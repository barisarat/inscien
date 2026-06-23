"""Background-job runner for `/verify` — a thin wrapper over the shared `JobRunner`
(`services/job_runner.py`), like the compare/write job modules. Verify is LLM-only (Ollama
or OpenAI + Qdrant, all reachable from the backend), so its job runs here.
"""

import os

from services.job_runner import JobRunner
from services.verify.pipeline import run_verify

_PUBLIC_FIELDS = ("id", "status", "stage", "progress", "detail", "error", "result")
_runner = JobRunner(
    "verify",
    os.getenv("VERIFY_JOBS_DIR", "/workspace/data/verify_jobs"),
    _PUBLIC_FIELDS,
)


def start_job(claim, doc_ids):
    return _runner.start(lambda _jid, progress: {"result": run_verify(claim, doc_ids, progress)})


def get_job(job_id):
    return _runner.get(job_id)


def recover_stale():
    _runner.recover_stale()


def clear_jobs():
    _runner.clear()
