"""Thin OpenAlex client - the one online dependency of the citation map.

We send only a paper's public DOI to OpenAlex (free, no account/key, CC0 data) to get its
canonical id + clean reference list, then resolve those reference ids to titles/years.
Anonymous by design: no mailto/email, a generic User-Agent, the shared common pool. Calls
are tolerant - any failure returns None / partial data so a build degrades gracefully
rather than raising.
"""

import logging
import os
import random
import time

import requests

logger = logging.getLogger(__name__)

_BASE = "https://api.openalex.org"
_HEADERS = {"User-Agent": "InScien/1.0"}
_TIMEOUT = 20
_SELECT = "id,display_name,publication_year,publication_date,doi,cited_by_count"
_TRANSIENT = {429, 500, 502, 503, 504}
# A flaky network or a 429 burst shouldn't silently drop papers/refs from the graph: retry a
# few times with exponential backoff + jitter instead of one-and-done.
_MAX_ATTEMPTS = int(os.getenv("OPENALEX_RETRIES", "4"))
_BACKOFF_BASE = 0.5
_BACKOFF_CAP = 10.0


def _sleep_backoff(attempt, resp):
    """Exponential backoff with jitter; honor a 429 Retry-After header when present."""
    delay = min(_BACKOFF_BASE * (2 ** attempt), _BACKOFF_CAP)
    if resp is not None and resp.status_code == 429:
        retry_after = resp.headers.get("Retry-After")
        if retry_after:
            try:
                delay = max(delay, float(retry_after))
            except ValueError:
                pass
    time.sleep(delay + random.uniform(0, 0.3))


def _short_id(openalex_id):
    """'https://openalex.org/W123' -> 'W123' (filters want the bare id)."""
    return (openalex_id or "").rstrip("/").rsplit("/", 1)[-1]


def _strip_doi(doi_url):
    """OpenAlex returns DOIs as 'https://doi.org/10.x' - keep the bare '10.x'."""
    if not doi_url:
        return None
    for prefix in ("https://doi.org/", "http://doi.org/", "doi.org/"):
        if doi_url.lower().startswith(prefix):
            return doi_url[len(prefix):]
    return doi_url


def _get(url, params=None):
    """GET with bounded exponential-backoff retries on transient errors; None on hard failure."""
    last = _MAX_ATTEMPTS - 1
    for attempt in range(_MAX_ATTEMPTS):
        try:
            resp = requests.get(url, params=params, headers=_HEADERS, timeout=_TIMEOUT)
            if resp.status_code == 404:
                return None
            if resp.status_code in _TRANSIENT:
                if attempt < last:
                    _sleep_backoff(attempt, resp)
                    continue
                logger.warning("OpenAlex %s after %d attempts: %s", resp.status_code, _MAX_ATTEMPTS, url)
                return None
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            if attempt < last:
                _sleep_backoff(attempt, None)
                continue
            logger.warning("OpenAlex request failed after %d attempts (%s): %s", _MAX_ATTEMPTS, url, exc)
            return None
    return None


def fetch_work(doi):
    """A paper's OpenAlex record by DOI, or None (no DOI / 404 / error).

    Returns {openalexId, year, date, citedByCount, referencedWorks:[full openalex id urls]}.
    """
    if not doi:
        return None
    data = _get(f"{_BASE}/works/https://doi.org/{doi}")
    if not data or not data.get("id"):
        return None
    return {
        "openalexId": data["id"],
        "year": data.get("publication_year"),
        "date": data.get("publication_date"),
        "citedByCount": data.get("cited_by_count"),
        "referencedWorks": data.get("referenced_works") or [],
    }


def fetch_citing_works(openalex_id, limit=100):
    """Works that CITE the given paper (the forward / Cited-by direction).

    Uses OpenAlex `filter=cites:<id>`, most-influential first (`sort=cited_by_count:desc`),
    cursor-paginated and capped at `limit` so a landmark paper's thousands of citers don't
    blow up the graph. Returns a list of full OpenAlex id urls (like `referencedWorks`).
    """
    short = _short_id(openalex_id)
    if not short:
        return []
    out = []
    cursor = "*"
    while len(out) < limit:
        data = _get(
            f"{_BASE}/works",
            params={
                "filter": f"cites:{short}",
                "select": "id",
                "sort": "cited_by_count:desc",
                "per-page": 50,
                "cursor": cursor,
            },
        )
        if not data:
            break
        results = data.get("results") or []
        out.extend(w["id"] for w in results if w.get("id"))
        cursor = (data.get("meta") or {}).get("next_cursor")
        if not cursor or not results:
            break
    return out[:limit]


def resolve_works(ids):
    """Resolve OpenAlex work ids to metadata.

    `ids` are full id urls (as found in `referencedWorks`). Returns
    {fullId: {title, year, doi, citedBy}} - keyed by the full id so callers can match the
    ids they passed in. Batches of <=50 (one page each); partial failures are skipped.
    """
    out = {}
    unique = [i for i in dict.fromkeys(ids) if i]
    for start in range(0, len(unique), 50):
        chunk = unique[start:start + 50]
        joined = "|".join(_short_id(i) for i in chunk)
        data = _get(
            f"{_BASE}/works",
            params={"filter": f"openalex_id:{joined}", "select": _SELECT, "per-page": 100},
        )
        if not data:
            continue
        for work in data.get("results", []):
            wid = work.get("id")
            if not wid:
                continue
            out[wid] = {
                "title": work.get("display_name"),
                "year": work.get("publication_year"),
                "date": work.get("publication_date"),
                "doi": _strip_doi(work.get("doi")),
                "citedBy": work.get("cited_by_count"),
            }
    return out
