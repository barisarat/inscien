"""The bundle: one self-contained directory per paper.

    bundles/<slug>/
      meta.json        title, duration, words, voice, speed, profile, mode, model
      document.jsonl   every structure block, typed, drop flags included
      narration.jsonl  the nodes actually rendered
      cues.json        sentence cues
      audio.mp3
      anchors.json, pages/   the source pane: per-sentence rects and page images

The intermediates are kept on purpose. They are what makes a bad narration diagnosable
without re-running the pipeline, and they are the input to the conversion sprint.

The app's listen view reads these files from `/b/<slug>/`; a bundle is a plain directory that
can be copied between machines.
"""

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .tts import (SAMPLE_RATE, room_tone, to_pcm16, trim_edges, fade_edges, open_encoder,
                  widen_sentence_gaps)

META = "meta.json"
AUDIO = "audio.mp3"


def track_audio(voice, primary):
    """audio.mp3 for the first voice, audio-<voice>.mp3 for the rest.

    The first voice keeps the plain name so a one-voice bundle is byte-for-byte the shape it
    always was - the phone URL, the LAN run and every bundle built before this all still
    point at audio.mp3.
    """
    return AUDIO if voice == primary else f"audio-{voice}.mp3"


def track_cues(voice, primary):
    return CUES if voice == primary else f"cues-{voice}.json"
CUES = "cues.json"
DOCUMENT = "document.jsonl"
NARRATION = "narration.jsonl"
PROGRESS = ".progress.json"


def slugify(text, maxlen=60):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return (text[:maxlen].strip("-") or "paper")


def document_title(blocks, fallback):
    """The largest type on page one that survived classification - papers set the title in
    the biggest font on the page, which is more reliable than PDF metadata."""
    first_page = [b for b in blocks if b.get("page") == 1 and len(b["text"]) > 8]
    if not first_page:
        return fallback
    biggest = max(first_page, key=lambda b: b["size"])
    title = " ".join(biggest["text"].split())
    return title[:200] if len(title) > 8 else fallback


# --------------------------------------------------------------------------------------
# Synthesis
# --------------------------------------------------------------------------------------

def sentence_spans(start, end, sentences, boundaries, n_samples):
    """Absolute (start, end) per sentence inside one unit.

    A boundary that was measured in the audio is used as it stands; one that could not be
    matched is interpolated by character share BETWEEN the neighbouring measured boundaries,
    so an unmatched boundary costs a little accuracy locally instead of shifting the whole
    paragraph the way whole-node interpolation did.
    """
    if len(sentences) < 2:
        return [(start, end)]
    duration = end - start
    lengths = [len(s) for s in sentences]
    at_char, running = [], 0
    for length in lengths[:-1]:
        running += length
        at_char.append(running)
    total_chars = running + lengths[-1] or 1

    # (character position, time) anchors: the unit's own edges always count as measured.
    anchors = [(0, start)]
    for index, boundary in enumerate(boundaries or []):
        if boundary is not None and n_samples > 0:
            anchors.append((at_char[index], start + duration * boundary / n_samples))
    anchors.append((total_chars, end))

    times, cursor = [], 0
    for index, chars in enumerate(at_char):
        while anchors[cursor + 1][0] < chars:
            cursor += 1
        left_chars, left_time = anchors[cursor]
        right_chars, right_time = anchors[cursor + 1]
        if chars == left_chars:
            times.append(left_time)
        else:
            share = (chars - left_chars) / max(1, right_chars - left_chars)
            times.append(left_time + (right_time - left_time) * share)

    edges = [start] + times + [end]
    return [(edges[i], edges[i + 1]) for i in range(len(sentences))]


def synthesize(units, backend, out_path, room_level=0.0005, bitrate="96k",
               progress=None, seed=11, stats=None):
    """Render units to an mp3. Returns (duration_seconds, spans, sent_spans).

    `spans` maps a unit index to its (start, end) in the finished audio, which is what makes
    the read-along cues exact at paragraph boundaries rather than estimated. `sent_spans`
    does the same one level down, per sentence inside a unit, for the units whose plan asked
    for sentence gaps.

    A unit's `gap_before` is collapsed with the previous unit's `gap_after` into one silence,
    so a long pause next to a long pause does not stack into a dead spot. Gaps INSIDE a unit
    are a different mechanism - see tts.widen_sentence_gaps.
    """
    rng = np.random.default_rng(seed)
    encoder = open_encoder(out_path, bitrate)
    position = 0.0
    spans, sent_spans = {}, {}
    pending_gap = 0
    counted = stats if stats is not None else {}
    counted.setdefault("boundaries", 0)
    counted.setdefault("widened", 0)

    try:
        for i, unit in enumerate(units):
            gap = max(pending_gap, unit.get("gap_before", 0))
            if gap > 0:
                encoder.stdin.write(to_pcm16(room_tone(gap, room_level, rng)))
                position += gap / 1000.0

            samples = backend.synth(unit["text"], speed=unit.get("speed"))
            pending_gap = unit.get("gap_after", 0)
            if samples is None or len(samples) == 0:
                continue
            samples = fade_edges(trim_edges(np.asarray(samples, dtype=np.float32).reshape(-1)))

            sentences = unit.get("sentences") or []
            gaps = unit.get("sentence_gaps") or []
            boundaries = []
            if gaps:
                samples, boundaries = widen_sentence_gaps(samples, sentences, gaps,
                                                          room_level, rng)
                counted["boundaries"] += len(gaps)
                counted["widened"] += sum(1 for b in boundaries if b is not None)

            start = position
            encoder.stdin.write(to_pcm16(samples))
            position += len(samples) / SAMPLE_RATE
            spans[i] = (start, position)
            if sentences:
                sent_spans[i] = sentence_spans(start, position, sentences, boundaries,
                                               len(samples))

            if progress:
                progress(i + 1, len(units), position)

        if pending_gap:
            encoder.stdin.write(to_pcm16(room_tone(pending_gap, room_level, rng)))
            position += pending_gap / 1000.0
    finally:
        try:
            encoder.stdin.close()
        except Exception:
            pass
        encoder.wait()

    return position, spans, sent_spans


# --------------------------------------------------------------------------------------
# Write / read
# --------------------------------------------------------------------------------------

def write(directory, meta, blocks_records, nodes, cue_list):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    _write_jsonl(directory / DOCUMENT, blocks_records)
    _write_jsonl(directory / NARRATION, nodes)
    (directory / CUES).write_text(json.dumps(cue_list), encoding="utf-8")
    (directory / META).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return directory


def _write_jsonl(path, records):
    with open(path, "w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record) + "\n")


def make_meta(*, slug, title, source, duration_s, words, sections, voice, speed, profile,
              mode, model=None, backend=None, device=None, sentence_gap=None,
              pauses=None, voices=None, durations=None):
    return {
        "slug": slug,
        "title": title,
        "source": str(source),
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "duration_s": round(duration_s, 1),
        "words": words,
        "sections": sections,
        "voice": voice,
        # Every voice in the bundle, primary first, with its own duration - the same words
        # take a different length of time in a different voice.
        "voices": voices or [voice],
        "durations": durations or [round(duration_s, 1)],
        "speed": speed,
        "profile": profile,
        "mode": mode,
        "model": model,
        "backend": backend,
        "device": device,
        # What the sentence pauses were asked for and how many the audio pass could place -
        # without these two, two builds of the same paper cannot be told apart a week later,
        # which is exactly when they are compared by ear.
        "sentence_gap": sentence_gap,
        "pauses": pauses,
    }


def list_bundles(root):
    """Every readable bundle under `root`, newest first. Unreadable dirs are skipped rather
    than failing the index - a half-written bundle should not take the library down."""
    root = Path(root)
    found = []
    if not root.is_dir():
        return found
    for directory in sorted(root.iterdir()):
        meta_path = directory / META
        if not meta_path.is_file():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        meta["has_audio"] = (directory / AUDIO).is_file()
        found.append(meta)
    return sorted(found, key=lambda m: m.get("created", ""), reverse=True)


def read_progress(root):
    path = Path(root) / PROGRESS
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_progress(root, slug, position):
    """Atomic tmp+replace so an interrupted write cannot corrupt the whole library's state."""
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    data = read_progress(root)
    previous = data.get(slug) or {}
    position = round(float(position), 2)
    # furthest is a high-water mark: position is where you stopped, furthest is how far you
    # ever got, so a stray write from a confused client stays recoverable.
    data[slug] = {"position": position,
                  "furthest": max(position, float(previous.get("furthest") or 0)),
                  "updated": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    # A hand-set finished flag survives playback writes; it is a separate decision.
    if "finished" in previous:
        data[slug]["finished"] = previous["finished"]
    _write_progress_file(root, data)
    return data[slug]


def write_finished(root, slug, finished):
    """Mark a paper finished or not by hand, independent of where playback stopped.

    Absent, the library infers finished from position (98% of the duration). Present,
    the flag wins both ways: True shelves a paper heard elsewhere, False reopens one
    the position says is done. Playback writes keep it (write_progress above)."""
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    data = read_progress(root)
    entry = dict(data.get(slug) or {})
    entry["finished"] = bool(finished)
    entry["updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    data[slug] = entry
    _write_progress_file(root, data)
    return entry


def _write_progress_file(root, data):
    tmp = root / (PROGRESS + ".tmp")
    tmp.write_text(json.dumps(data, indent=1), encoding="utf-8")
    tmp.replace(root / PROGRESS)
    return data[slug]
