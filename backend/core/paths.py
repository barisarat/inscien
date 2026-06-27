"""Durable data-dir resolution - one base dir for everything InScien persists.

SQLite, the OpenAlex cache, job records, narration audio, the Zotero snapshot, and the Kokoro
weights all live under one base directory. For host dev that's the repo-root `data/` folder
(default below); in the **desktop app** the Tauri shell sets `INSCIEN_DATA_DIR` to the OS per-user
app-data dir, so a single env var redirects them all. Each individual path still honours its own
explicit override (e.g. `INSCIEN_VECTORS_PATH`) for back-compat.
"""

import os
from pathlib import Path

# Default base = the repo-root `data/` dir (this file is backend/core/paths.py, so parents[2] is
# the repo root, regardless of cwd). The desktop build overrides this via INSCIEN_DATA_DIR.
_DEFAULT_DATA_DIR = str(Path(__file__).resolve().parents[2] / "data")


def data_dir() -> str:
    """The base directory for all durable state (`INSCIEN_DATA_DIR`, else the ./data mount)."""
    return (os.getenv("INSCIEN_DATA_DIR") or "").strip() or _DEFAULT_DATA_DIR


def data_path(*parts: str) -> str:
    """A path under the data dir, e.g. `data_path("pdf-index.json")` -> `<data_dir>/pdf-index.json`."""
    return str(Path(data_dir(), *parts))
