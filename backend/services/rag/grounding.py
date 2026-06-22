"""Grounding / verification — the two judge loops of the RAG-cite skill.

This is the shared mechanism the brief flags as the highest-leverage spec (§5.3):

  - `grade_sufficiency` — does the retrieved context actually support answering the
    question? Used INSIDE the retrieval tool to re-retrieve once when context is thin.
  - `verify_grounding` — does the drafted answer's content hold up against its cited
    passages? Used in the harness AFTER drafting to flag/revise unsupported claims.

Both use the nano model and are bounded (one call each). They fail OPEN: if the judge
errors or returns junk, we proceed rather than block the answer. (Paper->TTS will reuse
`verify_grounding` for its faithfulness check.)
"""

import logging

from services.llm.client import chat_create, text_of
from services.rag.json_utils import extract_json

logger = logging.getLogger(__name__)


def _parse_json(text):
    """First JSON object from a model response (tolerates fences/prose); {} on failure."""
    return extract_json(text, {})


def grade_sufficiency(query, context_blocks):
    """Judge whether the retrieved passages can answer the query.

    Returns {"sufficient": bool, "reformulation": str|None}. Fails open
    (sufficient=True) so a flaky judge never blocks a usable answer.
    """
    if not context_blocks:
        return {"sufficient": False, "reformulation": None}

    prompt = (
        "You grade retrieval quality for a research-paper Q&A system. Given the user's "
        "question and the retrieved passages, decide if the passages contain enough to "
        "answer it. If not, propose ONE better search query (different keywords/synonyms) "
        "that would likely retrieve the missing material.\n\n"
        'Respond with ONLY JSON: {"sufficient": true|false, "reformulation": "<query or null>"}\n\n'
        f"Question: {query}\n\nRetrieved passages:\n{context_blocks}"
    )

    try:
        response = chat_create(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0,  # deterministic JSON verdict
        )
        data = _parse_json(text_of(response))
        reformulation = data.get("reformulation")
        if isinstance(reformulation, str):
            reformulation = reformulation.strip() or None
        else:
            reformulation = None
        return {
            "sufficient": bool(data.get("sufficient", True)),
            "reformulation": reformulation,
        }
    except Exception:
        logger.exception("grade_sufficiency failed; treating context as sufficient")
        return {"sufficient": True, "reformulation": None}


def verify_grounding(answer, context_blocks):
    """Check the drafted answer's claims against the cited passages.

    Returns {"grounded": bool, "unsupported": [str], "revised_answer": str|None}.
    `revised_answer` (when present) drops/softens claims not supported by the sources.
    Fails open (grounded=True, no revision) on any error.
    """
    if not answer or not context_blocks:
        return {"grounded": True, "unsupported": [], "revised_answer": None}

    prompt = (
        "You are a strict fact-checker for a research-paper assistant. Check the draft "
        "answer ONLY against the numbered sources. Every factual claim must be directly "
        "supported by a source. List any claims that are not supported. If there are "
        "unsupported claims, rewrite the answer to remove or appropriately hedge them "
        "while keeping the inline [n] citations and page references intact; otherwise "
        "return the answer unchanged.\n\n"
        'Respond with ONLY JSON: {"grounded": true|false, '
        '"unsupported": ["<claim>", ...], "revised_answer": "<full answer text>"}\n\n'
        f"Sources:\n{context_blocks}\n\nDraft answer:\n{answer}"
    )

    try:
        response = chat_create(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1200,
            temperature=0,  # deterministic JSON verdict
        )
        data = _parse_json(text_of(response))
        grounded = bool(data.get("grounded", True))
        unsupported = data.get("unsupported") or []
        if not isinstance(unsupported, list):
            unsupported = []
        unsupported = [str(u) for u in unsupported][:10]
        revised = data.get("revised_answer")
        revised = revised.strip() if isinstance(revised, str) and revised.strip() else None
        # A weak local judge frequently self-contradicts: it returns grounded=true yet still
        # lists unsupported claims (and hedges them in revised_answer). Treat the draft as
        # ungrounded whenever any claim is flagged, and always pass the rewrite through — the
        # caller's accept_revision guard decides whether to actually swap it in.
        return {
            "grounded": grounded and not unsupported,
            "unsupported": unsupported,
            "revised_answer": revised,
        }
    except Exception:
        logger.exception("verify_grounding failed; treating answer as grounded")
        return {"grounded": True, "unsupported": [], "revised_answer": None}
