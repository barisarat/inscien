"""Zotero-native endpoints: browse the live library, index a selection, track sync state.

Organization (collections/membership) is read *live* from the Zotero snapshot — never
baked into the index — so reorganizing in Zotero needs no re-index. The index only owns
content (chunks keyed by itemKey) and the sync ledger (what's indexed).
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.db import get_db
from repositories import zotero_repository as ledger
from services.zotero import reader
from services.zotero.ingest import prune_orphans, reset_index
from services.zotero.settings import get_zotero_settings
from services.zotero.jobs import get_job, start_job

router = APIRouter(prefix="/api/zotero", tags=["zotero"])

# Collections tree cache, keyed by the snapshot's mtime (cheap). Indexed counts are
# computed live against the ledger on every call, so they never go stale after indexing.
_tree_cache = {"mtime": None, "tree": None, "direct": None}


class IndexIn(BaseModel):
    itemKeys: list[str]


def _cached_tree():
    mtime = reader.snapshot_mtime()
    if _tree_cache["mtime"] != mtime:
        _tree_cache["mtime"] = mtime
        _tree_cache["tree"] = reader.list_collections()
        _tree_cache["direct"] = reader.collection_direct_items()
    return _tree_cache["tree"], _tree_cache["direct"]


@router.get("/collections")
def collections(db: Session = Depends(get_db)):
    """The collection forest, each node annotated with recursive item + indexed counts."""
    ledger.ensure_table()
    # Fresh install: nothing mounted yet. Return a clean, distinct status (not a 500) so the
    # UI can show actionable setup guidance instead of a generic load error.
    if not reader.library_present():
        return {
            "collections": [],
            "liveConnected": False,
            "libraryMissing": True,
            "mountPath": get_zotero_settings()["db_path"],
        }
    indexed = ledger.indexed_keys(db)
    tree, direct = _cached_tree()

    def annotate(node):
        keys = set(direct.get(node["collectionID"], set()))
        for child in node["children"]:
            keys |= annotate(child)
        node["itemCount"] = len(keys)
        node["indexedCount"] = len(keys & indexed)
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
def collection_items(collection_id: int, db: Session = Depends(get_db)):
    """Direct (non-recursive) PDF-bearing items of a collection, with metadata + index
    state. Items with no synced PDF are omitted — that's Zotero's job, not ours."""
    ledger.ensure_table()
    indexed = ledger.indexed_keys(db)
    items = []
    for key in reader.resolve_collection_items(collection_id, recursive=False):
        meta = reader.item_metadata(key)
        if not meta or reader.resolve_pdf_path(key) is None:
            continue
        items.append({**meta, "indexed": key in indexed})
    items.sort(key=lambda x: ((x.get("year") or ""), (x.get("title") or "").lower()))
    return {"items": items}


@router.get("/collections/{collection_id}/indexable-keys")
def indexable_keys(collection_id: int):
    """Recursive item keys in a collection that are actually indexable — PDF-bearing and
    not a default-off book. Powers 'select this whole collection' in the navigator."""
    out = []
    for key in reader.resolve_collection_items(collection_id, recursive=True):
        meta = reader.item_metadata(key)
        if not meta or meta.get("isBookDefaultOff"):
            continue
        if reader.resolve_pdf_path(key) is None:
            continue
        out.append(key)
    return {"itemKeys": out}


@router.post("/index")
def index(body: IndexIn):
    """Start a background job that indexes the given item keys (additive, idempotent)."""
    if not body.itemKeys:
        raise HTTPException(status_code=400, detail="no itemKeys provided")
    return {"jobId": start_job(body.itemKeys)}


@router.get("/index/{job_id}")
def index_status(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@router.get("/sync-state")
def sync_state(db: Session = Depends(get_db)):
    ledger.ensure_table()
    led = ledger.get_ledger(db)
    return {
        "indexedKeys": [k for k, v in led.items() if v.get("status") == "indexed"],
        "count": len(led),
        "items": led,
    }


@router.post("/reset")
def reset():
    """Drop the whole index (Qdrant + manifest + ledger). One-time use to clear the
    pre-Zotero corpus before the first Zotero index. Destructive."""
    return reset_index()


@router.post("/reconcile")
def reconcile():
    """Remove index entries for papers no longer in the live Zotero library (deleted items).
    Safe: prunes nothing if the live library is unreadable/empty. Returns a summary."""
    return prune_orphans()
