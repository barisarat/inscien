"""Background-job runner for `/narrate`.

Narration is now LLM + CPU-TTS only (Ollama for the script via the shared client, Kokoro for
audio) — both run inside the backend, so there is no separate GPU tts container. This mirrors
the proven in-process pattern of `services/compare/jobs.py` and `services/writeup/jobs.py`:
a single-worker (serialized) executor, job state persisted to a volume so the UI can poll
across reloads, and stale running jobs marked failed on startup (the worker doesn't survive a
restart).
"""

import json
import logging
import os
import threading
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from services.narration.pipeline import run_narration

logger = logging.getLogger(__name__)

JOBS_DIR = Path(os.getenv("NARRATION_JOBS_DIR", "/workspace/data/narration_jobs"))
AUDIO_DIR = JOBS_DIR / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

_executor = ThreadPoolExecutor(max_workers=1)  # one narration at a time
_jobs = {}
_lock = threading.Lock()

_PUBLIC_FIELDS = ("id", "title", "status", "stage", "progress", "detail", "error",
                  "durationMin", "faithfulness")


def audio_path(job_id):
    return AUDIO_DIR / f"{job_id}.mp3"


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
        result = run_narration(file_name, str(audio_path(job_id)), _progress(job_id))
        _set(job_id, status="done", stage="done", progress=100,
             durationMin=result["duration_min"], faithfulness=result["faithfulness"])
    except Exception:
        last = (traceback.format_exc().strip().splitlines() or ["error"])[-1]
        logger.exception("narration job %s failed", job_id)
        _set(job_id, status="error", error=last)


def start_job(file_name, title=""):
    job_id = uuid.uuid4().hex[:12]
    job = {"id": job_id, "title": title or "", "status": "queued",
           "stage": "queued", "progress": 0}
    with _lock:
        _jobs[job_id] = job
        _persist(job)
    _executor.submit(_run, job_id, file_name)
    return job_id


def get_job(job_id):
    with _lock:
        job = _jobs.get(job_id)
    if job is None:
        path = JOBS_DIR / f"{job_id}.json"
        if not path.exists():
            return None
        job = json.loads(path.read_text())
    return {k: job.get(k) for k in _PUBLIC_FIELDS}


def recover_stale():
    """Mark jobs interrupted by a restart as failed (the in-process worker is gone)."""
    for f in JOBS_DIR.glob("*.json"):
        try:
            job = json.loads(f.read_text())
        except Exception:
            continue
        if job.get("status") in ("queued", "running"):
            job["status"] = "error"
            job["error"] = "interrupted by restart"
            f.write_text(json.dumps(job))
