import json
import sys
import traceback
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from services.lab.qdrant_store import check_qdrant_connection


def main():
    try:
        result = check_qdrant_connection()
        print(json.dumps(result, indent=2))
    except Exception:
        print(json.dumps({
            "ok": False,
            "error": traceback.format_exc(),
        }, indent=2))


if __name__ == "__main__":
    main()