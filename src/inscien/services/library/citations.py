"""The citation markers of a narrated paper, for the listen view's hover cards.

A bundle is joined to its built paper the way the library joins the other way (`narrations.find`:
the PDF filename, then the title). The markers are read live from the paper's PDF (Zotero's copy,
else the staged one under import/ or the narration queue) by `refs.citations`, so every existing
narration gets them without a rebuild. They are placed over the bundle's page images, so the PDF
must have the pages the bundle was rendered from: a different page count or page size answers
nothing rather than misplaced cards.

A reference that is itself in the Zotero library with a PDF carries that item's `itemKey`
(matched on DOI, then on the folded title), so its card can open the PDF in the app.

The answer is kept in memory per bundle, keyed by what it was computed from.
"""

import json
import logging
import os
import re
import unicodedata
from pathlib import Path

import pymupdf

from inscien.core.paths import import_dir, library_dir, narration_queue_dir, narrations_dir
from inscien.refs import citations
from inscien.services.library import narrations, store
from inscien.services.zotero import reader

logger = logging.getLogger(__name__)

EMPTY = {"citations": [], "references": {}}
_cache: dict = {}


def _read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None


def _paper_for(slug: str) -> dict | None:
    bundle = next((b for b in narrations.bundles() if b["slug"] == slug), None)
    if not bundle:
        return None
    for summary in store.list_papers():
        if narrations.find(summary.get("source"), summary.get("title"), [bundle]):
            return store.load_paper(summary["slug"])
    return None


def _pdf_for(paper: dict) -> str | None:
    if paper.get("zoteroKey"):
        try:
            path = reader.resolve_pdf_path(paper["zoteroKey"])
        except Exception:  # an unreadable Zotero database still leaves the staged copies
            path = None
        if path and os.path.isfile(path):
            return path
    name = os.path.basename(paper.get("source") or "")
    for root in (import_dir(), narration_queue_dir()):
        candidate = os.path.join(root, name)
        if name and os.path.isfile(candidate):
            return candidate
    return None


def _same_pages(pdf: str, pages: list) -> bool:
    with pymupdf.open(pdf) as doc:
        if doc.page_count != len(pages):
            return False
        return all(abs(p.rect.width - q["width"]) <= 1 and abs(p.rect.height - q["height"]) <= 1 for p, q in zip(doc, pages))


def _fold(title: str | None) -> str:
    text = unicodedata.normalize("NFKD", title or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def _zotero_keys(refs: list[dict]) -> dict:
    """{n: itemKey} for the references that are Zotero items with a stored PDF."""
    try:
        items = reader.library_items()
    except Exception:  # an unreadable Zotero library only costs the Open PDF buttons
        return {}
    by_doi = {i["doi"]: i["itemKey"] for i in items if i.get("doi")}
    by_title = {_fold(i["title"]): i["itemKey"] for i in items if len(_fold(i.get("title"))) >= 20}
    out = {}
    for ref in refs:
        doi = reader._normalize_doi((ref.get("resolved") or {}).get("doi") or ref.get("doi"))
        key = by_doi.get(doi) if doi else None
        key = key or by_title.get(_fold(ref.get("title")))
        try:
            if key and reader.resolve_pdf_path(key):
                out[ref["n"]] = key
        except Exception:
            continue
    return out


def _card(ref: dict) -> dict:
    """What the hover card shows for one reference: the fields the Map's node card shows."""
    resolved = ref.get("resolved") or {}
    return {
        "n": ref["n"],
        "title": ref.get("title"),
        "raw": ref.get("raw"),
        "authors": ref.get("authors") or [],
        "year": ref.get("year"),
        "venue": ref.get("venue"),
        "citedBy": resolved.get("citedBy"),
        "doi": resolved.get("doi") or ref.get("doi"),
        "arxivId": ref.get("arxivId"),
    }


def for_bundle(slug: str) -> dict:
    """{citations: [{page, rects, refs}], references: {n: card}} for one bundle; empty when the
    paper is not built, its PDF is gone, or the PDF is not the one the bundle shows."""
    paper = _paper_for(slug)
    anchors = _read_json(Path(narrations_dir(), slug, "anchors.json")) or {}
    if not paper or not anchors.get("pages"):
        return EMPTY
    pdf = _pdf_for(paper)
    if not pdf:
        return EMPTY
    extract = _read_json(Path(library_dir(), paper["slug"], "extract.json")) or {}
    try:
        library_mtime = reader.snapshot_mtime()  # a paper added to Zotero gets its Open PDF button
    except Exception:
        library_mtime = None
    key = (slug, pdf, os.path.getmtime(pdf), paper.get("builtAt"), library_mtime)
    if _cache.get(slug, (None,))[0] == key:
        return _cache[slug][1]
    result = EMPTY
    try:
        if _same_pages(pdf, anchors["pages"]):
            references = paper.get("references") or []
            found = citations.find(pdf, references, extract.get("style") or "none")
            used = [r for r in references if r["n"] in {n for c in found for n in c["refs"]}]
            keys = _zotero_keys(used)
            cards = {str(r["n"]): {**_card(r), "itemKey": keys.get(r["n"])} for r in used}
            result = {"citations": found, "references": cards}
        else:
            logger.info("citations: %s does not match the pages of bundle %s", pdf, slug)
    except Exception as exc:  # a PDF PyMuPDF cannot read leaves the listen view as it was
        logger.warning("citations for %s failed: %s", slug, exc)
    _cache[slug] = (key, result)
    return result
