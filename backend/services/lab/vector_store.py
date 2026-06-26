"""File-backed paper-vector store - one 384-dim vector per Zotero item, powering the Map's
semantic-similarity edges.

Replaces the embedded Qdrant store. At personal-library scale (hundreds to a few thousand
vectors) the Map computes cosine similarity in numpy (`services/map/fused.py` `_semantic_block`,
one matmul), so a vector database is unnecessary - this is a plain `{itemKey: vector}` dict
persisted to one JSON file, mirroring the OpenAlex cache (`services/refs/refstore.py`).

A process-wide cache holds the dict; writers run inside `DERIVED_STATE_LOCK` (the Map only
reads), so the cache stays coherent without extra locking. Each write persists the whole file
atomically (temp + replace), matching the manifest's per-item flush so a crash leaves a
consistent store.
"""

import json
import os
from pathlib import Path

from core.paths import data_path

VECTORS_PATH = Path(os.getenv("INSCIEN_VECTORS_PATH") or data_path("paper-vectors.json"))

# {itemKey: {"v": [float, ...(384)], "p": {title, year, itemType, doi}}}
_CACHE = None


def _load():
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    if not VECTORS_PATH.exists():
        _CACHE = {}
        return _CACHE
    try:
        _CACHE = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        _CACHE = {}
    return _CACHE


def _save():
    cache = _load()
    VECTORS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = VECTORS_PATH.with_name(VECTORS_PATH.name + ".tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    tmp.replace(VECTORS_PATH)


def get_vectors(item_keys):
    """{itemKey: vector} for the given items that have a stored paper vector."""
    cache = _load()
    out = {}
    for k in item_keys:
        rec = cache.get(k)
        if rec and rec.get("v"):
            out[k] = rec["v"]
    return out


def has_vector(item_key):
    """Whether this item already has a stored vector (drives the ingest self-heal)."""
    rec = _load().get(item_key)
    return bool(rec and rec.get("v"))


def present_keys(item_keys):
    """Subset of item_keys that have a stored vector (no vector copy). Lets callers treat
    "indexed" as "has a map vector", so a ledger row without a vector (e.g. after the
    Qdrant -> file migration, or a lost vector file) reads as not-indexed and self-heals on
    the next index pass."""
    cache = _load()
    return {k for k in item_keys if (cache.get(k) or {}).get("v")}


def upsert_vector(item_key, vector, payload=None):
    """Store (or replace) one paper vector + optional node-metadata payload."""
    cache = _load()
    cache[item_key] = {"v": [float(x) for x in vector], "p": payload or {}}
    _save()


def delete_vector(item_key):
    """Drop one item's vector. No-op if absent."""
    cache = _load()
    if cache.pop(item_key, None) is not None:
        _save()


def reset():
    """Wipe the whole store (part of a corpus reset)."""
    global _CACHE
    _CACHE = {}
    VECTORS_PATH.unlink(missing_ok=True)


def health():
    """Readiness probe - never raises. {ok, count, path}."""
    try:
        cache = _load()
        return {"ok": True, "count": len(cache), "path": str(VECTORS_PATH)}
    except Exception:
        return {"ok": False, "count": 0, "path": str(VECTORS_PATH)}
