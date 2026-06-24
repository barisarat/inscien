"""Per-item sync ledger: the one thing the index adds on top of Zotero.

Zotero stays the source of truth for *organization* (collections, membership - read
live). The index only owns *content*, and this table answers the single question the
index adds: "is this item indexed, and is it up to date?" Keyed by Zotero itemKey, so
it lines up 1:1 with chunk `sourceId`.
"""

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from core.db import Base


class ZoteroSyncItem(Base):
    __tablename__ = "zotero_sync_items"

    item_key = Column(String(32), primary_key=True)
    file_hash = Column(String(16), nullable=True)
    title = Column(Text, nullable=True)
    chunk_count = Column(Integer, nullable=False, default=0)
    status = Column(String(16), nullable=False, default="indexed")  # indexed | failed
    indexed_at = Column(
        DateTime(timezone=True), nullable=False,
        server_default=func.now(), onupdate=func.now(),
    )
