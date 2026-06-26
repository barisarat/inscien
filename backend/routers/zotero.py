"""Zotero-native endpoints: browse the live library (collections + items).

Organization (collections/membership) is read *live* from the Zotero snapshot - the app stores no
index. A paper's citation data lives in the OpenAlex cache (`services/refs/refstore.py`), fetched
by the whole-library prefetch (`POST /api/graph/prefetch`). The client greys papers that have no
DOI or no resolved citation data.
"""

import logging

from fastapi import APIRouter

from services.zotero import reader
from services.zotero.settings import get_zotero_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/zotero", tags=["zotero"])

# Collections tree cache, keyed by the snapshot's mtime (cheap).
_tree_cache = {"mtime": None, "tree": None, "direct": None}


def _cached_tree():
    mtime = reader.snapshot_mtime()
    if _tree_cache["mtime"] != mtime:
        _tree_cache["mtime"] = mtime
        _tree_cache["tree"] = reader.list_collections()
        _tree_cache["direct"] = reader.collection_direct_items()
    return _tree_cache["tree"], _tree_cache["direct"]


@router.get("/collections")
def collections():
    """The collection forest, each node annotated with a recursive item count."""
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

    def annotate(node):
        keys = set(direct.get(node["collectionID"], set()))
        for child in node["children"]:
            keys |= annotate(child)
        node["itemCount"] = len(keys)
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
    """Direct (non-recursive) PDF-bearing items of a collection, with metadata incl. `doi` (the
    client greys items with no DOI / no resolved citation data). Items with no synced PDF are
    omitted - that's Zotero's job, not ours."""
    items = []
    for key in reader.resolve_collection_items(collection_id, recursive=False):
        meta = reader.item_metadata(key)
        if not meta or reader.resolve_pdf_path(key) is None:
            continue
        items.append(meta)
    items.sort(key=lambda x: ((x.get("year") or ""), (x.get("title") or "").lower()))
    return {"items": items}


@router.get("/collections/{collection_id}/indexable-keys")
def indexable_keys(collection_id: int):
    """Recursive item keys in a collection that are PDF-bearing and not a default-off book.
    Powers 'select this whole collection' in the navigator."""
    out = []
    for key in reader.resolve_collection_items(collection_id, recursive=True):
        meta = reader.item_metadata(key)
        if not meta or meta.get("isBookDefaultOff"):
            continue
        if reader.resolve_pdf_path(key) is None:
            continue
        out.append(key)
    return {"itemKeys": out}


@router.post("/reset")
def reset():
    """Clear derived citation data (the OpenAlex cache) and any in-flight narration / citation
    fetch jobs. The Zotero library itself is never touched."""
    from services.state_guard import begin_reset, end_reset
    from services.narration.jobs import clear_jobs as clear_narration
    from services.refs.fetch_jobs import clear_jobs as clear_graph_fetch
    from services.refs import refstore

    begin_reset()
    try:
        for clear in (clear_narration, clear_graph_fetch):
            try:
                clear()
            except Exception:
                logger.exception("reset: job cleanup failed (non-fatal)")
        refstore.reset_cache()
    finally:
        end_reset()
    return {"ok": True}


@router.post("/reconcile")
def reconcile():
    """Drop cached citation data for papers no longer in the live Zotero library. Safe: prunes
    nothing if the library is unreadable/empty. Returns a summary."""
    from services.refs import refstore

    return refstore.prune_orphans()
