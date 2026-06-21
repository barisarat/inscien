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


def get_qdrant_client():
    settings = get_lab_settings()

    return QdrantClient(
        url=settings["qdrant_url"],
        timeout=30,
    )


def check_qdrant_connection():
    settings = get_lab_settings()
    client = get_qdrant_client()
    collections = client.get_collections()

    return {
        "ok": True,
        "qdrant_url": settings["qdrant_url"],
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


def build_point(chunk, vector):
    payload = {
        "sourceType": chunk["sourceType"],
        "sourceId": chunk["sourceId"],
        "chunkId": chunk["chunkId"],
        "parentId": chunk.get("parentId", ""),
        "title": chunk["title"],
        "description": chunk.get("description", ""),
        "category": chunk.get("category", ""),
        "sectionTitle": chunk.get("sectionTitle", ""),
        "url": chunk["url"],
        "externalUrl": chunk.get("externalUrl", ""),
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
            "parentId": payload.get("parentId", ""),
            "title": payload.get("title", ""),
            "description": payload.get("description", ""),
            "category": payload.get("category", ""),
            "sectionTitle": payload.get("sectionTitle", ""),
            "url": payload.get("url", ""),
            "externalUrl": payload.get("externalUrl", ""),
            "contentMode": payload.get("contentMode", ""),
            "text": payload.get("text", ""),
            "metadata": payload.get("metadata", {}),
        })

    return items