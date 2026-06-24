"""Durable data-dir resolution — one base dir for everything InScien persists.

SQLite, the embedded Qdrant store, the chunk manifest, the OpenAlex cache, job records, narration
audio, the Zotero snapshot, and the embedding-model cache all live under one base directory. In
Docker that's the `./data` bind mount (default below); in the **desktop app** the Tauri shell sets
`INSCIEN_DATA_DIR` to the OS per-user app-data dir, so a single env var redirects them all. Each
individual path still honours its own explicit override (e.g. `QDRANT_PATH`) for back-compat.
"""

import os
from pathlib import Path

# Default base = the Docker ./data mount, so existing deployments are unchanged.
_DEFAULT_DATA_DIR = "/workspace/data"


def data_dir() -> str:
    """The base directory for all durable state (`INSCIEN_DATA_DIR`, else the ./data mount)."""
    return (os.getenv("INSCIEN_DATA_DIR") or "").strip() or _DEFAULT_DATA_DIR


def data_path(*parts: str) -> str:
    """A path under the data dir, e.g. `data_path("qdrant")` → `<data_dir>/qdrant`."""
    return str(Path(data_dir(), *parts))
