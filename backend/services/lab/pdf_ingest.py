"""Ingest local PDFs into the chunk manifest + Qdrant index.

Pipeline: parse (PyMuPDF) -> chunk into sub-page passages (each tagged with its
page + bbox) -> write a single chunk manifest -> embed (bge-small) -> rebuild the
Qdrant collection. "Seed once, query many."

Idempotent: a document's id is a content hash of the file, so chunk ids are stable
and re-running on an unchanged corpus reproduces the same index. The collection is
rebuilt wholesale each run, so there are never stale/duplicate points.
"""

import hashlib
import json
from collections import defaultdict
from pathlib import Path

from services.lab.embedding_service import embed_texts
from services.lab.pdf_parser import parse_pdf, pdf_title
from services.lab.qdrant_store import (
    build_point,
    get_lab_collection_count,
    recreate_lab_collection,
    upsert_lab_points,
)
from services.lab.settings import get_lab_settings


# Passage sizing: sub-page windows so a citation points at a tight span, with a
# little overlap so a sentence split across the window boundary stays retrievable.
TARGET_CHARS = 900
OVERLAP_CHARS = 150
BATCH_SIZE = 32


def _file_doc_id(path):
    digest = hashlib.sha1(Path(path).read_bytes()).hexdigest()[:12]
    return f"{Path(path).stem[:40]}-{digest}"


def _union_bbox(bboxes):
    if not bboxes:
        return None
    return [
        min(b[0] for b in bboxes),
        min(b[1] for b in bboxes),
        max(b[2] for b in bboxes),
        max(b[3] for b in bboxes),
    ]


def _page_passages(blocks):
    """Window a single page's blocks into ~TARGET_CHARS passages with overlap.
    Returns [{text, bbox}] where bbox is the union of the contributing blocks."""
    passages = []
    buf_text = ""
    buf_bboxes = []

    for block in blocks:
        text = block["text"].strip()
        if not text:
            continue

        if buf_text and len(buf_text) + 1 + len(text) > TARGET_CHARS:
            passages.append({"text": buf_text, "bbox": _union_bbox(buf_bboxes)})
            tail = buf_text[-OVERLAP_CHARS:]
            buf_text = f"{tail} {text}".strip()
            buf_bboxes = [block["bbox"]]
        else:
            buf_text = f"{buf_text} {text}".strip() if buf_text else text
            buf_bboxes.append(block["bbox"])

    if buf_text:
        passages.append({"text": buf_text, "bbox": _union_bbox(buf_bboxes)})

    return passages


def build_chunks_for_pdf(path):
    """Parse one PDF into schema-conformant chunks (one per sub-page passage)."""
    path = Path(path)
    doc_id = _file_doc_id(path)
    title = pdf_title(path) or path.stem.replace("_", " ").strip()

    blocks = parse_pdf(str(path))
    by_page = defaultdict(list)
    for block in blocks:
        by_page[block["page"]].append(block)

    chunks = []
    for page in sorted(by_page):
        for index, passage in enumerate(_page_passages(by_page[page])):
            chunks.append({
                "sourceType": "pdf",
                "sourceId": doc_id,
                "chunkId": f"pdf::{doc_id}::p{page}::{index}",
                "title": title,
                "url": f"/papers/{doc_id}",
                "contentMode": "full_text",
                "text": passage["text"],
                "metadata": {
                    "page": page,
                    "passageIndex": index,
                    "bbox": passage["bbox"],
                    "fileName": path.name,
                },
            })

    return chunks


def build_manifest(papers_dir, progress=None):
    """Parse every PDF under papers_dir into one deduplicated chunk list."""
    emit = progress or (lambda _msg: None)
    pdfs = sorted(Path(papers_dir).glob("*.pdf"))
    emit(f"Found {len(pdfs)} PDF(s) in {papers_dir}")
    chunks = []
    per_file = {}
    seen_docs = set()

    for index, pdf in enumerate(pdfs, start=1):
        emit(f"[{index}/{len(pdfs)}] parsing {pdf.name} …")
        doc_chunks = build_chunks_for_pdf(pdf)
        doc_id = doc_chunks[0]["sourceId"] if doc_chunks else None
        # Idempotent dedup: identical file content -> same doc id -> ingest once.
        if doc_id and doc_id in seen_docs:
            emit(f"    duplicate of an already-parsed file — skipped")
            continue
        if doc_id:
            seen_docs.add(doc_id)
        per_file[pdf.name] = len(doc_chunks)
        emit(f"    {len(doc_chunks)} chunk(s)")

        chunks.extend(doc_chunks)

    return chunks, per_file


def _write_manifest(chunks, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(chunks, f, ensure_ascii=False)


def _batched(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def reindex_library(progress=None):
    """Full ingest: parse PDFs -> manifest -> embed -> rebuild Qdrant. Returns a
    summary dict. Used by the CLI script and the POST /api/lab/reindex endpoint.

    Pass `progress` (a callable taking a message string) to stream step-by-step
    feedback — the CLI prints it; the HTTP endpoint leaves it off.
    """
    emit = progress or (lambda _msg: None)
    settings = get_lab_settings()

    chunks, per_file = build_manifest(settings["papers_dir"], progress=progress)
    _write_manifest(chunks, settings["chunk_index_path"])

    total = len(chunks)
    emit(f"Embedding {total} chunk(s) and rebuilding the index "
         f"(first run downloads the embedding model once) …")
    collection = recreate_lab_collection()
    indexed = 0
    for batch in _batched(chunks, BATCH_SIZE):
        vectors = embed_texts([c["text"] for c in batch])
        points = [build_point(c, v) for c, v in zip(batch, vectors)]
        upsert_lab_points(points)
        indexed += len(batch)
        emit(f"    embedded {indexed}/{total}")

    emit("Done.")
    return {
        "ok": True,
        "papers": per_file,
        "documents": len(per_file),
        "total_chunks": len(chunks),
        "indexed": indexed,
        "collection": collection,
        "qdrant": get_lab_collection_count() if chunks else {"points_count": 0},
        "manifest_path": settings["chunk_index_path"],
    }
