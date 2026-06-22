"""Background-job runner for `/compare` — a thin wrapper over the shared `JobRunner`
(`services/job_runner.py`). `/compare` is LLM-only (Ollama + Qdrant, both reachable from
the backend), so its long-running job runs here in the lean backend.
"""

import os

from services.compare.pipeline import run_compare
from services.job_runner import JobRunner

_PUBLIC_FIELDS = ("id", "status", "stage", "progress", "detail", "error", "result")
_runner = JobRunner(
    "compare",
    os.getenv("COMPARE_JOBS_DIR", "/workspace/data/compare_jobs"),
    _PUBLIC_FIELDS,
)


def start_job(doc_ids, dimensions):
    return _runner.start(lambda _jid, progress: {"result": run_compare(doc_ids, dimensions, progress)})


def get_job(job_id):
    return _runner.get(job_id)


def recover_stale():
    _runner.recover_stale()


def clear_jobs():
    _runner.clear()
