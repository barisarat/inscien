"""Narrations: which papers have a finished bundle, and queueing a paper for narration.

Each bundle's `meta.json` names the PDF it was built from, the Zotero attachment filename the
queue holds (a "-narration" suffix on that name is ignored). So the join is the filename, with a
normalized-title prefix match as the fallback for a bundle built from a renamed file. `queue()` copies a PDF into the narration queue; the job does the rest.
"""

import json
import logging
import os
import re
import shutil
import unicodedata
from pathlib import Path

from inscien.core.paths import narration_queue_dir, narrations_dir, narrations_url
from inscien.services.zotero import reader

logger = logging.getLogger(__name__)

NARRATION_SUFFIX = "-narration"


def _title_key(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _source_stem(source: str) -> str:
    """The Zotero filename a bundle was narrated from, without extension or suffix."""
    stem = Path(source or "").stem
    return stem[: -len(NARRATION_SUFFIX)] if stem.endswith(NARRATION_SUFFIX) else stem


PROGRESS_FILE = ".progress.json"


def progress_entries() -> dict:
    """The listening progress file, one entry per bundle: `position` and `furthest` in seconds
    of the primary voice's timeline, and a `finished` flag the listener sets at the end.
    Read-only, missing or unreadable file means nothing has been listened to."""
    path = Path(narrations_dir()) / PROGRESS_FILE
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}
    return data if isinstance(data, dict) else {}


def finished_slugs() -> set:
    """Slugs whose narration was played to the end."""
    return {slug for slug, entry in progress_entries().items() if isinstance(entry, dict) and entry.get("finished")}


def _percent(entry, duration) -> int:
    """How much of a narration has been heard, 0-100, from the FURTHEST point reached rather
    than the current position: scrubbing back to re-hear a paragraph does not un-hear the
    rest. Finished is 100 whatever the numbers say; no duration means no percentage."""
    if not isinstance(entry, dict):
        return 0
    if entry.get("finished"):
        return 100
    try:
        furthest = float(entry.get("furthest") or entry.get("position") or 0)
        duration = float(duration or 0)
    except (TypeError, ValueError):
        return 0
    if furthest <= 0 or duration <= 0:
        return 0
    return max(0, min(99, round(furthest / duration * 100)))


def bundles() -> list:
    """[{slug, url, stem, titleKey, finished, percent}] over every built bundle, read fresh per
    request."""
    root = Path(narrations_dir())
    if not root.is_dir():
        return []
    progress = progress_entries()
    out = []
    for meta_path in sorted(root.glob("*/meta.json")):
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        slug = meta.get("slug") or meta_path.parent.name
        # The narration title opens with the paper title, then "By <authors>. Published in ...".
        title = re.split(r"\.\s+By\s+|\.\s", meta.get("title") or "", maxsplit=1)[0]
        out.append({
            "slug": slug,
            # The listen view, addressed by slug on one static page.
            "url": f"{narrations_url()}/listen/?b={slug}",
            "stem": _source_stem(meta.get("source") or ""),
            "titleKey": _title_key(title),
            "finished": bool(isinstance(progress.get(slug), dict) and progress[slug].get("finished")),
            "percent": _percent(progress.get(slug), meta.get("duration_s")),
            # What it was built WITH, so a rebuild reproduces this bundle rather than a fresh
            # random-voice one. What it was built FROM is "stem".
            "voice": (meta.get("voices") or [meta.get("voice")])[0] if (meta.get("voices") or meta.get("voice")) else None,
            "speed": meta.get("speed"),
        })
    return out


def find(file_name: str | None, title: str | None, known=None) -> dict | None:
    """The bundle for a paper, by its Zotero filename first, then by title prefix."""
    known = bundles() if known is None else known
    stem = Path(file_name).stem if file_name else None
    if stem:
        for b in known:
            if b["stem"] == stem:
                return b
    key = _title_key(title or "")
    if len(key) >= 30:
        for b in known:
            if b["titleKey"] and (b["titleKey"].startswith(key) or key.startswith(b["titleKey"])):
                return b
    return None


def queued_stems() -> set:
    """Stems of PDFs sitting in the narration queue."""
    root = Path(narration_queue_dir())
    if not root.is_dir():
        return set()
    return {p.stem for p in root.glob("*.pdf") if not p.stem.endswith(NARRATION_SUFFIX)}


def status_for(file_name: str | None, title: str | None, known=None, queued=None) -> dict:
    """{status: ready|queued|none, url} for one paper."""
    b = find(file_name, title, known)
    if b:
        return {"status": "ready", "url": b["url"], "finished": bool(b.get("finished")),
                "percent": int(b.get("percent") or 0)}
    queued = queued_stems() if queued is None else queued
    if file_name and Path(file_name).stem in queued:
        return {"status": "queued", "url": None}
    return {"status": "none", "url": None}


def queue(item_key: str) -> dict:
    """Copy the item's PDF into the narration queue. Idempotent."""
    src = reader.resolve_pdf_path(item_key)
    if not src:
        raise FileNotFoundError("item has no PDF attachment")
    root = Path(narration_queue_dir())
    root.mkdir(parents=True, exist_ok=True)
    name = re.sub(r"[\\/\x00-\x1f]", " ", os.path.basename(src)).strip() or "paper.pdf"
    dst = root / name
    already = dst.is_file()
    if not already:
        shutil.copy2(src, dst)
    return {"zoteroKey": item_key, "file": name, "alreadyQueued": already}
