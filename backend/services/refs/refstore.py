"""OpenAlex-backed reference cache + selection-scoped discovery graph.

Per-paper records keyed by Zotero itemKey, persisted to a single JSON cache (separate from
the agent's `references.json` so the two concerns stay independent). A record is one of:
  mapped     — DOI resolved in OpenAlex; has openalexId + resolved references
  no_doi     — the Zotero item has no DOI field
  not_found  — has a DOI but OpenAlex returned nothing (404 / error)

`mapped` records are cached permanently (skipped on re-fetch). Misses (no_doi/not_found)
are always retried — a DOI may have been added to Zotero since, and re-checking is cheap.
"""

import json
import os
import time
from collections import defaultdict
from pathlib import Path

from services.refs.openalex import fetch_work, resolve_works
from services.zotero.reader import item_metadata

CACHE_PATH = Path(os.getenv("OPENALEX_CACHE_PATH", "/workspace/data/openalex.json"))

# Bump when the cached record shape changes so older records are transparently re-fetched
# (a mapped record from an earlier schema is treated as unmapped → re-fetched on demand).
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


def _is_mapped(rec):
    """Mapped *and* current-schema — a stale-schema record re-fetches like a miss."""
    return bool(rec) and rec.get("status") == "mapped" and rec.get("v") == SCHEMA_VERSION


def mapped_keys():
    """itemKeys with a resolved OpenAlex record (drives the navigator 'mapped' dot)."""
    return [k for k, rec in _load().items() if _is_mapped(rec)]


def fetch_status(item_keys):
    """{mapped, unmapped, noDoi} for a selection — the pre-fetch coverage check.

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

    One `fetch_work` per paper (DOI → record), then a single batched `resolve_works` pass
    over every referenced id collected across the batch. Emits per-paper progress via
    `progress(stage, percent, detail)`.
    """
    emit = progress or (lambda *_a, **_k: None)
    cache = _load()
    todo = [k for k in item_keys if not _is_mapped(cache.get(k))]
    total = max(len(todo), 1)
    pending_refs = set()

    for done, key in enumerate(todo):
        meta = item_metadata(key) or {}
        title = meta.get("title") or key
        emit("fetching", 2 + int(80 * done / total), f"fetching ({done}/{len(todo)}) · {title[:60]}")
        doi = meta.get("doi")
        if not doi:
            cache[key] = {"doi": None, "openalexId": None, "year": meta.get("year"),
                          "citedBy": None, "references": [], "status": "no_doi",
                          "fetchedAt": time.time()}
            continue
        work = fetch_work(doi)
        if not work:
            cache[key] = {"doi": doi, "openalexId": None, "year": meta.get("year"),
                          "citedBy": None, "references": [], "status": "not_found",
                          "fetchedAt": time.time()}
            continue
        refs = work["referencedWorks"]
        cache[key] = {"doi": doi, "openalexId": work["openalexId"], "year": work["year"],
                      "date": work["date"], "citedBy": work["citedByCount"],
                      "references": refs,  # ids, resolved below
                      "status": "mapped", "fetchedAt": time.time(), "v": SCHEMA_VERSION}
        pending_refs.update(refs)

    emit("resolving", 88, f"resolving {len(pending_refs)} reference(s)")
    resolved = resolve_works(list(pending_refs)) if pending_refs else {}
    for key in todo:
        rec = cache.get(key)
        if not _is_mapped(rec):
            continue
        rec["references"] = [
            {"id": rid, **{f: (resolved.get(rid) or {}).get(f)
                           for f in ("title", "year", "date", "doi", "citedBy")}}
            for rid in rec["references"]
        ]

    _save(cache)
    emit("done", 100, "done")
    return {"mapped": [k for k in item_keys if _is_mapped(cache.get(k))]}


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
        })
        for ref in rec.get("references", []):
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
