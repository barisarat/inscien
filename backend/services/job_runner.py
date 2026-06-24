"""Shared in-process background-job runner for the app's background jobs (narration, the
voice-model download, OpenAlex reference fetches, and Zotero indexing).

Each is IO/LLM-bound, so it uses the same pattern: a single-worker (serialized) executor,
job state persisted to a volume so the UI can poll across reloads, and stale
`queued`/`running` jobs failed on startup (an in-process worker doesn't survive a restart).
This class is that pattern, parameterized by the job's jobs dir + public-field projection;
each job module is a thin wrapper over an instance.
"""

import json
import logging
import os
import threading
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from services.state_guard import DerivedStateReset, claim_generation, ensure_current_generation

# Cap completed (done/error) job files kept per jobs dir, newest-first. Bounds disk growth and
# the narration registry's per-request dir scan; queued/running jobs are never pruned.
JOB_RETENTION_MAX = int(os.getenv("JOB_RETENTION_MAX", "200"))


class JobRunner:
    def __init__(self, name, jobs_dir, public_fields):
        self.name = name
        self.public_fields = tuple(public_fields)
        self._dir = Path(jobs_dir)
        self._dir.mkdir(parents=True, exist_ok=True)
        self._executor = ThreadPoolExecutor(max_workers=1)  # one job at a time
        self._jobs = {}
        self._lock = threading.Lock()
        self._log = logging.getLogger(f"jobs.{name}")

    # --- persistence -------------------------------------------------------
    def _persist(self, job):
        (self._dir / f"{job['id']}.json").write_text(json.dumps(job), encoding="utf-8")

    def _set(self, job_id, **fields):
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.update(fields)
            self._persist(job)

    def _progress(self, job_id, generation):
        # A progress update never flips the job to its terminal "done" status - even when a
        # pipeline reports stage="done" as its last step. The "done" transition is owned
        # solely by `_run` *after* `work` returns, so a poller can't observe status="done"
        # before the result dict has been merged into the job.
        def cb(stage, percent, detail="", **extra):
            ensure_current_generation(generation)
            self._set(job_id, stage=stage, progress=percent, detail=detail, status="running", **extra)
        return cb

    # --- lifecycle ---------------------------------------------------------
    def _run(self, job_id, work):
        with self._lock:
            if job_id not in self._jobs:
                return
        try:
            generation = claim_generation()
            self._set(job_id, status="running", stage="queued", progress=0)
            done_fields = work(job_id, self._progress(job_id, generation)) or {}
            ensure_current_generation(generation)
            self._set(job_id, status="done", stage="done", progress=100, **done_fields)
        except DerivedStateReset as exc:
            self._log.info("%s job %s cancelled by reset", self.name, job_id)
            self._set(job_id, status="error", error=str(exc))
        except Exception:
            last = (traceback.format_exc().strip().splitlines() or ["error"])[-1]
            self._log.exception("%s job %s failed", self.name, job_id)
            self._set(job_id, status="error", error=last)
        finally:
            # Job is terminal and fully persisted; drop it from memory so the dict only holds
            # in-flight jobs. `get` falls back to the persisted file, so pollers and the
            # narration registry (which globs disk) are unaffected.
            with self._lock:
                self._jobs.pop(job_id, None)
                # Bound the dir as jobs complete, not only on restart.
                self._prune_completed()

    def start(self, work, extra=None):
        """Queue `work(job_id, progress_cb) -> dict|None`; the returned dict is merged into
        the job on success. `extra` seeds extra fields on the job record (e.g. title/docId)."""
        job_id = uuid.uuid4().hex[:12]
        job = {"id": job_id, "status": "queued", "stage": "queued", "progress": 0, **(extra or {})}
        with self._lock:
            self._jobs[job_id] = job
            self._persist(job)
        self._executor.submit(self._run, job_id, work)
        return job_id

    def get(self, job_id):
        with self._lock:
            job = self._jobs.get(job_id)
        if job is None:
            path = self._dir / f"{job_id}.json"
            if not path.exists():
                return None
            try:
                job = json.loads(path.read_text())
            except (ValueError, OSError):
                return None
        return {k: job.get(k) for k in self.public_fields}

    def _prune_completed(self):
        """Keep only the newest JOB_RETENTION_MAX terminal (done/error) job files; delete the
        rest. Queued/running files are always kept. Best-effort; caller holds self._lock."""
        files = list(self._dir.glob("*.json"))
        if len(files) <= JOB_RETENTION_MAX:
            return
        terminal = []
        for f in files:
            try:
                status = json.loads(f.read_text()).get("status")
            except (ValueError, OSError):
                continue
            if status in ("done", "error"):
                try:
                    terminal.append((f.stat().st_mtime, f))
                except OSError:
                    continue
        terminal.sort(reverse=True)  # newest first
        for _mtime, f in terminal[JOB_RETENTION_MAX:]:
            try:
                f.unlink()
            except OSError:
                self._log.warning("prune: could not delete %s", f)

    def recover_stale(self):
        """Mark jobs interrupted by a restart as failed (the in-process worker is gone)."""
        with self._lock:
            for f in self._dir.glob("*.json"):
                try:
                    job = json.loads(f.read_text())
                except (ValueError, OSError):
                    continue
                if job.get("status") in ("queued", "running"):
                    job["status"] = "error"
                    job["error"] = "interrupted by restart"
                    f.write_text(json.dumps(job))
            # Bound accumulated completed-job files on every startup.
            self._prune_completed()

    def clear(self):
        """Delete all persisted job files (used by the corpus reset). Best-effort."""
        with self._lock:
            self._jobs.clear()
            for f in self._dir.glob("*.json"):
                try:
                    f.unlink()
                except OSError:
                    self._log.warning("clear: could not delete %s", f)
