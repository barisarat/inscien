import json
import sys
import traceback
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from services.lab.embedding_service import embed_texts
from services.lab.manifest_loader import load_manifest_chunks
from services.lab.qdrant_store import (
    build_point,
    get_lab_collection_count,
    recreate_lab_collection,
    upsert_lab_points,
)


BATCH_SIZE = 32


def batched(items, size):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def main():
    try:
        manifest_result = load_manifest_chunks()
        chunks = manifest_result["chunks"]

        collection_result = recreate_lab_collection()

        indexed = 0

        for batch in batched(chunks, BATCH_SIZE):
            texts = [
                chunk["text"]
                for chunk in batch
            ]

            vectors = embed_texts(texts)

            points = [
                build_point(chunk, vector)
                for chunk, vector in zip(batch, vectors)
            ]

            upsert_lab_points(points)

            indexed += len(batch)
            print(json.dumps({
                "indexed": indexed,
                "total": len(chunks),
            }))

        count_result = get_lab_collection_count()

        print(json.dumps({
            "ok": True,
            "source_counts": manifest_result["source_counts"],
            "total_chunks": manifest_result["total"],
            "collection": collection_result,
            "qdrant": count_result,
        }, indent=2))
    except Exception:
        print(json.dumps({
            "ok": False,
            "error": traceback.format_exc(),
        }, indent=2))


if __name__ == "__main__":
    main()