"""The one background job (`services/library/host_job.py`): build a paper into the library or
narrate it, started from the UI and followed in its job pane.

Each start route first stages the PDF (into the import dir for a build, the narration queue for
a narration) and then starts the job. One job at a time: a start while one runs answers 409.
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException

from inscien.services.library import host_job, narrations, staging
from inscien.services.zotero import reader

router = APIRouter(prefix="/api/job", tags=["job"])

BUSY = "A job is running - wait for it to finish."


def _title(item_key: str) -> str:
    meta = reader.item_metadata(item_key) or {}
    return meta.get("title") or item_key


@router.get("")
def job():
    """The current or last job, or {"job": null}."""
    return {"job": host_job.current()}


@router.post("/build/{item_key}")
def build(item_key: str):
    if (host_job.current() or {}).get("status") == "running":
        raise HTTPException(status_code=409, detail=BUSY)
    try:
        staged = staging.stage(item_key)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Item not found") from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail="This item has no PDF in Zotero storage.") from exc
    try:
        return {"job": host_job.start_build(staged["file"], _title(item_key))}
    except host_job.Busy as exc:
        raise HTTPException(status_code=409, detail=BUSY) from exc


@router.post("/narrate/{item_key}")
def narrate(item_key: str):
    if (host_job.current() or {}).get("status") == "running":
        raise HTTPException(status_code=409, detail=BUSY)
    try:
        queued = narrations.queue(item_key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail="This item has no PDF in Zotero storage.") from exc
    try:
        return {"job": host_job.start_narration(queued["file"], _title(item_key))}
    except host_job.Busy as exc:
        raise HTTPException(status_code=409, detail=BUSY) from exc


@router.post("/rebuild/{slug}")
def rebuild(slug: str):
    """Narrate an existing bundle again, in the voice and speed it was built with."""
    bundle = next((b for b in narrations.bundles() if b["slug"] == slug), None)
    if not bundle:
        raise HTTPException(status_code=404, detail="no such narration")
    stem = bundle["stem"]
    try:
        return {"job": host_job.start_narration(f"{stem}.pdf", stem, bundle.get("voice"),
                                                 bundle.get("speed"), slug)}
    except host_job.Busy as exc:
        raise HTTPException(status_code=409, detail=BUSY) from exc


@router.post("/cancel")
def cancel():
    return {"job": host_job.cancel()}
