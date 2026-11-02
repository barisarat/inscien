"""Where InScien keeps everything it writes: one directory, INSCIEN_HOME.

    INSCIEN_HOME/
      data/              app state: SQLite settings, the Zotero snapshot, the job record
      library/<slug>/    built papers: paper.json (references) + extract.json
      import/            PDFs staged for a build, each with its Zotero sidecar
      narrate/queue/     PDFs waiting to be narrated
      narrate/work/      per-paper narration work: raw text, plan, slices
      bundles/<slug>/    finished narrations, plus .progress.json (where each listen stopped)
      weights/           the Kokoro voice weights, downloaded on first narration
      search/            the search index (index.sqlite3) and its models/, from `inscien index`

INSCIEN_HOME defaults to the OS per-user data directory (platformdirs: ~/.local/share/inscien
on Linux, ~/Library/Application Support/inscien on macOS, %LOCALAPPDATA%\\inscien on Windows).
"""

import os
from pathlib import Path


def home() -> Path:
    """The base directory for everything InScien writes (`INSCIEN_HOME`)."""
    value = (os.getenv("INSCIEN_HOME") or "").strip()
    if value:
        return Path(value).expanduser()
    from platformdirs import user_data_dir

    return Path(user_data_dir("inscien", appauthor=False))


def home_path(*parts: str) -> str:
    """A path under INSCIEN_HOME, created on first use for a directory."""
    path = home().joinpath(*parts)
    return str(path)


def _dir(*parts: str) -> str:
    path = home().joinpath(*parts)
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


def data_dir() -> str:
    return _dir("data")


def data_path(*parts: str) -> str:
    """A path under the data dir, e.g. `data_path("inscien.db")`."""
    return str(Path(data_dir(), *parts))


def library_dir() -> str:
    return _dir("library")


def import_dir() -> str:
    return _dir("import")


def narration_queue_dir() -> str:
    return _dir("narrate", "queue")


def narration_work_dir() -> str:
    return _dir("narrate", "work")


def narrations_dir() -> str:
    return _dir("bundles")


def search_dir() -> str:
    return _dir("search")


def search_index_path() -> str:
    """The search index: papers, passages, their BM25 tables and vectors (search/index.py)."""
    return str(Path(search_dir(), "index.sqlite3"))


def search_models_dir() -> str:
    """The embedding and rerank models, downloaded on first use."""
    return _dir("search", "models")


def narrations_url() -> str:
    """Origin prefix of the listen links; empty, because this app serves the bundles itself."""
    return ""
