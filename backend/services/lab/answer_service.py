import re
from collections import defaultdict

from core.db import SessionLocal
from services.llm.client import chat_create, delta_of, text_of
from services.lab.prompt_service import build_lab_answer_prompt
from services.lab.search_service import search_lab
from services.lab.settings import get_lab_settings


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


SOURCE_BOOSTS = {}


INSUFFICIENT_PHRASES = [
    "could not find",
    "do not contain",
    "don't contain",
    "not contain enough",
    "sources are insufficient",
    "no relevant",
    "isn't in the",
    "is not in the",
]


def detect_insufficient(answer):
    lower_answer = answer.lower()
    return any(phrase in lower_answer for phrase in INSUFFICIENT_PHRASES)


def tokenize(value):
    if not value:
        return []

    tokens = re.findall(r"[a-zA-Z0-9][a-zA-Z0-9_\-+.]*", value.lower())

    return [
        token
        for token in tokens
        if token not in STOP_WORDS and len(token) > 1
    ]


def result_search_text(result):
    return "\n".join([
        result.get("title", ""),
        result.get("description", ""),
        result.get("category", ""),
        result.get("sectionTitle", ""),
        result.get("text", ""),
    ])


def _passage_snippet(text, limit=400):
    text = " ".join((text or "").split())
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0] + "…"


def make_citation(result):
    meta = result.get("metadata") or {}
    return {
        "title": result.get("title", ""),
        "url": result.get("url", ""),
        # Document id — lets the UI open the source PDF at the cited page.
        "sourceId": result.get("sourceId", ""),
        "sourceType": result.get("sourceType", ""),
        "category": result.get("category", ""),
        "sectionTitle": result.get("sectionTitle", ""),
        "contentMode": result.get("contentMode", ""),
        # Page-precise citation surface: the page the passage was on, and the
        # exact retrieved passage so the UI can show it on click.
        "page": meta.get("page"),
        "passage": _passage_snippet(result.get("text", "")),
    }


def make_selected_source(result):
    return {
        "score": float(result.get("score", 0)),
        "sourceType": result.get("sourceType", ""),
        "sourceId": result.get("sourceId", ""),
        "chunkId": result.get("chunkId", ""),
        "parentId": result.get("parentId", ""),
        "title": result.get("title", ""),
        "description": result.get("description", ""),
        "category": result.get("category", ""),
        "sectionTitle": result.get("sectionTitle", ""),
        "url": result.get("url", ""),
        "externalUrl": result.get("externalUrl", ""),
        "contentMode": result.get("contentMode", ""),
        "metadata": result.get("metadata", {}),
    }


def group_results_by_url(results):
    groups = {}

    for result in results:
        url = result.get("url", "")

        if not url:
            continue

        if url not in groups:
            groups[url] = {
                "url": url,
                "results": [],
                "best_score": 0,
                "source_type": result.get("sourceType", ""),
            }

        groups[url]["results"].append(result)
        groups[url]["best_score"] = max(groups[url]["best_score"], float(result.get("score", 0)))

    for group in groups.values():
        group["results"].sort(key=lambda item: float(item.get("score", 0)), reverse=True)

    return list(groups.values())


def build_group_token_frequency(groups, query_tokens):
    frequency = defaultdict(int)

    for group in groups:
        group_text = " ".join(result_search_text(result) for result in group["results"])
        group_tokens = set(tokenize(group_text))

        for token in query_tokens:
            if token in group_tokens:
                frequency[token] += 1

    return frequency


def score_group(group, query_tokens, token_frequency, group_count):
    group_text = " ".join(result_search_text(result) for result in group["results"])
    group_tokens = set(tokenize(group_text))

    coverage_score = 0

    for token in query_tokens:
        if token not in group_tokens:
            continue

        frequency = token_frequency.get(token, group_count)
        rarity_weight = 1 / max(frequency, 1)
        coverage_score += rarity_weight

    normalized_coverage = coverage_score / max(len(query_tokens), 1)
    source_boost = SOURCE_BOOSTS.get(group.get("source_type", ""), 0)
    multi_chunk_bonus = min(len(group["results"]), 3) * 0.015

    return float(group["best_score"]) + normalized_coverage + source_boost + multi_chunk_bonus


def select_answer_context(query, results, max_items):
    if not results:
        return []

    query_tokens = list(dict.fromkeys(tokenize(query)))

    if not query_tokens:
        return results[:max_items]

    groups = group_results_by_url(results)

    if not groups:
        return results[:max_items]

    token_frequency = build_group_token_frequency(groups, query_tokens)

    for group in groups:
        group["group_score"] = score_group(
            group,
            query_tokens,
            token_frequency,
            len(groups),
        )

    groups.sort(key=lambda item: item["group_score"], reverse=True)

    best_group = groups[0]
    best_score = float(best_group["group_score"])
    selected = []

    for result in best_group["results"][:3]:
        selected.append(result)

        if len(selected) >= max_items:
            return selected

    for group in groups[1:]:
        group_score = float(group["group_score"])

        if group_score < best_score * 0.82:
            continue

        selected.append(group["results"][0])

        if len(selected) >= max_items:
            return selected

    if len(selected) < max_items:
        seen = {
            result.get("chunkId", "")
            for result in selected
        }

        for result in results:
            chunk_id = result.get("chunkId", "")

            if chunk_id in seen:
                continue

            selected.append(result)
            seen.add(chunk_id)

            if len(selected) >= max_items:
                break

    return selected


def unique_citations(results, max_items):
    seen = set()
    citations = []

    for result in results:
        key = (
            result.get("title", ""),
            result.get("url", ""),
            result.get("sectionTitle", ""),
        )

        if key in seen:
            continue

        seen.add(key)
        citations.append(make_citation(result))

        if len(citations) >= max_items:
            break

    return citations


def remove_invalid_citation_markers(answer, citation_count):
    def replace_marker(match):
        citation_number = int(match.group(1))

        if citation_number < 1 or citation_number > citation_count:
            return ""

        return match.group(0)

    cleaned = re.sub(r"\[(\d+)\]", replace_marker, answer)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)

    return cleaned.strip()


# Chat-completions text/delta extraction lives in services.llm.client
# (text_of / delta_of), imported above.


def resolve_user_snapshot(db, credentials):
    # InScien is single-user / local with no auth.
    return {"user_id": None, "user_email": None, "user_tier": None}


def safe_save_lab_query_event(
    db,
    credentials,
    anonymous_id,
    query,
    answer,
    citations,
    selected_sources,
    retrieved_count,
    insufficient,
    request_metadata,
):
    # Query-event analytics logging is dropped for the local single-user tool.
    return


def answer_lab(
    query,
    limit,
    db=None,
    credentials=None,
    anonymous_id="",
    request_metadata=None,
):
    settings = get_lab_settings()
    retrieval_limit = max(limit, 20)
    search_result = search_lab(query, retrieval_limit)
    results = search_result["results"]

    if not results:
        answer = "I could not find enough internal source material to answer this."
        citations = []
        selected_sources = []
        insufficient = True

        safe_save_lab_query_event(
            db=db,
            credentials=credentials,
            anonymous_id=anonymous_id,
            query=query,
            answer=answer,
            citations=citations,
            selected_sources=selected_sources,
            retrieved_count=0,
            insufficient=insufficient,
            request_metadata=request_metadata,
        )

        return {
            "query": query,
            "answer": answer,
            "citations": citations,
            "related": [],
            "retrievedCount": 0,
            "insufficientContext": insufficient,
        }

    context_results = select_answer_context(query, results, 4)
    citations = unique_citations(context_results, 4)
    selected_sources = [
        make_selected_source(result)
        for result in context_results
    ]

    prompt = build_lab_answer_prompt(query, context_results)

    response = chat_create(
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1000,
    )

    answer = text_of(response)

    if not answer:
        answer = "I could not generate an answer from the retrieved internal sources."

    answer = remove_invalid_citation_markers(answer, len(citations))

    insufficient = detect_insufficient(answer)

    safe_save_lab_query_event(
        db=db,
        credentials=credentials,
        anonymous_id=anonymous_id,
        query=query,
        answer=answer,
        citations=citations,
        selected_sources=selected_sources,
        retrieved_count=len(results),
        insufficient=insufficient,
        request_metadata=request_metadata,
    )

    return {
        "query": query,
        "answer": answer,
        "citations": citations,
        "related": [],
        "retrievedCount": len(results),
        "insufficientContext": insufficient,
    }


def stream_lab_answer(
    query,
    limit,
    credentials=None,
    anonymous_id="",
    request_metadata=None,
):
    """Generator yielding SSE protocol dicts for the lab answer flow.

    Mirrors answer_lab but reports progress in phases and streams the model's
    answer tokens as they arrive. Opens its own DB session because a streaming
    response outlives a request-scoped Depends(get_db) session.
    """
    settings = get_lab_settings()
    db = SessionLocal()

    try:
        yield {"type": "stage", "stage": "searching"}

        retrieval_limit = max(limit, 20)
        search_result = search_lab(query, retrieval_limit)
        results = search_result["results"]

        if not results:
            yield {"type": "stage", "stage": "reading"}

            answer = "I could not find enough internal source material to answer this."

            safe_save_lab_query_event(
                db=db,
                credentials=credentials,
                anonymous_id=anonymous_id,
                query=query,
                answer=answer,
                citations=[],
                selected_sources=[],
                retrieved_count=0,
                insufficient=True,
                request_metadata=request_metadata,
            )

            yield {
                "type": "final",
                "query": query,
                "answer": answer,
                "citations": [],
                "related": [],
                "retrievedCount": 0,
                "insufficientContext": True,
            }
            return

        yield {"type": "stage", "stage": "reading"}

        context_results = select_answer_context(query, results, 4)
        citations = unique_citations(context_results, 4)
        selected_sources = [
            make_selected_source(result)
            for result in context_results
        ]

        yield {"type": "stage", "stage": "drafting"}

        # Citations are fixed before generation (they define the [n] numbering the
        # model is told to use), so send them up front. This lets the frontend
        # render inline citation chips and the Sources list live during streaming
        # instead of only after the "final" event.
        yield {"type": "citations", "citations": citations}

        prompt = build_lab_answer_prompt(query, context_results)
        messages = [{"role": "user", "content": prompt}]

        accumulated = ""

        try:
            stream = chat_create(messages=messages, max_tokens=1000, stream=True)

            for chunk in stream:
                delta = delta_of(chunk)

                if delta:
                    accumulated += delta
                    yield {"type": "delta", "text": delta}
        except Exception:
            accumulated = ""

        if not accumulated:
            # Fallback to a single blocking call if streaming produced nothing.
            response = chat_create(messages=messages, max_tokens=1000)
            accumulated = text_of(response)

        answer = accumulated

        if not answer:
            answer = "I could not generate an answer from the retrieved internal sources."

        answer = remove_invalid_citation_markers(answer, len(citations))
        insufficient = detect_insufficient(answer)

        safe_save_lab_query_event(
            db=db,
            credentials=credentials,
            anonymous_id=anonymous_id,
            query=query,
            answer=answer,
            citations=citations,
            selected_sources=selected_sources,
            retrieved_count=len(results),
            insufficient=insufficient,
            request_metadata=request_metadata,
        )

        yield {
            "type": "final",
            "query": query,
            "answer": answer,
            "citations": citations,
            "related": [],
            "retrievedCount": len(results),
            "insufficientContext": insufficient,
        }
    except Exception as error:
        yield {
            "type": "error",
            "message": str(error) or "Failed to generate an answer.",
        }
    finally:
        db.close()
