"""Kokoro TTS weights — presence check + a download job with progress.

The desktop build does NOT bundle the Kokoro weights (they'd push the installer to ~1.5GB) — the
user downloads them once, with a visible progress bar, before the first narration. They land in the
writable data dir and the TTS engine reads them from there. Docker still bakes them into the image
(`KOKORO_MODEL_PATH`/`KOKORO_VOICES_PATH` env), so `model_present()` is true there and this is a no-op.
"""

import logging
import os
from pathlib import Path

import requests

from core.paths import data_path
from services.job_runner import JobRunner

logger = logging.getLogger(__name__)

KOKORO_DIR = Path(os.getenv("KOKORO_DIR") or data_path("kokoro"))
_BASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
FILES = (
    ("kokoro-v1.0.onnx", f"{_BASE}/kokoro-v1.0.onnx"),
    ("voices-v1.0.bin", f"{_BASE}/voices-v1.0.bin"),
)


def model_path() -> Path:
    return Path(os.getenv("KOKORO_MODEL_PATH") or (KOKORO_DIR / "kokoro-v1.0.onnx"))


def voices_path() -> Path:
    return Path(os.getenv("KOKORO_VOICES_PATH") or (KOKORO_DIR / "voices-v1.0.bin"))


def model_present() -> bool:
    return all(p.exists() and p.stat().st_size > 0 for p in (model_path(), voices_path()))


def _download(progress):
    """Stream both weight files to KOKORO_DIR, reporting a real byte-percentage across both."""
    KOKORO_DIR.mkdir(parents=True, exist_ok=True)

    # Sizes up front (HEAD) so the bar is a true percentage of the whole download.
    sizes = []
    for _name, url in FILES:
        try:
            h = requests.head(url, allow_redirects=True, timeout=20)
            sizes.append(int(h.headers.get("Content-Length") or 0))
        except Exception:
            sizes.append(0)
    total = sum(sizes)

    done = 0
    for (name, url), size in zip(FILES, sizes):
        dest = KOKORO_DIR / name
        if dest.exists() and dest.stat().st_size > 0:
            done += size
            continue
        tmp = dest.with_name(dest.name + ".part")
        with requests.get(url, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    if not chunk:
                        continue
                    f.write(chunk)
                    done += len(chunk)
                    pct = int(done / total * 100) if total else 0
                    progress("downloading", min(99, pct), f"{name} · {done >> 20} MB")
        tmp.replace(dest)

    progress("done", 100, "ready")
    return {"present": True}


_PUBLIC_FIELDS = ("id", "status", "stage", "progress", "detail", "error", "result")
_runner = JobRunner("narrate_model", data_path("narrate_model_jobs"), _PUBLIC_FIELDS)


def start_download() -> str:
    return _runner.start(lambda _job_id, progress: _download(progress))


def get_download(job_id):
    return _runner.get(job_id)


def recover_stale():
    _runner.recover_stale()


def clear_jobs():
    _runner.clear()
