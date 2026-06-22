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
import logging
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
from services.state_guard import (
    DERIVED_STATE_LOCK,
    DerivedStateReset,
    begin_reset,
    current_generation,
    end_reset,
    ensure_current_generation,
)
from services.zotero.reader import item_metadata, resolve_pdf_path

logger = logging.getLogger(__name__)

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
    generation = current_generation()
    ensure_table()
    settings = get_lab_settings()
    manifest_path = Path(settings["chunk_index_path"])

    # Working manifest, bucketed by source so we can replace one item cleanly.
    by_source = defaultdict(list)
    for chunk in read_json_file(manifest_path):
        by_source[chunk["sourceId"]].append(chunk)

    with DERIVED_STATE_LOCK:
        ensure_current_generation(generation)
        ensure_source_payload_index()
    db = SessionLocal()
    indexed = skipped = skipped_no_pdf = failed = 0
    total = max(len(item_keys), 1)

    def _flush_manifest():
        """Persist the manifest atomically from the current working set."""
        merged = [chunk for chunks in by_source.values() for chunk in chunks]
        _write_manifest(merged, manifest_path)
        return merged

    try:
        ledger = get_ledger(db)
        for i, key in enumerate(item_keys, start=1):
            ensure_current_generation(generation)
            pct = int(i / total * 100)
            meta = {"itemKey": key}
            file_hash = None

            # Per-item isolation: a single bad PDF (parse/embed/upsert failure) must not
            # abort the whole job or leave the manifest out of sync with Qdrant + ledger.
            try:
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

                point_batches = []
                for batch in _batched(chunks, BATCH_SIZE):
                    vectors = embed_texts([c["text"] for c in batch])
                    point_batches.append([build_point(c, v) for c, v in zip(batch, vectors)])

                with DERIVED_STATE_LOCK:
                    ensure_current_generation(generation)
                    delete_lab_points_by_source(key)  # clear stale points if re-indexing
                    for points in point_batches:
                        upsert_lab_points(points)

                    by_source[key] = chunks
                    upsert_item(db, key, file_hash, meta.get("title"), len(chunks), "indexed")
                    # Persist after each item so a later crash leaves a manifest matching
                    # exactly the items committed to Qdrant + the ledger (resumable).
                    _flush_manifest()
                indexed += 1
                emit("indexing", pct, f"{(meta.get('title') or key)[:48]} — {len(chunks)} chunks")
            except DerivedStateReset:
                db.rollback()
                emit("cancelled", pct, "indexing cancelled by reset")
                raise
            except Exception:
                logger.exception("index_items: failed to index %s", key)
                db.rollback()
                # Leave the item in a consistent unindexed state: clear any (partial or
                # stale) Qdrant points, drop its chunks from the manifest, and mark it
                # failed so the next run retries it.
                with DERIVED_STATE_LOCK:
                    ensure_current_generation(generation)
                    by_source.pop(key, None)
                    try:
                        delete_lab_points_by_source(key)
                    except Exception:
                        logger.exception("index_items: cleanup delete failed for %s", key)
                    try:
                        upsert_item(db, key, file_hash, meta.get("title"), 0, "failed")
                    except Exception:
                        db.rollback()
                    _flush_manifest()
                failed += 1
                emit("indexing", pct, f"{key}: failed — skipped")

        with DERIVED_STATE_LOCK:
            ensure_current_generation(generation)
            merged = _flush_manifest()
        summary = {
            "indexed": indexed,
            "skipped": skipped,
            "skippedNoPdf": skipped_no_pdf,
            "failed": failed,
            "totalChunks": len(merged),
        }
        emit("done", 100, f"indexed {indexed}, skipped {skipped}, no-PDF {skipped_no_pdf}, failed {failed}")
        return summary
    except DerivedStateReset:
        logger.info("index_items: cancelled by reset")
        raise
    finally:
        db.close()


def reset_index():
    """Full reset to a clean slate: drop + recreate the Qdrant collection, empty the
    manifest, clear the ledger, and clear derived artifacts (the OpenAlex cache, the Zotero
    index-job files, and the compare/writeup/narration/graph-fetch job files + narration
    mp3s). Everything after this is additive via `index_items`.
    """
    with DERIVED_STATE_LOCK:
        # Invalidate any running background writer before wiping stores. Writers that were
        # doing parse/embed work outside the lock will observe this before their next commit.
        begin_reset()
        try:
            # Clear job records first so queued work cannot start after reset begins. Active
            # work has an older generation and will fail before its next guarded commit.
            from services.zotero.jobs import clear_jobs as _clear_zotero
            from services.compare.jobs import clear_jobs as _clear_compare
            from services.writeup.jobs import clear_jobs as _clear_writeup
            from services.narration.jobs import clear_jobs as _clear_narration
            from services.refs.fetch_jobs import clear_jobs as _clear_graph_fetch
            for clear in (_clear_zotero, _clear_compare, _clear_writeup, _clear_narration, _clear_graph_fetch):
                try:
                    clear()
                except Exception:
                    logger.exception("reset_index: skill-artifact cleanup failed (non-fatal)")

            ensure_table()
            recreate_lab_collection()
            ensure_source_payload_index()
            _write_manifest([], Path(get_lab_settings()["chunk_index_path"]))
            # Clear the ledger right after wiping Qdrant + the manifest so the three index-state
            # stores stay consistent. (Done before the OpenAlex reset below, which is best-effort:
            # a failure there must not leave the ledger claiming items are still indexed.)
            db = SessionLocal()
            try:
                clear_all(db)
            finally:
                db.close()
            # Drop the OpenAlex cache too — its records are keyed to itemKeys that no longer exist.
            # Rebuildable, so failure here is non-fatal (logged, not raised).
            try:
                from services.refs.refstore import reset_cache
                reset_cache()
            except Exception:
                logger.exception("reset_index: OpenAlex cache reset failed (non-fatal)")
        finally:
            end_reset()
    return {"ok": True}
