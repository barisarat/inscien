"""Ingest the local PDF library into the InScien index.

Run inside the backend container:

    python scripts/inscien_ingest.py

Parses every PDF under PAPERS_DIR, writes the chunk manifest, and rebuilds the
Qdrant collection. Idempotent — safe to re-run whenever the papers folder changes.
"""

import json
import sys
import traceback
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from services.lab.pdf_ingest import reindex_library  # noqa: E402


def main():
    try:
        # Stream step-by-step progress so a multi-paper ingest isn't a silent wait.
        summary = reindex_library(progress=lambda msg: print(msg, flush=True))
        print(json.dumps(summary, indent=2))
    except Exception:
        print(json.dumps({"ok": False, "error": traceback.format_exc()}, indent=2))


if __name__ == "__main__":
    main()
