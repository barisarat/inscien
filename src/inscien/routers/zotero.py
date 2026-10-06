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


@router.get("/collections/{collection_id}/items")
def collection_items(collection_id: int):
    """Direct (non-recursive) items of a collection with their pipeline status. An item with no
    stored PDF is listed (it is in the shelf) but cannot be built or narrated."""
    built = slugs_by_zotero_key()
    staged = staging.staged_keys()
    known = narrations.bundles()
    queued = narrations.queued_stems()
    items = []
    for key in reader.resolve_collection_items(collection_id, recursive=False):
        meta = reader.item_metadata(key)
        if not meta or meta.get("itemType") in ("attachment", "note", "annotation"):
            continue
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
        items.append(meta)
    items.sort(key=lambda x: ((x.get("year") or ""), (x.get("title") or "").lower()))
    return {"items": items}
