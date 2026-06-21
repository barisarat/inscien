"""Sync-ledger access (`zotero_sync_items`).

`ensure_table()` self-creates the table on demand so standalone processes
(`docker compose exec ... python -c`) work without relying on the server's startup
`create_all` having run first.
"""

from core.db import engine
from models.zotero_sync import ZoteroSyncItem


def ensure_table():
    ZoteroSyncItem.__table__.create(bind=engine, checkfirst=True)


def get_ledger(db):
    """itemKey -> {file_hash, title, chunk_count, status}."""
    rows = db.query(ZoteroSyncItem).all()
    return {
        r.item_key: {
            "file_hash": r.file_hash,
            "title": r.title,
            "chunk_count": r.chunk_count,
            "status": r.status,
        }
        for r in rows
    }


def indexed_keys(db):
    rows = db.query(ZoteroSyncItem.item_key).filter(ZoteroSyncItem.status == "indexed").all()
    return {r[0] for r in rows}


def upsert_item(db, item_key, file_hash, title, chunk_count, status="indexed"):
    row = db.get(ZoteroSyncItem, item_key)
    if row is None:
        row = ZoteroSyncItem(item_key=item_key)
        db.add(row)
    row.file_hash = file_hash
    row.title = title
    row.chunk_count = chunk_count
    row.status = status
    db.commit()
    return row


def clear_all(db):
    db.query(ZoteroSyncItem).delete()
    db.commit()
