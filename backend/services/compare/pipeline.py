"""Cross-paper comparison — the agentic `/compare` skill.

The local-first pattern: never ask the small model to build a whole comparison table in
one shot. Instead decompose into **atomic cells** — one cell = one paper x one dimension —
so the model only ever holds a single paper, a single attribute, and the passages
retrieved for it. Each cell is independently grounded to a page (or honestly marked "Not
reported"), and the table is *assembled* from those verified atoms. The reduce step
(synthesis) then runs over already-grounded cells.

Two entry points:
  - `propose_dimensions(doc_ids)` — fast, synchronous: sample each paper and propose the
    comparison axes for the user to confirm/edit before the long run.
  - `run_compare(doc_ids, dimensions, progress)` — the background job: the per-cell map
    (scoped retrieve -> extract -> sufficiency re-retrieve -> ground) then the synthesis
    reduce. `progress(stage, percent, detail)` updates the job state.

Reuses the existing machinery: per-document scoped hybrid retrieval (`search_lab` with
`doc_id`), the numbered-source renderer (`build_context_blocks`), the page-precise citation
(`make_citation`), and both grounding judges (`grade_sufficiency`, `verify_grounding`).
"""

import logging

from services.lab.answer_service import accept_revision
from services.lab.manifest_loader import load_manifest_chunks
from services.llm.client import chat_create, text_of
from services.rag.extraction import extract_cell, retrieve_cell
from services.rag.grounding import verify_grounding
from services.rag.json_utils import extract_json as _parse_json

logger = logging.getLogger(__name__)

# Bounds — keep the agent honest and the run finite (brief: "don't over-agent").
MAX_PAPERS = 5
MAX_DIMENSIONS = 5


def _resolve_titles(doc_ids):
    # Lazy import to avoid a router<->service import cycle at module load.
    from routers.papers import resolve_titles

    return resolve_titles(doc_ids)


def _sample_excerpt(doc_id, max_chunks=2, max_chars=900):
    """The first couple of chunks of a paper (manifest order ~ page order) — enough for
    the model to see what the paper is about when proposing comparison axes."""
    chunks = load_manifest_chunks()["chunks"]
    texts = []
    for chunk in chunks:
        if chunk.get("sourceId") != doc_id:
            continue
        texts.append(chunk.get("text", ""))
        if len(texts) >= max_chunks:
            break
    excerpt = " ".join(" ".join(texts).split())
    return excerpt[:max_chars]


# --- propose ----------------------------------------------------------------

def propose_dimensions(doc_ids):
    """Propose 3-6 comparison dimensions for the selected papers. Synchronous (one LLM
    call); the user confirms/edits before the long extraction runs."""
    doc_ids = list(dict.fromkeys(doc_ids))[:MAX_PAPERS]
    titles = _resolve_titles(doc_ids)

    blocks = []
    for i, doc_id in enumerate(doc_ids, start=1):
        blocks.append(f"Paper {i}: {titles[doc_id]}\nExcerpt: {_sample_excerpt(doc_id)}")
    papers_text = "\n\n".join(blocks)

    prompt = (
        "You are setting up a comparison table across several research papers. Propose the "
        "3 to 6 most useful COLUMNS to compare them on — the attributes a researcher would "
        "line up side by side (for example: task, dataset, method, key metric, main result, "
        "limitation). Choose dimensions that apply to ALL the papers below and that are "
        "likely stated in their text. Keep each label short (1-4 words).\n\n"
        'Respond with ONLY a JSON array of strings, e.g. ["Task", "Dataset", "Main result"].\n\n'
        f"{papers_text}"
    )

    try:
        response = chat_create(messages=[{"role": "user", "content": prompt}], max_tokens=200, temperature=0)
        raw = _parse_json(text_of(response), [])
    except Exception:
        logger.exception("propose_dimensions failed; falling back to defaults")
        raw = []

    dims = []
    for item in raw if isinstance(raw, list) else []:
        label = str(item).strip()
        if label and label.lower() not in {d.lower() for d in dims}:
            dims.append(label)

    if not dims:
        dims = ["Task", "Dataset", "Method", "Main result", "Limitation"]

    return dims[:MAX_DIMENSIONS]


# --- synthesis (the reduce over grounded cells) -----------------------------

def _synthesize(titles, dimensions, cells):
    """A short comparative summary over the already-grounded cells, fact-checked against
    them. Input is compact (just the filled values), so the local model can handle it."""
    lines = []
    for doc_id, title in titles.items():
        parts = [f'"{title}":']
        for dim in dimensions:
            cell = cells[doc_id][dim]
            parts.append(f"  - {dim}: {cell['value']}")
        lines.append("\n".join(parts))
    table_text = "\n\n".join(lines)

    prompt = (
        "Below is a comparison table of several research papers (already extracted and "
        "grounded). Write a SHORT comparative summary (3-5 sentences) highlighting the most "
        "salient similarities and differences across the papers. Use ONLY the values shown; "
        "do not introduce new facts. Refer to papers by a short form of their title.\n\n"
        f"{table_text}"
    )

    try:
        response = chat_create(messages=[{"role": "user", "content": prompt}], max_tokens=400)
        synthesis = text_of(response)
    except Exception:
        logger.exception("compare synthesis failed")
        return ""

    check = verify_grounding(synthesis, table_text)
    revised = check.get("revised_answer")
    # Accept the rewrite only if it keeps the [n] markers and isn't truncated — verify_grounding
    # now always returns a rewrite when the judge produced one, so this guard (matching the
    # agent and /write) is what keeps a weak judge from regressing the synthesis.
    if revised and accept_revision(synthesis, revised):
        synthesis = revised
    return synthesis


# --- orchestration ----------------------------------------------------------

def run_compare(doc_ids, dimensions, progress):
    """Build the grounded comparison table. `progress(stage, percent, detail)` updates the
    job. Returns {dimensions, papers, cells, synthesis}."""
    doc_ids = list(dict.fromkeys(doc_ids))[:MAX_PAPERS]
    dimensions = [d for d in (s.strip() for s in dimensions) if d][:MAX_DIMENSIONS]
    titles = _resolve_titles(doc_ids)

    cells = {doc_id: {} for doc_id in doc_ids}
    total = max(len(doc_ids) * len(dimensions), 1)
    done = 0

    progress("extracting", 2, f"extracting (0/{total})")
    for doc_id in doc_ids:
        for dim in dimensions:
            results = retrieve_cell(dim, doc_id)
            cells[doc_id][dim] = extract_cell(titles[doc_id], dim, results)
            done += 1
            pct = 2 + int(88 * done / total)
            progress("extracting", pct, f"extracting ({done}/{total})")

    progress("synthesizing", 92, "writing the summary")
    synthesis = _synthesize(titles, dimensions, cells)

    progress("done", 100, "done")
    return {
        "dimensions": dimensions,
        "papers": [{"docId": d, "title": titles[d]} for d in doc_ids],
        "cells": cells,
        "synthesis": synthesis,
    }
