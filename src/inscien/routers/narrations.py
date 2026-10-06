"""Serving the narrations: the bundle files, and where each listen stopped.

`/b/<slug>/<file>` serves a bundle's audio, cues, anchors, meta and page images to the listen
view. `/api/progress` is the one piece of listening state: where each listen stopped, a
high-water mark, and a hand-set finished flag, in `bundles/.progress.json`.
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from inscien.core.paths import narrations_dir
from inscien.services.library import narrations as narration_service

router = APIRouter(tags=["narrations"])

SAFE_SLUG = re.compile(r"^[A-Za-z0-9._-]+$")
PROGRESS_FILE = ".progress.json"


def _root() -> Path:
    return Path(narrations_dir())


def read_progress() -> dict:
    try:
        data = json.loads((_root() / PROGRESS_FILE).read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}
    return data if isinstance(data, dict) else {}


def _write_progress_file(data: dict) -> None:
    # Atomic tmp+replace, as tts-papers wrote it: an interrupted write cannot corrupt the whole
    # library's state. Two clients (the desk and the phone) share the file; each write is a
    # read-merge-replace of ONE slug, so the phone finishing a paper cannot roll back the desk.
    root = _root()
    root.mkdir(parents=True, exist_ok=True)
    tmp = root / (PROGRESS_FILE + ".tmp")
    tmp.write_text(json.dumps(data, indent=1), encoding="utf-8")
    tmp.replace(root / PROGRESS_FILE)


def write_position(slug: str, position: float) -> dict:
    data = read_progress()
    previous = data.get(slug) or {}
    position = round(float(position), 2)
    # furthest is a high-water mark: position is where you stopped, furthest is how far you
    # ever got, so a stray write from a confused client stays recoverable.
    entry = {
        "position": position,
        "furthest": max(position, float(previous.get("furthest") or 0)),
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    # A hand-set finished flag survives playback writes; it is a separate decision.
    if "finished" in previous:
        entry["finished"] = previous["finished"]
    data[slug] = entry
    _write_progress_file(data)
    return entry


def write_finished(slug: str, finished: bool) -> dict:
    data = read_progress()
    entry = dict(data.get(slug) or {})
    entry["finished"] = bool(finished)
    entry["updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    data[slug] = entry
    _write_progress_file(data)
    return entry


@router.get("/api/progress")
def progress():
    """Every bundle's playback state, keyed by slug - the reader reads its own entry on load."""
    return read_progress()


@router.put("/api/progress/{slug}")
async def put_progress(slug: str, request: Request):
    """Two kinds of write share the route: the reader reports {"position"}, the sidebar sets
    {"finished"} by hand. Each leaves the other field alone."""
    if not SAFE_SLUG.match(slug):
        raise HTTPException(status_code=404, detail="not found")
    try:
        payload = await request.json()
    except ValueError:
        payload = {}
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="bad request")
    if "finished" in payload:
        return write_finished(slug, bool(payload["finished"]))
    try:
        position = float(payload.get("position", 0))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="bad request") from exc
    return write_position(slug, position)


def _resolve(slug: str, name: str) -> Path | None:
    if not SAFE_SLUG.match(slug):
        return None
    base = (_root() / slug).resolve()
    if not name:
        return None
    target = (base / name).resolve()
    if base != target and base not in target.parents:
        return None
    return target if target.is_file() else None


@router.get("/b/{slug}/{name:path}")
def bundle_file(slug: str, name: str = ""):
    """One of a bundle's files. FileResponse honours Range, which is what seeking a long mp3
    needs."""
    target = _resolve(slug, name)
    if not target:
        raise HTTPException(status_code=404, detail="not found")
    # Everything that defines the TIMELINE revalidates - meta.json, cues.json, anchors.json. A
    # rebuild rewrites them under the same url, while the audio is refetched because its url
    # carries the build stamp (?v=duration_ms); a browser that kept the old cues would play the
    # new audio against them. They are small and FileResponse sends an etag, so revalidating
    # costs one 304. Audio and page images cache freely.
    revalidate = name.endswith(".json")
    headers = {"Cache-Control": "no-cache"} if revalidate else None
    return FileResponse(target, headers=headers)
