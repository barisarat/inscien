"""Tool registry for the InScien research agent.

The agent harness is a hand-rolled tool-calling loop (no framework). Skills are tools:
  - search_internal_content — RAG-cite Q&A (retrieval-sufficiency loop inside it),
  - citation_graph — the intra-corpus citation map (reads the prebuilt graph),
  - search_references — find references across the corpus by name/DOI.
The harness routes a `/skill` to a forced tool, else lets the model infer.
"""

from dataclasses import dataclass

from services.lab.answer_service import select_answer_context, unique_citations
from services.lab.prompt_service import build_context_blocks
from services.lab.search_service import search_lab
from services.rag.grounding import grade_sufficiency
from services.refs.build import corpus_graph, search_references as _search_references


_NOT_BUILT = {
    "error": "not_built",
    "message": (
        "The reference graph hasn't been built yet. Run the reference build first "
        "(scripts/build_references.py, or POST /api/graph/build), then try again."
    ),
}


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


def _raw_search(query, item_keys=None):
    return search_lab(query, 20, item_keys=item_keys).get("results", [])


def search_internal_content(query, limit=4, item_keys=None):
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

    context_results = select_answer_context(query, raw, limit)
    context_blocks = build_context_blocks(context_results)

    verdict = grade_sufficiency(query, context_blocks)
    if not verdict["sufficient"] and verdict.get("reformulation"):
        extra = _raw_search(verdict["reformulation"], item_keys=item_keys)
        if extra:
            seen = {r.get("chunkId") for r in raw}
            union = raw + [r for r in extra if r.get("chunkId") not in seen]
            # Re-select against the ORIGINAL question so the answer stays on-topic.
            context_results = select_answer_context(query, union, limit)
            context_blocks = build_context_blocks(context_results)

    citations = unique_citations(context_results, limit)

    return {
        "contextBlocks": context_blocks,
        "citations": citations,
        "contextResults": context_results,
    }


def citation_graph(_args=None):
    """The intra-corpus citation map (reads the prebuilt reference graph)."""
    graph = corpus_graph()
    if graph is None:
        return _NOT_BUILT
    return {"graph": graph}


def search_references_tool(query):
    """References across the corpus matching a name/DOI."""
    matches = _search_references(query)
    if matches is None:
        return _NOT_BUILT
    return {"matches": matches}


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
    {
        "type": "function",
        "function": {
            "name": "citation_graph",
            "description": (
                "Show the CITATION MAP of the user's library — which of their papers cite "
                "each other. Use for requests like 'map my papers', 'how do my papers "
                "connect', 'show the citation graph'. Renders a graph in the side panel."
            ),
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_references",
            "description": (
                "Search the REFERENCE LISTS of the user's papers for a cited work by title "
                "or DOI — i.e. 'which of my papers cite X'. Returns the matching references "
                "and which papers cite them."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "A paper title or DOI to look for in the bibliographies.",
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
    "citation_graph": lambda args, ctx: citation_graph(args),
    "search_references": lambda args, ctx: search_references_tool(args.get("query", "")),
}


STAGE_LABELS = {
    "search_internal_content": lambda args: "searching your library",
    "citation_graph": lambda args: "mapping your citations",
    "search_references": lambda args: "searching references",
}


def stage_label(name, args):
    builder = STAGE_LABELS.get(name)

    if builder:
        return builder(args)

    return "working"
