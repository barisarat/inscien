import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    FilterSelector,
    MatchAny,
    MatchValue,
    PointStruct,
    VectorParams,
)

from services.lab.settings import get_lab_settings


_client = None


def get_qdrant_client():
    """Return a process-wide singleton client.

    Embedded local mode (the default) holds a file lock on its storage folder, so a fresh
    client per call would fail with "already accessed by another instance". Reusing one
    client avoids that. Jobs run as threads in this same process (single-worker executor),
    so a shared client is correct; server mode shares it harmlessly too. Set QDRANT_URL to
    talk to a Qdrant server instead of the embedded store.
    """
    global _client
    if _client is not None:
        return _client

    settings = get_lab_settings()
    if settings["qdrant_url"]:
        _client = QdrantClient(url=settings["qdrant_url"], timeout=30)
    else:
        _client = QdrantClient(path=settings["qdrant_path"])
    return _client


def check_qdrant_connection():
    settings = get_lab_settings()
    client = get_qdrant_client()
    collections = client.get_collections()

    location = settings["qdrant_url"] or f"local:{settings['qdrant_path']}"
    return {
        "ok": True,
        "qdrant_url": location,
        "collection": settings["qdrant_collection"],
        "collections": [
            collection.name
            for collection in collections.collections
        ],
    }


def make_point_id(chunk_id):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, chunk_id))


def recreate_lab_collection():
    settings = get_lab_settings()
    client = get_qdrant_client()
    collection_name = settings["qdrant_collection"]

    existing = client.get_collections()
    existing_names = [
        collection.name
        for collection in existing.collections
    ]

    if collection_name in existing_names:
        client.delete_collection(collection_name=collection_name)

    client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(
            size=settings["vector_size"],
            distance=Distance.COSINE,
        ),
    )

    return {
        "collection": collection_name,
        "vector_size": settings["vector_size"],
    }


def ensure_lab_collection():
    """Create the vector collection when missing.

    Normal indexing should work on a fresh Qdrant volume without requiring a destructive
    reset first. Reset still uses `recreate_lab_collection()` because it intentionally
    drops existing vectors.
    """
    settings = get_lab_settings()
    client = get_qdrant_client()
    collection_name = settings["qdrant_collection"]

    existing = client.get_collections()
    existing_names = [
        collection.name
        for collection in existing.collections
    ]

    if collection_name in existing_names:
        return {
            "collection": collection_name,
            "vector_size": settings["vector_size"],
            "created": False,
        }

    client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(
            size=settings["vector_size"],
            distance=Distance.COSINE,
        ),
    )

    return {
        "collection": collection_name,
        "vector_size": settings["vector_size"],
        "created": True,
    }


def build_point(chunk, vector):
    payload = {
        "sourceType": chunk["sourceType"],
        "sourceId": chunk["sourceId"],
        "chunkId": chunk["chunkId"],
        "title": chunk["title"],
        "url": chunk["url"],
        "contentMode": chunk["contentMode"],
        "text": chunk["text"],
        "metadata": chunk.get("metadata", {}),
    }

    return PointStruct(
        id=make_point_id(chunk["chunkId"]),
        vector=vector,
        payload=payload,
    )


def upsert_lab_points(points):
    settings = get_lab_settings()
    client = get_qdrant_client()

    client.upsert(
        collection_name=settings["qdrant_collection"],
        points=points,
        wait=True,
    )


def delete_lab_points_by_source(source_id):
    """Remove all points for one document (sourceId) — used before re-indexing an item
    so a shrunk page/passage count never leaves stale points behind."""
    settings = get_lab_settings()
    client = get_qdrant_client()
    client.delete(
        collection_name=settings["qdrant_collection"],
        points_selector=FilterSelector(
            filter=Filter(must=[FieldCondition(key="sourceId", match=MatchValue(value=source_id))])
        ),
        wait=True,
    )


def ensure_source_payload_index():
    """Keyword payload index on sourceId so multi-item (MatchAny) scope filters stay
    index-backed. Idempotent — a no-op if the index already exists."""
    settings = get_lab_settings()
    client = get_qdrant_client()
    try:
        client.create_payload_index(
            collection_name=settings["qdrant_collection"],
            field_name="sourceId",
            field_schema="keyword",
        )
    except Exception:
        pass


def get_lab_collection_count():
    settings = get_lab_settings()
    client = get_qdrant_client()
    info = client.get_collection(settings["qdrant_collection"])

    return {
        "collection": settings["qdrant_collection"],
        "points_count": info.points_count,
    }


def search_lab_chunks(query_vector, limit, doc_id=None, item_keys=None):
    settings = get_lab_settings()
    client = get_qdrant_client()

    # A payload filter on sourceId scopes the vector search. `/compare` scopes to one
    # paper (`doc_id`); the Zotero navigator scopes to a *selection* (`item_keys`, a set
    # of itemKeys). Unscoped search omits the filter and searches the whole library.
    query_filter = None
    if doc_id:
        query_filter = Filter(
            must=[FieldCondition(key="sourceId", match=MatchValue(value=doc_id))]
        )
    elif item_keys:
        query_filter = Filter(
            must=[FieldCondition(key="sourceId", match=MatchAny(any=list(item_keys)))]
        )

    response = client.query_points(
        collection_name=settings["qdrant_collection"],
        query=query_vector,
        limit=limit,
        with_payload=True,
        query_filter=query_filter,
    )

    items = []

    for result in response.points:
        payload = result.payload or {}

        items.append({
            "score": float(result.score),
            "sourceType": payload.get("sourceType", ""),
            "sourceId": payload.get("sourceId", ""),
            "chunkId": payload.get("chunkId", ""),
            "title": payload.get("title", ""),
            "url": payload.get("url", ""),
            "contentMode": payload.get("contentMode", ""),
            "text": payload.get("text", ""),
            "metadata": payload.get("metadata", {}),
        })

    return items


# --- Paper-level vectors (one per item; mean of its chunk vectors) -----------------------
# Powers the Map's Similarity lens: content similarity *between papers*, not chunks. Stored in
# a separate collection so paper-to-paper k-NN is a single query (no per-chunk aggregation).


def _paper_collection(settings):
    return settings["qdrant_paper_collection"]


def ensure_paper_collection():
    """Create the paper-vector collection when missing (idempotent), with a sourceId index so
    scope filters stay index-backed."""
    settings = get_lab_settings()
    client = get_qdrant_client()
    name = _paper_collection(settings)
    existing = [c.name for c in client.get_collections().collections]
    if name not in existing:
        client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=settings["vector_size"], distance=Distance.COSINE),
        )
    try:
        client.create_payload_index(collection_name=name, field_name="sourceId", field_schema="keyword")
    except Exception:
        pass


def recreate_paper_collection():
    settings = get_lab_settings()
    client = get_qdrant_client()
    name = _paper_collection(settings)
    if name in [c.name for c in client.get_collections().collections]:
        client.delete_collection(collection_name=name)
    ensure_paper_collection()


def upsert_paper_vector(item_key, vector, payload=None):
    settings = get_lab_settings()
    client = get_qdrant_client()
    ensure_paper_collection()
    point = PointStruct(
        id=make_point_id(f"paper::{item_key}"),
        vector=list(vector),
        payload={**(payload or {}), "sourceId": item_key},
    )
    client.upsert(collection_name=_paper_collection(settings), points=[point], wait=True)


def get_paper_vectors(item_keys):
    """{sourceId: vector} for the given items that already have a paper vector."""
    settings = get_lab_settings()
    client = get_qdrant_client()
    ids = [make_point_id(f"paper::{k}") for k in item_keys]
    if not ids:
        return {}
    try:
        records = client.retrieve(
            collection_name=_paper_collection(settings), ids=ids, with_vectors=True, with_payload=True
        )
    except Exception:
        return {}
    out = {}
    for r in records:
        sid = (r.payload or {}).get("sourceId")
        if sid and r.vector:
            out[sid] = r.vector
    return out


def query_similar_papers(vector, item_keys, k, exclude_id=None):
    """Top-k papers within `item_keys` most similar to `vector` (cosine). Excludes exclude_id."""
    settings = get_lab_settings()
    client = get_qdrant_client()
    response = client.query_points(
        collection_name=_paper_collection(settings),
        query=list(vector),
        limit=k + 1,
        with_payload=True,
        query_filter=Filter(must=[FieldCondition(key="sourceId", match=MatchAny(any=list(item_keys)))]),
    )
    out = []
    for p in response.points:
        sid = (p.payload or {}).get("sourceId")
        if sid and sid != exclude_id:
            out.append({"sourceId": sid, "score": float(p.score)})
    return out[:k]


def _scroll_chunk_vectors(item_key):
    """All chunk vectors for one item, read back from the chunk collection (for backfill)."""
    settings = get_lab_settings()
    client = get_qdrant_client()
    vectors = []
    offset = None
    while True:
        points, offset = client.scroll(
            collection_name=settings["qdrant_collection"],
            scroll_filter=Filter(must=[FieldCondition(key="sourceId", match=MatchValue(value=item_key))]),
            limit=128,
            offset=offset,
            with_vectors=True,
            with_payload=False,
        )
        vectors.extend(p.vector for p in points if p.vector)
        if offset is None:
            break
    return vectors


def backfill_paper_vectors(item_keys, payload_for=None):
    """Build paper vectors for items missing one, by averaging their already-indexed chunk
    vectors — no reparse. `payload_for(item_key) -> dict` supplies optional node metadata.
    Returns the count built."""
    import numpy as np

    have = set(get_paper_vectors(item_keys).keys())
    built = 0
    for key in item_keys:
        if key in have:
            continue
        vectors = _scroll_chunk_vectors(key)
        if not vectors:
            continue
        mean = np.mean(np.asarray(vectors, dtype="float32"), axis=0).tolist()
        upsert_paper_vector(key, mean, payload_for(key) if payload_for else None)
        built += 1
    return built
