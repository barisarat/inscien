"""`inscien index`: the papers in the library sidebar -> page-anchored passages -> one sqlite file.

What is indexed is every item the sidebar shows (every collection except the hidden roots) that
has a stored PDF in Zotero. The PDF is read from Zotero storage, read-only.

    Papers are keyed by Zotero itemKey. Title, authors, year and venue come from Zotero.

    Passages never cross a page, so each has one page and one bounding box, and can be marked
    where it sits. They are built from PyMuPDF text blocks, not refs/pdftext.py: a passage mark
    needs the block geometry, which the glyph-run items of pdftext do not carry.

    The reference list is not indexed: everything from the last "References" (or
    "Bibliography") heading up to an "Appendix" heading is left out.

    What is embedded is "<title>" followed by the passage; what is stored and shown is the
    passage alone. chunks_fts holds passage text only; papers_fts holds titles and authors, for
    the type-ahead.

An update indexes new and changed papers (a paper is skipped when its PDF path, size and
modification time are unchanged) and drops papers that left the sidebar. Each paper commits on
its own, so a cancelled run keeps every finished paper. Progress is printed in the job pane's
shapes: `==> k/n label` per step and `[ done/total]` per paper.
"""

import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import pymupdf

from inscien.core.paths import search_index_path

TARGET_CHARS = 900
OVERLAP_CHARS = 150
# Below this many extracted characters a PDF has no text layer; it is recorded as 'no_text'.
NO_TEXT_THRESHOLD = 1000

REFERENCES = re.compile(r"^(\d+(\.\d+)*\.?\s*|[IVX]+\.\s*)?(references|bibliography|works cited|literature cited)$", re.I)
APPENDIX = re.compile(r"^(\d+\.?\s*|[A-Z]\.?\s+)?(appendix|appendices|supplementary material)\b", re.I)

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS papers (
    id INTEGER PRIMARY KEY,
    item_key TEXT UNIQUE NOT NULL,
    title TEXT, authors TEXT, year INTEGER, venue TEXT,
    pdf TEXT, size INTEGER, mtime REAL, pages INTEGER, chunks INTEGER,
    status TEXT, error TEXT, indexed_at TEXT
);
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY,
    paper_id INTEGER NOT NULL,
    page INTEGER NOT NULL,
    bbox_json TEXT,
    text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_paper ON chunks(paper_id, page);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, content='chunks', content_rowid='id');
CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts USING fts5(title, authors, content='papers', content_rowid='id');
"""


def connect(db_path: str | None = None, readonly: bool = False) -> sqlite3.Connection:
    """The index, with sqlite-vec loaded. Read-only connections are for queries."""
    import sqlite_vec

    from inscien.search import models

    path = Path(db_path or search_index_path())
    if readonly:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, check_same_thread=False)
    else:
        conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    if not readonly:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0("
                     f"chunk_id INTEGER PRIMARY KEY, embedding FLOAT[{models.DIM}])")
        conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('embed_model', ?)", (models.EMBED_MODEL,))
        conn.commit()
    return conn


def sidebar_items() -> dict[str, str]:
    """{itemKey: pdf path} for every item the sidebar shows that has a stored PDF."""
    from inscien.routers.zotero import HIDDEN_ROOTS
    from inscien.services.zotero import reader

    keys = set()
    for root in reader.list_collections():
        if root["name"] not in HIDDEN_ROOTS:
            keys |= reader.resolve_collection_items(root["collectionID"], recursive=True)
    found = {}
    for key in sorted(keys):
        pdf = reader.resolve_pdf_path(key)
        if pdf:
            found[key] = pdf
    return found


def page_blocks(page) -> list[dict]:
    """Text blocks of one page in reading order (left column, then right), with bboxes."""
    raw = page.get_text("blocks")
    blocks = [b for b in raw if len(b) >= 5 and (b[4] or "").strip() and (len(b) <= 6 or b[6] == 0)]
    mid = page.rect.width / 2.0
    blocks.sort(key=lambda b: (0 if (b[0] + b[2]) / 2.0 < mid else 1, round(b[1], 1), b[0]))
    return [{"text": " ".join(b[4].split()), "bbox": [b[0], b[1], b[2], b[3]]} for b in blocks]


def without_references(pages: dict[int, list[dict]]) -> dict[int, list[dict]]:
    """The pages with the reference list removed: from the last References heading to an Appendix
    heading, or to the end. A heading on the first page is not taken (a title or abstract may
    name it)."""
    flat = [(page, i, block) for page in sorted(pages) for i, block in enumerate(pages[page])]
    start = None
    for n, (page, _, block) in enumerate(flat):
        if page > 1 and len(block["text"]) <= 40 and REFERENCES.match(block["text"].strip()):
            start = n
    if start is None:
        return pages
    end = next((n for n in range(start + 1, len(flat)) if len(flat[n][2]["text"]) <= 80
                and APPENDIX.match(flat[n][2]["text"].strip())), len(flat))
    drop = {(page, i) for page, i, _ in flat[start:end]}
    return {page: [b for i, b in enumerate(blocks) if (page, i) not in drop] for page, blocks in pages.items()}


def union_bbox(boxes):
    if not boxes:
        return None
    return [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]


def window(blocks: list[dict]) -> list[dict]:
    """One page's blocks as ~TARGET_CHARS passages, each overlapping the previous by OVERLAP_CHARS."""
    passages, buf, boxes = [], "", []
    for block in blocks:
        text = block["text"].strip()
        if not text:
            continue
        if buf and len(buf) + 1 + len(text) > TARGET_CHARS:
            passages.append({"text": buf, "bbox": union_bbox(boxes)})
            buf = f"{buf[-OVERLAP_CHARS:]} {text}".strip()
            boxes = [block["bbox"]]
        else:
            buf = f"{buf} {text}".strip() if buf else text
            boxes.append(block["bbox"])
    if buf:
        passages.append({"text": buf, "bbox": union_bbox(boxes)})
    return passages


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def remove_paper(conn, paper_id: int, keep_row: bool = False) -> None:
    for row in conn.execute("SELECT id FROM chunks WHERE paper_id = ?", (paper_id,)).fetchall():
        conn.execute("DELETE FROM chunks_fts WHERE rowid = ?", (row["id"],))
        conn.execute("DELETE FROM vec_chunks WHERE chunk_id = ?", (row["id"],))
    conn.execute("DELETE FROM chunks WHERE paper_id = ?", (paper_id,))
    if not keep_row:
        row = conn.execute("SELECT title, authors FROM papers WHERE id = ?", (paper_id,)).fetchone()
        if row:
            conn.execute("INSERT INTO papers_fts (papers_fts, rowid, title, authors) VALUES ('delete', ?, ?, ?)",
                         (paper_id, row["title"] or "", row["authors"] or ""))
        conn.execute("DELETE FROM papers WHERE id = ?", (paper_id,))


def _upsert_paper(conn, key, meta, pdf, stat, pages, status, error=None) -> int:
    authors = "; ".join(a for a in (meta.get("authors") or []) if a) if isinstance(meta.get("authors"), list) else ""
    year = int(meta["year"]) if str(meta.get("year") or "").isdigit() else None
    row = conn.execute("SELECT id, title, authors FROM papers WHERE item_key = ?", (key,)).fetchone()
    values = (meta.get("title") or Path(pdf).stem, authors, year, meta.get("venue"), pdf, stat.st_size,
              stat.st_mtime, pages, status, error, _now())
    if row:
        conn.execute("INSERT INTO papers_fts (papers_fts, rowid, title, authors) VALUES ('delete', ?, ?, ?)",
                     (row["id"], row["title"] or "", row["authors"] or ""))
        conn.execute("UPDATE papers SET title=?, authors=?, year=?, venue=?, pdf=?, size=?, mtime=?, pages=?,"
                     " status=?, error=?, indexed_at=? WHERE id=?", (*values, row["id"]))
        paper_id = row["id"]
    else:
        paper_id = conn.execute("INSERT INTO papers (title, authors, year, venue, pdf, size, mtime, pages, status,"
                                " error, indexed_at, chunks, item_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?)",
                                (*values, key)).lastrowid
    conn.execute("INSERT INTO papers_fts (rowid, title, authors) VALUES (?, ?, ?)", (paper_id, values[0], authors))
    return paper_id


def _author_names(meta: dict) -> list[str]:
    """Zotero authors as display names, whatever shape the reader gives them in."""
    names = []
    for a in meta.get("authors") or []:
        if isinstance(a, str):
            names.append(a)
        elif isinstance(a, dict):
            names.append(" ".join(p for p in (a.get("firstName"), a.get("lastName")) if p) or a.get("name") or "")
    return [n for n in names if n]


def index_paper(conn, key: str, pdf: str) -> str:
    """Read, chunk, embed and store one paper. Returns 'ok' or 'no_text'."""
    from inscien.search import models
    from inscien.services.zotero import reader

    meta = dict(reader.item_metadata(key) or {})
    meta["authors"] = _author_names(meta)
    stat = os.stat(pdf)
    doc = pymupdf.open(pdf)
    try:
        page_count = doc.page_count
        pages = {i + 1: page_blocks(doc.load_page(i)) for i in range(page_count)}
    finally:
        doc.close()
    pages = without_references(pages)

    passages = [{"page": page, **p} for page in sorted(pages) for p in window(pages[page])]
    existing = conn.execute("SELECT id FROM papers WHERE item_key = ?", (key,)).fetchone()
    if existing:
        remove_paper(conn, existing["id"], keep_row=True)
    if sum(len(p["text"]) for p in passages) < NO_TEXT_THRESHOLD:
        paper_id = _upsert_paper(conn, key, meta, pdf, stat, page_count, "no_text", "no text layer")
        conn.execute("UPDATE papers SET chunks=0 WHERE id=?", (paper_id,))
        conn.commit()
        return "no_text"

    paper_id = _upsert_paper(conn, key, meta, pdf, stat, page_count, "ok")
    title = meta.get("title") or Path(pdf).stem
    ids = []
    for p in passages:
        cursor = conn.execute("INSERT INTO chunks (paper_id, page, bbox_json, text) VALUES (?,?,?,?)",
                              (paper_id, p["page"], json.dumps(p["bbox"]) if p["bbox"] else None, p["text"]))
        ids.append(cursor.lastrowid)
        conn.execute("INSERT INTO chunks_fts (rowid, text) VALUES (?, ?)", (cursor.lastrowid, p["text"]))
    vectors = models.passages(f"{title}\n\n{p['text']}" for p in passages)
    conn.executemany("INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)",
                     [(chunk_id, json.dumps(vector)) for chunk_id, vector in zip(ids, vectors)])
    conn.execute("UPDATE papers SET chunks=? WHERE id=?", (len(passages), paper_id))
    conn.commit()
    return "ok"


def run(rebuild: bool = False) -> None:
    """Update the index (or, with `rebuild`, index every paper again)."""
    from inscien import search
    from inscien.search import models

    if not search.installed():
        raise RuntimeError("search is not installed: pip install 'inscien[search]'")
    print("==> 1/2 find the papers", flush=True)
    items = sidebar_items()
    conn = connect()
    removed = 0
    try:
        for row in conn.execute("SELECT id, item_key FROM papers").fetchall():
            if row["item_key"] not in items:
                remove_paper(conn, row["id"])
                removed += 1
        conn.commit()
        todo = []
        for key, pdf in items.items():
            row = conn.execute("SELECT pdf, size, mtime FROM papers WHERE item_key = ?", (key,)).fetchone()
            stat = os.stat(pdf)
            if rebuild or not row or row["pdf"] != pdf or row["size"] != stat.st_size or row["mtime"] != stat.st_mtime:
                todo.append((key, pdf))
        print(f"{len(items)} papers with a PDF, {len(todo)} to index, {removed} removed", flush=True)
        print(f"==> 2/2 index {len(todo)} papers", flush=True)
        if todo:
            models.embedder()
            print(f"embedding on {'the GPU' if models.DEVICE == 'cuda' else 'the CPU'}", flush=True)
        counts = {"ok": 0, "no_text": 0, "error": 0}
        for n, (key, pdf) in enumerate(todo, 1):
            print(f"[{n:4d}/{len(todo)}] {Path(pdf).name[:70]}", flush=True)
            try:
                counts[index_paper(conn, key, pdf)] += 1
            except Exception as exc:
                conn.rollback()
                counts["error"] += 1
                print(f"  skipped: {str(exc)[:160]}", file=sys.stderr, flush=True)
        print(f"indexed {counts['ok']}, without text {counts['no_text']}, errors {counts['error']}", flush=True)
    finally:
        conn.rollback()
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.close()
