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

from services.refs.build import _tokens
from routers.papers import corpus_papers
from services.narration.jobs import audio_path, get_job, start_job

router = APIRouter(prefix="/api/narrate", tags=["narrate"])


class NarrateIn(BaseModel):
    # The picker sends an exact docId (deterministic); a typed title falls back to fuzzy.
    docId: str | None = None
    query: str | None = None


def _resolve_paper(doc_id=None, query=None):
    """Exact docId when the picker provides it; else fuzzy-match the typed title against
    both the chunk-manifest title and the real references.json title."""
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
    if not paper or not paper.get("fileName"):
        raise HTTPException(status_code=404, detail="Couldn't find that paper in your library.")
    job_id = start_job(paper["fileName"], paper["title"])
    return {"jobId": job_id, "title": paper["title"]}


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
