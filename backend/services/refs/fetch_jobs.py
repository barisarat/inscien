"""Background-job runner for the OpenAlex reference fetch (`/graph` confirm step) - a thin
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


def start_prefetch_job(item_keys):
    """Whole-library prefetch: references then citers under the single worker, so any later
    selection's map renders instantly from cache. Both fetchers skip already-mapped items, so
    re-running on each load is cheap. Progress runs 0-50% (references) then 50-100% (cited-by)."""
    def _run(_jid, progress):
        def _phase(lo, hi):
            span = hi - lo
            return lambda stage, pct, detail="", **extra: progress(
                stage, lo + int(span * (pct or 0) / 100), detail, **extra
            )
        refs = fetch_items(item_keys, _phase(0, 50))
        citing = fetch_citing_items(item_keys, _phase(50, 100))
        return {"result": {"references": refs, "citing": citing}}

    return _runner.start(_run, extra={"kind": "prefetch"})


def active_prefetch_id():
    """The id of a currently queued/running whole-library prefetch, or None. Used to dedupe
    repeat clicks and to resume the progress UI on reload."""
    ids = _runner.active_ids("prefetch")
    return ids[0] if ids else None


def get_job(job_id):
    return _runner.get(job_id)


def recover_stale():
    _runner.recover_stale()


def clear_jobs():
    _runner.clear()
