"""Grounded single-attribute extraction — the atomic unit shared by `/compare` and `/write`.

The local-first primitive: scope retrieval to one paper, retrieve passages for one attribute,
extract a short value bound to the supporting page — or honestly "Not reported". Never
fabricates. Used as the map step by both the comparison table and the literature-review writer.

Reuses per-document scoped hybrid retrieval (`search_lab` with `doc_id`), the numbered-source
renderer, the page-precise citation, and the retrieval-sufficiency judge.
"""

import logging

from services.lab.answer_service import make_citation
from services.lab.prompt_service import build_context_blocks
from services.lab.search_service import search_lab
from services.llm.client import chat_create, text_of
from services.rag.grounding import grade_sufficiency
from services.rag.json_utils import extract_json

logger = logging.getLogger(__name__)

CELL_RETRIEVE_K = 4
NOT_REPORTED = "Not reported"


def retrieve_cell(attribute, doc_id):
    """Scoped retrieval for one (paper, attribute), with a single corrective re-retrieval when
    the first pass is judged insufficient (reuses the RAG-cite sufficiency judge)."""
    results = search_lab(attribute, CELL_RETRIEVE_K, doc_id=doc_id)["results"]

    verdict = grade_sufficiency(attribute, build_context_blocks(results))
    if not verdict["sufficient"] and verdict.get("reformulation"):
        extra = search_lab(verdict["reformulation"], CELL_RETRIEVE_K, doc_id=doc_id)["results"]
        # Union, de-duped by chunkId, preserving the original ranking first.
        seen = {r.get("chunkId") for r in results}
        for r in extra:
            if r.get("chunkId") not in seen:
                results.append(r)
                seen.add(r.get("chunkId"))

    return results


def extract_cell(title, attribute, results):
    """Extract one paper's value for one attribute from its retrieved passages, bound to the
    supporting source. Returns {value, citation}. Returns "Not reported" with no citation when
    the passages don't state it (never fabricates)."""
    if not results:
        return {"value": NOT_REPORTED, "citation": None}

    context = build_context_blocks(results)
    prompt = (
        f'You are extracting one attribute from a single research paper titled "{title}".\n'
        f'Attribute to extract: "{attribute}".\n\n'
        "Use ONLY the numbered sources below. Give a SHORT, factual value (a phrase, not a "
        "sentence). If the sources do not state this attribute, set value to "
        f'"{NOT_REPORTED}". Identify the ONE source number that best supports the value.\n\n'
        'Respond with ONLY JSON: {"value": "<short value or '
        f'{NOT_REPORTED}>", "source": <source number or null>}}\n\n'
        f"Sources:\n{context}"
    )

    try:
        response = chat_create(messages=[{"role": "user", "content": prompt}], max_tokens=200, temperature=0)
        data = extract_json(text_of(response), {})
    except Exception:
        logger.exception("cell extraction failed for attribute=%s", attribute)
        data = {}

    value = str(data.get("value") or "").strip()
    if not value or value.lower() in {NOT_REPORTED.lower(), "n/a", "none", "null"}:
        return {"value": NOT_REPORTED, "citation": None}

    citation = None
    source = data.get("source")
    if isinstance(source, int) and 1 <= source <= len(results):
        citation = make_citation(results[source - 1])

    return {"value": value, "citation": citation}
