"""Tool registry for the InScien research agent.

The agent harness is a hand-rolled tool-calling loop (no framework). The chat agent has
a single tool — search_internal_content (RAG-cite Q&A, with the retrieval-sufficiency
loop inside it) — and the model infers when to call it. Structured skills (compare,
write, narrate, the citation graph) live in their own workspace tabs, not the chat.
"""

from dataclasses import dataclass

from services.lab.answer_service import select_answer_context
from services.lab.prompt_service import build_context_blocks
from services.lab.search_service import search_lab
from services.rag.grounding import grade_sufficiency


@dataclass
class ToolContext:
    """Per-request context passed to tool handlers.

    InScien is single-user/local with no auth, so this is mostly a carrier for the
    DB session. `item_keys` is the active Zotero selection (a set of itemKeys); when
    present, retrieval is scoped to those items. Kept as a struct so new tools can take
    dependencies without changing the dispatch signature.
    """
    db: object = None
    item_keys: object = None


# How many passages to select as answer context. Not model-tunable — the agent calls
# the tool with just a query; this is the fixed retrieval breadth.
RESULT_LIMIT = 4


def _raw_search(query, item_keys=None):
    return search_lab(query, 20, item_keys=item_keys).get("results", [])


def search_internal_content(query, item_keys=None):
    """Hybrid (dense + BM25) retrieval over the user's PDF library, with the
    retrieval-sufficiency judge loop (judge loop #1) built in.

    Retrieve -> grade whether the context can answer the query -> if thin and the
    judge proposes a better query, retrieve once more and re-select over the union
    (bounded to two retrievals). Returns page-tagged context blocks, citation
    objects, and the full selected results so the harness can consolidate citations
    across multiple searches with consistent numbering.
    """
    raw = _raw_search(query, item_keys=item_keys)

    if not raw:
        return {"contextBlocks": "", "citations": [], "contextResults": []}

    context_results = select_answer_context(query, raw, RESULT_LIMIT)
    context_blocks = build_context_blocks(context_results)

    verdict = grade_sufficiency(query, context_blocks)
    if not verdict["sufficient"] and verdict.get("reformulation"):
        extra = _raw_search(verdict["reformulation"], item_keys=item_keys)
        if extra:
            seen = {r.get("chunkId") for r in raw}
            union = raw + [r for r in extra if r.get("chunkId") not in seen]
            # Re-select against the ORIGINAL question so the answer stays on-topic.
            context_results = select_answer_context(query, union, RESULT_LIMIT)
            context_blocks = build_context_blocks(context_results)

    return {
        "contextBlocks": context_blocks,
        "contextResults": context_results,
    }


TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "search_internal_content",
            "description": (
                "Answer a QUESTION about the content of the user's papers. Searches the "
                "local library for relevant passages — the only source of grounding. "
                "Returns page-tagged context blocks and citation sources for the [n] markers."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query describing what to find in the papers.",
                    },
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
]


TOOL_DISPATCH = {
    "search_internal_content": lambda args, ctx: search_internal_content(
        args.get("query", ""), item_keys=getattr(ctx, "item_keys", None)
    ),
}


STAGE_LABELS = {
    "search_internal_content": lambda args: "searching your library",
}


def stage_label(name, args):
    builder = STAGE_LABELS.get(name)

    if builder:
        return builder(args)

    return "working"
