"""Agentic literature-review writer — the `/write` skill.

Writing is the LAST step, not the first. A related-work section is built the way a
researcher builds one: **extract → compare → synthesize → write**, over already-grounded
material. This kills v1's two failures (overlapping sections; a paper repeated in the
References) by construction: themes are formed before any prose, and citations are managed
per-document.

  extract   — one grounded cell per (paper × dimension)  [reuses services/rag/extraction]
  compare   — cluster the cell table into 2–5 themes (shared point / contrast)  [1 LLM call]
  synthesize— assemble each theme's grounded cells into a brief  [deterministic]
  write     — one grounded paragraph per theme, citing [n] (p. X)  [1 LLM call / theme]

Long-running → driven as a background job (services/writeup/jobs.py) with progress/state.
"""

import logging
import re

from services.compare.pipeline import propose_dimensions
from services.lab.answer_service import accept_revision
from services.lab.search_service import search_lab
from services.llm.client import chat_create, text_of
from services.rag.extraction import NOT_REPORTED, extract_cell, retrieve_cell
from services.rag.grounding import verify_grounding
from services.rag.json_utils import extract_json as parse_json

logger = logging.getLogger(__name__)

MAX_PAPERS = 5
MAX_DIMENSIONS = 5
MAX_THEMES = 5
DISCOVER_K = 30  # retrieval breadth when auto-selecting candidate papers


def _titles(doc_ids):
    # Lazy import to avoid a router<->service import cycle at module load.
    from routers.papers import resolve_titles
    return resolve_titles(doc_ids)


def select_papers(topic, n=MAX_PAPERS):
    """Top-N papers for a topic: aggregate each paper's retrieved-chunk scores and rank."""
    results = search_lab(topic, DISCOVER_K)["results"]
    scores = {}
    for r in results:
        sid = r.get("sourceId")
        if sid:
            scores[sid] = scores.get(sid, 0.0) + float(r.get("score", 0))
    ranked = sorted(scores, key=lambda s: scores[s], reverse=True)[:n]
    titles = _titles(ranked)
    return [{"docId": sid, "title": titles[sid]} for sid in ranked]


# --- propose (synchronous) --------------------------------------------------

def propose_plan(topic):
    """Top-N candidate papers + proposed extraction dimensions, for the user to confirm."""
    papers = select_papers(topic)
    doc_ids = [p["docId"] for p in papers]
    dimensions = propose_dimensions(doc_ids)[:MAX_DIMENSIONS] if doc_ids else []
    return {"papers": papers, "dimensions": dimensions}


# --- compare + write helpers ------------------------------------------------

def _cells_table_text(doc_ids, titles, dimensions, cells):
    """The grounded cell table as text, papers numbered [n] = their global citation number."""
    lines = []
    for i, doc_id in enumerate(doc_ids, start=1):
        parts = [f'[{i}] "{titles[doc_id]}":']
        for dim in dimensions:
            parts.append(f"  - {dim}: {cells[doc_id][dim]['value']}")
        lines.append("\n".join(parts))
    return "\n\n".join(lines)


def _cluster_themes(topic, doc_ids, titles, dimensions, cells):
    """One LLM call: organize the grounded cell table into 2–MAX_THEMES related-work themes."""
    table = _cells_table_text(doc_ids, titles, dimensions, cells)
    prompt = (
        f'You are organizing a related-work / literature-review section on: "{topic}".\n'
        "Below is a grounded comparison of the papers (each numbered [n], with extracted "
        f"attributes). Group them into 2 to {MAX_THEMES} THEMES for the section. Each theme is a "
        "short title, a one-sentence point (a shared finding OR a contrast between papers), and "
        "the list of paper numbers it draws on.\n\n"
        'Respond with ONLY JSON: [{"title": "...", "point": "...", "papers": [1, 2]}, ...]\n\n'
        f"{table}"
    )
    try:
        raw = parse_json(text_of(chat_create(messages=[{"role": "user", "content": prompt}],
                                            max_tokens=500, temperature=0)), [])
    except Exception:
        logger.exception("theme clustering failed")
        raw = []

    themes = []
    for item in raw if isinstance(raw, list) else []:
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        nums = [n for n in (item.get("papers") or []) if isinstance(n, int) and 1 <= n <= len(doc_ids)]
        themes.append({
            "title": title,
            "point": str(item.get("point") or "").strip(),
            "papers": nums or list(range(1, len(doc_ids) + 1)),
        })
    if not themes:
        themes = [{"title": "Overview", "point": "", "papers": list(range(1, len(doc_ids) + 1))}]
    return themes[:MAX_THEMES]


def _write_theme(topic, theme, doc_ids, dimensions, cells):
    """One grounded paragraph for a theme, from its papers' grounded cells (with page cites)."""
    brief = []
    for num in theme["papers"]:
        doc_id = doc_ids[num - 1]
        for dim in dimensions:
            cell = cells[doc_id][dim]
            if cell["value"] and cell["value"] != NOT_REPORTED and cell.get("citation"):
                page = cell["citation"].get("page")
                pg = f" (p. {page})" if page is not None else ""
                brief.append(f'[{num}] {dim}: {cell["value"]}{pg}')
    brief_text = "\n".join(brief) or "(no grounded facts available for this theme)"

    prompt = (
        f'Write ONE paragraph (3–5 sentences) for the "{theme["title"]}" theme of a related-work '
        f'section on "{topic}".\n'
        + (f"Thesis: {theme['point']}\n" if theme["point"] else "")
        + "Use ONLY the grounded facts below. Cite each claim with the paper's number as [n] and its "
        "page, e.g. '... improves accuracy [2] (p. 4)'. Use each paper's number EXACTLY as given. "
        "Do not invent facts, numbers, or citations. Do not repeat the heading or write other "
        "themes.\n\n"
        f"Grounded facts:\n{brief_text}"
    )
    try:
        return text_of(chat_create(messages=[{"role": "user", "content": prompt}], max_tokens=400))
    except Exception:
        logger.exception("theme drafting failed: %s", theme["title"])
        return ""


def _finalize(draft, doc_ids, titles, cells):
    """Compact the global paper-numbers actually cited to 1..k, build aligned doc-level
    citations + a one-entry-per-paper References block."""
    used = sorted({int(n) for n in re.findall(r"\[(\d+)\]", draft) if 1 <= int(n) <= len(doc_ids)})
    if not used:
        # No inline [n] (model didn't cite, or the rewrite stripped them) — fall back to
        # every reviewed paper with >=1 grounded cell, so the review keeps its doc-level
        # provenance instead of shipping a reference-less "literature review".
        used = [i + 1 for i, doc_id in enumerate(doc_ids)
                if any(c.get("citation") for c in cells[doc_id].values())]
    remap = {old: i + 1 for i, old in enumerate(used)}
    draft = re.sub(
        r"\[(\d+)\]",
        lambda m: f"[{remap[int(m.group(1))]}]" if int(m.group(1)) in remap else "",
        draft,
    )

    citations, lines = [], []
    for new_i, old in enumerate(used, start=1):
        doc_id = doc_ids[old - 1]
        rep = next((c["citation"] for c in cells[doc_id].values() if c.get("citation")), None)
        title = titles.get(doc_id) or "Untitled"
        citations.append({
            "title": title,
            "url": (rep or {}).get("url", ""),
            "sourceId": doc_id,
            "sourceType": "zotero",
            "contentMode": "full_text",
            "page": (rep or {}).get("page"),
            "passage": (rep or {}).get("passage", ""),
        })
        lines.append(f"[{new_i}] {title}.")

    references_md = ("## References\n\n" + "\n\n".join(lines)) if lines else ""
    answer = f"{draft}\n\n{references_md}".strip() if references_md else draft
    return answer, citations


# --- orchestration ----------------------------------------------------------

def run_writeup(topic, doc_ids, dimensions, progress):
    """Extract → compare → synthesize → write. `progress(stage, percent, detail)` updates the
    job. Returns {answer (markdown), citations (doc-level)}."""
    doc_ids = list(dict.fromkeys(doc_ids))[:MAX_PAPERS]
    dimensions = [d for d in (s.strip() for s in dimensions) if d][:MAX_DIMENSIONS]

    if not doc_ids or not dimensions:
        progress("done", 100, "done")
        return {"answer": "No papers or dimensions were available for the review.", "citations": []}

    titles = _titles(doc_ids)

    # Extract (map): one grounded cell per (paper × dimension).
    cells = {doc_id: {} for doc_id in doc_ids}
    total = len(doc_ids) * len(dimensions)
    done = 0
    progress("extracting", 2, f"extracting (0/{total})")
    for doc_id in doc_ids:
        for dim in dimensions:
            cells[doc_id][dim] = extract_cell(titles[doc_id], dim, retrieve_cell(dim, doc_id))
            done += 1
            progress("extracting", 2 + int(66 * done / total), f"extracting ({done}/{total})")

    # Compare (cluster): grounded cells → themes.
    progress("comparing", 72, "clustering themes")
    themes = _cluster_themes(topic, doc_ids, titles, dimensions, cells)

    # Synthesize + Write (map over themes): grounded paragraph per theme.
    progress("synthesizing", 80, "organizing the evidence")
    parts = []
    for i, theme in enumerate(themes):
        progress("writing", 82 + int(14 * i / max(len(themes), 1)),
                 f"writing ({i + 1}/{len(themes)})")
        para = _write_theme(topic, theme, doc_ids, dimensions, cells)
        parts.append(f"## {theme['title']}\n\n{para.strip()}")

    draft = "\n\n".join(parts)

    # Faithfulness judge over the grounded table, then compact citations + references.
    verdict = verify_grounding(draft, _cells_table_text(doc_ids, titles, dimensions, cells))
    revised = verdict.get("revised_answer")
    # Only accept the rewrite if it keeps the draft's citations and isn't truncated — a
    # weak judge can otherwise strip the [n] markers, which would yield a reference-less draft.
    if revised and accept_revision(draft, revised):
        draft = revised

    answer, citations = _finalize(draft, doc_ids, titles, cells)

    progress("done", 100, "done")
    return {"answer": answer, "citations": citations}
