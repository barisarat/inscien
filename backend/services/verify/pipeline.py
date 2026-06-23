"""Claim verification — the agentic `/verify` skill.

The lit-review / pre-submission job: take a claim and check it against the papers the user
selected in their Zotero library, returning a per-paper verdict (supports / contradicts /
mixed / doesn't address) with quoted, page-pinned evidence — and an honest "your sources
don't address this" when that's the truth.

Same local-first atomic pattern as `/compare`: never ask the model to weigh the whole
library at once. For each paper, scope retrieval to it, judge the claim against only its
passages, and bind the verdict to the supporting page(s). The consensus summary then runs
over the already-grounded per-paper verdicts.

Reuses the existing machinery: per-document scoped retrieval + sufficiency re-retrieval
(`retrieve_cell`), the numbered-source renderer (`build_context_blocks`), the page-precise
citation (`make_citation`), and a 4-way claim judge (`judge_claim`).
"""

import logging

from services.lab.answer_service import make_citation
from services.lab.prompt_service import build_context_blocks
from services.llm.client import chat_create, text_of
from services.rag.extraction import retrieve_cell
from services.rag.grounding import judge_claim

logger = logging.getLogger(__name__)

# Bound the run: one judge call per paper, so a big selection stays finite (and cheap on a
# cloud model). Beyond this the router rejects the request with a clear message.
MAX_VERIFY_PAPERS = 20

_VERDICT_LABEL = {
    "supports": "supports the claim",
    "contradicts": "contradicts the claim",
    "mixed": "is mixed on the claim",
    "not_addressed": "does not address the claim",
}


def _resolve_titles(doc_ids):
    # Lazy import to avoid a router<->service import cycle at module load.
    from routers.papers import resolve_titles

    return resolve_titles(doc_ids)


def _evidence(results, indices, stance):
    """Page-pinned citations for the given 1-based source indices, tagged with their stance."""
    out = []
    for i in indices:
        if isinstance(i, int) and 1 <= i <= len(results):
            citation = make_citation(results[i - 1])
            citation["stance"] = stance
            out.append(citation)
    return out


def verify_paper(claim, doc_id, title):
    """Verdict + page-pinned evidence for one paper against the claim. Never fabricates: an
    empty/irrelevant retrieval yields `not_addressed` with no evidence."""
    results = retrieve_cell(claim, doc_id)
    if not results:
        return {"docId": doc_id, "title": title, "verdict": "not_addressed", "evidence": []}

    judgment = judge_claim(claim, build_context_blocks(results), title)
    evidence = (
        _evidence(results, judgment["supporting"], "supporting")
        + _evidence(results, judgment["contradicting"], "contradicting")
    )
    return {"docId": doc_id, "title": title, "verdict": judgment["verdict"], "evidence": evidence}


def _summarize(claim, papers):
    """One short, CALIBRATED prose line over the per-paper verdicts — describes what the
    library says without ever declaring the claim true or false. Falls back to a plain
    deterministic sentence on error (never a scoreboard)."""
    addressed = [p for p in papers if p["verdict"] != "not_addressed"]
    if not addressed:
        return "None of the selected papers address this claim."

    lines = []
    for p in papers:
        snippet = p["evidence"][0]["passage"] if p["evidence"] else ""
        snippet = (snippet[:200] + "…") if len(snippet) > 200 else snippet
        lines.append(f'- "{p["title"]}" {_VERDICT_LABEL[p["verdict"]]}.' + (f' Evidence: {snippet}' if snippet else ""))
    verdict_text = "\n".join(lines)

    prompt = (
        "A researcher is checking a claim against their own library. Below is, per paper, "
        "whether it supports / contradicts / is mixed on / does not address the claim, with a "
        "short evidence snippet. Write ONE or TWO plain sentences summarizing what their library "
        "collectively says.\n"
        "Be conservative and descriptive: note if only a few papers address it, or if they "
        "disagree. DO NOT declare the claim true or false, and do not add facts beyond what's "
        "shown. No score or tally phrasing.\n\n"
        f"Claim: {claim}\n\nPer-paper findings:\n{verdict_text}"
    )
    try:
        response = chat_create(messages=[{"role": "user", "content": prompt}], max_tokens=400)
        summary = text_of(response).strip()
        if summary:
            return summary
    except Exception:
        logger.exception("verify summary failed; using a plain fallback")

    return f"{len(addressed)} of {len(papers)} selected papers address this claim; see the evidence below."


def run_verify(claim, doc_ids, progress):
    """Check `claim` against each selected paper. `progress(stage, percent, detail)` updates the
    job. Returns {claim, summary, papers:[{docId, title, verdict, evidence}]}."""
    claim = (claim or "").strip()
    doc_ids = list(dict.fromkeys(doc_ids))[:MAX_VERIFY_PAPERS]
    titles = _resolve_titles(doc_ids)

    papers = []
    total = max(len(doc_ids), 1)
    progress("verifying", 2, f"checking (0/{total})")
    for i, doc_id in enumerate(doc_ids):
        title = titles.get(doc_id, doc_id)
        papers.append(verify_paper(claim, doc_id, title))
        pct = 2 + int(88 * (i + 1) / total)
        progress("verifying", pct, f"checking ({i + 1}/{total})")

    progress("summarizing", 92, "summarizing")
    summary = _summarize(claim, papers)

    progress("done", 100, "done")
    return {"claim": claim, "summary": summary, "papers": papers}
