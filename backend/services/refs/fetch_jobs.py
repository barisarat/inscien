"""Background-job runner for the OpenAlex reference fetch.

Fetching references for a selection hits OpenAlex once per paper plus a batched resolve,
so it can run for several seconds — too long to block a request on a large selection. Same
single-worker, persisted-state pattern as `services/compare/jobs.py`: kick it off, return a
job id, poll for status/progress. An in-process worker doesn't survive a restart, so stale
running jobs are failed on startup.
"""

import json
import logging
import os
import threading
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from services.refs.refstore import fetch_items

logger = logging.getLogger(__name__)

JOBS_DIR = Path(os.getenv("GRAPH_FETCH_JOBS_DIR", "/workspace/data/graph_fetch_jobs"))
JOBS_DIR.mkdir(parents=True, exist_ok=True)

_executor = ThreadPoolExecutor(max_workers=1)  # one fetch at a time (polite to OpenAlex)
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
        result = fetch_items(item_keys, _progress(job_id))
        _set(job_id, status="done", stage="done", progress=100, result=result)
    except Exception:
        last = (traceback.format_exc().strip().splitlines() or ["error"])[-1]
        logger.exception("graph fetch job %s failed", job_id)
        _set(job_id, status="error", error=last)


def start_job(item_keys):
    job_id = uuid.uuid4().hex[:12]
    job = {"id": job_id, "status": "queued", "stage": "queued", "progress": 0}
    with _lock:
        _jobs[job_id] = job
        _persist(job)
    _executor.submit(_run, job_id, item_keys)
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
