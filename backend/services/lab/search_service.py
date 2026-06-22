import logging
import math
import threading
from collections import Counter, defaultdict
from pathlib import Path

from services.lab.embedding_service import embed_texts
from services.lab.manifest_loader import load_manifest_chunks
from services.lab.qdrant_store import search_lab_chunks
from services.lab.settings import get_lab_settings
from services.lab.text_utils import tokenize

logger = logging.getLogger(__name__)

# Cache the parsed manifest chunks + the full-corpus BM25 index, invalidated when the
# manifest file changes (ingestion rewrites it). Without this, every search reparsed the
# whole manifest and rebuilt the index from scratch — O(corpus) per query.
_corpus_cache = {"key": None, "chunks": [], "index": None}
_corpus_lock = threading.Lock()


def _manifest_key():
    """Cheap change-token for the manifest: (path, mtime, size). A stat, not a full read."""
    path = Path(get_lab_settings()["chunk_index_path"])
    try:
        st = path.stat()
        return (str(path), st.st_mtime_ns, st.st_size)
    except OSError:
        return (str(path), None, None)  # manifest not written yet


def _corpus():
    """Return {chunks, index} for the current manifest, rebuilding only when it changed."""
    global _corpus_cache
    key = _manifest_key()
    cache = _corpus_cache
    if cache["key"] == key:
        return cache
    with _corpus_lock:
        if _corpus_cache["key"] != key:
            chunks = load_manifest_chunks()["chunks"]
            _corpus_cache = {"key": key, "chunks": chunks, "index": build_bm25_index(chunks)}
        return _corpus_cache


def make_result_from_chunk(chunk, score):
    return {
        "score": float(score),
        "sourceType": chunk.get("sourceType", ""),
        "sourceId": chunk.get("sourceId", ""),
        "chunkId": chunk.get("chunkId", ""),
        "title": chunk.get("title", ""),
        "url": chunk.get("url", ""),
        "contentMode": chunk.get("contentMode", ""),
        "text": chunk.get("text", ""),
        "metadata": chunk.get("metadata", {}),
    }


def build_bm25_index(chunks):
    documents = []
    document_frequency = defaultdict(int)
    total_length = 0

    for chunk in chunks:
        title_tokens = tokenize(chunk.get("title", ""))
        text_tokens = tokenize(chunk.get("text", ""))

        # Title terms weighted above body text; section/category/etc. fields don't
        # exist for Zotero PDFs.
        weighted_tokens = title_tokens * 4 + text_tokens

        token_counts = Counter(weighted_tokens)
        unique_tokens = set(token_counts.keys())

        for token in unique_tokens:
            document_frequency[token] += 1

        total_length += len(weighted_tokens)

        documents.append({
            "chunk": chunk,
            "tokens": weighted_tokens,
            "token_counts": token_counts,
            "length": len(weighted_tokens),
        })

    average_length = total_length / len(documents) if documents else 0

    return {
        "documents": documents,
        "document_frequency": document_frequency,
        "average_length": average_length,
        "document_count": len(documents),
    }


def bm25_score(query_tokens, document, index):
    if not query_tokens or document["length"] == 0:
        return 0

    k1 = 1.5
    b = 0.75
    score = 0

    document_count = index["document_count"]
    average_length = index["average_length"]
    document_frequency = index["document_frequency"]

    for token in query_tokens:
        frequency = document["token_counts"].get(token, 0)

        if frequency == 0:
            continue

        df = document_frequency.get(token, 0)
        idf = math.log(1 + (document_count - df + 0.5) / (df + 0.5))

        denominator = frequency + k1 * (1 - b + b * document["length"] / average_length)
        score += idf * (frequency * (k1 + 1)) / denominator

    return score


def normalize_scores(results):
    if not results:
        return []

    max_score = max(result["score"] for result in results)

    if max_score <= 0:
        return results

    return [
        {
            **result,
            "score": result["score"] / max_score,
        }
        for result in results
    ]


def get_keyword_candidates(query, max_items, doc_id=None, item_keys=None):
    query_tokens = tokenize(query)

    if not query_tokens:
        return []

    corpus = _corpus()

    # Per-document scope (used by /compare): restrict the BM25 index to this paper's chunks so
    # keyword candidates can never bleed in from other documents (and IDF stays subset-relative).
    # The Zotero navigator scopes to a selection (`item_keys`, a set of itemKeys / sourceIds).
    # Unscoped (the chat agent's retrieval) reuses the cached full-corpus index.
    if doc_id:
        index = build_bm25_index([c for c in corpus["chunks"] if c.get("sourceId") == doc_id])
    elif item_keys:
        index = build_bm25_index([c for c in corpus["chunks"] if c.get("sourceId") in item_keys])
    else:
        index = corpus["index"]

    candidates = []

    for document in index["documents"]:
        score = bm25_score(query_tokens, document, index)

        if score <= 0:
            continue

        chunk = document["chunk"]
        result = make_result_from_chunk(chunk, score)
        candidates.append(result)

    candidates.sort(key=lambda item: item["score"], reverse=True)

    return normalize_scores(candidates[:max_items])


def normalize_vector_results(results):
    if not results:
        return []

    return normalize_scores(results)


def combine_results(vector_results, keyword_results):
    combined = {}

    for result in vector_results:
        chunk_id = result["chunkId"]
        combined[chunk_id] = {
            **result,
            "score": result["score"] * 0.65,
        }

    for result in keyword_results:
        chunk_id = result["chunkId"]
        keyword_score = result["score"] * 0.35

        if chunk_id in combined:
            combined[chunk_id]["score"] = combined[chunk_id]["score"] + keyword_score
        else:
            combined[chunk_id] = {
                **result,
                "score": keyword_score,
            }

    ranked = list(combined.values())
    ranked.sort(key=lambda item: item["score"], reverse=True)

    return ranked


def diversify_by_page(results, limit):
    """Cap how many chunks come from any single (document, page) so retrieval spreads
    across pages and papers rather than piling onto one dense page."""
    selected = []
    page_counts = defaultdict(int)

    for result in results:
        page_key = (result.get("url", ""), (result.get("metadata") or {}).get("page"))

        if page_counts[page_key] >= 3:
            continue

        selected.append(result)
        page_counts[page_key] += 1

        if len(selected) >= limit:
            break

    return selected


def search_lab(query, limit, doc_id=None, item_keys=None):
    query_vector = embed_texts([query])[0]

    vector_limit = max(limit * 5, 30)
    keyword_limit = max(limit * 5, 30)

    try:
        vector_results = normalize_vector_results(
            search_lab_chunks(query_vector, vector_limit, doc_id=doc_id, item_keys=item_keys)
        )
    except Exception:
        logger.warning(
            "Lab vector search failed; degrading to keyword-only results",
            exc_info=True,
        )
        vector_results = []

    keyword_results = get_keyword_candidates(query, keyword_limit, doc_id=doc_id, item_keys=item_keys)

    combined_results = combine_results(vector_results, keyword_results)
    results = diversify_by_page(combined_results, limit)

    return {
        "query": query,
        "count": len(results),
        "results": results,
    }
