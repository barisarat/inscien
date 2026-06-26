import os

from core.paths import data_path


LAB_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
LAB_VECTOR_SIZE = 384


def get_lab_settings():
    return {
        # One vector per paper (the title+abstract summary embedding) - powers the Map's
        # Similarity lens. Stored in a single JSON file (see services/lab/vector_store.py).
        "paper_vectors_path": os.getenv("INSCIEN_VECTORS_PATH") or data_path("paper-vectors.json"),
        # The chunk manifest produced by Zotero ingestion.
        "chunk_index_path": os.getenv("INSCIEN_INDEX_PATH") or data_path("pdf-index.json"),
        # Writable cache for the fastembed embedding model (downloaded/bundled here).
        "fastembed_cache_path": os.getenv("FASTEMBED_CACHE_PATH") or data_path(".fastembed"),
        "embedding_model": LAB_EMBEDDING_MODEL,
        "vector_size": LAB_VECTOR_SIZE,
    }