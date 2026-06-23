"""Read-only access to the user's local Zotero library.

Everything here reads a *private snapshot* of `zotero.sqlite` (a `shutil.copy`), never
the live DB — Zotero may hold a WAL lock while running, and an `immutable=1` read of our
own copy fully derisks any interaction with the real library. The snapshot is refreshed
lazily when the live DB's mtime advances (on-demand staleness, per the design).

The functions mirror exactly the queries proven during feasibility testing:
- collections tree           -> collections(collectionID, collectionName, parentCollectionID, key)
- a collection's item keys   -> collectionItems -> items.key (recursive over parentCollectionID)
- per-item metadata          -> itemData/itemDataValues/fields (EAV) + itemCreators/creators
- attachment -> file on disk -> itemAttachments.path 'storage:<file>' + attachment items.key
Trashed items are excluded via `deletedItems`.
"""

import logging
import os
import re
import shutil
import sqlite3
import threading
from collections import defaultdict

from services.zotero.settings import BOOK_ITEM_TYPES, get_zotero_settings

logger = logging.getLogger(__name__)

_snapshot_lock = threading.Lock()

# Whether the live Zotero DB was reachable at the last snapshot refresh. When False we
# are serving the existing read-only snapshot (live source unmounted/absent), so the
# navigator may be stale — endpoints surface this to the UI via `live_connected()`.
_live_connected = True


def live_connected():
    return _live_connected


def _set_live_connected(value):
    """Update + log only on a state transition, to avoid per-request log spam."""
    global _live_connected
    if value != _live_connected:
        if value:
            logger.info("Zotero live DB reconnected; snapshot will refresh on next read.")
        else:
            logger.warning(
                "Zotero live DB not found at %s; serving the existing read-only snapshot. "
                "Library changes won't appear until the data dir (ZOTERO_DATA_DIR) is mounted.",
                get_zotero_settings()["db_path"],
            )
    _live_connected = value
_YEAR_RE = re.compile(r"(\d{4})")
_DOI_PREFIX_RE = re.compile(r"^(?:https?://)?(?:dx\.)?doi\.org/", re.IGNORECASE)


def _normalize_doi(value):
    """Bare lowercase DOI (no scheme/host), or None. DOIs are case-insensitive."""
    doi = (value or "").strip()
    if not doi:
        return None
    doi = _DOI_PREFIX_RE.sub("", doi).strip()
    return doi.lower() or None


# --- snapshot + connection -------------------------------------------------

def library_present():
    """Whether any readable Zotero library exists — the live mounted DB or a prior snapshot.

    False means a fresh install with nothing mounted yet: reads would raise FileNotFoundError.
    Endpoints check this first to return a clean "no library" status instead of a 500.
    """
    s = get_zotero_settings()
    return os.path.exists(s["db_path"]) or os.path.exists(s["snapshot_path"])


def _refresh_snapshot():
    """Copy the live DB to our snapshot if missing or stale (live mtime advanced).

    If the live DB is absent, degrade to the existing snapshot (read-only, possibly
    stale) so reads keep working; only fail when there is genuinely nothing to read.
    """
    s = get_zotero_settings()
    live, snap = s["db_path"], s["snapshot_path"]
    if not os.path.exists(live):
        if os.path.exists(snap):
            _set_live_connected(False)
            return snap
        raise FileNotFoundError(
            f"Zotero DB not found at {live} and no snapshot exists yet. Bind-mount the "
            f"Zotero data dir (set ZOTERO_DATA_DIR) so {live} exists."
        )
    _set_live_connected(True)
    with _snapshot_lock:
        fresh = os.path.exists(snap) and os.path.getmtime(snap) >= os.path.getmtime(live)
        if fresh:
            return snap
        os.makedirs(os.path.dirname(snap), exist_ok=True)
        shutil.copy2(live, snap)
        # WAL sidecars, if present, so a checkpoint-pending write isn't lost.
        for ext in ("-wal", "-shm"):
            side = live + ext
            if os.path.exists(side):
                shutil.copy2(side, snap + ext)
            elif os.path.exists(snap + ext):
                os.remove(snap + ext)
    return snap


def _connect():
    snap = _refresh_snapshot()
    con = sqlite3.connect(f"file:{snap}?mode=ro&immutable=1", uri=True)
    con.row_factory = sqlite3.Row
    return con


def snapshot_mtime():
    """mtime of the live DB the snapshot tracks — a cheap cache key for the tree.

    Falls back to the snapshot's own mtime when the live DB is absent, so the cache key
    stays stable (and callers don't crash) while we serve a stale snapshot.
    """
    s = get_zotero_settings()
    live, snap = s["db_path"], s["snapshot_path"]
    if os.path.exists(live):
        return os.path.getmtime(live)
    if os.path.exists(snap):
        return os.path.getmtime(snap)
    return 0.0


# --- collections -----------------------------------------------------------

def list_collections():
    """Return the collection forest: [{collectionID, key, name, parentCollectionID,
    children:[...]}] with roots at the top (parentCollectionID is NULL)."""
    con = _connect()
    try:
        rows = con.execute(
            "SELECT collectionID, collectionName, parentCollectionID, key FROM collections"
        ).fetchall()
    finally:
        con.close()

    nodes = {
        r["collectionID"]: {
            "collectionID": r["collectionID"],
            "key": r["key"],
            "name": r["collectionName"],
            "parentCollectionID": r["parentCollectionID"],
            "children": [],
        }
        for r in rows
    }
    roots = []
    for node in nodes.values():
        parent = nodes.get(node["parentCollectionID"])
        (parent["children"] if parent else roots).append(node)
    _sort_tree(roots)
    return roots


def _sort_tree(nodes):
    nodes.sort(key=lambda n: (n["name"] or "").lower())
    for n in nodes:
        _sort_tree(n["children"])


def _descendant_collection_ids(con, collection_id, recursive):
    ids = {collection_id}
    if not recursive:
        return ids
    frontier = [collection_id]
    while frontier:
        cur = frontier.pop()
        for r in con.execute(
            "SELECT collectionID FROM collections WHERE parentCollectionID = ?", (cur,)
        ):
            cid = r["collectionID"]
            if cid not in ids:
                ids.add(cid)
                frontier.append(cid)
    return ids


def resolve_collection_items(collection_id, recursive=True):
    """Item keys belonging to a collection (recursively by default), excluding trash."""
    con = _connect()
    try:
        ids = _descendant_collection_ids(con, collection_id, recursive)
        placeholders = ",".join("?" * len(ids))
        rows = con.execute(
            f"""
            SELECT DISTINCT i.key
            FROM collectionItems ci
            JOIN items i ON i.itemID = ci.itemID
            WHERE ci.collectionID IN ({placeholders})
              AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
            """,
            tuple(ids),
        ).fetchall()
    finally:
        con.close()
    return {r["key"] for r in rows}


def live_item_keys():
    """Every item key present in the live library (excluding trash) — the authoritative set
    of what still exists in Zotero. Used to find indexed items that were deleted from Zotero.

    Returns a superset of valid parent keys (includes attachments/notes), so diffing the
    indexed set against it can never false-positive a still-present paper.
    """
    con = _connect()
    try:
        rows = con.execute(
            """
            SELECT DISTINCT i.key
            FROM items i
            WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
            """
        ).fetchall()
    finally:
        con.close()
    return {r["key"] for r in rows}


def collection_direct_items():
    """One-query map {collectionID: set(itemKey)} of *direct* (non-recursive) membership,
    excluding trash. The collections endpoint folds this up the tree in Python instead of
    issuing a recursive query per collection."""
    con = _connect()
    try:
        rows = con.execute(
            """
            SELECT ci.collectionID AS cid, i.key AS key
            FROM collectionItems ci
            JOIN items i ON i.itemID = ci.itemID
            WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
            """
        ).fetchall()
    finally:
        con.close()
    out = defaultdict(set)
    for r in rows:
        out[r["cid"]].add(r["key"])
    return out


def item_primary_collection(item_keys):
    """{itemKey: collectionName} — one collection per item (lowest collectionID) for grouping
    nodes on the Map. Items in no collection are omitted."""
    wanted = set(item_keys)
    direct = collection_direct_items()  # {collectionID: set(itemKey)}

    names = {}

    def _walk(nodes):
        for n in nodes:
            names[n["collectionID"]] = n["name"]
            _walk(n.get("children") or [])

    _walk(list_collections())

    key_cids = defaultdict(list)
    for cid, keys in direct.items():
        for k in keys & wanted:
            key_cids[k].append(cid)
    return {k: names.get(min(cids), "") for k, cids in key_cids.items() if cids}


# --- per-item metadata -----------------------------------------------------

def _item_id(con, item_key):
    row = con.execute("SELECT itemID FROM items WHERE key = ?", (item_key,)).fetchone()
    return row["itemID"] if row else None


def _field_value(con, item_id, field_name):
    row = con.execute(
        """
        SELECT idv.value
        FROM itemData id
        JOIN itemDataValues idv ON idv.valueID = id.valueID
        JOIN fields f ON f.fieldID = id.fieldID
        WHERE id.itemID = ? AND f.fieldName = ?
        """,
        (item_id, field_name),
    ).fetchone()
    return row["value"] if row else None


def _authors(con, item_id):
    rows = con.execute(
        """
        SELECT c.firstName, c.lastName, c.fieldMode
        FROM itemCreators ic
        JOIN creators c ON c.creatorID = ic.creatorID
        WHERE ic.itemID = ?
        ORDER BY ic.orderIndex
        """,
        (item_id,),
    ).fetchall()
    names = []
    for r in rows:
        last, first = (r["lastName"] or "").strip(), (r["firstName"] or "").strip()
        if r["fieldMode"] == 1 or not first:
            name = last or first
        else:
            name = f"{last}, {first}" if last else first
        if name:
            names.append(name)
    return names


def item_metadata(item_key):
    """{itemKey, title, authors[], year, itemType, isBookDefaultOff} or None if missing."""
    con = _connect()
    try:
        item_id = _item_id(con, item_key)
        if item_id is None:
            return None
        type_row = con.execute(
            """
            SELECT it.typeName FROM items i
            JOIN itemTypes it ON it.itemTypeID = i.itemTypeID
            WHERE i.itemID = ?
            """,
            (item_id,),
        ).fetchone()
        item_type = type_row["typeName"] if type_row else None
        title = _field_value(con, item_id, "title")
        date = _field_value(con, item_id, "date")
        doi = _normalize_doi(_field_value(con, item_id, "DOI"))
        authors = _authors(con, item_id)
    finally:
        con.close()

    year_match = _YEAR_RE.search(date or "")
    return {
        "itemKey": item_key,
        "title": title,
        "authors": authors,
        "year": year_match.group(1) if year_match else None,
        "itemType": item_type,
        "isBookDefaultOff": item_type in BOOK_ITEM_TYPES,
        "doi": doi,
    }


# --- attachment -> file on disk --------------------------------------------

def resolve_pdf_path(item_key):
    """Absolute path to the item's stored PDF, or None if it has no synced PDF.

    v1 returns the first existing imported PDF attachment (deterministic by attachment
    itemID). The attachment item's own `key` is its storage subfolder; the filename is
    `itemAttachments.path` minus the `storage:` prefix.
    """
    storage_dir = get_zotero_settings()["storage_dir"]
    con = _connect()
    try:
        item_id = _item_id(con, item_key)
        if item_id is None:
            return None
        rows = con.execute(
            """
            SELECT att.key AS attachment_key, a.path AS path
            FROM itemAttachments a
            JOIN items att ON att.itemID = a.itemID
            WHERE a.parentItemID = ?
              AND a.contentType = 'application/pdf'
              AND a.linkMode = 0
              AND a.path LIKE 'storage:%'
            ORDER BY a.itemID
            """,
            (item_id,),
        ).fetchall()
    finally:
        con.close()

    for r in rows:
        filename = r["path"][len("storage:"):]
        candidate = os.path.join(storage_dir, r["attachment_key"], filename)
        if os.path.exists(candidate):
            return candidate
    return None
