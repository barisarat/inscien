"""Staging: copy a Zotero item's PDF into the import dir so it can be built.

Beside the PDF goes a sidecar `<name>.json` carrying the Zotero itemKey, title, authors, DOI and
year, so the build needs no flags and records which Zotero item the library entry came from.
That key is the join between the library and the Zotero tree in the sidebar; collection
membership is never copied, it is read from Zotero on every request.
"""

import json
import logging
import os
import re
import shutil
from pathlib import Path

from inscien.core.paths import import_dir
from inscien.services.zotero import reader

logger = logging.getLogger(__name__)

SIDECAR_SUFFIX = ".json"


def _sidecars():
    root = Path(import_dir())
    if not root.is_dir():
        return []
    out = []
    for p in sorted(root.glob("*" + SIDECAR_SUFFIX)):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        if isinstance(data, dict) and data.get("zoteroKey"):
            out.append(data)
    return out


def staged_keys() -> dict:
    """{zoteroKey: pdf filename} for every staged PDF whose file is still present."""
    root = Path(import_dir())
    out = {}
    for s in _sidecars():
        name = s.get("file")
        if name and (root / name).is_file():
            out[s["zoteroKey"]] = name
    return out


def _safe_name(name: str) -> str:
    # The Zotero filename is kept (it is what the build's `source` field records, and what the
    # rebuild looks for); only path separators and control characters are dropped.
    cleaned = re.sub(r"[\\/\x00-\x1f]", " ", name).strip()
    return cleaned or "paper.pdf"


def stage(item_key: str) -> dict:
    """Copy the item's PDF into the import dir and write its sidecar. Idempotent: an existing
    copy is left alone and reported as `alreadyStaged`."""
    meta = reader.item_metadata(item_key)
    if not meta:
        raise LookupError("item not found")
    src = reader.resolve_pdf_path(item_key)
    if not src:
        raise FileNotFoundError("item has no PDF attachment")

    root = Path(import_dir())
    root.mkdir(parents=True, exist_ok=True)
    name = _safe_name(os.path.basename(src))
    dst = root / name
    already = dst.is_file()
    if not already:
        shutil.copy2(src, dst)

    sidecar = {
        "zoteroKey": item_key,
        "file": name,
        "title": meta.get("title"),
        "authors": meta.get("authors") or [],
        "year": int(meta["year"]) if meta.get("year") else None,
        "doi": meta.get("doi"),
    }
    stem = name[:-4] if name.lower().endswith(".pdf") else name
    (root / (stem + SIDECAR_SUFFIX)).write_text(json.dumps(sidecar, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"zoteroKey": item_key, "file": name, "alreadyStaged": already}
