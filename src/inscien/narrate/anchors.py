"""Narration nodes -> where they came from on the page of the ORIGINAL paper.

The reader can follow the narration in the source PDF only if every node knows which words on
which page it came from, and nothing in the pipeline carries that: the narration text is
derived, not copied. Citations are stripped, notation is verbalized, "e.g." becomes "for
example", sentences broken across a column are rejoined. So the mapping has to be recovered,
not looked up.

It is recoverable because the slicing step's rule is that the author's prose stays verbatim.
The edits are deletions and small substitutions inside otherwise identical word sequences, so
a shingle vote finds the right place even when a third of the shingles are broken by them:

  index every 4-gram of the source's word stream
  for each node, let its own 4-grams vote for a start offset, with a bonus for offsets that
  come after the previous node (a paper repeats itself - an abstract sentence reappears in
  the conclusion - and document order breaks that tie correctly)

Measured on the Faggioli 2023 paper: 86 of 88 nodes anchor. The two that do not are the
spoken title line and "End of paper.", which the slicing step writes and the paper never contained.

The vote's score is NOT a quality measure and must not be read as one. A paragraph carrying
three stripped citations loses a dozen shingles and scores 0.26 while landing on exactly the
right words. `verify` is the honest check: what fraction of the node's words actually occur in
the span the vote chose.
"""

import json
import re
from pathlib import Path

GRAM = 4
# Below this share of the node's words appearing in the chosen span, the anchor is dropped
# rather than shown. A wrong highlight is worse than none: it sends the eye to the wrong
# paragraph and the reader stops trusting the pane.
MIN_OVERLAP = 0.55
# ~1750px wide for A4. 110 was chosen against a page-width CSS box and looked soft on a HiDPI
# panel, which draws two device pixels per CSS pixel, and softer again once the pane could
# zoom. The cost is the cheap half of the bundle: pages went from 2-5 MB to 5-12 MB beside a
# 19 MB mp3.
PAGE_DPI = 160


def tokens_of(text):
    """Words, punctuation stripped INSIDE each word rather than treated as a separator.

    The distinction is the whole ballgame for hyphens, and getting it wrong cost 40 sentence
    anchors on the Panickssery paper. The source side strips per word, so "self-recognition"
    is one token there; splitting on the hyphen here made it two, and every shingle containing
    a hyphenated word failed to match. Long paragraphs had enough clean shingles to survive,
    which is why paragraphs anchored and short sentences did not - "In this paper, we
    investigate if self-recognition capability contributes to self-preference." carries two of
    them in thirteen words.
    """
    return [word for word in (re.sub(r"[^a-z0-9]+", "", w) for w in text.lower().split())
            if word and not _is_number_word(word)]


# Numbers are spoken by the time the node text is stored ("0.81" is "zero point eight one",
# "k = 10" is "k equals 10", "12.5%" is "twelve point five percent"), so every shingle around a
# number differed from the page and a paragraph of results could not anchor at all (two long
# paragraphs and a third of the unplaced sentences on one paper). Digits and the words
# the spoken forms are made of are dropped from BOTH sides, so the shingles align on the prose
# around them. A token of the prose that happens to be in this list ("the point is") costs one
# shingle, consistently on both sides.
_NUMBER_WORDS = frozenset(
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen "
    "fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty "
    "ninety hundred thousand million billion point percent equals plus minus times".split())


def _is_number_word(word):
    return word in _NUMBER_WORDS or word.isdigit()


def find_sequence(node_tokens, source, lo, hi):
    """First exact occurrence of a short token sequence between source offsets lo and hi.

    The shingle vote needs four words; a heading ("Abstract", "2 Related Work") or a bold
    lead-in ("Base Model.") has one to three, and they were the bulk of the unplaced nodes
    (fourteen of twenty-two on one paper). Short sequences repeat across a paper, so
    the search is confined to a window after the previous node, where document order makes
    the first hit the right one.
    """
    n = len(node_tokens)
    if n == 0:
        return None
    lo, hi = max(0, lo), min(len(source) - n + 1, hi)
    for i in range(lo, hi):
        if all(source[i + k]["tok"] == node_tokens[k] for k in range(n)):
            return (i, i + n, 1.0)
    return None


# --------------------------------------------------------------------------------------
# The source side
# --------------------------------------------------------------------------------------

# A superscript citation glued to the word before it ("reviews.5-11", "completed.2,3",
# "policy.1"): the PDF puts no space between them, so the word's token became "reviews511"
# and the sentence's last word fell out of the highlight. Only digits
# after sentence punctuation are stripped - "GPT-4" and "F1" keep theirs.
_GLUED_CITATION = re.compile(r"(?<=[.,;:!?)\]])\d{1,3}(?:[,\u2013\u2014-]\d{1,3})*$")


def strip_glued_citation(word):
    return _GLUED_CITATION.sub("", word)


def source_words(pdf_path):
    """[{tok, page, rects}] for the whole paper, in reading order, plus the page sizes.

    Reading order comes from the same column logic the narration side uses, so a two-column
    source is read left column then right rather than straight down the page.
    """
    from .structure import analyze, open_pdf, two_column_page

    # The narration never says a running header, a page number, a footer or a footnote - the
    # structure pass drops them - so nothing narrated can legitimately anchor to one. Reading
    # them anyway put the ACL footer, the page number and a footnote inside the FollowIR
    # paragraph's span, and the reader dutifully highlighted a footnote that is never spoken.
    # Reuse the SAME classification rather than a second rule here: repetition
    # for furniture, sub-body font size for footnotes.
    skip = {}
    try:
        blocks, _ = analyze(pdf_path)
        for block in blocks:
            if block.get("type") in ("furniture", "footnote"):
                skip.setdefault(block["page"], []).append(block["bbox"])
    except Exception:
        # A source PDF the structure pass cannot read is still worth anchoring roughly.
        skip = {}

    def is_furniture(page_no, rect):
        # Centre-in-box: a word belongs to the block it sits in, and a word straddling an edge
        # is decided by where most of it is.
        cx, cy = (rect[0] + rect[2]) / 2.0, (rect[1] + rect[3]) / 2.0
        for x0, y0, x1, y1 in skip.get(page_no, ()):
            if x0 <= cx <= x1 and y0 <= cy <= y1:
                return True
        return False

    doc = open_pdf(pdf_path)
    entries, pages = [], []
    try:
        for page_index in range(doc.page_count):
            page = doc.load_page(page_index)
            width, height = page.rect.width, page.rect.height
            pages.append({"width": round(width, 1), "height": round(height, 1)})

            by_block = {}
            for x0, y0, x1, y1, word, block_no, line_no, word_no in page.get_text("words"):
                by_block.setdefault(block_no, []).append(
                    (line_no, word_no, word, [x0, y0, x1, y1]))
            blocks = []
            for block_no, words in by_block.items():
                words.sort(key=lambda w: (w[0], w[1]))
                bbox = [min(w[3][0] for w in words), min(w[3][1] for w in words),
                        max(w[3][2] for w in words), max(w[3][3] for w in words)]
                blocks.append({"bbox": bbox, "words": words, "column": 0})

            mid = width / 2.0
            if two_column_page(blocks, mid, width):
                for block in blocks:
                    block["column"] = 0 if (block["bbox"][0] + block["bbox"][2]) / 2 < mid else 1
            blocks.sort(key=lambda b: (b["column"], round(b["bbox"][1], 1), b["bbox"][0]))

            for block in blocks:
                for _, _, word, rect in block["words"]:
                    if is_furniture(page_index + 1, rect):
                        continue
                    entries.append({"raw": strip_glued_citation(word), "page": page_index + 1, "rects": [rect]})
    finally:
        doc.close()
    return dehyphenate(entries), pages


def dehyphenate(entries):
    """Join "re-" + "search" into one token, keeping both rectangles.

    The narration is already dehyphenated upstream, so leaving these apart would break every
    shingle that crosses a line end - and a line end falls inside a paragraph far more often
    than at its edges.
    """
    joined, index = [], 0
    while index < len(entries):
        entry = entries[index]
        following = entries[index + 1] if index + 1 < len(entries) else None
        if (following is not None and re.search(r"[A-Za-z]-$", entry["raw"])
                and re.match(r"^[a-z]", following["raw"])):
            joined.append({"raw": entry["raw"][:-1] + following["raw"],
                           "page": entry["page"],
                           "rects": entry["rects"] + following["rects"]})
            index += 2
            continue
        joined.append(entry)
        index += 1
    for entry in joined:
        entry["tok"] = re.sub(r"[^a-z0-9]+", "", entry["raw"].lower())
    return [e for e in joined if e["tok"]]


# --------------------------------------------------------------------------------------
# Matching
# --------------------------------------------------------------------------------------

def build_index(source):
    index = {}
    toks = [e["tok"] for e in source]
    for i in range(len(toks) - GRAM + 1):
        index.setdefault(" ".join(toks[i:i + GRAM]), []).append(i)
    return index


def locate(node_tokens, source, index, after=0):
    """(start, end, overlap) of the span this node came from, or None.

    `after` is where the previous node ended; offsets at or past it get a small bonus, which
    is what stops an abstract sentence anchoring to its restatement in the conclusion.

    The span comes from the whole winning CLUSTER of shingles, not from the single best
    offset. Each deletion inside the paragraph - a citation, a gloss - shifts every shingle
    after it by its own length, so the shingles before and after a deletion vote for
    different offsets, and whichever side has more of them wins. Taking that offset literally
    starts the highlight a few words into the paragraph. Taking the first and last shingle
    that voted anywhere near it recovers the real extent.
    """
    if len(node_tokens) < GRAM:
        # one word may sit anywhere; keep it close to where the narration is
        reach = 300 if len(node_tokens) == 1 else 800
        return find_sequence(node_tokens, source, after - 2, after + reach)

    hits, votes = [], {}
    for i in range(len(node_tokens) - GRAM + 1):
        for position in index.get(" ".join(node_tokens[i:i + GRAM]), ()):
            offset = position - i
            if offset < 0:
                continue
            hits.append((offset, position))
            votes[offset] = votes.get(offset, 0) + (1.25 if offset >= after - 20 else 1.0)
    if not votes:
        # No shingle survived (a paragraph of spoken symbols): its first three words, looked
        # for right after the previous node, then checked as a whole against that window.
        head = find_sequence(node_tokens[:3], source, after - 20, after + 400)
        if head is None:
            return None
        start = head[0]
        end = min(len(source), start + len(node_tokens) + 8)
        return (start, end, verify(node_tokens, source, start, end))

    best = max(votes, key=votes.get)
    tolerance = max(8, len(node_tokens) // 3)
    near = [offset for offset, position in hits if abs(offset - best) <= tolerance]
    # The span is the node's full extent from the cluster's offsets, not the first and last
    # matched shingle: a gloss the narration dropped ("(AI)") breaks the opening shingle, and
    # starting at the first surviving one began the highlight a word or two late.
    # Then trimmed to words the node actually contains at either end.
    bag = set(node_tokens)
    start = max(0, min(near))
    end = min(len(source), max(near) + len(node_tokens))
    while start < end and source[start]["tok"] not in bag:
        start += 1
    # A word the narration dropped inside the opening shingles shifts every surviving one
    # forward, so the cluster starts that many words late: reach back for the node's first word.
    for back in range(1, 4):
        if start - back >= 0 and source[start - back]["tok"] == node_tokens[0]:
            start -= back
            break
    while end > start and source[end - 1]["tok"] not in bag:
        end -= 1
    return (start, end, verify(node_tokens, source, start, end))


def verify(node_tokens, source, start, end):
    """What share of the node's words really occur in the chosen span.

    Bag-of-words on purpose: the deletions that break shingles do not move the words that
    remain, so this stays high exactly when the anchor is right.
    """
    present = {}
    for entry in source[start:end]:
        present[entry["tok"]] = present.get(entry["tok"], 0) + 1
    found = 0
    for token in node_tokens:
        if present.get(token):
            present[token] -= 1
            found += 1
    return found / max(1, len(node_tokens))


# Wider than any word space and narrower than a two-column gutter (~20pt here), so a line
# tolerates a wide justified gap but never reaches the next column.
COLUMN_GAP = 12.0


def line_rects(source, start, end):
    """The span's word boxes merged into one rectangle per line, per page.

    A rectangle per word would be hundreds of divs for one paragraph; a single bounding box
    would swallow the other column. One per line is what a highlighter would do.
    """
    out = []
    for entry in source[start:end]:
        for rect in entry["rects"]:
            x0, y0, x1, y1 = rect
            merged = None
            for candidate in out:
                # Same page, and vertically overlapping enough to be the same line.
                if candidate["page"] != entry["page"]:
                    continue
                if min(candidate["y1"], y1) - max(candidate["y0"], y0) <= \
                        0.5 * min(candidate["y1"] - candidate["y0"], y1 - y0):
                    continue
                # ... AND horizontally adjacent. Vertical overlap alone merged the bottom of
                # the left column with a line of the right one, because in a two-column paper
                # they share a y band: one rect from x=83 to x=526, straight across the gutter.
                # Words on one line sit next to each other; a word in
                # the other column is a column-gap away.
                if x0 - candidate["x1"] > COLUMN_GAP or candidate["x0"] - x1 > COLUMN_GAP:
                    continue
                merged = candidate
                break
            if merged is None:
                out.append({"page": entry["page"], "x0": x0, "y0": y0, "x1": x1, "y1": y1})
            else:
                merged["x0"] = min(merged["x0"], x0)
                merged["y0"] = min(merged["y0"], y0)
                merged["x1"] = max(merged["x1"], x1)
                merged["y1"] = max(merged["y1"], y1)
    out.sort(key=lambda r: (r["page"], round(r["y0"], 1), r["x0"]))
    return [{k: (v if k == "page" else round(v, 1)) for k, v in r.items()} for r in out]


def span_index(source, start, end):
    """A 4-gram index over one span only, with absolute positions.

    Anchoring a sentence against the whole paper would be both slower and less reliable - a
    short sentence has few shingles and a paper repeats its phrases. Inside the paragraph it
    came from there is almost nothing to collide with.
    """
    index = {}
    toks = [e["tok"] for e in source]
    for i in range(start, min(end, len(source)) - GRAM + 1):
        index.setdefault(" ".join(toks[i:i + GRAM]), []).append(i)
    return index


def build(nodes, cues, pdf_path):
    """({"nodes": ..., "cues": [...]}, pages, stats) for one paper.

    Two levels. The node anchor is the paragraph, found against the whole paper; the cue
    anchors are its sentences, found only inside that paragraph's span. A sentence that does
    not anchor falls back to its paragraph in the reader rather than showing nothing, which is
    the right failure: the page is still in the right place, the highlight is just coarser.

    A heading is matched on its DISPLAY text: its `text` is the spoken form ("Section two
    point one. Human Judgment.") and appears nowhere in the source.
    """
    source, pages = source_words(pdf_path)
    index = build_index(source)
    anchors, spans, after, matched = {}, {}, 0, 0

    for node in nodes:
        raw = node.get("display") if node["type"] == "heading" else node["text"]
        node_tokens = tokens_of(raw or node["text"])
        found = locate(node_tokens, source, index, after)
        if found is None and not anchors and len(node_tokens) > 8:
            # The spoken title line ("<Title>. By <authors>, and colleagues. Published in
            # ...") is invented after its first words; the title itself is on page one.
            found = locate(node_tokens[:8], source, index, after)
            if found is not None:
                found = (found[0], found[1], verify(node_tokens[:8], source, found[0], found[1]))
        if found is None:
            continue
        start, end, overlap = found
        if overlap < MIN_OVERLAP:
            continue
        after = start + len(node_tokens)
        matched += 1
        rects = line_rects(source, start, end)
        spans[node["id"]] = (start, end)
        anchors[str(node["id"])] = {"page": rects[0]["page"] if rects else None,
                                    "rects": rects, "overlap": round(overlap, 2)}

    cue_rects, local, local_node, cursor, sentences = [], None, None, 0, 0
    for cue in cues:
        span = spans.get(cue["node"])
        if span is None:
            cue_rects.append(None)
            continue
        if cue["node"] != local_node:
            local, local_node, cursor = span_index(source, *span), cue["node"], span[0]
        # Same reason as the node level: a heading cue's `text` is the spoken announcement
        # ("Section two. Introduction.") and only its `display` exists in the paper.
        wanted = cue["display"] if cue["type"] == "heading" else cue["text"]
        found = locate(tokens_of(wanted), source, local, cursor)
        if found is None or found[2] < MIN_OVERLAP:
            cue_rects.append(None)
            continue
        cursor = found[0]
        sentences += 1
        cue_rects.append(line_rects(source, found[0], found[1]))

    stats = {"nodes": len(nodes), "anchored": matched, "pages": len(pages),
             "cues": len(cues), "sentences": sentences}
    return {"nodes": anchors, "cues": cue_rects}, pages, stats


# --------------------------------------------------------------------------------------
# Page images
# --------------------------------------------------------------------------------------

def render_pages(pdf_path, out_dir, dpi=PAGE_DPI, quality=80):
    """Every page as a JPEG under `out_dir`. Returns the file names, in order.

    Images rather than a PDF viewer: the bundle is an artifact that has to open from disk with
    no dependencies, and next to a 130 MB mp3 a few MB of page images cost nothing. It also
    means the highlight is a plain absolutely-positioned div over an image, which cannot
    disagree with the renderer about where a word is.
    """
    from .structure import open_pdf

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = open_pdf(pdf_path)
    names = []
    try:
        for page_index in range(doc.page_count):
            pixmap = doc.load_page(page_index).get_pixmap(dpi=dpi)
            name = f"p{page_index + 1:03d}.jpg"
            try:
                (out_dir / name).write_bytes(pixmap.tobytes("jpeg", jpg_quality=quality))
            except (TypeError, ValueError, RuntimeError):
                # Older PyMuPDF builds ship without JPEG output.
                name = f"p{page_index + 1:03d}.png"
                (out_dir / name).write_bytes(pixmap.tobytes("png"))
            names.append(name)
    finally:
        doc.close()
    return names


def write(directory, anchors, pages, images):
    path = Path(directory) / "anchors.json"
    payload = {"pages": pages, "images": images,
               "nodes": anchors["nodes"], "cues": anchors["cues"]}
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return path


def read(directory):
    try:
        return json.loads((Path(directory) / "anchors.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
