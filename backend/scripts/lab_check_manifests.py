import json
import sys
import traceback
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from services.lab.manifest_loader import load_manifest_chunks


def main():
    try:
        result = load_manifest_chunks()

        preview = []

        for chunk in result["chunks"][:5]:
            preview.append({
                "chunkId": chunk["chunkId"],
                "sourceType": chunk["sourceType"],
                "title": chunk["title"],
                "url": chunk["url"],
                "contentMode": chunk["contentMode"],
                "textLength": len(chunk["text"]),
            })

        print(json.dumps({
            "ok": True,
            "source_counts": result["source_counts"],
            "total": result["total"],
            "preview": preview,
        }, indent=2))
    except Exception:
        print(json.dumps({
            "ok": False,
            "error": traceback.format_exc(),
        }, indent=2))


if __name__ == "__main__":
    main()