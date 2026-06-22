"""Background-job runner for `/write` (the agentic literature-review pipeline) — a thin
wrapper over the shared `JobRunner` (`services/job_runner.py`). LLM-only, runs in the
lean backend.
"""

import os

from services.job_runner import JobRunner
from services.writeup.pipeline import run_writeup

_PUBLIC_FIELDS = ("id", "status", "stage", "progress", "detail", "error", "result")
_runner = JobRunner(
    "writeup",
    os.getenv("WRITEUP_JOBS_DIR", "/workspace/data/writeup_jobs"),
    _PUBLIC_FIELDS,
)


def start_job(topic, doc_ids, dimensions):
    return _runner.start(lambda _jid, progress: {"result": run_writeup(topic, doc_ids, dimensions, progress)})


def get_job(job_id):
    return _runner.get(job_id)


def recover_stale():
    _runner.recover_stale()


def clear_jobs():
    _runner.clear()
