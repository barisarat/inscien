"""Background-job runner for Zotero indexing.

Indexing a selection (parse + embed + upsert) can take a while for a big collection, so
it runs off-request on a single-worker in-process executor, with state persisted to a
volume so the UI can poll across reloads. Mirrors `services/compare/jobs.py` exactly; an
in-process worker doesn't survive a restart, so stale running jobs are failed on startup.
"""

import json
import logging
import os
import threading
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from services.zotero.ingest import index_items

logger = logging.getLogger(__name__)

JOBS_DIR = Path(os.getenv("ZOTERO_JOBS_DIR", "/workspace/data/zotero_jobs"))
JOBS_DIR.mkdir(parents=True, exist_ok=True)

_executor = ThreadPoolExecutor(max_workers=1)  # one indexing run at a time
_jobs = {}
_lock = threading.Lock()

_PUBLIC_FIELDS = ("id", "status", "stage", "progress", "detail", "error", "result")


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


def _run(job_id, item_keys):
    _set(job_id, status="running", stage="queued", progress=0)
    try:
        result = index_items(item_keys, _progress(job_id))
        _set(job_id, status="done", stage="done", progress=100, result=result)
    except Exception:
        last = (traceback.format_exc().strip().splitlines() or ["error"])[-1]
        logger.exception("zotero index job %s failed", job_id)
        _set(job_id, status="error", error=last)


def start_job(item_keys):
    job_id = uuid.uuid4().hex[:12]
    job = {"id": job_id, "status": "queued", "stage": "queued", "progress": 0}
    with _lock:
        _jobs[job_id] = job
        _persist(job)
    _executor.submit(_run, job_id, list(item_keys))
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
