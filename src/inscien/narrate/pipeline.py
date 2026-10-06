"""`inscien narrate <pdf>`: a paper PDF -> a narration bundle, in three steps.

    1  plan     the PDF's text as lines, and which of them are the main text (planning)
    2  slice    the kept lines as narration text, by rule (slicing)
    3  audio    the narration text synthesized, with the source pane anchored to the PDF

Each step announces itself as `==> k/3 <label>`, which is what the app's job pane shows. The
work directory, INSCIEN_HOME/narrate/work/<slug>, keeps the plan, the raw text and the slice
files, so a bad narration can be read without re-running anything.
"""

import os
import re
import unicodedata
from pathlib import Path

from inscien.core.paths import narration_work_dir
from inscien.narrate import narration_text, structure
from inscien.narrate.cli import make_bundle
from inscien.narrate.planning import write_plan
from inscien.narrate.slicing import Narrator
from inscien.narrate.tts import SPEED_DEFAULT
from inscien.refs.pdftext import pdf_layout_pages


def work_slug(stem: str) -> str:
    """Work-directory name: first-author part and year of a Zotero filename ("Soboroff - 2025 -
    Title" -> "soboroff-2025"), else the whole stem, cut short."""
    parts = [x.strip() for x in stem.split(" - ")]
    base = " ".join(parts[:2]) if len(parts) >= 3 else stem
    slug = re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode().lower()).strip("-")
    return slug[:48].strip("-") or "paper"


def narrate(pdf, voice: str | None = None, speed: float | None = None, device: str | None = None,
            slug: str | None = None) -> Path:
    pdf = Path(pdf)
    if not pdf.is_file():
        raise FileNotFoundError(f"no such file: {pdf}")
    work = Path(narration_work_dir()) / work_slug(pdf.stem)

    print("==> 1/3 plan the paper", flush=True)
    pages, num_pages = pdf_layout_pages(pdf)
    plan = write_plan(pages, num_pages, pdf, work)
    print(f"title line: {plan['title_line']}", flush=True)

    print("==> 2/3 write the narration text", flush=True)
    out = Narrator(work).run()
    print(f"{len(plan['slices'])} slices in {out}", flush=True)

    print("==> 3/3 synthesize the audio", flush=True)
    blocks, stats = structure.analyze_text(narration_text.paragraphs(out))
    bundle_dir, _ = make_bundle(blocks, stats, title_fallback=pdf.stem, source_pdf=pdf, slug=slug, voice=voice,
                                speed=speed or SPEED_DEFAULT, device=device or os.getenv("INSCIEN_TTS_DEVICE") or "cpu")
    return bundle_dir
