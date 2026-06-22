import re
from collections import defaultdict

from services.lab.text_utils import tokenize


def result_search_text(result):
    return "\n".join([
        result.get("title", ""),
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
        "contentMode": result.get("contentMode", ""),
        # Page-precise citation surface: the page the passage was on, and the
        # exact retrieved passage so the UI can show it on click.
        "page": meta.get("page"),
        "passage": _passage_snippet(result.get("text", "")),
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
    multi_chunk_bonus = min(len(group["results"]), 3) * 0.015

    return float(group["best_score"]) + normalized_coverage + multi_chunk_bonus


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


_CITATION_MARKER_RE = re.compile(r"\[(\d+)\]")


def _citation_markers(text):
    return {int(n) for n in _CITATION_MARKER_RE.findall(text or "")}


def accept_revision(original, revised):
    """Accept a grounding judge's rewrite only if it doesn't regress the answer.

    The judge is the same local model that drafted the answer, so its rewrite can drop
    [n] citations (defeating page-precise/doc-level citations) or truncate. Keep the
    rewrite only when it preserves the original's citations (allowing at most one dropped
    marker for a legitimately removed unsupported claim) and isn't drastically shorter;
    otherwise the caller keeps the original. Shared by the chat agent and the /write skill.
    """
    if not revised or not revised.strip():
        return False
    orig = _citation_markers(original)
    new = _citation_markers(revised)
    if orig and len(orig & new) < max(1, len(orig) - 1):
        return False
    if len(revised.strip()) < 0.5 * len(original.strip()):
        return False
    return True
