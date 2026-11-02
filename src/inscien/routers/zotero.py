"""The Zotero library as the Map's sidebar: collections and items, read live from a snapshot.

Organization (collections, membership) is read on every request, so moving a paper between
collections in Zotero needs no rebuild here. Each item row carries where it stands in the
reference pipeline - `built` (a library entry exists, joined on the Zotero itemKey the build
recorded), `staged` (its PDF waits for a build) or `unbuilt` - and its narration status.
"""

import logging
import os

from fastapi import APIRouter

from inscien.services.library import narrations, staging
from inscien.services.library.store import slugs_by_zotero_key
from inscien.services.zotero import reader
from inscien.services.zotero.settings import get_zotero_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/zotero", tags=["zotero"])

# Root collections left out of the sidebar, by name, comma-separated (INSCIEN_HIDDEN_COLLECTIONS).
HIDDEN_ROOTS = {
    n.strip() for n in (os.getenv("INSCIEN_HIDDEN_COLLECTIONS") or "").split(",") if n.strip()
}

# Collections tree cache, keyed by the snapshot's mtime (cheap).
_tree_cache = {"mtime": None, "tree": None, "direct": None}


def _cached_tree():
    mtime = reader.snapshot_mtime()
    if _tree_cache["mtime"] != mtime:
        _tree_cache["mtime"] = mtime
        _tree_cache["tree"] = [c for c in reader.list_collections() if c["name"] not in HIDDEN_ROOTS]
        _tree_cache["direct"] = reader.collection_direct_items()
    return _tree_cache["tree"], _tree_cache["direct"]


@router.get("/collections")
def collections():
    """The collection forest, each node annotated with a recursive item count and the slugs of
    its built papers (recursive too - that is what "select this shelf" toggles)."""
    # Fresh install: nothing mounted yet. Return a clean, distinct status (not a 500) so the
    # UI can show actionable setup guidance instead of a generic load error.
    if not reader.library_present():
        return {
            "collections": [],
            "liveConnected": False,
            "libraryMissing": True,
            "mountPath": get_zotero_settings()["db_path"],
        }
    tree, direct = _cached_tree()
    built = slugs_by_zotero_key()

    def annotate(node):
        keys = set(direct.get(node["collectionID"], set()))
        for child in node["children"]:
            keys |= annotate(child)
        node["itemCount"] = len(keys)
        node["builtSlugs"] = sorted(built[k] for k in keys if k in built)
        return keys

    for root in tree:
        annotate(root)
    # liveConnected=False => the live Zotero DB is unmounted and we're serving a
    # possibly-stale snapshot; the UI surfaces this so the tree isn't silently trusted.
    return {
        "collections": tree,
        "liveConnected": reader.live_connected(),
        "libraryMissing": False,
    }


def _row(key, meta, built, staged, known, queued):
    """One sidebar row: the item's metadata plus its PDF, narration and pipeline status."""
    pdf = reader.resolve_pdf_path(key)
    meta["hasPdf"] = pdf is not None
    meta["narration"] = narrations.status_for(os.path.basename(pdf) if pdf else None, meta.get("title"), known, queued)
    if key in built:
        meta["status"] = "built"
        meta["slug"] = built[key]
    elif key in staged:
        meta["status"] = "staged"
        meta["slug"] = None
    else:
        meta["status"] = "unbuilt"
        meta["slug"] = None
    return meta


def _pipeline_state():
    return slugs_by_zotero_key(), staging.staged_keys(), narrations.bundles(), narrations.queued_stems()


@router.get("/collections/{collection_id}/items")
def collection_items(collection_id: int):
    """Direct (non-recursive) items of a collection with their pipeline status. An item with no
    stored PDF is listed (it is in the shelf) but cannot be built or narrated."""
    state = _pipeline_state()
    items = []
    for key in reader.resolve_collection_items(collection_id, recursive=False):
        meta = reader.item_metadata(key)
        if not meta or meta.get("itemType") in ("attachment", "note", "annotation"):
            continue
        items.append(_row(key, meta, *state))
    items.sort(key=lambda x: ((x.get("year") or ""), (x.get("title") or "").lower()))
    return {"items": items}


# The sidebar filter shows at most this many rows; past it the query is too broad to scan.
FILTER_LIMIT = 50


@router.get("/items")
def filter_items(q: str = ""):
    """The sidebar filter: items of the visible collections whose title holds every word of `q`
    (case-insensitive), as collection rows plus `collection`, the path of the shelf it sits on
    (the first by name when it is on several). `more` says rows were cut at FILTER_LIMIT."""
    words = q.casefold().split()
    if not words or not reader.library_present():
        return {"items": [], "more": False}
    tree, direct = _cached_tree()
    paths = {}

    def walk(nodes, prefix):
        for n in nodes:
            path = f"{prefix} / {n['name']}" if prefix else n["name"]
            paths[n["collectionID"]] = path
            walk(n["children"], path)

    walk(tree, "")
    shelf = {}
    for cid, path in paths.items():
        for key in direct.get(cid, ()):
            if key not in shelf or path.casefold() < shelf[key].casefold():
                shelf[key] = path
    hits = [
        r for r in reader.library_items()
        if r["itemKey"] in shelf and r["title"] and all(w in r["title"].casefold() for w in words)
    ]
    hits.sort(key=lambda r: (shelf[r["itemKey"]].casefold(), r["title"].casefold()))
    state = _pipeline_state()
    items = []
    for r in hits[:FILTER_LIMIT]:
        meta = reader.item_metadata(r["itemKey"])
        if not meta:
            continue
        row = _row(r["itemKey"], meta, *state)
        row["collection"] = shelf[r["itemKey"]]
        items.append(row)
    return {"items": items, "more": len(hits) > FILTER_LIMIT}
