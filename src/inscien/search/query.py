"""Retrieval over the index, then filters, an optional rerank, and the per-paper cap.

Modes:

    lexical    BM25 over passage text: exact terms.
    semantic   vector search over passage embeddings: meaning.
    hybrid     both, combined with reciprocal rank fusion (a passage ranked r adds 1/(RRF_K + r));
               ranks are fused because BM25 and cosine distance are on different scales.

Rerank: off, neural (the cross-encoder in models.py) or llm (llm.py). The query is used
verbatim, never expanded or rewritten.

Pipeline order: retrieve -> dedupe -> filter -> rerank -> per-paper cap. The cap comes last so
it applies to the final order. Filters (a year range, a Zotero collection) widen the candidate
pool, since they are applied after retrieval.

Type-ahead (`titles`) matches paper titles and authors, the last word as a prefix.
"""

import json
import re
import sqlite3

from inscien.search import llm, models

MODES = ("lexical", "semantic", "hybrid")
RERANKS = ("off", "neural", "llm")
POOL = 120
FILTERED_POOL = 600
RRF_K = 60
NEURAL_DEPTH = 30
LLM_DEPTH = 20
LLM_CHARS = 700


def terms_of(text: str) -> list[str]:
    """Words of a query; each is quoted later, so punctuation never reaches FTS5 as syntax."""
    return [t for t in re.findall(r"[\w][\w'-]*", text) if len(t) > 1]


def _match(terms: list[str], join: str = " AND ", prefix: bool = False) -> str:
    parts = ['"' + t.replace('"', "") + '"' for t in terms]
    if prefix and parts:
        parts[-1] += "*"
    return join.join(parts)


def lexical(conn, terms, limit, join=" AND "):
    if not terms:
        return []
    try:
        rows = conn.execute("SELECT rowid AS id FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts)"
                            " LIMIT ?", (_match(terms, join), limit)).fetchall()
    except sqlite3.OperationalError:
        return []
    return [row["id"] for row in rows]


def lexical_any(conn, terms, limit):
    """All terms first; any term when that returns too little, as long questions do."""
    ids = lexical(conn, terms, limit)
    return ids if len(ids) >= limit // 4 else lexical(conn, terms, limit, join=" OR ")


def vector(conn, question, limit):
    rows = conn.execute("SELECT chunk_id FROM vec_chunks WHERE embedding MATCH ? AND k = ? ORDER BY distance",
                        (json.dumps(models.query(question)), limit)).fetchall()
    return [row["chunk_id"] for row in rows]


def fuse(*rankings):
    """Reciprocal rank fusion: [chunk_id], best first."""
    scores = {}
    for ranking in rankings:
        for rank, chunk_id in enumerate(ranking, 1):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank)
    return [chunk_id for chunk_id, _ in sorted(scores.items(), key=lambda pair: -pair[1])]


def candidates(conn, question, mode, pool):
    if mode == "lexical":
        return lexical_any(conn, terms_of(question), pool)
    if mode == "semantic":
        return vector(conn, question, pool)
    return fuse(vector(conn, question, pool), lexical_any(conn, terms_of(question), pool))


def hydrate(conn, ids):
    """Passage rows joined to their paper, in the order of `ids`, without overlapping duplicates."""
    if not ids:
        return []
    marks = ",".join("?" * len(ids))
    rows = {row["id"]: dict(row) for row in conn.execute(
        "SELECT c.id, c.page, c.text, c.bbox_json, p.item_key, p.title, p.authors, p.year, p.venue"
        f" FROM chunks c JOIN papers p ON p.id = c.paper_id WHERE c.id IN ({marks})", ids)}
    seen, out = set(), []
    for chunk_id in ids:
        row = rows.get(chunk_id)
        # Windows overlap, so neighbouring passages can share a head.
        if row is None or row["text"][:80] in seen:
            continue
        seen.add(row["text"][:80])
        out.append(row)
    return out


def rerank_neural(question, rows):
    top, rest = rows[:NEURAL_DEPTH], rows[NEURAL_DEPTH:]
    scores = list(models.cross_encoder().rerank(question, [f"{r['title']}\n\n{r['text']}" for r in top]))
    return [row for _, row in sorted(zip(scores, top), key=lambda pair: -pair[0])] + rest


LLM_SYSTEM = ("You rank paper passages for a search query. Read every passage, then reply with JSON only: "
              '{"ranking": [passage numbers]}, most useful first. Leave out passages that do not help answer '
              "the query. An empty ranking is a valid answer.")


def rerank_llm(question, rows, model):
    """Kept passages first, then the ones the model left out (marked `dropped`), then the rest."""
    top, rest = rows[:LLM_DEPTH], rows[LLM_DEPTH:]
    listing = "\n\n".join(f"[{n}] {r['title']}, p. {r['page']}\n{r['text'][:LLM_CHARS]}" for n, r in enumerate(top, 1))
    reply = llm.chat_json(model, LLM_SYSTEM, f"Query: {question}\n\nPassages:\n\n{listing}")
    order = []
    for value in reply.get("ranking", []) if isinstance(reply, dict) else []:
        try:
            n = int(value)
        except (TypeError, ValueError):
            continue
        if 1 <= n <= len(top) and n - 1 not in order:
            order.append(n - 1)
    return [top[i] for i in order] + [dict(r, dropped=True) for i, r in enumerate(top) if i not in order] + rest


def capped(rows, limit, per_paper):
    per, out = {}, []
    for row in rows:
        if per.get(row["item_key"], 0) >= per_paper:
            continue
        per[row["item_key"]] = per.get(row["item_key"], 0) + 1
        out.append(row)
        if len(out) >= limit:
            break
    return out


def passages(conn, question, mode="hybrid", rerank="off", limit=20, per_paper=3,
             year_from=None, year_to=None, keys=None, model=None):
    """The result list. `keys` (a set of itemKeys) limits it to a collection. Raises
    llm.LLMError when an llm rerank fails."""
    filtered = year_from is not None or year_to is not None or keys is not None
    rows = hydrate(conn, candidates(conn, question, mode, FILTERED_POOL if filtered else POOL))
    if filtered:
        rows = [r for r in rows if (keys is None or r["item_key"] in keys)
                and (year_from is None or (r["year"] or 0) >= year_from)
                and (year_to is None or (r["year"] or 9999) <= year_to)]
    if rerank == "neural":
        rows = rerank_neural(question, rows)
    elif rerank == "llm":
        rows = rerank_llm(question, rows, model)
    return capped(rows, limit, per_paper)


def titles(conn, text, limit=8):
    """Type-ahead: papers whose title or authors match, the last word as a prefix."""
    terms = terms_of(text)
    if not terms:
        return []
    try:
        rows = conn.execute("SELECT p.item_key, p.title, p.authors, p.year FROM papers_fts f JOIN papers p"
                            " ON p.id = f.rowid WHERE papers_fts MATCH ? ORDER BY bm25(papers_fts) LIMIT ?",
                            (_match(terms, prefix=True), limit)).fetchall()
    except sqlite3.OperationalError:
        return []
    return [dict(row) for row in rows]
