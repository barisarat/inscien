import os


LAB_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
LAB_VECTOR_SIZE = 384


def get_lab_settings():
    return {
        "qdrant_url": os.getenv("QDRANT_URL", "http://qdrant:6333"),
        "qdrant_collection": os.getenv("QDRANT_COLLECTION", "inscien_lab_chunks"),
        # Local PDF corpus + the chunk manifest produced by ingestion (Phase 2).
        "papers_dir": os.getenv("PAPERS_DIR", "/workspace/papers"),
        "chunk_index_path": os.getenv("INSCIEN_INDEX_PATH", "/workspace/data/pdf-index.json"),
        # References manifest produced by the explicit reference-graph build.
        "references_index_path": os.getenv("INSCIEN_REFS_PATH", "/workspace/data/references.json"),
        "top_k": int(os.getenv("LAB_TOP_K", "10")),
        "embedding_model": LAB_EMBEDDING_MODEL,
        "vector_size": LAB_VECTOR_SIZE,
    }