"""In-text citation markers on a paper's pages, each with its place and the references it names.

The listen view hovers them: a marker's rects (PDF points, origin top-left, one rect per line it
spans) sit over the page image, and its `refs` are reference numbers (`n`) in paper.json.

Which markers are looked for follows the bibliography style `inscien build` found
(extract.json): a numbered paper is read for "[12]", "[3, 5-7]" (or "(12)" in a paper with no
square-bracket marker at all); an author-year paper for
"(Smith et al., 2020; Lee and Kim 2019a)" and "Smith et al. (2020)", in round or square
brackets (natbib styles use both). Reading only the style the
paper uses keeps "[0, 1]" in an author-year paper from becoming a citation. An author-year
marker names a reference by first author surname and year; a letter suffix picks among
several same-surname, same-year entries in bibliography order. An author-year bibliography whose
entries open with a key ("[RWC+19] Alec Radford, ...") is also read for those keys. Superscript
numbers are not read: telling them from footnote marks and exponents needs the font sizes.

Geometry is per character, so this reads PyMuPDF `rawdict` rather than `refs/pdftext.py` items:
a marker glued to a word ("retrieval[12].") gets the rect of the marker alone.
"""

import unicodedata

import pymupdf
import regex as re

DASH = r"[-\u2010-\u2015]"
_NUM_ITEM = rf"\d{{1,3}}(?:\s*{DASH}\s*\d{{1,3}})?"
NUMBERED = re.compile(rf"\[\s*({_NUM_ITEM}(?:\s*[,;]\s*{_NUM_ITEM})*)\s*\]")
NUMBERED_ROUND = re.compile(rf"\(\s*({_NUM_ITEM}(?:\s*[,;]\s*{_NUM_ITEM})*)\s*\)")
_KEY = r"[A-Za-z][\w+.\-]*\d\d[a-z]?"
KEYED = re.compile(rf"\[\s*({_KEY}(?:\s*,\s*{_KEY})*)\s*\]")

_PARTICLE = r"(?:(?:van|von|der|den|de|del|della|di|da|du|le|la|dos|ten|ter)\s+)*"
_NAME = rf"{_PARTICLE}\p{{Lu}}[\p{{L}}'\u2019\-]+"
_NAMES = rf"(?P<names>{_NAME}(?:\s+et\s+al\.?|\s*,?\s+(?:and|&)\s+{_NAME}|(?:\s*,\s*{_NAME})+\s*,?\s+(?:and|&)\s+{_NAME})?)"
_YEAR = r"(?:1[89]|20)\d\d[a-z]?"
_YEARS = rf"(?P<years>{_YEAR}(?:\s*,\s*{_YEAR})*)"
# Smith et al. (2020), Lee and Kim [2019a, 2020]
NARRATIVE = re.compile(rf"{_NAMES}\s*[(\[]\s*{_YEARS}\s*[)\]]")
# A parenthesis or bracket holding a year; its parts are read one by one.
PAREN = re.compile(rf"\(([^()]{{0,400}}?\b{_YEAR}\b[^()]{{0,400}}?)\)|\[([^\[\]]{{0,400}}?\b{_YEAR}\b[^\[\]]{{0,400}}?)\]")
# One part of a parenthetical: "e.g., Smith et al., 2020, 2021" - the names, then the years.
PART = re.compile(rf"{_NAMES}\s*,?\s*{_YEARS}\b")


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", text.lower())


def _surname(names: str) -> str:
    """The first author's surname from the cited names: "van Dijk et al." -> "dijk"."""
    first = re.split(r"\s+et\s+al|\s*,|\s+(?:and|&)\s+", names, maxsplit=1)[0]
    return _fold(first.split()[-1]) if first.split() else ""


def _blocks(page):
    """Each text block as (text, boxes): lines joined by a space, boxes[i] the char's rect and
    line number, or None for a joining space."""
    raw = page.get_text("rawdict", flags=pymupdf.TEXT_PRESERVE_WHITESPACE | pymupdf.TEXT_MEDIABOX_CLIP)
    for block in raw.get("blocks", []):
        text, boxes = [], []
        for ln, line in enumerate(block.get("lines", [])):
            if text:
                text.append(" ")
                boxes.append(None)
            for span in line.get("spans", []):
                for ch in span.get("chars", []):
                    text.append(ch["c"])
                    boxes.append((ch["bbox"], ln))
        if text:
            yield "".join(text), boxes


def _rects(boxes, start, end):
    """One rect per line over the chars in [start, end), spaces at the ends left out."""
    by_line = {}
    for box in boxes[start:end]:
        if box is None:
            continue
        (x0, y0, x1, y1), ln = box
        if x1 - x0 <= 0:
            continue
        r = by_line.setdefault(ln, [x0, y0, x1, y1])
        r[0], r[1], r[2], r[3] = min(r[0], x0), min(r[1], y0), max(r[2], x1), max(r[3], y1)
    return [[round(v, 1) for v in r] for _, r in sorted(by_line.items())]


def _numbers(group: str, count: int) -> list[int]:
    out = []
    for item in re.split(r"\s*[,;]\s*", group.strip()):
        bounds = re.split(rf"\s*{DASH}\s*", item)
        lo, hi = int(bounds[0]), int(bounds[-1])
        if hi < lo or hi - lo > 50:
            return []
        out.extend(range(lo, hi + 1))
    # A bracket naming a number outside the bibliography is not a citation ("[0, 1]", "[2048]").
    return out if out and all(1 <= n <= count for n in out) else []


class _AuthorYear:
    """References indexed by (first author surname, year), in bibliography order."""

    def __init__(self, references):
        self.index = {}
        for ref in references:
            authors = ref.get("authors") or []
            # The build leaves some years empty; the entry's own text still ends with one.
            raw_years = re.findall(r"\b(?:1[89]|20)\d\d\b", ref.get("raw") or "")
            year = str(ref.get("year") or (raw_years[-1] if raw_years else ""))
            if not authors or not year:
                continue
            name = authors[0].split(",")[0] if "," in authors[0] else authors[0]
            words = name.split()
            # The surname is the last word ("Marwah Alaofi") or, in a surname-first list, the
            # first ("Alaofi Marwah"); both are indexed.
            for word in {words[-1], words[0]} if words else ():
                hits = self.index.setdefault((_fold(word), year[:4]), [])
                if ref["n"] not in hits:
                    hits.append(ref["n"])
        self.keys = {}
        for ref in references:
            key = re.match(r"\s*\[([^\]]+)\]", ref.get("raw") or "")
            if key:
                self.keys[key.group(1).strip()] = ref["n"]

    def find(self, names: str, years: str) -> list[int]:
        surname = _surname(names)
        out = []
        for y in re.split(r"\s*,\s*", years.strip()):
            hits = self.index.get((surname, y[:4]), [])
            if len(y) > 4 and len(hits) > 1:
                i = ord(y[4]) - ord("a")
                hits = hits[i:i + 1] if 0 <= i < len(hits) else []
            out.extend(hits[:1] if len(y) == 4 else hits)
        return out


def _numbered(pages, pattern, count: int) -> list[dict]:
    out = []
    for pno, blocks in enumerate(pages):
        for text, boxes in blocks:
            for m in pattern.finditer(text):
                refs = _numbers(m.group(1), count)
                if refs:
                    out.append({"page": pno, "rects": _rects(boxes, m.start(), m.end()), "refs": refs})
    return out


def _part_refs(part: str, author_year: _AuthorYear) -> list[int]:
    """The references one part of a bracket names. A part may hold several ("Smith, 2018b, Lee
    and Kim, 2022"); a match that resolves to nothing is retried from its next capitalised word,
    so a leading acronym or label ("CBP, Adler and Wilkerson, 2006") does not hide the name."""
    out, pos = [], 0
    while True:
        m = PART.search(part, pos)
        if not m:
            return out
        refs = author_year.find(m.group("names"), m.group("years"))
        if refs:
            out.extend(refs)
            pos = m.end()
            continue
        nxt = re.search(r"[,\s]+(?=\S)", part[m.start():m.end()])
        if not nxt:
            return out
        pos = m.start() + nxt.end()


def find(pdf_path: str, references: list[dict], style: str) -> list[dict]:
    """[{page, rects, refs}] over the whole PDF; page is 0-based. Only markers that resolve to
    at least one reference are returned."""
    if style not in ("numbered", "author-year") or not references:
        return []
    count = max(r["n"] for r in references)
    author_year = _AuthorYear(references) if style == "author-year" else None
    with pymupdf.open(pdf_path) as doc:
        pages = [list(_blocks(page)) for page in doc]
    if style == "numbered":
        out = _numbered(pages, NUMBERED, count)
        if out:
            return out
        # Round brackets also number lists and equations, "(1) We ...". A paper that really cites
        # this way names most of its bibliography; one that does not is left without markers.
        out = _numbered(pages, NUMBERED_ROUND, count)
        return out if len({n for c in out for n in c["refs"]}) >= count / 2 else []
    out = []
    for pno, blocks in enumerate(pages):
        for text, boxes in blocks:
            if author_year.keys:
                for m in KEYED.finditer(text):
                    refs = [author_year.keys[k] for k in re.split(r"\s*,\s*", m.group(1).strip()) if k in author_year.keys]
                    if refs:
                        out.append({"page": pno, "rects": _rects(boxes, m.start(), m.end()), "refs": refs})
            taken = []
            for m in NARRATIVE.finditer(text):
                refs = author_year.find(m.group("names"), m.group("years"))
                if refs:
                    taken.append((m.start(), m.end()))
                    out.append({"page": pno, "rects": _rects(boxes, m.start(), m.end()), "refs": refs})
            for m in PAREN.finditer(text):
                if any(a < m.end() and m.start() < b for a, b in taken):
                    continue
                refs = []
                for part in re.split(r";", m.group(1) or m.group(2)):
                    refs.extend(n for n in _part_refs(part, author_year) if n not in refs)
                if refs:
                    out.append({"page": pno, "rects": _rects(boxes, m.start(), m.end()), "refs": refs})
    return out
