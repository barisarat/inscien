import os

from core.paths import data_path


LAB_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
LAB_VECTOR_SIZE = 384


def get_lab_settings():
    return {
        # Server-mode escape hatch: if QDRANT_URL is set we talk to a Qdrant server
        # (e.g. a container). Unset (the default) → embedded local mode at qdrant_path,
        # which needs no separate process and stores under the data dir.
        "qdrant_url": os.getenv("QDRANT_URL") or None,
        "qdrant_path": os.getenv("QDRANT_PATH") or data_path("qdrant"),
        "qdrant_collection": os.getenv("QDRANT_COLLECTION", "inscien_lab_chunks"),
        # One vector per paper (mean of its chunk vectors) — powers the Map's Similarity lens.
        "qdrant_paper_collection": os.getenv("QDRANT_PAPER_COLLECTION", "inscien_lab_paper_vectors"),
        # The chunk manifest produced by Zotero ingestion.
        "chunk_index_path": os.getenv("INSCIEN_INDEX_PATH") or data_path("pdf-index.json"),
        # Writable cache for the fastembed embedding model (downloaded/bundled here).
        "fastembed_cache_path": os.getenv("FASTEMBED_CACHE_PATH") or data_path(".fastembed"),
        "embedding_model": LAB_EMBEDDING_MODEL,
        "vector_size": LAB_VECTOR_SIZE,
    }