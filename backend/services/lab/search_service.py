import logging
import math
import re
from collections import Counter, defaultdict

from services.lab.embedding_service import embed_texts
from services.lab.manifest_loader import load_manifest_chunks
from services.lab.qdrant_store import search_lab_chunks

logger = logging.getLogger(__name__)


STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "can",
    "do",
    "does",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "it",
    "make",
    "me",
    "my",
    "of",
    "on",
    "or",
    "the",
    "this",
    "to",
    "use",
    "using",
    "what",
    "when",
    "where",
    "which",
    "with",
}


def tokenize(value):
    if not value:
        return []

    tokens = re.findall(r"[a-zA-Z0-9][a-zA-Z0-9_\-+.]*", value.lower())

    return [
        token
        for token in tokens
        if token not in STOP_WORDS and len(token) > 1
    ]


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
    manifest_result = load_manifest_chunks()
    chunks = manifest_result["chunks"]

    # Per-document scope (used by /compare): restrict the BM25 index to this paper's
    # chunks so keyword candidates can never bleed in from other documents. The Zotero
    # navigator scopes to a selection (`item_keys`, a set of itemKeys / sourceIds).
    if doc_id:
        chunks = [c for c in chunks if c.get("sourceId") == doc_id]
    elif item_keys:
        chunks = [c for c in chunks if c.get("sourceId") in item_keys]

    query_tokens = tokenize(query)

    if not query_tokens:
        return []

    index = build_bm25_index(chunks)
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
