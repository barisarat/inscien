"""Search and Ask over the papers in the Zotero library.

    index.py    `inscien index`: every PDF the library sidebar shows -> page-anchored passages ->
                one sqlite file (papers, passages, BM25 tables, vectors)
    models.py   the local embedder and cross-encoder (fastembed, CPU)
    query.py    retrieval (keyword, semantic, hybrid), filters, rerank, per-paper cap
    llm.py      the language model through Ollama, for the LLM rerank and Ask
    answer.py   Ask: quotes chosen by the model, verified against the passages, located on the page

The models and sqlite-vec come with the `search` extra (`pip install inscien[search]`); without it
the rest of InScien works and the search routes report that search is not installed.
"""


def installed() -> bool:
    """Whether the `search` extra is installed."""
    try:
        import fastembed  # noqa: F401
        import sqlite_vec  # noqa: F401
    except ImportError:
        return False
    return True
