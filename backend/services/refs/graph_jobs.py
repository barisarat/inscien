"""Background-job runner for the citation-graph build.

`build_references()` parses every paper's bibliography via the LLM, so it runs for
minutes — far too long for a synchronous request (the browser fetch times out). Same
in-process single-worker pattern as `services/compare/jobs.py`: kick it off, return a
job id, poll for status.
"""

import json
import logging
import os
import threading
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from services.refs.build import build_references

logger = logging.getLogger(__name__)

JOBS_DIR = Path(os.getenv("GRAPH_JOBS_DIR", "/workspace/data/graph_jobs"))
JOBS_DIR.mkdir(parents=True, exist_ok=True)

_executor = ThreadPoolExecutor(max_workers=1)
_jobs = {}
_lock = threading.Lock()

_PUBLIC_FIELDS = ("id", "status", "error")


def _persist(job):
    (JOBS_DIR / f"{job['id']}.json").write_text(json.dumps(job), encoding="utf-8")


def _set(job_id, **fields):
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.update(fields)
        _persist(job)


def _run(job_id):
    _set(job_id, status="running")
    try:
        build_references()
        _set(job_id, status="done")
    except Exception:
        last = (traceback.format_exc().strip().splitlines() or ["error"])[-1]
        logger.exception("graph build job %s failed", job_id)
        _set(job_id, status="error", error=last)


def start_job():
    job_id = uuid.uuid4().hex[:12]
    job = {"id": job_id, "status": "queued"}
    with _lock:
        _jobs[job_id] = job
        _persist(job)
    _executor.submit(_run, job_id)
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
    for f in JOBS_DIR.glob("*.json"):
        try:
            job = json.loads(f.read_text())
        except Exception:
            continue
        if job.get("status") in ("queued", "running"):
            job["status"] = "error"
            job["error"] = "interrupted by restart"
            f.write_text(json.dumps(job))
