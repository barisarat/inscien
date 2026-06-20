"""Build the intra-corpus reference graph from the indexed papers.

Run inside the backend container, after ingesting PDFs:

    python scripts/build_references.py

Extracts each paper's references (local LLM) and maps which papers cite each other.
LLM work per paper, so it streams progress. Re-run whenever the corpus changes.
"""

import json
import sys
import traceback
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from services.refs.build import build_references  # noqa: E402


def main():
    try:
        summary = build_references(progress=lambda msg: print(msg, flush=True))
        print(json.dumps(summary, indent=2))
    except Exception:
        print(json.dumps({"ok": False, "error": traceback.format_exc()}, indent=2))


if __name__ == "__main__":
    main()
