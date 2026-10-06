#!/usr/bin/env python3
"""PDF -> a clean, typed, sectioned document. The stage that runs BEFORE any model.

Every failure in the Qwen run was structural: a fabricated heading, a running header spliced
into a sentence, an epigraph read as a heading, formulas left unverbalized. None of that is a
language problem, so none of it should be a language model's job.

This stage decides structure deterministically, using what the PDF actually knows - font size,
weight, position, and repetition across pages - and hands the model a document where every
block already has a type. The model is then left with only the judgments that need judgment.

Two principles:

  CLASSIFY, NEVER DELETE. Nothing is dropped; blocks get a type and a `drop` flag. The output
  is auditable and reversible, and a misclassification is visible instead of silent.

  DECIDE ONCE, GLOBALLY. Running headers, the body font size, the references boundary and the
  heading levels are properties of the whole document. Deciding them per chunk is what makes
  parallel chunks disagree with each other.

Entry point is `analyze(pdf_path)` -> (blocks, stats). Presentation lives in `cli.py`.
"""

import re
import statistics
from collections import Counter, defaultdict

BOLD_FLAG = 1 << 4  # PyMuPDF span flags: bit 4 is bold

CAPTION = re.compile(r"^\s*(table|fig(?:ure)?\.?|scheme|algorithm)\s*\d+", re.I)
BOX = re.compile(r"^\s*box\s*\d+", re.I)
NUMBERED_HEADING = re.compile(r"^\s*(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(\S.*)$")
REFERENCES = re.compile(
    r"^\s*(?:\d{1,2}\.?\s+)?(references|bibliography|works\s+cited|literature\s+cited)\s*:?\s*$",
    re.I,
)
FRONT_MATTER = re.compile(
    r"(correspondence|received:|accepted:|published\s+online|doi\.org|https?://|@[\w.]+\.\w+"
    r"|creativecommons|\bissn\b|all rights reserved|published by)",
    re.I,
)
# A formula line is mostly operators and single letters rather than words.
MATH_CHARS = set("=+-*/^_<>|(){}[]∑∏∫≈≠≤≥×÷→")
# An attribution dash inside a short standalone block marks an epigraph, which is read
# differently from body prose - slower, with air around it. This lived in the prosody stage
# during exploration, but it is a fact about the document, so it belongs here.
ATTRIBUTION = re.compile(r"\s[-]\s[A-Z][A-Za-z]+,")


# --------------------------------------------------------------------------------------
# Extraction
# --------------------------------------------------------------------------------------

def two_column_page(page_blocks, mid, width):
    """Does this page really have two columns?

    Crossing the gutter is the giveaway. In a two-column layout almost nothing does - a
    full-width title or figure at most - while in a single-column layout every body paragraph
    does, because it runs margin to margin.

    Asking this at all matters. Assigning a column to every block unconditionally, by testing
    whether the block's centre sits left of the page midpoint, breaks a single-column justified
    page: its body blocks run the full text width, so their centre lands on the midpoint to
    within a rounding error, on the wrong side of a `<`. Body prose goes to "column 1", every
    narrower heading and short line to "column 0", and the sort lifts all of those to the top
    of their page - a heading then announced with its paragraphs already read above it.
    """
    if len(page_blocks) < 4:
        return False
    tolerance = width * 0.02
    left = sum(1 for b in page_blocks if b["bbox"][2] <= mid + tolerance)
    right = sum(1 for b in page_blocks if b["bbox"][0] >= mid - tolerance)
    straddling = sum(1 for b in page_blocks
                     if b["bbox"][0] < mid - tolerance and b["bbox"][2] > mid + tolerance)
    # `right` is the discriminator that actually separates the two cases: measured on real
    # files, a single-column page has NOTHING starting past the midpoint (0 blocks) while a
    # two-column page has dozens. The straddling cap is the backstop for a single-column page
    # whose right-numbered equations would otherwise look like a right column; it is a loose
    # half rather than a tight fraction because a two-column page carrying a full-width table
    # measured 40% straddling, and calling that page single-column would interleave its two
    # columns - the same class of damage this test exists to prevent.
    return left >= 2 and right >= 2 and straddling <= len(page_blocks) * 0.5


def open_pdf(path):
    """PyMuPDF's document, imported under the name the library actually wants now.

    `import fitz` is the old spelling and prints a deprecation warning on every run; `pymupdf`
    is the same module and is what >= 1.24.3 installs. The fallback keeps an older pinned
    install working rather than trading one break for another.
    """
    try:
        import pymupdf
    except ImportError:
        try:
            import fitz as pymupdf
        except ImportError:
            raise RuntimeError("PyMuPDF is required: pip install pymupdf")
    return pymupdf.open(str(path))


def raw_blocks(pdf_path):
    """Per-page blocks in reading order, carrying the font facts we classify on."""
    doc = open_pdf(pdf_path)
    blocks = []
    try:
        for page_index in range(doc.page_count):
            page = doc.load_page(page_index)
            page_height = page.rect.height
            mid = page.rect.width / 2.0
            page_blocks = []

            for block in page.get_text("dict").get("blocks", []):
                if block.get("type") != 0:
                    continue
                text_parts, sizes, bold_chars, total_chars = [], [], 0, 0
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        text = span.get("text", "")
                        if not text.strip():
                            continue
                        text_parts.append(text)
                        n = len(text)
                        sizes.extend([round(span.get("size", 0), 1)] * n)
                        total_chars += n
                        if span.get("flags", 0) & BOLD_FLAG:
                            bold_chars += n
                text = " ".join(" ".join(text_parts).split())
                if not text or not sizes:
                    continue
                x0, y0, x1, y1 = block["bbox"]
                page_blocks.append({
                    "page": page_index + 1,
                    "text": text,
                    "size": statistics.median(sizes),
                    "bold": bold_chars / max(total_chars, 1),
                    "bbox": [x0, y0, x1, y1],
                    # Fraction down the page: running headers and footers live at the extremes.
                    "y_rel": y0 / page_height,
                    "column": 0,
                })

            # Left column top-to-bottom, then right; within a column by y then x. Only when
            # the page really has two columns - see two_column_page for what a bare
            # "centre < mid" test did to every single-column narration PDF.
            if two_column_page(page_blocks, mid, page.rect.width):
                for candidate in page_blocks:
                    x0, _, x1, _ = candidate["bbox"]
                    candidate["column"] = 0 if (x0 + x1) / 2.0 < mid else 1
            page_blocks.sort(key=lambda b: (b["column"], round(b["bbox"][1], 1), b["bbox"][0]))
            blocks.extend(page_blocks)
    finally:
        doc.close()
    return blocks


# --------------------------------------------------------------------------------------
# Global decisions
# --------------------------------------------------------------------------------------

def dehyphenate(blocks):
    """Rejoin words broken by a line-break hyphen, decided by document-internal evidence.

    "defini- tions" must become "definitions" but "reliability- oriented" must keep its hyphen,
    and no rule about the characters alone can tell them apart. The document can: if the
    joined form appears elsewhere unhyphenated it was a soft hyphen; if the hyphenated form
    appears elsewhere inline it was a real one. On this paper that resolves ~89% of cases
    outright, and soft hyphens are the overwhelming majority of the remainder, so unresolved
    cases join.

    A global pass, before classification, so heading text is clean too.
    """
    everything = " ".join(b["text"] for b in blocks)
    vocab = {w.lower() for w in re.findall(r"[A-Za-z]{2,}", everything)}
    # Genuine inline hyphens only - a line-broken pair has a space and cannot match here.
    inline_hyphen = {m.lower() for m in re.findall(r"[A-Za-z]{2,}-[A-Za-z]{2,}", everything)}
    stats = Counter()

    def resolve(match):
        left, right = match.group(1), match.group(2)
        if len(left) < 2 or not left.isalpha() or left.isupper() or right[:1].isupper():
            # "LLM-as-a- judge", "GPT-4- turbo", "LMSYS- Chat": a single letter, a number, or
            # a capitalised right side is always a real compound, never a line break.
            #
            # An ALL-CAPS left side is the same thing, and it cost a word: "LLM-assigned"
            # broke across a line and came out "LLMassigned", because the paper never used
            # that compound anywhere else for the vocabulary check to find. No English word
            # starts in capitals and continues in lower case, so a caps-then-lower pair is
            # always two morphemes - it can never be one word a typesetter split.
            stats["short"] += 1
            return f"{left}-{right}"
        if (left + right).lower() in vocab:
            stats["joined"] += 1
            return left + right
        if f"{left}-{right}".lower() in inline_hyphen:
            stats["kept"] += 1
            return f"{left}-{right}"
        stats["unknown"] += 1
        return left + right

    pattern = re.compile(r"([A-Za-z0-9]+)-\s+([A-Za-z]+)")
    for block in blocks:
        block["text"] = pattern.sub(resolve, block["text"])
    return stats


def body_size(blocks):
    """The dominant font size, weighted by characters - i.e. the size of running prose."""
    weights = Counter()
    for block in blocks:
        weights[round(block["size"] * 2) / 2] += len(block["text"])
    return weights.most_common(1)[0][0] if weights else 10.0


def find_furniture(blocks, page_count):
    """Running headers and footers, found by repetition rather than by pattern.

    A short line near the top or bottom of the page that recurs on many pages is furniture,
    whatever it says. Pattern matching cannot know that "Artificial Intelligence" is a running
    header in this paper and a real heading in another - repetition can.
    """
    seen = defaultdict(set)
    for block in blocks:
        if len(block["text"]) > 90 or not (block["y_rel"] < 0.08 or block["y_rel"] > 0.92):
            continue
        # Normalise page numbers away so "page 3" and "page 4" count as the same header.
        key = re.sub(r"\d+", "#", block["text"].lower()).strip()
        seen[key].add(block["page"])

    threshold = max(2, int(page_count * 0.3))
    return {key for key, pages in seen.items() if len(pages) >= threshold}


def analyze_text(paragraphs):
    """(blocks, stats) for narration text that is already clean: [(text, size, bold)] in
    reading order, as the slice step writes it - headings carry their set size, body is 11pt.

    The same classification, empty-heading and level rules as `analyze`, minus everything that
    only exists to undo a PDF's layout (line-end hyphens, running headers, column order).
    """
    blocks = [{"page": 1, "text": text, "size": size, "bold": bold, "bbox": [0, 0, 0, 0],
               "y_rel": 0.5, "column": 0} for text, size, bold in paragraphs if text.strip()]
    if not blocks:
        raise ValueError("no narration text")
    body = body_size(blocks)
    blocks = classify(blocks, set(), body)
    blocks = merge_wrapped(blocks)
    blocks = drop_empty_headings(blocks)
    levels = compress_levels(heading_levels(blocks))
    blocks = assign_sections(blocks, levels)
    for i, block in enumerate(blocks):
        block["id"] = i
    kept = [b for b in blocks if not b.get("drop")]
    stats = {
        "pages": 1, "blocks": len(blocks), "body_size": body,
        "levels": {f"{size}{'/CAPS' if caps else ''}": level
                   for (size, caps), level in sorted(levels.items(), key=lambda kv: kv[1])},
        "furniture": [], "hyphens": {}, "merged": sum(b.get("merged", 0) for b in blocks),
        "types": dict(Counter(b["type"] for b in blocks).most_common()),
        "kept_blocks": len(kept), "kept_words": sum(len(b["text"].split()) for b in kept),
        "review": sum(1 for b in blocks if b.get("review")),
    }
    return blocks, stats


def drop_empty_headings(blocks):
    """Drop a heading with no narratable content under it.

    "GRAPHICAL ABSTRACT" heads a figure, so after captions and images are dropped there is
    nothing left beneath it - and because it is typeset larger than the real sections, leaving
    it in pushes every genuine section down a level. Emptiness is the reliable signal here;
    the title itself is journal-specific.

    A NUMBERED heading is exempt. The rule cascades: in a run of consecutive headings every
    one but the last is dropped, so a few stray heading-shaped lines take the real sections
    down with them. On the Faggioli 2023 build the labels inside the spectrum figure ("Human
    Judgment", "AI Assistance", "Human Verification", "Fully Automated") were short and bold
    enough to classify as headings, and they cost "3 SPECTRUM OF ..." and "4 OPEN ISSUES AND
    OPPORTUNITIES" - both silently, from the outline and from the spoken announcements. A
    number is strong evidence of a real section, and keeping a genuinely empty numbered
    heading only costs one spoken line.

    That exemption is narrowed rather than absolute. Announcing "Section two
    point three. Fully Automated Test Collections." and then going straight on to section
    three is worse than saying nothing: the listener waits for content that never arrives. So
    a NUMBERED heading is also dropped when the next block is a numbered heading at the same
    or a shallower depth, which is the case where it owns nothing at all. "3" followed by
    "3.1" is a parent introducing its child and stays, and a stray figure label can still
    never take a real section with it, because a label carries no number.
    """
    kept = [b for b in blocks if not b.get("drop")]
    for i, block in enumerate(kept):
        if block["type"] != "heading":
            continue
        following = kept[i + 1] if i + 1 < len(kept) else None
        if block.get("number"):
            # Same depth rule as `classify` uses for levels: "2.3" is depth 2.
            depth = block["number"].count(".") + 1
            if following is None or (
                    following["type"] == "heading" and following.get("number")
                    and following["number"].count(".") + 1 <= depth):
                block["drop"] = True
            continue
        if following is None or following["type"] == "heading":
            block["drop"] = True
    return blocks


def compress_levels(levels):
    """Renumber to a contiguous 1..N, so a level emptied by the checks above does not leave
    a gap that shifts every deeper heading down one."""
    used = sorted(set(levels.values()))
    remap = {old: new + 1 for new, old in enumerate(used)}
    return {key: remap[level] for key, level in levels.items()}


def heading_key(block):
    """Headings are ranked by (size, is-all-caps). Papers routinely set a section heading and
    its subsections at the same size and separate them by case alone, so size ranking on its
    own collapses the hierarchy to two levels."""
    return round(block["size"] * 2) / 2, block["text"].isupper()


def heading_levels(blocks):
    """Map each (size, caps) combination to a level - biggest, then all-caps, is level 1."""
    keys = {heading_key(b) for b in blocks
            if b.get("type") == "heading" and not b.get("drop")}
    ordered = sorted(keys, key=lambda k: (-k[0], not k[1]))
    return {key: min(i + 1, 4) for i, key in enumerate(ordered)}


# --------------------------------------------------------------------------------------
# Classification
# --------------------------------------------------------------------------------------

def looks_like_formula(text):
    if len(text) > 220:
        return False
    symbols = sum(1 for ch in text if ch in MATH_CHARS)
    letters = sum(1 for ch in text if ch.isalpha())
    words = text.split()
    long_words = sum(1 for w in words if len(w) > 3)
    return symbols >= 2 and letters > 0 and long_words <= max(2, len(words) // 3)


def classify(blocks, furniture, body):
    """Assign a type to every block. Order matters: the cheapest, most certain tests first."""
    in_references = False

    for block in blocks:
        text = block["text"]
        key = re.sub(r"\d+", "#", text.lower()).strip()

        if key in furniture:
            block["type"], block["drop"] = "furniture", True
            continue
        if REFERENCES.match(text):
            in_references = True
            block["type"], block["drop"] = "heading", True
            continue
        if in_references:
            block["type"], block["drop"] = "reference", True
            continue
        if CAPTION.match(text):
            block["type"], block["drop"] = "caption", True
            continue
        if FRONT_MATTER.search(text) and len(text) < 400:
            block["type"], block["drop"] = "frontmatter", True
            continue
        if block["size"] <= body - 0.8:
            # Sub-body type is footnotes, author affiliations, table cells and figure text.
            # Catching it by size rather than by pattern is what stops "1 IDEA Research,
            # Shenzhen, China" from being read as a numbered section heading.
            block["type"], block["drop"] = "footnote", True
            continue
        if BOX.match(text):
            # Prompt-template boxes are unlistenable; discussion boxes are real prose.
            # The policy says decide each one - so flag rather than guess.
            block["type"], block["drop"], block["review"] = "box", False, True
            continue
        if looks_like_formula(text):
            block["type"], block["drop"] = "formula", False
            continue
        if len(text) < 420 and ATTRIBUTION.search(text):
            block["type"], block["drop"] = "epigraph", False
            continue

        numbered = NUMBERED_HEADING.match(text)
        is_big = block["size"] >= body + 0.4
        is_bold_short = block["bold"] > 0.6 and len(text) < 90
        is_caps_short = text.isupper() and len(text) < 90
        # A heading looks like a heading (bigger, bolder, all-caps, or numbered) AND reads
        # like one: short, and not ending as a sentence. The second half is what keeps a bold
        # lead-in sentence from being promoted to a heading.
        # A numbered block still has to be set at body size or larger. Without this, footnote
        # and affiliation lists ("1 IDEA Research, Shenzhen, China") become section headings.
        looks_like = (is_big or is_bold_short or is_caps_short
                      or (numbered and block["size"] >= body - 0.1))
        reads_like = len(text) < 130 and not text.endswith((".", ";", ","))
        # Display maths sets its glyphs large, so font size alone promotes a stray sum sign or
        # bracket to a heading. Require real words - or, for the "ML" and "NLP" style heading,
        # that the block is nothing but letters.
        real_words = sum(1 for w in re.findall(r"[A-Za-z]+", text) if len(w) >= 4)
        # A numbered block needs only one real word: "6.1 Methodology", "7 Conclusion" and
        # "6.2 Results" are the common shape of a subsection heading, and the two-word rule
        # silently dropped every one of them. The number itself is the strong signal, and the
        # size test above has already excluded sub-body text like "1 IDEA Research, Shenzhen".
        is_wordy = (real_words >= 2
                    or (numbered and real_words >= 1)
                    or bool(re.fullmatch(r"[A-Za-z][A-Za-z ]{0,20}", text)))
        # "position consistency =" has two real words and passes everything else. A heading
        # never contains an operator; a labelled equation always does.
        has_math = bool(re.search(r"[=+<>≤≥∑∏∫]", text))
        if looks_like and reads_like and is_wordy and not has_math:
            block["type"], block["drop"] = "heading", False
            if numbered:
                block["number"] = numbered.group(1)
            continue

        block["type"], block["drop"] = "paragraph", False

    return blocks


def merge_wrapped(blocks):
    """Rejoin a sentence broken across a column, page, or a dropped running header.

    This is the exact failure that corrupted the Qwen run: the source read "...input
    variability, model" / "Artificial Intelligence" / "characteristics, and contextual...".
    Dropping furniture first and then merging makes the split invisible to the model.
    """
    out = []
    open_para = -1  # index in `out` of the paragraph a continuation could still attach to
    for block in blocks:
        if block.get("drop"):
            # Furniture and captions do not close the paragraph - bridging across them is
            # the entire point.
            out.append(block)
            continue
        if block["type"] != "paragraph":
            # A heading, formula or box genuinely ends the paragraph.
            out.append(block)
            open_para = -1
            continue
        # A leading dash counts as a continuation too. The slicing step strips citation
        # brackets, and where the source read "...contribute to the pool [55]-in order to
        # construct low-bias reusable test collections." the removal left the dash starting a
        # new paragraph. Without this the tail is narrated as its own sentence, opening on a
        # dash, and the paragraph before it ends mid-thought.
        if (open_para >= 0
                and not re.search(r'[.!?:;"\')\]]$', out[open_para]["text"])
                and re.match(r"^(?:[a-z(]|[-]+\s*[a-z])", block["text"])):
            out[open_para]["text"] += " " + block["text"]
            out[open_para]["merged"] = out[open_para].get("merged", 0) + 1
            continue
        out.append(block)
        open_para = len(out) - 1
    return out


def assign_sections(blocks, levels):
    """Walk the document, maintaining the current heading path for every block."""
    path = []
    for block in blocks:
        if block["type"] == "heading" and not block.get("drop"):
            level = levels.get(heading_key(block), 2)
            if "number" in block:
                # An explicit "3.1.2" is better evidence of depth than any font heuristic.
                level = block["number"].count(".") + 1
            path = path[: level - 1]
            path.append(block["text"])
            block["level"] = level
        block["path"] = list(path)
    return blocks


# --------------------------------------------------------------------------------------
# Pipeline
# --------------------------------------------------------------------------------------

def analyze(pdf_path):
    """(blocks, stats) for a paper PDF.

    Every block is returned, typed and flagged - dropped ones included - so a
    misclassification can be seen rather than silently losing content.
    """
    blocks = raw_blocks(pdf_path)
    if not blocks:
        raise ValueError(f"No text extracted from {pdf_path} (scanned or image-only PDF?)")

    pages = max(b["page"] for b in blocks)
    hyphens = dehyphenate(blocks)
    body = body_size(blocks)
    furniture = find_furniture(blocks, pages)
    blocks = classify(blocks, furniture, body)
    blocks = merge_wrapped(blocks)
    # A hyphen break can straddle two blocks ("defini-" ends one, "tions" starts the next), so
    # it only becomes visible once the blocks are joined. Second pass, same rules.
    for key, value in dehyphenate(blocks).items():
        hyphens[key] += value
    # Empty headings are dropped before levels are ranked, so a figure-only section cannot
    # occupy the top rank and push the real sections down.
    blocks = drop_empty_headings(blocks)
    levels = compress_levels(heading_levels(blocks))
    blocks = assign_sections(blocks, levels)

    for i, block in enumerate(blocks):
        block["id"] = i

    kept = [b for b in blocks if not b.get("drop")]
    stats = {
        "pages": pages,
        "blocks": len(blocks),
        "body_size": body,
        "levels": {f"{size}{'/CAPS' if caps else ''}": level
                   for (size, caps), level in sorted(levels.items(), key=lambda kv: kv[1])},
        "furniture": sorted(furniture),
        "hyphens": dict(hyphens),
        "merged": sum(b.get("merged", 0) for b in blocks),
        "types": dict(Counter(b["type"] for b in blocks).most_common()),
        "kept_blocks": len(kept),
        "kept_words": sum(len(b["text"].split()) for b in kept),
        "review": sum(1 for b in blocks if b.get("review")),
    }
    return blocks, stats


def to_records(blocks):
    """The serializable view of a block - what lands in `document.jsonl`."""
    return [{
        "id": b["id"], "page": b["page"], "type": b["type"],
        "drop": bool(b.get("drop")), "review": bool(b.get("review")),
        "level": b.get("level"), "number": b.get("number"),
        "path": b["path"], "text": b["text"],
    } for b in blocks]
