"""Shared PDF chunking helpers for the Zotero ingestion path.

Windows a parsed PDF's per-page blocks into sub-page passages (each tagged with its
page + bbox) and writes the chunk manifest. The Zotero ingest path
(`services.zotero.ingest`) imports `_page_passages`, `_write_manifest`, and `_batched`
and pairs them with the shared parser (`pdf_parser`), embedder (`embedding_service`),
and Qdrant store (`qdrant_store`).
"""

import json
import os
from pathlib import Path


# Passage sizing: sub-page windows so a citation points at a tight span, with a
# little overlap so a sentence split across the window boundary stays retrievable.
TARGET_CHARS = 900
OVERLAP_CHARS = 150


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


def _write_manifest(chunks, path):
    """Atomically replace the manifest: write a temp file in the same dir, fsync, then
    rename over the target. A crash mid-write can never truncate the live manifest."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(chunks, f, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def _batched(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]
