"""Background-job runner for `/narrate` - a thin wrapper over the shared `JobRunner`
(`services/job_runner.py`), plus narration-specific helpers (audio path + the done/active
registries the library uses to show > / re-attach to an in-progress narration).

Narration is LLM + CPU-TTS only (Ollama for the script, Kokoro for audio), both in-process,
so there is no separate GPU tts container.
"""

import json
import os
from pathlib import Path

from core.paths import data_path
from services.job_runner import JobRunner
from services.narration.pipeline import run_narration

JOBS_DIR = Path(os.getenv("NARRATION_JOBS_DIR") or data_path("narration_jobs"))
AUDIO_DIR = JOBS_DIR / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

_PUBLIC_FIELDS = ("id", "title", "status", "stage", "progress", "detail", "error",
                  "durationMin", "faithfulness", "docId")
_runner = JobRunner("narration", JOBS_DIR, _PUBLIC_FIELDS)


def audio_path(job_id):
    return AUDIO_DIR / f"{job_id}.mp3"


def start_job(file_name, title="", doc_id=None):
    def work(job_id, progress):
        result = run_narration(file_name, str(audio_path(job_id)), progress)
        return {"durationMin": result["duration_min"], "faithfulness": result["faithfulness"]}
    return _runner.start(work, extra={"title": title or "", "docId": doc_id})


def get_job(job_id):
    return _runner.get(job_id)


def recover_stale():
    _runner.recover_stale()


def clear_jobs():
    """Clear job files (shared runner) plus the generated mp3s."""
    _runner.clear()
    for f in AUDIO_DIR.glob("*.mp3"):
        try:
            f.unlink()
        except OSError:
            pass


def list_narrations():
    """Registry of completed narrations, newest per paper: [{docId, jobId, title}].
    Scanned from the persisted job files (jobs carry their docId), so it survives restarts.
    The scan is O(files), but the shared JobRunner caps each jobs dir at JOB_RETENTION_MAX,
    so this stays cheap without a separate cache to invalidate."""
    out = {}
    for f in JOBS_DIR.glob("*.json"):
        try:
            job = json.loads(f.read_text())
        except Exception:
            continue
        doc_id = job.get("docId")
        if job.get("status") != "done" or not doc_id:
            continue
        mtime = f.stat().st_mtime
        prev = out.get(doc_id)
        if prev is None or mtime > prev[0]:
            out[doc_id] = (mtime, {"docId": doc_id, "jobId": job["id"], "title": job.get("title", "")})
    return [v[1] for v in out.values()]


def active_narration(doc_id):
    """The newest queued/running narration job for a paper (public shape), or None.
    Lets the UI re-attach to an in-progress narration after navigating away and back."""
    if not doc_id:
        return None
    best = None
    for f in JOBS_DIR.glob("*.json"):
        try:
            job = json.loads(f.read_text())
        except Exception:
            continue
        if job.get("docId") != doc_id or job.get("status") not in ("queued", "running"):
            continue
        mtime = f.stat().st_mtime
        if best is None or mtime > best[0]:
            best = (mtime, job)
    if best is None:
        return None
    return {k: best[1].get(k) for k in _PUBLIC_FIELDS}
