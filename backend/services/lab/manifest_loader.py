"""Load the chunk manifest produced by Zotero ingestion.

InScien ingests the user's Zotero PDFs into a single chunk manifest (a JSON list)
written by `services.zotero.ingest` to `chunk_index_path`. This module reads +
validates it for both the Qdrant index and the in-process BM25 keyword index. If the
manifest does not exist yet (nothing indexed), it returns an empty set rather than
failing - the app still boots and answers "insufficient sources".
"""

import json
import logging
import shutil
import time
from pathlib import Path

from services.lab.settings import get_lab_settings

logger = logging.getLogger(__name__)


class ManifestCorruptError(RuntimeError):
    """The chunk manifest exists but is unparseable/not a list - a damaged derived store.

    Carries a user-facing, actionable message: the recovery is a Reset + re-index (which
    rebuilds the manifest, Qdrant, and the ledger together), not a silent partial rebuild.
    """


REQUIRED_CHUNK_FIELDS = [
    "sourceType",
    "sourceId",
    "chunkId",
    "title",
    "url",
    "contentMode",
    "text",
    "metadata",
]


_CORRUPT_MESSAGE = (
    "Your search index is corrupted. Reset and re-index from the sidebar to rebuild it."
)


def read_json_file(path):
    if not path.exists():
        return []

    try:
        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)
        if not isinstance(data, list):
            raise ValueError(f"Manifest must contain a list: {path}")
    except (json.JSONDecodeError, ValueError) as exc:
        # Damaged manifest. Preserve a copy for debugging (a copy, not a move, so a later
        # Reset still wipes the original cleanly), then fail loudly with an actionable
        # message rather than crashing with an opaque traceback or limping on bad data.
        try:
            backup = path.with_name(f"{path.name}.corrupt-{int(time.time())}")
            shutil.copy2(path, backup)
            logger.error("Corrupt manifest at %s (%s); preserved a copy at %s", path, exc, backup)
        except Exception:
            logger.exception("Corrupt manifest at %s (%s); failed to preserve a copy", path, exc)
        raise ManifestCorruptError(_CORRUPT_MESSAGE) from exc

    return data


def validate_chunk(chunk, source_path):
    if not isinstance(chunk, dict):
        raise ValueError(f"Chunk must be an object in {source_path}")

    for field in REQUIRED_CHUNK_FIELDS:
        if field not in chunk:
            raise ValueError(f"Missing field '{field}' in {source_path}")

    if not chunk["chunkId"]:
        raise ValueError(f"Empty chunkId in {source_path}")

    if not chunk["text"]:
        raise ValueError(f"Empty text in {source_path}")

    if not isinstance(chunk["metadata"], dict):
        raise ValueError(f"metadata must be an object in {source_path}")


def load_manifest_chunks():
    settings = get_lab_settings()
    path = Path(settings["chunk_index_path"])
    data = read_json_file(path)

    for chunk in data:
        validate_chunk(chunk, path)

    seen = set()
    duplicates = []

    for chunk in data:
        chunk_id = chunk["chunkId"]

        if chunk_id in seen:
            duplicates.append(chunk_id)

        seen.add(chunk_id)

    if duplicates:
        raise ValueError(f"Duplicate chunkId values found: {duplicates[:20]}")

    return {
        "chunks": data,
        "source_counts": {str(path.name): len(data)},
        "total": len(data),
    }
