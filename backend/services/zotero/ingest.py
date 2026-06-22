"""Incremental, item-keyed ingestion from the Zotero library.

Reuses the shared PDF parser + page-windowing chunker (`lab.pdf_parser`,
`lab.pdf_ingest`), but writes chunks keyed by Zotero **itemKey** (`sourceId = itemKey`)
and enriched with real bibliographic metadata. This path is **additive**: it indexes a
given set of items, upserting only their points and replacing only their chunks in the
manifest. So selecting a new collection adds to the index without disturbing what's
already there.

Idempotent via a content hash recorded in the sync ledger: an unchanged file is skipped.
"""

import hashlib
from collections import defaultdict
from pathlib import Path

from core.db import SessionLocal
from repositories.zotero_repository import (
    clear_all,
    ensure_table,
    get_ledger,
    upsert_item,
)
from services.lab.embedding_service import embed_texts
from services.lab.manifest_loader import read_json_file
from services.lab.pdf_ingest import _batched, _page_passages, _write_manifest
from services.lab.pdf_parser import parse_pdf
from services.lab.qdrant_store import (
    build_point,
    delete_lab_points_by_source,
    ensure_source_payload_index,
    recreate_lab_collection,
    upsert_lab_points,
)
from services.lab.settings import get_lab_settings
from services.zotero.reader import item_metadata, resolve_pdf_path

BATCH_SIZE = 32


def _file_hash(path):
    return hashlib.sha1(Path(path).read_bytes()).hexdigest()[:12]


def build_chunks_for_item(item_key, pdf_path, meta):
    """Schema-conformant chunks for one Zotero item, keyed by itemKey and carrying
    Zotero metadata (real title/authors/year + a deep-link) alongside page/bbox."""
    path = Path(pdf_path)
    file_hash = _file_hash(path)
    title = (meta or {}).get("title") or path.stem.replace("_", " ").strip()

    blocks = parse_pdf(str(path))
    by_page = defaultdict(list)
    for block in blocks:
        by_page[block["page"]].append(block)

    chunks = []
    for page in sorted(by_page):
        for index, passage in enumerate(_page_passages(by_page[page])):
            chunks.append({
                "sourceType": "zotero",
                "sourceId": item_key,
                "chunkId": f"zotero::{item_key}::p{page}::{index}",
                "title": title,
                "url": f"/papers/{item_key}",
                "contentMode": "full_text",
                "text": passage["text"],
                "metadata": {
                    "page": page,
                    "passageIndex": index,
                    "bbox": passage["bbox"],
                    "fileName": path.name,
                    "itemKey": item_key,
                    "authors": (meta or {}).get("authors", []),
                    "year": (meta or {}).get("year"),
                    "itemType": (meta or {}).get("itemType"),
                    "zoteroLink": f"zotero://select/library/items/{item_key}",
                    "fileHash": file_hash,
                },
            })

    return chunks, file_hash


def index_items(item_keys, progress=None):
    """Index a set of Zotero item keys into the manifest + Qdrant, additively.

    Skips items with no synced PDF and items whose file is unchanged since last index
    (ledger hit). Returns a summary dict.
    """
    emit = progress or (lambda *_args, **_kwargs: None)
    item_keys = list(item_keys)
    ensure_table()
    settings = get_lab_settings()
    manifest_path = Path(settings["chunk_index_path"])

    # Working manifest, bucketed by source so we can replace one item cleanly.
    by_source = defaultdict(list)
    for chunk in read_json_file(manifest_path):
        by_source[chunk["sourceId"]].append(chunk)

    ensure_source_payload_index()
    db = SessionLocal()
    indexed = skipped = skipped_no_pdf = 0
    total = max(len(item_keys), 1)
    try:
        ledger = get_ledger(db)
        for i, key in enumerate(item_keys, start=1):
            pct = int(i / total * 100)
            pdf = resolve_pdf_path(key)
            if not pdf:
                skipped_no_pdf += 1
                emit("indexing", pct, f"{key}: no PDF — skipped")
                continue

            file_hash = _file_hash(pdf)
            prev = ledger.get(key)
            if prev and prev.get("status") == "indexed" and prev.get("file_hash") == file_hash:
                skipped += 1
                emit("indexing", pct, f"{key}: up to date")
                continue

            meta = item_metadata(key) or {"itemKey": key}
            chunks, _ = build_chunks_for_item(key, pdf, meta)

            delete_lab_points_by_source(key)  # clear stale points if re-indexing
            for batch in _batched(chunks, BATCH_SIZE):
                vectors = embed_texts([c["text"] for c in batch])
                upsert_lab_points([build_point(c, v) for c, v in zip(batch, vectors)])

            by_source[key] = chunks
            upsert_item(db, key, file_hash, meta.get("title"), len(chunks), "indexed")
            indexed += 1
            emit("indexing", pct, f"{(meta.get('title') or key)[:48]} — {len(chunks)} chunks")

        merged = [chunk for chunks in by_source.values() for chunk in chunks]
        _write_manifest(merged, manifest_path)
        summary = {
            "indexed": indexed,
            "skipped": skipped,
            "skippedNoPdf": skipped_no_pdf,
            "totalChunks": len(merged),
        }
        emit("done", 100, f"indexed {indexed}, skipped {skipped}, no-PDF {skipped_no_pdf}")
        return summary
    finally:
        db.close()


def reset_index():
    """One-time reset: drop + recreate the Qdrant collection, empty the manifest, and
    clear the ledger. Used once to clear the pre-Zotero (finance/test) corpus before the
    first Zotero index. Everything after this is additive via `index_items`.
    """
    ensure_table()
    recreate_lab_collection()
    ensure_source_payload_index()
    _write_manifest([], Path(get_lab_settings()["chunk_index_path"]))
    # Drop the OpenAlex cache too — its records are keyed to itemKeys that no longer exist.
    from services.refs.refstore import reset_cache
    reset_cache()
    db = SessionLocal()
    try:
        clear_all(db)
    finally:
        db.close()
    return {"ok": True}
