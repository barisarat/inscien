"""Serve the original PDF for a citation, so the UI can open it at the cited page.

Single GET endpoint streaming the source PDF inline (the browser's native viewer
honors a `#page=N` fragment). The doc id is a Zotero itemKey, resolved to the file in
the Zotero storage tree.
"""

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from services.lab.manifest_loader import load_manifest_chunks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/papers", tags=["papers"])


def corpus_papers():
    """[{docId, title, fileName}] — one entry per chunk-manifest doc, using the Zotero
    titles carried on the chunks (used by the picker and narration resolution)."""
    manifest = load_manifest_chunks()
    docs = {}
    for chunk in manifest["chunks"]:
        sid = chunk.get("sourceId")
        if not sid or sid in docs:
            continue
        meta = chunk.get("metadata") or {}
        docs[sid] = {"docId": sid, "title": chunk.get("title", ""), "fileName": meta.get("fileName", "")}

    return list(docs.values())


def resolve_titles(doc_ids):
    """{docId: title} from the chunk manifest, falling back to the id when unknown.
    Shared by the /compare and /write skills to label papers in their outputs."""
    by_id = {d["docId"]: d["title"] for d in corpus_papers()}
    return {doc_id: (by_id.get(doc_id) or doc_id) for doc_id in doc_ids}


@router.get("")
def list_papers():
    """The library, for the inline narration picker."""
    return {"papers": [{"docId": p["docId"], "title": p["title"]} for p in corpus_papers()]}


@router.get("/{doc_id}")
def get_paper(doc_id: str):
    # Zotero-native: doc_id is the itemKey, and the file lives in the Zotero storage tree.
    from services.zotero.reader import resolve_pdf_path

    try:
        zotero_path = resolve_pdf_path(doc_id)
    except Exception as exc:
        # A reader/config error (Zotero library unreadable/unmounted) is NOT "paper not
        # found" — report it as such instead of masquerading as a 404.
        logger.warning("resolve_pdf_path failed for %s", doc_id, exc_info=True)
        raise HTTPException(status_code=503, detail="Could not read the Zotero library.") from exc

    if not zotero_path or not Path(zotero_path).exists():
        raise HTTPException(status_code=404, detail="Paper not found")

    path = Path(zotero_path)
    return FileResponse(
        str(path),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{path.name}"'},
    )
