"""Narration proxy: the lean backend resolves the paper and forwards to the GPU tts
service (so the frontend talks to one origin). The tts service owns the actual job.
"""

import os
import re

import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.refs.build import _tokens
from routers.papers import corpus_papers

router = APIRouter(prefix="/api/narrate", tags=["narrate"])

TTS_URL = os.getenv("TTS_SERVICE_URL", "http://tts:8300")


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
    try:
        resp = requests.post(
            f"{TTS_URL}/narrate",
            json={"docId": paper["docId"], "fileName": paper["fileName"], "title": paper["title"]},
            timeout=30,
        )
        resp.raise_for_status()
    except Exception:
        raise HTTPException(status_code=502, detail="Narration service is unavailable.")
    return {**resp.json(), "title": paper["title"]}


@router.get("/{job_id}")
def status(job_id: str):
    try:
        resp = requests.get(f"{TTS_URL}/jobs/{job_id}", timeout=15)
    except Exception:
        raise HTTPException(status_code=502, detail="Narration service is unavailable.")
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="job not found")
    return resp.json()


@router.get("/{job_id}/audio")
def audio(job_id: str):
    try:
        upstream = requests.get(f"{TTS_URL}/audio/{job_id}", stream=True, timeout=30)
    except Exception:
        raise HTTPException(status_code=502, detail="Narration service is unavailable.")
    if upstream.status_code != 200:
        raise HTTPException(status_code=404, detail="audio not ready")
    return StreamingResponse(
        upstream.iter_content(chunk_size=65536),
        media_type="audio/mpeg",
    )
