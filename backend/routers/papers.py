"""Serve the original PDF for a citation, so the UI can open it at the cited page.

Single GET endpoint streaming the source PDF inline (the browser's native viewer
honors a `#page=N` fragment). The document id -> filename mapping comes straight from
the chunk manifest (each chunk carries `metadata.fileName`).
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from services.lab.manifest_loader import load_manifest_chunks
from services.lab.settings import get_lab_settings
from services.refs.build import load_references

router = APIRouter(prefix="/api/papers", tags=["papers"])


def corpus_papers():
    """[{docId, title, fileName}] — chunk-manifest docs with the real titles from
    references.json merged in (used by the picker and narration resolution)."""
    manifest = load_manifest_chunks()
    docs = {}
    for chunk in manifest["chunks"]:
        sid = chunk.get("sourceId")
        if not sid or sid in docs:
            continue
        meta = chunk.get("metadata") or {}
        docs[sid] = {"docId": sid, "title": chunk.get("title", ""), "fileName": meta.get("fileName", "")}

    refs = load_references()
    if refs:
        for sid, d in (refs.get("documents") or {}).items():
            if sid in docs and d.get("title"):
                docs[sid]["title"] = d["title"]
    return list(docs.values())


def _resolve_filename(doc_id):
    manifest = load_manifest_chunks()
    for chunk in manifest["chunks"]:
        if chunk.get("sourceId") == doc_id:
            return (chunk.get("metadata") or {}).get("fileName")
    return None


@router.get("")
def list_papers():
    """The library, for the inline narration picker."""
    return {"papers": [{"docId": p["docId"], "title": p["title"]} for p in corpus_papers()]}


@router.get("/{doc_id}")
def get_paper(doc_id: str):
    settings = get_lab_settings()
    file_name = _resolve_filename(doc_id)
    if not file_name:
        raise HTTPException(status_code=404, detail="Paper not found")

    # Path(...).name strips any directory components — guards against traversal.
    path = Path(settings["papers_dir"]) / Path(file_name).name
    if not path.exists():
        raise HTTPException(status_code=404, detail="PDF file missing")

    return FileResponse(
        str(path),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{path.name}"'},
    )
