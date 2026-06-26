"""Incremental, item-keyed ingestion from the Zotero library.

Indexes one summary chunk per Zotero item, keyed by Zotero **itemKey**
(`sourceId = itemKey`) and enriched with real bibliographic metadata. Abstract-bearing
items index title + abstract; items without abstracts index title and lightweight
metadata. This path is **additive**: it indexes a given set of items, upserting only
their points and replacing only their chunks in the manifest. So selecting a new
collection adds to the index without disturbing what's already there.

Idempotent via an index-input hash recorded in the sync ledger: unchanged PDF +
metadata inputs are skipped.
"""

import hashlib
import logging
from collections import defaultdict
from pathlib import Path

from core.db import SessionLocal
from repositories.zotero_repository import (
    clear_all,
    delete_item,
    ensure_table,
    get_ledger,
    upsert_item,
)
from services.lab import vector_store
from services.lab.embedding_service import embed_texts
from services.lab.manifest_loader import read_json_file
from services.lab.pdf_ingest import _write_manifest
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

INDEX_STRATEGY_VERSION = "zotero-summary-v1"


def _file_hash(path):
    return hashlib.sha1(Path(path).read_bytes()).hexdigest()[:12]


def _index_hash(raw_pdf_hash, mode, text, meta):
    parts = [
        INDEX_STRATEGY_VERSION,
        raw_pdf_hash or "",
        mode or "",
        text or "",
        (meta or {}).get("title") or "",
        (meta or {}).get("year") or "",
        (meta or {}).get("itemType") or "",
        (meta or {}).get("doi") or "",
        "\n".join((meta or {}).get("authors") or []),
    ]
    return hashlib.sha1("\0".join(parts).encode("utf-8")).hexdigest()[:12]


def _clean_text(value):
    return " ".join((value or "").split())


def _metadata_text(item_key, title, meta):
    meta = meta or {}
    authors = ", ".join(meta.get("authors") or [])
    lines = [
        ("Title", title),
        ("Authors", authors),
        ("Year", meta.get("year")),
        ("Item type", meta.get("itemType")),
        ("DOI", meta.get("doi")),
    ]
    text = "\n".join(f"{label}: {_clean_text(value)}" for label, value in lines if _clean_text(value))
    return text or _clean_text(title) or item_key


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


def build_chunks_for_item(item_key, pdf_path, meta, raw_pdf_hash=None):
    """One schema-conformant summary chunk for one Zotero item."""
    path = Path(pdf_path)
    file_hash = raw_pdf_hash or _file_hash(path)
    title = (meta or {}).get("title") or path.stem.replace("_", " ").strip()
    title = _clean_text(title) or item_key
    abstract = _clean_text((meta or {}).get("abstractNote"))

    if abstract:
        content_mode = "abstract"
        text = f"{title}\n\n{abstract}"
    else:
        content_mode = "metadata"
        text = _metadata_text(item_key, title, meta)

    index_hash = _index_hash(file_hash, content_mode, text, meta)
    chunk = {
        "sourceType": "zotero",
        "sourceId": item_key,
        "chunkId": f"zotero::{item_key}::summary",
        "title": title,
        "url": f"/papers/{item_key}",
        "contentMode": content_mode,
        "text": text,
        "metadata": {
            "fileName": path.name,
            "itemKey": item_key,
            "authors": (meta or {}).get("authors", []),
            "year": (meta or {}).get("year"),
            "itemType": (meta or {}).get("itemType"),
            "doi": (meta or {}).get("doi"),
            "indexMode": content_mode,
            "zoteroLink": f"zotero://select/library/items/{item_key}",
            "fileHash": file_hash,
        },
    }

    return [chunk], index_hash


def index_items(item_keys, progress=None):
    """Index a set of Zotero item keys into the manifest + vector store, additively.

    Skips items with no synced PDF and items whose indexed PDF + metadata inputs are
    unchanged since last index (ledger hit). Returns a summary dict.
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
            # abort the whole job or leave the manifest out of sync with the vector store + ledger.
            try:
                emit("indexing", pct, f"{key}: indexing", currentItemKey=key)
                pdf = resolve_pdf_path(key)
                if not pdf:
                    skipped_no_pdf += 1
                    emit("indexing", pct, f"{key}: no PDF - skipped", currentItemKey=key)
                    continue

                meta = item_metadata(key) or {"itemKey": key}
                raw_pdf_hash = _file_hash(pdf)
                chunks, file_hash = build_chunks_for_item(key, pdf, meta, raw_pdf_hash)

                prev = ledger.get(key)
                # Skip only when the ledger says indexed, the PDF is unchanged, AND the vector
                # actually exists in the store. The last clause self-heals installs migrating
                # off Qdrant (empty store + "indexed" ledger): the item re-embeds once, then
                # skips normally.
                if (prev and prev.get("status") == "indexed"
                        and prev.get("file_hash") == file_hash
                        and vector_store.has_vector(key)):
                    skipped += 1
                    emit("indexing", pct, f"{key}: up to date", currentItemKey=key)
                    continue

                vectors = embed_texts([c["text"] for c in chunks])

                with DERIVED_STATE_LOCK:
                    ensure_current_generation(generation)
                    # One summary chunk per item, so the paper vector is the summary vector.
                    # upsert_vector overwrites by key - no stale-point cleanup needed.
                    if vectors:
                        vector_store.upsert_vector(key, vectors[0], _paper_payload(key, meta))

                    by_source[key] = chunks
                    upsert_item(db, key, file_hash, meta.get("title"), len(chunks), "indexed")
                    # Persist after each item so a later crash leaves a manifest matching
                    # exactly the items committed to the vector store + the ledger (resumable).
                    _flush_manifest()
                indexed += 1
                emit("indexing", pct, f"{(meta.get('title') or key)[:48]} - {len(chunks)} chunks", currentItemKey=key)

                # Best-effort: fetch this paper's OpenAlex record so the Map's citation signals
                # are ready without a separate fetch step. Fail-open - the item is already
                # indexed; a network/lookup failure must never mark it failed.
                try:
                    emit("indexing", pct, f"{(meta.get('title') or key)[:40]} - fetching citations", currentItemKey=key)
                    _enrich_citations(key, meta, generation)
                except DerivedStateReset:
                    raise
                except Exception:
                    logger.exception("index_items: citation enrichment failed for %s (non-fatal)", key)
            except DerivedStateReset:
                db.rollback()
                emit("cancelled", pct, "indexing cancelled by reset", currentItemKey=key)
                raise
            except Exception:
                logger.exception("index_items: failed to index %s", key)
                db.rollback()
                # Leave the item in a consistent unindexed state: clear any (partial or
                # stale) vector, drop its chunks from the manifest, and mark it failed so the
                # next run retries it.
                with DERIVED_STATE_LOCK:
                    ensure_current_generation(generation)
                    by_source.pop(key, None)
                    try:
                        vector_store.delete_vector(key)
                    except Exception:
                        logger.exception("index_items: cleanup delete failed for %s", key)
                    try:
                        upsert_item(db, key, file_hash, meta.get("title"), 0, "failed")
                    except Exception:
                        db.rollback()
                    _flush_manifest()
                failed += 1
                emit("indexing", pct, f"{key}: failed - skipped", currentItemKey=key)

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
        emit("done", 100, f"indexed {indexed}, skipped {skipped}, no-PDF {skipped_no_pdf}, failed {failed}", currentItemKey=None)
        return summary
    except DerivedStateReset:
        logger.info("index_items: cancelled by reset")
        raise
    finally:
        db.close()


def reset_index():
    """Full reset to a clean slate: wipe the paper-vector store, empty the manifest, clear the
    ledger, and clear derived artifacts (the OpenAlex cache, the Zotero index-job files, and the
    narration + OpenAlex-fetch job files + narration mp3s). Everything after this is additive
    via `index_items`.
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
            vector_store.reset()
            _write_manifest([], Path(get_lab_settings()["chunk_index_path"]))
            # Clear the ledger right after wiping the vectors + the manifest so the three
            # index-state stores stay consistent. (Done before the OpenAlex reset below, which is
            # best-effort:
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
    drops each orphan's vector, manifest chunks, and ledger row. Explicit/user-driven.

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
                    vector_store.delete_vector(key)
                except Exception:
                    logger.exception("prune_orphans: vector delete failed for %s", key)
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
