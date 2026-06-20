import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
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


def get_lab_collection_count():
    settings = get_lab_settings()
    client = get_qdrant_client()
    info = client.get_collection(settings["qdrant_collection"])

    return {
        "collection": settings["qdrant_collection"],
        "points_count": info.points_count,
    }


def search_lab_chunks(query_vector, limit, doc_id=None):
    settings = get_lab_settings()
    client = get_qdrant_client()

    # `/compare` scopes retrieval to one paper at a time (one cell = one paper x one
    # dimension), so the citation binds unambiguously. A payload filter on sourceId
    # restricts the vector search to that document; unscoped search omits it.
    query_filter = None
    if doc_id:
        query_filter = Filter(
            must=[FieldCondition(key="sourceId", match=MatchValue(value=doc_id))]
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