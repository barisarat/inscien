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
import os
from collections import defaultdict
from pathlib import Path

import numpy as np

from core.db import SessionLocal
from repositories.zotero_repository import (
    clear_all,
    delete_item,
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
    ensure_lab_collection,
    ensure_paper_collection,
    ensure_source_payload_index,
    recreate_lab_collection,
    recreate_paper_collection,
    upsert_lab_points,
    upsert_paper_vector,
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
from services.refs import refstore
from services.zotero.reader import item_metadata, live_item_keys, resolve_pdf_path

logger = logging.getLogger(__name__)

BATCH_SIZE = 32
# Cap per-document parsing/embedding by page count so books / very-long items don't bloat the
# index (and a whole collection can be fully indexed cheaply). The first pages carry a paper's
# "aboutness" - which is all the Map (similarity) and Narration need. Cap by ACTUAL length, not
# the (unreliable) Zotero item-type. Changing this requires a reset + re-index to take effect.
MAX_INDEX_PAGES = int(os.getenv("MAX_INDEX_PAGES", "15"))


def _file_hash(path):
    return hashlib.sha1(Path(path).read_bytes()).hexdigest()[:12]


def _paper_payload(item_key, meta):
    """Minimal node metadata stored on the paper vector (the Map builder also resolves titles)."""
    meta = meta or {}
    return {
        "title": meta.get("title"),
        "year": meta.get("year"),
        "itemType": meta.get("itemType"),
        "doi": meta.get("doi"),
    }


def _enrich_citations(item_key, meta, generation):
    """Best-effort OpenAlex enrichment folded into indexing so the Map has citation signals
    (direct citation + bibliographic coupling) without a separate fetch gate.

    Network I/O (`fetch_work`) runs OUTSIDE the derived-state lock; only the small cache write
    is guarded. Reference *resolution* (titles/years for the external satellite layer) stays
    lazy on the `/api/graph` endpoints - the fused map only needs the raw referenced ids. Any
    failure is swallowed by the caller: the item is already fully indexed and the map simply
    degrades to a semantic-only node for it (the citation endpoints still retry on demand).
    """
    cache = refstore._load()
    if refstore._is_mapped(cache.get(item_key)):
        return  # already have a current OpenAlex record
    rec = refstore._map_record(meta, (meta or {}).get("doi"))  # does the fetch_work round-trip
    with DERIVED_STATE_LOCK:
        ensure_current_generation(generation)
        cache = refstore._load()  # reload under lock so we don't clobber a concurrent writer
        cache[item_key] = rec
        refstore._save(cache)


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
        if page > MAX_INDEX_PAGES:  # length cap - see MAX_INDEX_PAGES
            break
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
        ensure_lab_collection()
        ensure_source_payload_index()
        ensure_paper_collection()
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
                    emit("indexing", pct, f"{key}: no PDF - skipped")
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
                all_vectors = []
                for batch in _batched(chunks, BATCH_SIZE):
                    vectors = embed_texts([c["text"] for c in batch])
                    all_vectors.extend(vectors)
                    point_batches.append([build_point(c, v) for c, v in zip(batch, vectors)])

                with DERIVED_STATE_LOCK:
                    ensure_current_generation(generation)
                    delete_lab_points_by_source(key)  # clear stale points if re-indexing
                    for points in point_batches:
                        upsert_lab_points(points)
                    # Paper-level vector = mean of the item's chunk vectors (reflects the capped
                    # content) -> powers the Map's Similarity lens.
                    if all_vectors:
                        paper_vec = np.mean(np.asarray(all_vectors, dtype="float32"), axis=0).tolist()
                        upsert_paper_vector(key, paper_vec, _paper_payload(key, meta))

                    by_source[key] = chunks
                    upsert_item(db, key, file_hash, meta.get("title"), len(chunks), "indexed")
                    # Persist after each item so a later crash leaves a manifest matching
                    # exactly the items committed to Qdrant + the ledger (resumable).
                    _flush_manifest()
                indexed += 1
                emit("indexing", pct, f"{(meta.get('title') or key)[:48]} - {len(chunks)} chunks")

                # Best-effort: fetch this paper's OpenAlex record so the Map's citation signals
                # are ready without a separate fetch step. Fail-open - the item is already
                # indexed; a network/lookup failure must never mark it failed.
                try:
                    emit("indexing", pct, f"{(meta.get('title') or key)[:40]} - fetching citations")
                    _enrich_citations(key, meta, generation)
                except DerivedStateReset:
                    raise
                except Exception:
                    logger.exception("index_items: citation enrichment failed for %s (non-fatal)", key)
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
                emit("indexing", pct, f"{key}: failed - skipped")

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
    index-job files, and the narration + OpenAlex-fetch job files + narration mp3s).
    Everything after this is additive via `index_items`.
    """
    with DERIVED_STATE_LOCK:
        # Invalidate any running background writer before wiping stores. Writers that were
        # doing parse/embed work outside the lock will observe this before their next commit.
        begin_reset()
        try:
            # Clear job records first so queued work cannot start after reset begins. Active
            # work has an older generation and will fail before its next guarded commit.
            from services.zotero.jobs import clear_jobs as _clear_zotero
            from services.narration.jobs import clear_jobs as _clear_narration
            from services.refs.fetch_jobs import clear_jobs as _clear_graph_fetch
            for clear in (_clear_zotero, _clear_narration, _clear_graph_fetch):
                try:
                    clear()
                except Exception:
                    logger.exception("reset_index: skill-artifact cleanup failed (non-fatal)")

            ensure_table()
            recreate_lab_collection()
            recreate_paper_collection()
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
            # Drop the OpenAlex cache too - its records are keyed to itemKeys that no longer exist.
            # Rebuildable, so failure here is non-fatal (logged, not raised).
            try:
                from services.refs.refstore import reset_cache
                reset_cache()
            except Exception:
                logger.exception("reset_index: OpenAlex cache reset failed (non-fatal)")
        finally:
            end_reset()
    return {"ok": True}


def prune_orphans(progress=None):
    """Remove index entries for items no longer in the live Zotero library (deleted papers).

    Diffs the indexed set (manifest sourceIds  or  ledger keys) against the live library and
    drops each orphan's Qdrant points, manifest chunks, and ledger row. Explicit/user-driven.

    Safety: if the live library can't be read or comes back empty, prune NOTHING - an
    unmounted/empty library must never look like "everything was deleted".
    """
    emit = progress or (lambda *_args, **_kwargs: None)
    generation = current_generation()
    ensure_table()
    settings = get_lab_settings()
    manifest_path = Path(settings["chunk_index_path"])

    try:
        live = live_item_keys()
    except Exception:
        logger.exception("prune_orphans: could not read the live Zotero library")
        return {"skipped": True, "pruned": 0,
                "reason": "Couldn't read your Zotero library - nothing was removed."}
    if not live:
        return {"skipped": True, "pruned": 0,
                "reason": "Your Zotero library looks empty or unavailable - nothing was removed."}

    by_source = defaultdict(list)
    for chunk in read_json_file(manifest_path):
        by_source[chunk["sourceId"]].append(chunk)

    db = SessionLocal()
    try:
        ledger = get_ledger(db)
        orphans = sorted((set(by_source) | set(ledger)) - live)
        if not orphans:
            return {"pruned": 0, "removed": []}

        removed = []
        with DERIVED_STATE_LOCK:
            ensure_current_generation(generation)
            for i, key in enumerate(orphans, start=1):
                title = (ledger.get(key) or {}).get("title") or key
                try:
                    delete_lab_points_by_source(key)
                except Exception:
                    logger.exception("prune_orphans: Qdrant delete failed for %s", key)
                by_source.pop(key, None)
                try:
                    delete_item(db, key)
                except Exception:
                    db.rollback()
                    logger.exception("prune_orphans: ledger delete failed for %s", key)
                removed.append(title)
                emit("pruning", int(i / len(orphans) * 100), f"removed {title[:48]}")
            # One atomic manifest write reflecting the pruned working set.
            _write_manifest([c for chunks in by_source.values() for c in chunks], manifest_path)
        logger.info("prune_orphans: removed %d orphaned item(s)", len(removed))
        return {"pruned": len(removed), "removed": removed}
    finally:
        db.close()
