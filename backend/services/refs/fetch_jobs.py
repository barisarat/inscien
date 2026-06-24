"""Background-job runner for the OpenAlex reference fetch (`/graph` confirm step) — a thin
wrapper over the shared `JobRunner` (`services/job_runner.py`). Single-worker, so it's
polite to OpenAlex (one batch at a time).
"""

import os

from core.paths import data_path
from services.job_runner import JobRunner
from services.refs.refstore import fetch_citing_items, fetch_items

_PUBLIC_FIELDS = ("id", "status", "stage", "progress", "detail", "error", "result")
_runner = JobRunner(
    "graph_fetch",
    os.getenv("GRAPH_FETCH_JOBS_DIR") or data_path("graph_fetch_jobs"),
    _PUBLIC_FIELDS,
)


def start_job(item_keys):
    return _runner.start(lambda _jid, progress: {"result": fetch_items(item_keys, progress)})


def start_citing_job(item_keys):
    return _runner.start(lambda _jid, progress: {"result": fetch_citing_items(item_keys, progress)})


def get_job(job_id):
    return _runner.get(job_id)


def recover_stale():
    _runner.recover_stale()


def clear_jobs():
    _runner.clear()
