"""Background-job runner for Zotero indexing - a thin wrapper over the shared `JobRunner`
(`services/job_runner.py`), like the other background-job modules (narration, OpenAlex fetches).

Indexing a selection (parse + embed + upsert) can take a while for a big collection, so it
runs off-request on the runner's single-worker executor, with state persisted to a volume
so the UI can poll across reloads; stale jobs are failed on startup (an in-process worker
doesn't survive a restart).
"""

import os

from core.paths import data_path
from services.job_runner import JobRunner
from services.zotero.ingest import index_items

_PUBLIC_FIELDS = ("id", "status", "stage", "progress", "detail", "error", "result")
_runner = JobRunner(
    "zotero",
    os.getenv("ZOTERO_JOBS_DIR") or data_path("zotero_jobs"),
    _PUBLIC_FIELDS,
)


def start_job(item_keys):
    keys = list(item_keys)  # materialize before handing off to the worker thread
    return _runner.start(lambda _jid, progress: {"result": index_items(keys, progress)})


def get_job(job_id):
    return _runner.get(job_id)


def recover_stale():
    _runner.recover_stale()


def clear_jobs():
    _runner.clear()
