"""In-text citation markers on synthetic PDFs - what the listen view's hover cards stand on.

What is pinned: a marker resolves to the references it names (ranges expanded, author-year by
surname and year, a letter suffix picking among same-year entries), its rect covers the marker
and not the word it is glued to, and brackets that are not citations stay unmarked.
"""

import pymupdf

from inscien.refs import citations


def _pdf(tmp_path, lines):
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    for i, line in enumerate(lines):
        page.insert_text((72, 100 + 20 * i), line, fontsize=10)
    path = tmp_path / "paper.pdf"
    doc.save(path)
    return str(path)


def _ref(n, authors=None, year=None, raw=""):
    return {"n": n, "authors": authors or [], "year": year, "raw": raw}


def test_numbered_markers_and_ranges(tmp_path):
    pdf = _pdf(tmp_path, ["Prior work[2] and later [3, 5-6] studies.", "The interval [0, 1] is not one."])
    found = citations.find(pdf, [_ref(n) for n in range(1, 7)], "numbered")
    assert [c["refs"] for c in found] == [[2], [3, 5, 6]]
    # Glued to "work": the rect starts at the bracket, right of where the line starts.
    x0 = found[0]["rects"][0][0]
    assert x0 > 72 + 30


def test_round_numbers_only_when_they_cover_the_bibliography(tmp_path):
    pdf = _pdf(tmp_path, ["(1) We list a contribution.", "(2) And another."])
    assert citations.find(pdf, [_ref(n) for n in range(1, 21)], "numbered") == []


def test_author_year_parenthetical_narrative_and_suffix(tmp_path):
    refs = [
        _ref(1, ["Ana Lee", "Bo Kim"], 2019),
        _ref(2, ["Tom Smith"], 2020),
        _ref(3, ["Tom Smith"], 2020),
        _ref(4, ["Alaofi Marwah"], 2024),  # a surname-first bibliography
        _ref(5, ["Victor Chernozhukov"], None, raw="V. Chernozhukov. Double ML. Econometrics J., 2018."),
    ]
    pdf = _pdf(tmp_path, [
        "As (Lee and Kim, 2019; Smith, 2020b) show,",
        "Smith et al. (2020a) argued, and [Alaofi et al., 2024]",
        "agrees (Chernozhukov, 2018). The year (2021) alone is not one.",
    ])
    found = citations.find(pdf, refs, "author-year")
    assert sorted(tuple(c["refs"]) for c in found) == [(1, 3), (2,), (4,), (5,)]
