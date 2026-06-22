import os


LAB_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
LAB_VECTOR_SIZE = 384


def get_lab_settings():
    return {
        "qdrant_url": os.getenv("QDRANT_URL", "http://qdrant:6333"),
        "qdrant_collection": os.getenv("QDRANT_COLLECTION", "inscien_lab_chunks"),
        # The chunk manifest produced by Zotero ingestion.
        "chunk_index_path": os.getenv("INSCIEN_INDEX_PATH", "/workspace/data/pdf-index.json"),
        "embedding_model": LAB_EMBEDDING_MODEL,
        "vector_size": LAB_VECTOR_SIZE,
    }