"""InScien TTS service — owns narration jobs end-to-end (parse -> script -> audio).

Single-worker (serialized) background execution; job state persisted to a volume so the
UI can poll across reloads. In-process worker doesn't survive a restart, so stale
running jobs are marked failed on startup.
"""

import json
import os
import threading
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from pipeline import run_narration

JOBS_DIR = Path(os.getenv("JOBS_DIR", "/workspace/jobs"))
(JOBS_DIR / "audio").mkdir(parents=True, exist_ok=True)

app = FastAPI(title="InScien TTS")
_executor = ThreadPoolExecutor(max_workers=1)  # one narration at a time
_jobs = {}
_lock = threading.Lock()


class NarrateRequest(BaseModel):
    docId: str | None = None
    fileName: str
    title: str | None = ""


def _persist(job):
    (JOBS_DIR / f"{job['id']}.json").write_text(json.dumps(job), encoding="utf-8")


def _set(job_id, **fields):
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.update(fields)
        _persist(job)


def _progress(job_id):
    def cb(stage, percent, detail=""):
        _set(job_id, stage=stage, progress=percent, detail=detail,
             status="done" if stage == "done" else "running")
    return cb


def _run(job_id, file_name):
    _set(job_id, status="running", stage="queued", progress=0)
    try:
        result = run_narration(job_id, file_name, _progress(job_id))
        _set(job_id, status="done", stage="done", progress=100,
             durationMin=result["duration_min"], faithfulness=result["faithfulness"])
    except Exception:
        last = (traceback.format_exc().strip().splitlines() or ["error"])[-1]
        _set(job_id, status="error", error=last)


@app.on_event("startup")
def _recover():
    for f in JOBS_DIR.glob("*.json"):
        try:
            job = json.loads(f.read_text())
        except Exception:
            continue
        if job.get("status") in ("queued", "running"):
            job["status"] = "error"
            job["error"] = "interrupted by restart"
            f.write_text(json.dumps(job))


@app.post("/narrate")
def narrate(body: NarrateRequest):
    job_id = uuid.uuid4().hex[:12]
    job = {"id": job_id, "title": body.title or "", "status": "queued",
           "stage": "queued", "progress": 0}
    with _lock:
        _jobs[job_id] = job
        _persist(job)
    _executor.submit(_run, job_id, body.fileName)
    return {"jobId": job_id}


def _public(job):
    return {k: job.get(k) for k in (
        "id", "title", "status", "stage", "progress", "detail", "error",
        "durationMin", "faithfulness",
    )}


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    with _lock:
        job = _jobs.get(job_id)
    if job is None:
        path = JOBS_DIR / f"{job_id}.json"
        if not path.exists():
            raise HTTPException(status_code=404, detail="job not found")
        job = json.loads(path.read_text())
    return _public(job)


@app.get("/audio/{job_id}")
def job_audio(job_id: str):
    path = JOBS_DIR / "audio" / f"{job_id}.mp3"
    if not path.exists():
        raise HTTPException(status_code=404, detail="audio not ready")
    return FileResponse(
        str(path),
        media_type="audio/mpeg",
        headers={"Content-Disposition": f'inline; filename="{job_id}.mp3"'},
    )


@app.get("/health")
def health():
    return {"status": "ok"}
