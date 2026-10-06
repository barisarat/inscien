"""The one background job: building a paper into the library, or narrating it.

The job runs the `inscien build` or `inscien narrate` command as a subprocess of this server
(`python -m inscien ...`), so a crash in a long synthesis cannot take the server down and Cancel
can kill it cleanly. ONE job at a time: a second start while one runs is refused, and the UI says
to wait. The state is one record, the current or last job, kept in the data dir so a reload sees
it; a job that was running when the server stopped is marked failed on the next start.

Progress comes from the command's own output: a line `==> 2/3 slice the text` starts a step,
and `[  12/340]` (the synthesis counter) sets its percent. Deliberately simple: no queue, no
history, no resume.
"""

import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

from inscien.core.paths import data_path, import_dir, narration_queue_dir

STATE_FILE = Path(data_path("host_job.json"))
LOG_LINES = 12
_STEP = re.compile(r"^==> (\d+)/(\d+) (.+)$")
_PROGRESS = re.compile(r"\[\s*(\d+)/(\d+)\]")

_lock = threading.Lock()
_job: dict | None = None
_proc: subprocess.Popen | None = None


class Busy(Exception):
    """A job is already running."""


def _save() -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(_job), encoding="utf-8")
    tmp.replace(STATE_FILE)


def _update(**fields) -> None:
    with _lock:
        if _job is None:
            return
        _job.update(fields)
        _save()


def _log(line: str) -> None:
    line = line.rstrip()
    if not line:
        return
    with _lock:
        if _job is None:
            return
        step = _STEP.match(line)
        if step:
            _job.update(step=int(step.group(1)), steps=int(step.group(2)), stepLabel=step.group(3),
                        percent=None)
        _job["log"] = (_job.get("log") or [])[-(LOG_LINES - 1):] + [line[:300]]
        m = _PROGRESS.search(line)
        if m and int(m.group(2)):
            _job["percent"] = int(int(m.group(1)) * 100 / int(m.group(2)))
        _save()


def current() -> dict | None:
    """The current or last job, or None if there has never been one."""
    with _lock:
        return dict(_job) if _job else None


def recover() -> None:
    """At startup: load the last job; one left running by a stopped server becomes failed."""
    global _job
    try:
        job = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return
    if job.get("status") == "running":
        job.update(status="failed", error="interrupted by a server restart")
    with _lock:
        _job = job
        _save()


def _run(argv: list) -> None:
    global _proc
    _log(f"$ inscien {' '.join(argv[3:])}")
    try:
        # Unbuffered, so the command's lines arrive as they are printed, not at exit.
        proc = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                start_new_session=True, env={**os.environ, "PYTHONUNBUFFERED": "1"})
    except OSError as exc:
        _update(status="failed", error=str(exc))
        return
    with _lock:
        _proc = proc
    buf = b""
    while True:
        chunk = proc.stdout.read1(4096)
        if not chunk:
            break
        buf += chunk
        # The synthesis counter redraws itself with \r, so split on both.
        *lines, buf = re.split(rb"[\r\n]", buf)
        for raw in lines:
            _log(raw.decode("utf-8", "replace"))
    _log(buf.decode("utf-8", "replace"))
    code = proc.wait()
    with _lock:
        _proc = None
    if current().get("status") != "running":
        return  # cancelled
    if code != 0:
        last = next((l for l in reversed(current().get("log") or []) if l.startswith("error:")), None)
        _update(status="failed", error=last or f"exited with code {code}")
        return
    _update(status="done", percent=100, finished=time.time())


def _start(kind: str, title: str, args: list, steps: int) -> dict:
    global _job
    with _lock:
        if _job and _job.get("status") == "running":
            raise Busy()
        _job = {"id": uuid.uuid4().hex[:12], "kind": kind, "title": title, "status": "running",
                "step": 0, "steps": steps, "stepLabel": "starting", "percent": None, "log": [],
                "error": None, "started": time.time()}
        _save()
        job = dict(_job)
    argv = [sys.executable, "-m", "inscien", *args]
    threading.Thread(target=_run, args=(argv,), daemon=True).start()
    return job


def cancel() -> dict | None:
    with _lock:
        if not _job or _job.get("status") != "running":
            return dict(_job) if _job else None
        _job.update(status="cancelled", error="cancelled")
        _save()
        proc = _proc
    if proc and proc.poll() is None:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except OSError:
            pass
    return current()


def start_build(file_name: str, title: str) -> dict:
    """`inscien build` on a staged PDF: the library entry the Map reads."""
    return _start("build", title, ["build", str(Path(import_dir()) / file_name)], steps=3)


def start_narration(file_name: str, title: str, voice: str | None = None,
                    speed: float | None = None, slug: str | None = None) -> dict:
    """`inscien narrate` on a queued PDF: plan the slices, slice the text, synthesize."""
    args = ["narrate", str(Path(narration_queue_dir()) / file_name)]
    if voice:
        args += ["--voice", voice]
    if speed:
        args += ["--speed", f"{speed:g}"]
    if slug:
        args += ["--slug", slug]
    return _start("narrate", title, args, steps=3)
