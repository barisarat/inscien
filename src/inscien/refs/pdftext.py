"""A PDF's text as positioned items, the shape the extract and plan steps read.

An item is a run of text in one font on one baseline: its string, baseline origin (x, and y
measured UP from the bottom of the page), width and font size. Items are built from PyMuPDF's
text trace - every glyph as drawn, in content order, with no layout analysis - and joined the way
the text layer of a PDF viewer joins them: a gap up to 0.102 x the font size is no space, up to
0.6 x is a space inside the item, and anything wider (or a font change, or a new baseline)
starts a new item. Building from the trace matters: a layout-analysing extractor splits a
justified line at its wide gaps, and the two halves then read as two columns.

Ligature glyphs ("fi" as one glyph) become their letters, and a glyph with no known character
(U+FFFD) is dropped.
"""

import unicodedata
from pathlib import Path

import pymupdf
import regex as re

TRACKING_SPACE = 0.102   # x font size: below this a gap is kerning, not a space
SPACE_IN_FLOW_MAX = 0.6  # x font size: above this a gap ends the item
NEGATIVE_SPACE = -0.2    # x font size: a jump back this far ends the item
VERTICAL_SHIFT = 0.25    # x font size: a baseline move this large ends the item

# Ligatures are replaced by their letters; every other character is kept as the PDF has it.
_NORMALIZE = re.compile("[\uFB00-\uFB06]")


def _norm(text: str) -> str:
    return _NORMALIZE.sub(lambda m: unicodedata.normalize("NFKC", m.group(0)), text)


def _page_items(page, upright_only: bool, layout: bool = False) -> list[dict]:
    """Items in content order. With `layout`, each item also carries its font id, its text
    direction (t0, t1: the x axis of its text matrix) and rotated text is kept; `eol` is set by
    `_mark_line_ends`."""
    height = page.rect.height
    items, cur = [], None
    last = None  # where the previous glyph ended, kept across items for the space between them
    pending_space = False  # a space drawn on its own (often in another font) opens the next item

    def flush():
        nonlocal cur, pending_space
        if cur and not cur["str"].strip() and cur["str"]:
            pending_space = True
        if cur and cur["str"].strip():
            item = {"str": _norm(cur["str"]), "x": cur["x"], "y": cur["y"], "w": cur["end"] - cur["x"], "h": cur["h"]}
            if layout:
                item.update(font=cur["font"], t0=cur["t0"], t1=cur["t1"], serif=cur["serif"], mono=cur["mono"])
            items.append(item)
        cur = None

    for span in page.get_texttrace():
        dx, dy = span["dir"]
        upright = abs(dx - 1) < 1e-3 and abs(dy) < 1e-3
        if upright_only and not upright and not layout:
            flush()
            continue
        # An item's height is the vertical scale of its text matrix, as in a PDF viewer's text
        # layer: rotated text (an arXiv stamp up the margin) has none, so it never reads as the
        # largest face on the page.
        size = span["size"] * abs(dx) if not upright else span["size"]
        font = span["font"]
        chars = span["chars"]
        # Character spacing (Tc) is part of a glyph's advance in the PDF, but the trace's glyph
        # boxes leave it out, so in a letter-spaced span every letter would look separated. The
        # smallest gap between two letters of the span is that spacing; it is taken off every gap.
        tc = 0.0
        letter_gaps = [b[2][0] - a[3][2] for a, b in zip(chars, chars[1:])
                       if a[1] >= 0 and b[1] >= 0 and chr(a[0]) != " " and chr(b[0]) != " "]
        # Only measured on a span with enough letters to tell spacing from a word gap ("][" is
        # one gap, and that gap is a space), and never more than a quarter of the font size.
        if len(letter_gaps) >= 4:
            tc = min(max(0.0, min(letter_gaps)), 0.25 * size)
        for ch in chars:
            code, _gid, origin, bbox = ch[0], ch[1], ch[2], ch[3]
            c = chr(code) if isinstance(code, int) and code > 0 else ""
            if not c or c == "\ufffd":
                continue
            x, y = origin[0], height - origin[1]
            # A ligature arrives as its letters: the first carries the glyph and its advance, the
            # rest are zero-width continuations (glyph id -1) at the same origin.
            if _gid < 0 and cur is not None:
                cur["str"] += c
                continue
            end = max(bbox[2], x)
            if cur and cur["font"] == font and abs(cur["h"] - size) < 0.01 and abs(cur["y"] - y) <= VERTICAL_SHIFT * size:
                gap = x - cur["end"] - (tc if cur["font"] == font else 0)
                if gap < NEGATIVE_SPACE * size or gap > SPACE_IN_FLOW_MAX * size:
                    flush()
                elif gap > TRACKING_SPACE * size and c != " " and not cur["str"].endswith(" "):
                    cur["str"] += " "
            else:
                flush()
            if cur is None:
                cur = {"str": "", "x": x, "y": y, "h": size, "font": font, "end": x, "t0": dx, "t1": dy,
                       "serif": bool(span["flags"] & 4), "mono": bool(span["flags"] & 8)}
                # The space between two items on one line: a gap in flow opens the new item with a
                # space, a wider one is a whitespace item of its own (as a viewer's text layer has it).
                same_line = last and abs(last["y"] - y) <= VERTICAL_SHIFT * max(size, last["h"])
                if pending_space and same_line and c != " ":
                    cur["str"] = " "
                elif last and c != " " and same_line:
                    gap = x - last["end"]
                    if gap > TRACKING_SPACE * size:
                        if gap <= SPACE_IN_FLOW_MAX * size:
                            cur["str"] = " "
                        elif layout:
                            items.append({"str": " ", "x": last["end"], "y": y, "w": gap, "h": size, "font": font,
                                          "t0": dx, "t1": dy, "serif": cur["serif"], "mono": cur["mono"]})
            if c != " ":
                pending_space = False
            cur["str"] += c
            cur["end"] = max(cur["end"], end)
            last = {"end": cur["end"], "y": y, "h": size}
    flush()
    return items


def _mark_line_ends(items: list[dict]) -> None:
    """A line ends after an item when the next one starts on another baseline - a move larger than
    a superscript's, which stays on its line."""
    for a, b in zip(items, items[1:]):
        a["eol"] = abs(b["y"] - a["y"]) > 0.75 * max(a["h"], b["h"], 1)
    if items:
        items[-1]["eol"] = True


def pdf_layout_pages(path: Path) -> tuple[list[dict], int]:
    """[{height, styles, items}] per page for the narration planner: items in content order with
    font ids, text direction and line ends; `styles` maps a font id to its generic family."""
    doc = pymupdf.open(str(path))
    try:
        pages = []
        for page in doc:
            items = _page_items(page, upright_only=False, layout=True)
            _mark_line_ends(items)
            styles = {i["font"]: ("monospace" if i["mono"] else "serif" if i["serif"] else "sans-serif") for i in items}
            pages.append({"height": page.rect.height, "styles": styles, "items": items})
        return pages, doc.page_count
    finally:
        doc.close()


def pdf_pages(path: Path, upright_only: bool = True, limit: int | None = None) -> tuple[list[dict], int]:
    """[{width, height, items}] per page (the first `limit` pages if given), and the page count."""
    doc = pymupdf.open(str(path))
    try:
        pages = []
        for i in range(doc.page_count if limit is None else min(limit, doc.page_count)):
            page = doc[i]
            pages.append({"width": page.rect.width, "height": page.rect.height, "items": _page_items(page, upright_only)})
        return pages, doc.page_count
    finally:
        doc.close()
