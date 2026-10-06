"""The narration text: the slice files read back as typed paragraphs for the audio build.

Files are concatenated in sorted filename order. A paragraph prefixed "## " is a heading, and so
is the very first paragraph (the spoken title line). Each heading carries the size it is ranked
by, stepped by the depth of its number ("6" > "6.1" > "6.1.2"), so the structure pass gives
the outline its levels; body paragraphs are 11. A heading loses its trailing period; the title
line is a spoken sentence and keeps it.
"""

from pathlib import Path

import regex as re

TITLE_SIZE = 20
HEADING_SIZES = [16, 14, 12.5, 12]
BODY_SIZE = 11


def paragraphs(narration_dir: Path) -> list[tuple[str, float, float]]:
    """[(text, size, bold)] in reading order."""
    out = []
    files = sorted(Path(narration_dir).glob("*.txt"))
    for fi, f in enumerate(files):
        paras = [re.sub(r"\s*\n\s*", " ", p).strip() for p in re.split(r"\n\s*\n", f.read_text(encoding="utf-8"))]
        for pi, p in enumerate(x for x in paras if x):
            is_title = fi == 0 and pi == 0
            if re.match(r"##\s+", p) or is_title:
                bare = re.sub(r"^##\s+", "", p)
                text = bare if is_title else re.sub(r"\.\s*$", "", bare)
                number = re.match(r"(\d+(?:\.\d+)*)", text)
                depth = len(number[1].split(".")) if number else 1
                out.append((text, TITLE_SIZE if is_title else HEADING_SIZES[min(depth, 4) - 1], 1.0))
            else:
                out.append((p, BODY_SIZE, 0.0))
    return out
