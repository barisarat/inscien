"""Typed document blocks -> narration nodes.

`passthrough` takes the blocks `structure.py` kept, verbalizes headings and drops notation. That
is already a clean, listenable document: furniture, captions, references, footnotes and
affiliations are gone, split sentences are rejoined, hyphen breaks are resolved. No model.
"""

import re

_ONES = ("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
         "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
         "seventeen", "eighteen", "nineteen")
_TENS = ("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")

NARRATED_TYPES = {"paragraph", "heading", "epigraph", "box"}


def _spell(number):
    n = int(number)
    if n < 20:
        return _ONES[n]
    if n < 100:
        tens, ones = divmod(n, 10)
        return _TENS[tens] + (f" {_ONES[ones]}" if ones else "")
    return str(n)


def spoken_heading(text, number=None, announce=True):
    """A heading read aloud.

    "3.1 Reasoning tasks" becomes "Section three point one. Reasoning tasks." and an
    unnumbered heading becomes "Section. Reasoning tasks." The leading word is what tells a
    listener a section changed - at three hours, an unannounced heading is just a pause.

    `announce=False` drops the word "Section" and keeps the number. Papers routinely open a
    section with its first subsection and no prose between, and saying the word twice in a
    row ("Section three. Method. Section three point one. Setup.") is the single most
    noticeable tic in a long narration. The number alone still places the listener.
    """
    body = text
    if number:
        body = re.sub(r"^\s*" + re.escape(number) + r"\.?\s*", "", text).strip()
        spoken_number = " point ".join(_spell(part) for part in number.split("."))
        # Without the leading "Section" the number starts the sentence, so it has to carry
        # the capital itself.
        prefix = f"Section {spoken_number}." if announce else f"{spoken_number.capitalize()}."
    else:
        prefix = "Section." if announce else ""
    body = body.strip().rstrip(".")
    # Title case for an all-caps heading: Kokoro spells out shouty words letter by letter.
    if body.isupper():
        body = body.title()
    if not prefix:
        return f"{body}." if body else ""
    return f"{prefix} {body}." if body else prefix


def passthrough(blocks, keep_formulas=False):
    """Kept blocks -> narration nodes, no model involved."""
    nodes = []
    previous_was_heading = False
    for block in blocks:
        if block.get("drop"):
            continue
        kind = block["type"]
        if kind == "formula":
            if not keep_formulas:
                continue
        elif kind not in NARRATED_TYPES:
            continue

        text = block["text"].strip()
        if not text:
            continue
        display = text
        if kind == "heading":
            # Only the first heading of a run announces itself; see spoken_heading.
            text = spoken_heading(text, block.get("number"),
                                  announce=not previous_was_heading)
        previous_was_heading = kind == "heading"

        nodes.append({
            "id": block["id"], "type": kind, "level": block.get("level"),
            "text": text, "display": display, "page": block.get("page"),
        })
    return nodes
