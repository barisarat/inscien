"""Third step: resolve each extracted reference to a canonical work and attach a citation count.

The APIs are used ONLY for the two things they are reliably good at:
  - resolution (does this reference string correspond to a known work?)
  - citation counts (how many times has that work been cited?)
They are never asked for a reference LIST - that is what the PDF is for. OpenAlex returns partial
or empty reference lists for arXiv and ACL DOIs while reporting citation counts correctly, which
is the whole reason this pipeline exists.

Resolution is cheapest-first: a batched OpenAlex DOI lookup for everything that printed a DOI or
an arXiv id, then a per-title OpenAlex search, then Crossref's bibliographic match, then a
Semantic Scholar title match. Every candidate passes the same title check, so a near-miss becomes
an unresolved leaf rather than a wrong node. Counts come from Semantic Scholar wherever it knows
the work (see `s2_counts`).

INSCIEN_CONTACT_EMAIL, when set, is sent as the `mailto` both OpenAlex and Crossref ask polite
clients for; S2_API_KEY (free) lifts Semantic Scholar's shared rate limit.
"""

import os
import time
from datetime import date

import regex as re
import requests

from inscien.refs.parse import title_key

OPENALEX = "https://api.openalex.org"
CROSSREF = "https://api.crossref.org/works"
S2_BATCH = "https://api.semanticscholar.org/graph/v1/paper/batch"
S2_MATCH = "https://api.semanticscholar.org/graph/v1/paper/search/match"
SELECT = "id,display_name,publication_year,publication_date,doi,cited_by_count,referenced_works_count,type"
USER_AGENT = "InScien (local reference library; https://github.com/barisarat/inscien)"
MIN_INTERVAL = 0.12
REQ_TIMEOUT = 20  # every request is bounded: one stalled fetch must not hang a build
S2_CHUNK = 400

_session = requests.Session()
_session.headers["User-Agent"] = USER_AGENT
_last = 0.0
# OpenAlex meters a DAILY budget and answers 429 "Insufficient budget ... Resets at midnight UTC"
# once it is spent. That is not transient, so it stops OpenAlex calls for the rest of the run
# and lets Crossref and S2 carry resolution.
_openalex_budget_spent = False


def _contact() -> str | None:
    return (os.getenv("INSCIEN_CONTACT_EMAIL") or "").strip() or None


def _openalex(path: str, params: dict) -> dict | None:
    global _last, _openalex_budget_spent
    if _openalex_budget_spent:
        return None
    gap = MIN_INTERVAL - (time.time() - _last)
    if gap > 0:
        time.sleep(gap)
    params = dict(params)
    if _contact():
        params["mailto"] = _contact()
    for attempt in range(4):
        _last = time.time()
        try:
            res = _session.get(OPENALEX + path, params=params, timeout=REQ_TIMEOUT)
            if res.status_code == 404:
                return None
            if res.status_code == 429:
                body = res.text or ""
                try:
                    retry_after = float((res.json() or {}).get("retryAfter") or 0)
                except ValueError:
                    retry_after = 0
                if re.search(r"budget", body, re.I) or retry_after > 300:
                    _openalex_budget_spent = True
                    print("openalex: daily budget spent - Crossref and S2 carry the rest of this build")
                    return None
                time.sleep(min(0.5 * 2 ** attempt, 8))
                continue
            if res.status_code in (500, 502, 503, 504):
                time.sleep(min(0.5 * 2 ** attempt, 8))
                continue
            if not res.ok:
                return None
            return res.json()
        except (requests.RequestException, ValueError):
            time.sleep(min(0.5 * 2 ** attempt, 8))
    return None


def openalex_available() -> bool:
    return not _openalex_budget_spent


def _searchable(title: str) -> str:
    """OpenAlex title.search chokes on punctuation; search on words only."""
    return re.sub(r"\s+", " ", re.sub(r"[^\p{L}\p{N}]+", " ", title)).strip()


def title_match(ref: dict, work: dict) -> str | None:
    """Accept a candidate, and say WHY:
      exact    the normalized titles are identical
      prefix   the citing paper truncated a subtitle
      overlap  near-identical wording, used only with a year sanity check
    The printed year is NOT a hard gate on an exact title: a preprint is cited by its revision
    year while the API carries the v1 year. A wrong year on an identical title is a metadata
    discrepancy, not a different paper."""
    a, b = title_key(ref.get("title")), title_key(work.get("display_name"))
    if not a or not b:
        return None
    if a == b:
        return "exact"
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    if len(short) >= 25 and long_.startswith(short):
        return "prefix"
    wa, wb = set(a.split(" ")), set(b.split(" "))
    inter = len(wa & wb)
    jac = inter / (len(wa) + len(wb) - inter)
    year, wyear = ref.get("year"), work.get("publication_year")
    year_ok = not year or not wyear or abs(wyear - year) <= 3
    if jac >= 0.9 and year_ok:
        return "overlap"
    return None


def _strip_doi(doi) -> str | None:
    return re.sub(r"^https?://(dx\.)?doi\.org/", "", doi or "", flags=re.I).lower() or None


def _work_fields(w: dict) -> dict:
    return {
        "openalexId": w.get("id"),
        "matchedTitle": w.get("display_name"),
        "matchedYear": w.get("publication_year"),
        "date": w.get("publication_date") or None,
        "doi": _strip_doi(w.get("doi")),
        "citedBy": w.get("cited_by_count"),
        "apiReferenceCount": w.get("referenced_works_count"),
        "type": w.get("type"),
    }


def candidate_doi(ref: dict) -> str | None:
    """A reference's best DOI: the printed one, or the DataCite DOI an arXiv id always has."""
    if ref.get("doi"):
        return ref["doi"].lower()
    return f"10.48550/arxiv.{ref['arxivId']}" if ref.get("arxivId") else None


def _crossref_lookup(ref: dict) -> dict | None:
    """Crossref's query.bibliographic matches a printed reference string to a record and carries
    proceedings and older journal articles OpenAlex does not. Guarded by the same title check:
    asked for a TREC 2023 overview it returns the 2020 one, which is rejected, not accepted."""
    q = " ".join(str(x) for x in (ref.get("title"), (ref.get("authors") or [None])[0], ref.get("year")) if x)
    params = {"query.bibliographic": q, "rows": "5", "select": "DOI,title,issued,is-referenced-by-count"}
    if _contact():
        params["mailto"] = _contact()
    try:
        res = _session.get(CROSSREF, params=params, timeout=REQ_TIMEOUT)
        if not res.ok:
            return None
        items = ((res.json() or {}).get("message") or {}).get("items") or []
    except (requests.RequestException, ValueError):
        return None
    for it in items:
        title = (it.get("title") or [None])[0]
        if not title:
            continue
        year = (((it.get("issued") or {}).get("date-parts") or [[None]])[0] or [None])[0]
        verdict = title_match(ref, {"display_name": title, "publication_year": year})
        if verdict:
            return {"doi": (it.get("DOI") or "").lower(), "title": title, "year": year,
                    "crossrefCitedBy": it.get("is-referenced-by-count"), "verdict": verdict}
    return None


def resolved_index(papers: list[dict]) -> dict:
    """Every confirmed resolution in the library, keyed by DOI and title key, so the second paper
    that cites a work costs no request for it. Identity is the expensive part and does not go
    stale; counts are refreshed on every build by the S2 batch."""
    idx = {}
    for p in papers:
        for r in p.get("references") or []:
            resolved = r.get("resolved") or {}
            if resolved.get("confidence") != "confirmed":
                continue
            for k in (resolved.get("doi"), candidate_doi(r), r.get("key")):
                if k and k not in idx:
                    idx[k] = resolved
    return idx


def _days_between(a: str, b: str) -> float:
    return abs((date.fromisoformat(a[:10]) - date.fromisoformat(b[:10])).days)


# --- Semantic Scholar: the citation counts ----------------------------------------------------
#
# S2 is the count source. OpenAlex and Crossref can only count a citation whose citing paper had
# its reference list deposited by a publisher, and arXiv deposits none, so an arXiv-native paper
# is undercounted by about an order of magnitude (Constitutional AI 328 vs 3587). S2 parses
# reference lists out of PDFs itself. One POST covers hundreds of ids, and it runs on EVERY build,
# cached references included, so every node is measured on one scale.

def _as_s2_id(value) -> str | None:
    """"10.48550/arXiv.2306.05685" is the DataCite DOI of an arXiv posting; S2 404s on it but
    answers to the arXiv id inside it."""
    if not value:
        return None
    value = str(value)
    m = (re.match(r"(?:arxiv:)?(\d{4}\.\d{4,5})(?:v\d+)?$", value, re.I)
         or re.match(r"10\.48550/arxiv\.(\d{4}\.\d{4,5})(?:v\d+)?$", value, re.I))
    if m:
        return f"arXiv:{m[1]}"
    return f"DOI:{value}" if value.startswith("10.") else None


def _s2_id(ref: dict) -> str | None:
    return ref.get("_forced") or _as_s2_id(ref.get("arxivId")) or _as_s2_id(
        ref.get("doi") or (ref.get("resolved") or {}).get("doi"))


def _s2_headers() -> dict:
    key = (os.getenv("S2_API_KEY") or "").strip()
    return {"x-api-key": key} if key else {}


def s2_counts(refs: list[dict]) -> dict:
    """{s2 id: row} for every reference S2 knows, batched."""
    by_id = {}
    ids = list(dict.fromkeys(i for i in (_s2_id(r) for r in refs) if i))
    for start in range(0, len(ids), S2_CHUNK):
        chunk = ids[start:start + S2_CHUNK]
        for attempt in range(5):
            try:
                res = _session.post(S2_BATCH, params={"fields": "title,citationCount,referenceCount,publicationDate,year"},
                                    json={"ids": chunk}, headers=_s2_headers(), timeout=60)
                # Unauthenticated requests share one global pool and 429 readily.
                if res.status_code == 429:
                    time.sleep(8 * (attempt + 1))
                    continue
                if not res.ok:
                    break
                rows = res.json()
                if not isinstance(rows, list):
                    break
                for i, row in enumerate(rows):
                    if row:
                        by_id[chunk[i]] = row
                break
            except (requests.RequestException, ValueError):
                time.sleep(5 * (attempt + 1))
    return by_id


def s2_paper(id_like) -> dict | None:
    """One paper's own S2 record, for the count on its node - from the same source as its
    references, or it would sit tiers off the scale."""
    sid = _as_s2_id(id_like)
    if not sid:
        return None
    return s2_counts([{"_forced": sid}]).get(sid)


def s2_match(ref: dict) -> dict | None:
    """S2 title match for references that printed no identifier (books, older papers). One
    request each, so it is only used after the cheap routes, and guarded by the title check."""
    title = ref.get("title")
    if not title or len(title) < 12:
        return None
    for attempt in range(4):
        try:
            res = _session.get(S2_MATCH, params={"query": title, "fields": "title,citationCount,year,publicationDate,externalIds"},
                               headers=_s2_headers(), timeout=30)
            if res.status_code == 429:
                time.sleep(6 * (attempt + 1))
                continue
            if res.status_code == 404 or not res.ok:
                return None  # 404 is S2 saying "no match", which is an answer
            hit = ((res.json() or {}).get("data") or [None])[0]
            if not hit:
                return None
            verdict = title_match(ref, {"display_name": hit.get("title"), "publication_year": hit.get("year")})
            return {**hit, "verdict": verdict} if verdict else None
        except (requests.RequestException, ValueError):
            time.sleep(4 * (attempt + 1))
    return None


def enrich(refs: list[dict], stamp: str, index: dict | None = None, max_age_days: int = 90,
           log=print) -> list[dict]:
    index = index or {}

    def fresh(r):
        for k in (candidate_doi(r), r.get("key")):
            hit = index.get(k) if k else None
            if hit and hit.get("at") and _days_between(hit["at"], stamp) <= max_age_days:
                return hit
        return None

    cached = {}
    for r in refs:
        hit = fresh(r)
        if hit:
            cached[r["n"]] = hit

    by_doi = {}
    wanted = list(dict.fromkeys(d for d in (candidate_doi(r) for r in refs if r["n"] not in cached) if d))
    for i in range(0, len(wanted), 40):
        chunk = wanted[i:i + 40]
        data = _openalex("/works", {"filter": f"doi:{'|'.join(chunk)}", "select": SELECT, "per-page": 50})
        for w in (data or {}).get("results") or []:
            if _strip_doi(w.get("doi")):
                by_doi[_strip_doi(w.get("doi"))] = w

    out = []
    for r in refs:
        rec = dict(r)
        reuse = cached.get(r["n"])
        if reuse:
            rec["resolved"] = {**reuse, "fromLibrary": True}
            out.append(rec)
            continue
        cd = candidate_doi(r)
        hit = by_doi.get(cd) if cd else None
        if hit:
            rec["resolved"] = {**_work_fields(hit), "via": "doi", "confidence": "confirmed", "at": stamp}
        elif r.get("title"):
            data = _openalex("/works", {"filter": f"title.search:{_searchable(r['title'])}", "select": SELECT, "per-page": 10})
            cands = (data or {}).get("results") or []
            match = via = None
            for w in cands:
                verdict = title_match(r, w)
                if verdict:
                    match, via = w, verdict
                    break
            if match:
                rec["resolved"] = {**_work_fields(match), "via": f"title:{via}", "confidence": "confirmed", "at": stamp}
            else:
                cr = _crossref_lookup(r)
                if cr:
                    # Prefer OpenAlex for the count even when Crossref found the record, so counts
                    # stay comparable; fall back to Crossref's own count only when OpenAlex has none.
                    back = _openalex("/works", {"filter": f"doi:{cr['doi']}", "select": SELECT, "per-page": 1})
                    w = ((back or {}).get("results") or [None])[0]
                    if w:
                        rec["resolved"] = {**_work_fields(w), "via": f"crossref:{cr['verdict']}", "confidence": "confirmed",
                                           "at": stamp, "citedBySource": "openalex"}
                    else:
                        rec["resolved"] = {"openalexId": None, "matchedTitle": cr["title"], "matchedYear": cr["year"],
                                           "doi": cr["doi"], "citedBy": cr["crossrefCitedBy"], "via": f"crossref:{cr['verdict']}",
                                           "confidence": "confirmed", "at": stamp, "citedBySource": "crossref"}
                else:
                    near = cands[0] if cands else None
                    rec["resolved"] = {"via": "title", "confidence": "unresolved", "at": stamp,
                                       "nearest": {"title": near.get("display_name"), "year": near.get("publication_year")} if near else None}
        else:
            rec["resolved"] = {"via": "none", "confidence": "unresolved", "at": stamp}
        out.append(rec)

    # Overwrite every count S2 can supply, cached or fresh, so the library is on one scale.
    by_id = s2_counts(out)
    upgraded = 0
    for rec in out:
        row = by_id.get(_s2_id(rec))
        if not row or not isinstance(row.get("citationCount"), int):
            continue
        res = rec.setdefault("resolved", {})
        res["citedBy"] = row["citationCount"]
        res["citedBySource"] = "s2"
        res["at"] = stamp
        if not res.get("date") and row.get("publicationDate"):
            res["date"] = row["publicationDate"]
        # An S2 hit on a printed identifier IS a resolution: the id matched a real record.
        if res.get("confidence") != "confirmed":
            res["confidence"] = "confirmed"
            res["via"] = f"{res['via']}+s2" if res.get("via") else "s2:id"
            res["matchedTitle"] = res.get("matchedTitle") or row.get("title")
            res["matchedYear"] = res.get("matchedYear") or row.get("year")
        upgraded += 1
    if upgraded:
        log(f"s2: {upgraded} citation counts")

    matched = 0
    for rec in [r for r in out if (r.get("resolved") or {}).get("confidence") != "confirmed" and r.get("title")]:
        hit = s2_match(rec)
        if hit:
            rec["resolved"] = {
                "openalexId": None, "matchedTitle": hit.get("title"), "matchedYear": hit.get("year"),
                "doi": str(hit["externalIds"]["DOI"]).lower() if (hit.get("externalIds") or {}).get("DOI") else None,
                "citedBy": hit.get("citationCount"), "citedBySource": "s2", "date": hit.get("publicationDate") or None,
                "via": f"s2:title:{hit['verdict']}", "confidence": "confirmed", "at": stamp,
            }
            matched += 1
        time.sleep(1.2)
    if matched:
        log(f"s2: {matched} matched by title")
    return out


def fetch_paper(doi: str) -> dict | None:
    data = _openalex("/works", {"filter": f"doi:{doi}", "select": SELECT, "per-page": 1})
    w = ((data or {}).get("results") or [None])[0]
    return _work_fields(w) if w else None
