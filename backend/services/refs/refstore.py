"""OpenAlex-backed reference cache for the Map's Citations lens, scoped to the selection.

Per-paper records keyed by Zotero itemKey, persisted to a single JSON cache. A record is one of:
  mapped     - DOI resolved in OpenAlex; has openalexId + resolved references
  no_doi     - the Zotero item has no DOI field
  not_found  - has a DOI but OpenAlex returned nothing (404 / error)

`mapped` records are cached permanently (skipped on re-fetch). Misses (no_doi/not_found)
are always retried - a DOI may have been added to Zotero since, and re-checking is cheap.
"""

import json
import os
import time
from collections import defaultdict
from pathlib import Path

from core.paths import data_path
from services.refs.openalex import fetch_citing_works, fetch_work, resolve_works
from services.state_guard import DERIVED_STATE_LOCK, current_generation, ensure_current_generation
from services.zotero.reader import item_metadata, item_primary_collection

CACHE_PATH = Path(os.getenv("OPENALEX_CACHE_PATH") or data_path("openalex.json"))

# Cap on forward citers fetched per paper (Cited-by lens) - most-influential first.
CITING_LIMIT = int(os.getenv("OPENALEX_CITING_LIMIT", "100"))
# A reference cited by at least this many of your selected papers is a "gap" worth surfacing.
GAP_MIN = int(os.getenv("OPENALEX_GAP_MIN", "2"))

# Bump when the cached record shape changes so older records are transparently re-fetched
# (a mapped record from an earlier schema is treated as unmapped -> re-fetched on demand).
# v2 added publication_date on the paper and its references.
SCHEMA_VERSION = 2


def _load():
    if not CACHE_PATH.exists():
        return {}
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}


def _save(cache):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CACHE_PATH.with_name(CACHE_PATH.name + ".tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    tmp.replace(CACHE_PATH)


def reset_cache():
    """Drop the OpenAlex cache so a corpus reset doesn't leave records keyed to
    itemKeys that no longer exist."""
    CACHE_PATH.unlink(missing_ok=True)


def prune_orphans():
    """Drop cached records for itemKeys no longer in the live Zotero library (deleted papers).
    Safe: if the live library can't be read or is empty, prune nothing - an unmounted/empty
    library must never look like 'everything was deleted'."""
    from services.zotero.reader import live_item_keys

    try:
        live = live_item_keys()
    except Exception:
        return {"skipped": True, "pruned": 0,
                "reason": "Couldn't read your Zotero library - nothing was removed."}
    if not live:
        return {"skipped": True, "pruned": 0,
                "reason": "Your Zotero library looks empty or unavailable - nothing was removed."}
    cache = _load()
    orphans = [k for k in list(cache) if k not in live]
    if not orphans:
        return {"pruned": 0, "removed": []}
    for k in orphans:
        cache.pop(k, None)
    _save(cache)
    return {"pruned": len(orphans), "removed": orphans}


def _is_mapped(rec):
    """Mapped *and* current-schema - a stale-schema record re-fetches like a miss."""
    return bool(rec) and rec.get("status") == "mapped" and rec.get("v") == SCHEMA_VERSION


def _as_ref(entry):
    """Normalize a references/citingWorks entry to a metadata dict.

    Index-time enrichment writes raw OpenAlex id strings (resolution is lazy); a fully fetched
    record has resolved dicts. Accept either so the graph builders never crash on unresolved
    ids - an unresolved external just renders with its id until a fetch resolves its title."""
    if isinstance(entry, dict):
        return entry
    if isinstance(entry, str):
        return {"id": entry}
    return {}


def mapped_keys():
    """itemKeys with a resolved OpenAlex record (whether or not it has references). Used to track
    what's been *attempted* - so the prefetch doesn't keep re-fetching them."""
    return [k for k, rec in _load().items() if _is_mapped(rec)]


def ready_keys():
    """itemKeys that will actually appear on the References map: a current OpenAlex record WITH a
    non-empty reference list. A mapped record with no references (~1 in 5 - mostly arXiv preprints
    and publishers OpenAlex lacks references for) renders as an isolated node, so it must not show
    as 'ready'. Drives the navigator 'Citations ready' check + greying."""
    return [k for k, rec in _load().items() if _is_mapped(rec) and rec.get("references")]


def fetch_status(item_keys):
    """{mapped, unmapped, noDoi} for a selection - the pre-fetch coverage check.

    `unmapped` = anything not yet mapped (uncached or a cached miss to retry); `noDoi` is
    the subset already known to lack a DOI, surfaced so the UI can explain the gap.
    """
    cache = _load()
    mapped, unmapped, no_doi = [], [], []
    for key in item_keys:
        rec = cache.get(key)
        if _is_mapped(rec):
            mapped.append(key)
            continue
        unmapped.append(key)
        if rec and rec.get("status") == "no_doi":
            no_doi.append(key)
    return {"mapped": mapped, "unmapped": unmapped, "noDoi": no_doi}


def fetch_items(item_keys, progress=None):
    """Fetch + cache OpenAlex records for the not-yet-mapped subset of `item_keys`.

    One `fetch_work` per paper (DOI -> record), then a single batched `resolve_works` pass
    over every referenced id collected across the batch. Emits per-paper progress via
    `progress(stage, percent, detail)`.
    """
    emit = progress or (lambda *_a, **_k: None)
    generation = current_generation()
    cache = _load()
    todo = [k for k in item_keys if not _is_mapped(cache.get(k))]
    total = max(len(todo), 1)

    for done, key in enumerate(todo):
        meta = item_metadata(key) or {}
        title = meta.get("title") or key
        emit("fetching", 2 + int(80 * done / total), f"fetching ({done}/{len(todo)}) - {title[:60]}")
        doi = meta.get("doi")
        if not doi:
            cache[key] = {"doi": None, "openalexId": None, "year": meta.get("year"),
                          "citedBy": None, "references": [], "status": "no_doi",
                          "fetchedAt": time.time()}
        else:
            work = fetch_work(doi)
            if not work:
                cache[key] = {"doi": doi, "openalexId": None, "year": meta.get("year"),
                              "citedBy": None, "references": [], "status": "not_found",
                              "fetchedAt": time.time()}
            else:
                cache[key] = {"doi": doi, "openalexId": work["openalexId"], "year": work["year"],
                              "date": work["date"], "citedBy": work["citedByCount"],
                              "references": work["referencedWorks"],  # raw ids, resolved below
                              "status": "mapped", "fetchedAt": time.time(), "v": SCHEMA_VERSION}
        # Persist after each paper so an interrupted batch isn't lost (each record is
        # one polite OpenAlex round-trip); the atomic _save makes this safe.
        with DERIVED_STATE_LOCK:
            ensure_current_generation(generation)
            _save(cache)

    # Resolve reference ids -> metadata for every requested mapped record whose references
    # are still raw ids. Covers this run AND any left unresolved by a prior interrupted run
    # (a mapped record with unresolved refs would otherwise be skipped above and never fixed).
    pending_refs = set()
    to_resolve = []
    for key in item_keys:
        rec = cache.get(key)
        if _is_mapped(rec) and rec.get("references") and isinstance(rec["references"][0], str):
            to_resolve.append(key)
            pending_refs.update(rec["references"])

    if pending_refs:
        emit("resolving", 88, f"resolving {len(pending_refs)} reference(s)")
        resolved = resolve_works(list(pending_refs))
        for key in to_resolve:
            rec = cache[key]
            rec["references"] = [
                {"id": rid, **{f: (resolved.get(rid) or {}).get(f)
                               for f in ("title", "year", "date", "doi", "citedBy")}}
                for rid in rec["references"]
            ]
        with DERIVED_STATE_LOCK:
            ensure_current_generation(generation)
            _save(cache)

    emit("done", 100, "done")
    return {"mapped": [k for k in item_keys if _is_mapped(cache.get(k))]}


def _map_record(meta, doi):
    """A fresh cache record for one item from its (possibly missing) DOI."""
    if not doi:
        return {"doi": None, "openalexId": None, "year": meta.get("year"), "citedBy": None,
                "references": [], "status": "no_doi", "fetchedAt": time.time()}
    work = fetch_work(doi)
    if not work:
        return {"doi": doi, "openalexId": None, "year": meta.get("year"), "citedBy": None,
                "references": [], "status": "not_found", "fetchedAt": time.time()}
    return {"doi": doi, "openalexId": work["openalexId"], "year": work["year"],
            "date": work["date"], "citedBy": work["citedByCount"],
            "references": work["referencedWorks"], "status": "mapped",
            "fetchedAt": time.time(), "v": SCHEMA_VERSION}


def fetch_citing_items(item_keys, progress=None):
    """Fetch + cache the works that CITE each selected paper (the Cited-by lens).

    Maps any not-yet-mapped item first (one `fetch_work`), then fetches its citers
    (`fetch_citing_works`) and resolves them to metadata in one batched pass. Stored under
    `citingWorks` on the cache record. Mirrors `fetch_items`'s persistence + resolution.
    """
    emit = progress or (lambda *_a, **_k: None)
    generation = current_generation()
    cache = _load()
    todo = [k for k in item_keys if not (cache.get(k) or {}).get("citingWorks")]
    total = max(len(todo), 1)

    for done, key in enumerate(todo):
        meta = item_metadata(key) or {}
        title = meta.get("title") or key
        emit("fetching", 2 + int(80 * done / total), f"cited-by ({done}/{len(todo)}) - {title[:60]}")
        rec = cache.get(key)
        if not _is_mapped(rec):
            rec = cache[key] = _map_record(meta, meta.get("doi"))
        oaid = rec.get("openalexId")
        if oaid:
            rec["citingWorks"] = fetch_citing_works(oaid, CITING_LIMIT)  # raw ids, resolved below
        with DERIVED_STATE_LOCK:
            ensure_current_generation(generation)
            _save(cache)

    # Resolve citing ids -> metadata (covers this run + any interrupted prior run).
    pending, to_resolve = set(), []
    for key in item_keys:
        cw = (cache.get(key) or {}).get("citingWorks")
        if cw and isinstance(cw[0], str):
            to_resolve.append(key)
            pending.update(cw)
    if pending:
        emit("resolving", 88, f"resolving {len(pending)} citing work(s)")
        resolved = resolve_works(list(pending))
        for key in to_resolve:
            rec = cache[key]
            rec["citingWorks"] = [
                {"id": cid, **{f: (resolved.get(cid) or {}).get(f)
                               for f in ("title", "year", "date", "doi", "citedBy")}}
                for cid in rec["citingWorks"]
            ]
        with DERIVED_STATE_LOCK:
            ensure_current_generation(generation)
            _save(cache)

    emit("done", 100, "done")
    return {"mapped": [k for k in item_keys if _is_mapped(cache.get(k))]}


def citing_graph(item_keys):
    """Forward map: owned papers + the works that cite them (edges point citer -> owned)."""
    cache = _load()
    nodes, edges = [], []
    unmapped, no_doi = [], []
    within = defaultdict(int)
    ext_meta = {}
    collections = item_primary_collection(item_keys)

    for key in item_keys:
        rec = cache.get(key)
        if not _is_mapped(rec):
            unmapped.append(key)
            if rec and rec.get("status") == "no_doi":
                no_doi.append(key)
            continue
        meta = item_metadata(key) or {}
        nodes.append({
            "id": key, "label": meta.get("title") or key, "type": "owned",
            "year": meta.get("year"), "date": rec.get("date"),
            "globalCitedBy": rec.get("citedBy"), "doi": rec.get("doi"),
            "collection": collections.get(key),
        })
        for raw in rec.get("citingWorks", []):
            c = _as_ref(raw)
            cid = c.get("id")
            if not cid:
                continue
            within[cid] += 1
            ext_meta.setdefault(cid, c)
            edges.append({"from": cid, "to": key})

    for cid, c in ext_meta.items():
        nodes.append({
            "id": cid, "label": c.get("title") or cid, "type": "external",
            "year": c.get("year"), "date": c.get("date"),
            "citedBy": within[cid], "globalCitedBy": c.get("citedBy"), "doi": c.get("doi"),
        })

    return {"nodes": nodes, "edges": edges, "unmapped": unmapped, "noDoi": no_doi}


def discovery_graph(item_keys):
    """Selection-scoped map over the *mapped* subset of `item_keys`.

    Owned nodes = the selected papers; external nodes = the union of their OpenAlex
    references, deduped by OpenAlex id. An external node's `citedBy` is its within-selection
    degree (how many selected papers cite it) so shared anchors render larger.
    """
    cache = _load()
    nodes, edges = [], []
    mapped, unmapped, no_doi = [], [], []
    within_cited = defaultdict(int)
    ext_meta = {}
    collections = item_primary_collection(item_keys)

    for key in item_keys:
        rec = cache.get(key)
        if not _is_mapped(rec):
            unmapped.append(key)
            if rec and rec.get("status") == "no_doi":
                no_doi.append(key)
            continue
        mapped.append(key)
        meta = item_metadata(key) or {}
        nodes.append({
            "id": key,
            "label": meta.get("title") or key,
            "type": "owned",
            "year": meta.get("year"),
            "date": rec.get("date"),
            "globalCitedBy": rec.get("citedBy"),
            "doi": rec.get("doi"),
            "collection": collections.get(key),
        })
        for raw in rec.get("references", []):
            ref = _as_ref(raw)
            rid = ref.get("id")
            if not rid:
                continue
            within_cited[rid] += 1
            ext_meta.setdefault(rid, ref)
            edges.append({"from": key, "to": rid})

    for rid, ref in ext_meta.items():
        nodes.append({
            "id": rid,
            "label": ref.get("title") or rid,
            "type": "external",
            "year": ref.get("year"),
            "date": ref.get("date"),
            "citedBy": within_cited[rid],
            "globalCitedBy": ref.get("citedBy"),
            "doi": ref.get("doi"),
        })

    return {"nodes": nodes, "edges": edges, "unmapped": unmapped, "noDoi": no_doi}
