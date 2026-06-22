"""Narration endpoints. The backend resolves the paper from the library and runs the whole
narration job in-process (script via the shared LLM client, audio via Kokoro on CPU) — there
is no separate tts service. The frontend contract is unchanged:

  POST /api/narrate          {docId|query}  -> {jobId, title}      (background)
  GET  /api/narrate/{jobId}                  -> {status, stage, progress, durationMin, ...}
  GET  /api/narrate/{jobId}/audio            -> mp3
"""

import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from routers.papers import corpus_papers
from services.narration.jobs import audio_path, get_job, list_narrations, start_job

router = APIRouter(prefix="/api/narrate", tags=["narrate"])


class NarrateIn(BaseModel):
    # The picker sends an exact docId (deterministic); a typed title falls back to fuzzy.
    docId: str | None = None
    query: str | None = None


def _tokens(title):
    return [t for t in re.sub(r"[^a-z0-9 ]", " ", (title or "").lower()).split() if t]


def _resolve_paper(doc_id=None, query=None):
    """Exact docId when the picker provides it; else fuzzy-match the typed title against
    the chunk-manifest (Zotero) title."""
    docs = corpus_papers()
    if not docs:
        return None

    if doc_id:
        for d in docs:
            if d["docId"] == doc_id:
                return d
        return None

    ql = re.sub(r"\s+", " ", (query or "").strip().lower())
    q_tokens = set(_tokens(query or ""))
    best, best_score = None, 0.0
    for d in docs:
        title = (d["title"] or "").lower()
        if ql and (ql in title or title in ql):
            return d
        ct = set(_tokens(d["title"]))
        if q_tokens and ct:
            score = len(q_tokens & ct) / len(q_tokens)
            if score > best_score:
                best, best_score = d, score
    if best and best_score >= 0.45:
        return best
    if len(docs) == 1:
        return docs[0]
    return None


@router.post("")
def start(body: NarrateIn):
    paper = _resolve_paper(doc_id=body.docId, query=body.query)
    if not paper:
        raise HTTPException(status_code=404, detail="Couldn't find that paper in your library.")

    # Zotero items live in storage/ — resolve the absolute path to the stored PDF.
    file_ref = None
    try:
        from services.zotero.reader import resolve_pdf_path
        file_ref = resolve_pdf_path(paper["docId"])
    except Exception:
        file_ref = None
    if not file_ref:
        raise HTTPException(status_code=404, detail="That paper has no PDF on disk.")

    job_id = start_job(file_ref, paper["title"], paper["docId"])
    return {"jobId": job_id, "title": paper["title"]}


@router.get("/registry")
def registry():
    """Completed narrations, 1:1 by paper, so the library can show a ▶ that replays the
    saved mp3 without regenerating."""
    items = [
        {**n, "audioUrl": f"/api/narrate/{n['jobId']}/audio"}
        for n in list_narrations()
    ]
    return {"items": items}


@router.get("/{job_id}")
def status(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@router.get("/{job_id}/audio")
def audio(job_id: str):
    path = audio_path(job_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="audio not ready")
    return FileResponse(
        str(path),
        media_type="audio/mpeg",
        headers={"Content-Disposition": f'inline; filename="{job_id}.mp3"'},
    )
