import os


LAB_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
LAB_VECTOR_SIZE = 384


def get_lab_settings():
    return {
        # Server-mode escape hatch: if QDRANT_URL is set we talk to a Qdrant server
        # (e.g. a container). Unset (the default) → embedded local mode at qdrant_path,
        # which needs no separate process and stores under the ./data mount.
        "qdrant_url": os.getenv("QDRANT_URL") or None,
        "qdrant_path": os.getenv("QDRANT_PATH", "/workspace/data/qdrant"),
        "qdrant_collection": os.getenv("QDRANT_COLLECTION", "inscien_lab_chunks"),
        # The chunk manifest produced by Zotero ingestion.
        "chunk_index_path": os.getenv("INSCIEN_INDEX_PATH", "/workspace/data/pdf-index.json"),
        "embedding_model": LAB_EMBEDDING_MODEL,
        "vector_size": LAB_VECTOR_SIZE,
    }