"""First half of reference extraction: PDF -> the reference block, split into entries.

It NEVER guesses. Anything ambiguous (dehyphenation, a line that may or may not belong to the
previous entry) is preserved verbatim in `lines` for the parse step; `raw` is a best-effort join.

Three structural signals end the reference block, in order of reliability:
  1. hanging indent - numbered lists outdent the marker and indent continuations, so a line back
     at the marker margin WITHOUT a marker is no longer part of the list
  2. font size - a heading is set larger than reference body text
  3. a literal trailing heading ("Appendix", "Supplementary Material")

Two things that look like details and are not:
  - Indent is measured per (page, column) from the left edge of the REFERENCE LINES on that
    column, after page furniture is removed. Raw page x mixes two x scales in a two-column
    layout, and a centred page number left of the text block would define the margin.
  - A running header/footer is only looked for in the top/bottom band of the page. Matching
    repeated text anywhere also deletes a sentence that legitimately appears twice.

The input is the page's text as items - a run of text with its baseline origin (x, y measured
up from the bottom of the page), width and font size - which `pdf_pages` reads with PyMuPDF.
"""

from decimal import ROUND_HALF_UP, Decimal
from math import floor, inf
from pathlib import Path

import regex as re

A = re.ASCII
HEADINGS = re.compile(r"^(references|bibliography|referencescited|literaturecited)$", re.I)
AFTER = re.compile(r"^(appendix(\s+[a-z0-9]+)?|supplementary\s+material)\b", re.I | A)
CAPTION = re.compile(r"^(Figure|Fig\.|Table)\s*\d+\s*[:.]", A)
HEADING_SIZE_RATIO = 1.12  # a line this much taller than body text is a heading
# 0.12, not less: ACM headers sit at ~0.915. Body text also falls in this band, so the band alone
# never deletes anything - a line must ALSO repeat across pages and be over 12 characters.
BAND = 0.12
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
          "september", "october", "november", "december"]


def _js_round(v: float) -> int:
    return floor(v + 0.5)


def _fixed(v: float, digits: int) -> float:
    """Number.prototype.toFixed then back to a number: half-up on the exact binary value."""
    return float(Decimal(v).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP))


def _median(xs: list[float]) -> float:
    s = sorted(xs)
    return s[len(s) >> 1] if s else 0


def _is_ref_heading(text: str) -> bool:
    return bool(HEADINGS.match(re.sub(r"\s+", "", text or "")))


def lines_of_page(items: list[dict], width: float, height: float) -> list[dict]:
    """Group a page's items into text lines, column by column when the page has two."""
    mid = width / 2
    left = [i for i in items if i["x"] + i["w"] / 2 < mid]
    right = [i for i in items if i["x"] + i["w"] / 2 >= mid]
    straddle = [i for i in items if i["x"] < mid and i["x"] + i["w"] > mid]
    two_col = len(left) > 8 and len(right) > 8 and len(straddle) / max(len(items), 1) < 0.12
    cols = [left, right] if two_col else [items]
    out = []
    for ci, col in enumerate(cols):
        rows = []
        for it in sorted(col, key=lambda i: (-i["y"], i["x"])):
            last = rows[-1] if rows else None
            if last and abs(last["y"] - it["y"]) < max(2, it["h"] * 0.4):
                last["items"].append(it)
                last["y"] = (last["y"] + it["y"]) / 2
            else:
                rows.append({"y": it["y"], "items": [it]})
        for r in rows:
            parts = sorted(r["items"], key=lambda i: i["x"])
            s, prev = "", None
            for it in parts:
                if prev and it["x"] - (prev["x"] + prev["w"]) > 1.0 and not re.search(r"\s$", s):
                    s += " "
                s += it["str"]
                prev = it
            s = re.sub(r"\s+", " ", s).strip()
            if not s:
                continue
            size = sum(i["h"] for i in parts) / len(parts)
            out.append({"text": s, "x": _js_round(parts[0]["x"]), "y": _js_round(r["y"]),
                        "yFrac": _fixed(r["y"] / height, 3), "size": _fixed(size, 2), "col": ci})
    return out


def extract_pages(pages: list[dict], num_pages: int) -> dict:
    """The extraction over `pages` = [{width, height, items}], items already upright text."""
    pages = [{"page": n + 1, "lines": lines_of_page(p["items"], p["width"], p["height"])} for n, p in enumerate(pages)]

    # Page furniture: text in the top/bottom band that repeats across pages, or a bare page
    # number. Repeats are counted with digits blanked, so "Page 12" and "Page 13" are one header.
    def in_band(l):
        return l["yFrac"] > 1 - BAND or l["yFrac"] < BAND

    def shape(t):
        return re.sub(r"\d+", "#", t, flags=A)
    seen = {}
    for pg in pages:
        for t in dict.fromkeys(shape(l["text"]) for l in pg["lines"] if in_band(l)):
            seen[t] = seen.get(t, 0) + 1
    repeated = {t for t, n in seen.items() if n >= 2 and len(t.encode("utf-16-le")) // 2 > 12}
    dropped = []
    for pg in pages:
        kept = []
        for l in pg["lines"]:
            # Up to five digits: ACL proceedings number pages past 10000.
            if in_band(l) and (shape(l["text"]) in repeated or re.fullmatch(r"\d{1,5}", l["text"], A)):
                dropped.append(l["text"])
            else:
                kept.append(l)
        pg["lines"] = kept

    # The reference heading, searched from the back (a paper may say "References" in prose).
    start_page = start_idx = -1
    for p in range(len(pages) - 1, -1, -1):
        ls = pages[p]["lines"]
        for i in range(len(ls) - 1, -1, -1):
            if _is_ref_heading(ls[i]["text"]):
                start_page, start_idx = p, i
                break
        if start_page >= 0:
            break
    if start_page < 0:
        # A paper that cites nothing has nothing to find - a fact about the paper. The test is the
        # CITATIONS, not the heading: a paper that cites but whose heading was missed is an error.
        body = " ".join(l["text"] for p in pages for l in p["lines"])
        cites = len(re.findall(r"\[\d{1,3}\]", body, A)) + len(
            re.findall(r"\([A-Z][A-Za-z'-]+[^)]{0,40}\b(?:19|20)\d{2}[a-z]?\)", body, A))
        if cites == 0:
            return {"numPages": num_pages, "refPagesFrom": None, "count": 0, "style": "none", "layout": None,
                    "stoppedAt": None, "droppedFurniture": [], "droppedForeign": [], "orphans": [], "noReferences": True,
                    "warnings": ["this paper cites nothing: no reference list and no citation markers"], "entries": []}
        return {"error": f"no reference heading found, but the text carries {cites} citation marker(s) - the reference list was not located",
                "numPages": num_pages}

    block = []
    for p in range(start_page, len(pages)):
        ls = pages[p]["lines"]
        for i in range(start_idx + 1 if p == start_page else 0, len(ls)):
            block.append({**ls[i], "page": pages[p]["page"]})

    # Two numbered styles: "[12]" and "12.". The dotted form is a marker only when its number is
    # the NEXT one expected, since a continuation line can open on "2. In: CEUR ...".
    bracket = re.compile(r"^\[(\d{1,3})\]\s*(.*)$", A)
    dotted = re.compile(r"^(\d{1,3})\.\s+(.*)$", A)
    marker_of = {}
    if sum(1 for l in block if bracket.search(l["text"])) >= 3:
        for l in block:
            m = bracket.search(l["text"])
            if m:
                marker_of[id(l)] = m
    else:
        expected = 1
        for l in block:
            m = dotted.search(l["text"])
            if m and int(m[1]) == expected:
                marker_of[id(l)] = m
                expected += 1
        if len(marker_of) < 3:
            marker_of.clear()

    def is_marker(l):
        return id(l) in marker_of
    # Body size from the lines right after the heading, which are references by construction.
    body_size = _median([l["size"] for l in block[:30]])

    # Pass 1 - truncate on the signals that need no indent statistics, BEFORE indent is measured.
    # A heading-sized line ends the list only past the last marker: a float inside the list is
    # an interruption, and the numbering decides where the list ends.
    last_marker = max((i for i, l in enumerate(block) if is_marker(l)), default=-1)
    stopped = None
    for i, l in enumerate(block):
        if is_marker(l) or i < last_marker:
            continue
        why = None
        if AFTER.search(l["text"]):
            why = "trailing heading"
        elif l["size"] > body_size * HEADING_SIZE_RATIO:
            why = "larger font (heading)"
        elif last_marker < 0 and CAPTION.search(l["text"]):
            # In an unnumbered list a caption is the end of the list, not a two-word reference.
            why = "float caption"
        if why:
            stopped = {"text": l["text"], "page": l["page"], "why": why}
            block = block[:i]
            break

    # Pass 2 - indent, per column, relative to the leftmost reference line in that column.
    col_left = {}
    for l in block:
        k = f"{l['page']}:{l['col']}"
        col_left[k] = min(col_left.get(k, inf), l["x"])
    for l in block:
        l["indent"] = l["x"] - col_left[f"{l['page']}:{l['col']}"]

    marker_lines = [l for l in block if is_marker(l)]
    numbered = len(marker_lines) >= 3
    head = block[:40]
    cont_indent = _median([l["indent"] for l in head if (not is_marker(l) if numbered else l["indent"] > 2)])
    start_indent = _median([l["indent"] for l in marker_lines]) if numbered else 0
    hanging = cont_indent - start_indent > 3
    outdent_cut = (start_indent + cont_indent) / 2 if hanging else -inf

    # Pass 3 - in a NUMBERED list a line back at the marker margin without a marker ends the
    # list, again only past the last marker.
    if numbered and hanging:
        last_now = max((i for i, l in enumerate(block) if is_marker(l)), default=-1)
        for i, l in enumerate(block):
            if is_marker(l) or l["indent"] >= outdent_cut or i < last_now:
                continue
            stopped = {"text": l["text"], "page": l["page"], "why": "at marker margin without a marker"}
            block = block[:i]
            break

    if not numbered and not hanging:
        return {"error": "no [n] markers and no hanging indent - reference style not recognised",
                "numPages": num_pages, "refPagesFrom": pages[start_page]["page"], "blockLines": block}

    entries, orphans, foreign = [], [], []
    for ln in block:
        m = marker_of.get(id(ln))
        if (bool(m) if numbered else ln["indent"] < outdent_cut):
            entries.append({"n": len(entries) + 1, "printed": int(m[1]) if m else None, "page": ln["page"],
                            "lines": [x for x in [m[2] if m else ln["text"]] if x]})
            continue
        # A continuation sits at the continuation indent in body type; anything else is floated
        # content, and joining it would corrupt the previous reference.
        continuation = (ln["size"] <= body_size * HEADING_SIZE_RATIO and (not hanging or ln["indent"] >= outdent_cut)) if numbered else True
        if not continuation:
            foreign.append(ln["text"])
            continue
        if entries:
            entries[-1]["lines"].append(ln["text"])
        else:
            orphans.append(ln["text"])

    warnings = []
    if orphans:
        warnings.append(f"{len(orphans)} line(s) before the first entry")
    if numbered:
        for i in range(1, len(entries)):
            if entries[i]["printed"] != entries[i - 1]["printed"] + 1:
                warnings.append(f"numbering jump: [{entries[i - 1]['printed']}] -> [{entries[i]['printed']}]")
        if entries and entries[0]["printed"] != 1:
            warnings.append(f"first entry is [{entries[0]['printed']}], not [1]")
    short = [e["n"] for e in entries if len(" ".join(e["lines"])) < 30]
    if short:
        warnings.append(f"suspiciously short entries: [{', '.join(str(n) for n in short)}]")
    if not stopped:
        warnings.append("reference block ran to the end of the document without a stop signal")
    if foreign:
        warnings.append(f"{len(foreign)} line(s) inside the block were not references (floated content) and were dropped")

    return {
        "numPages": num_pages,
        "refPagesFrom": pages[start_page]["page"],
        "count": len(entries),
        "style": "numbered" if numbered else "author-year",
        "layout": {"startIndent": start_indent, "contIndent": cont_indent, "hanging": hanging, "bodySize": body_size},
        "stoppedAt": stopped,
        "droppedFurniture": list(dict.fromkeys(dropped)),
        "droppedForeign": foreign,
        "orphans": orphans,
        "warnings": warnings,
        # `raw` is a best-effort join; a trailing hyphen is left in place for the parse step.
        "entries": [{"n": e["n"], "printed": e["printed"], "page": e["page"], "lines": e["lines"],
                     "raw": re.sub(r"\s+", " ", " ".join(e["lines"])).strip()} for e in entries],
    }


def title_from_pages(page1: dict) -> str | None:
    """The paper's own title off page 1: the lines set in the largest face, top-down, ignoring the
    top band where a venue banner is often set large too."""
    lines = [l for l in lines_of_page(page1["items"], page1["width"], page1["height"]) if l["yFrac"] < 0.97]
    if not lines:
        return None
    max_size = max(l["size"] for l in lines)
    picked = sorted((l for l in lines if l["size"] >= max_size - 0.4 and len(l["text"]) > 3), key=lambda l: -l["y"])
    return re.sub(r"\s+", " ", " ".join(l["text"] for l in picked)).strip() or None


def date_from_texts(texts: list[str]) -> dict | None:
    """The paper's own publication date when it prints one ("Publication date: November 2025",
    "accepted 12 March 2024") - it outranks the APIs, which answer for the version THEY indexed."""
    patterns = [re.compile(r"Publication date:\s*([A-Za-z]+)\s+((?:19|20)\d\d)", re.I | A),
                re.compile(r"accepted\s+\d{1,2}\s+([A-Za-z]+)\s+((?:19|20)\d\d)", re.I | A)]
    for text in texts:
        for pat in patterns:
            m = pat.search(text)
            if not m:
                continue
            month = MONTHS.index(m[1].lower()) + 1 if m[1].lower() in MONTHS else 0
            if month > 0:
                return {"year": int(m[2]), "month": month}
    return None
