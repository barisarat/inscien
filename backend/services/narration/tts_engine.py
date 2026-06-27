"""Text-to-speech synthesis via Kokoro (ONNX, CPU).

Kokoro is a small Apache-2.0 voice model that runs fast on CPU through onnxruntime - so
narration needs no GPU and no torch. The model
weights (`kokoro-*.onnx` + `voices-*.bin`) are baked into the backend image, so synthesis
works fully offline. This replaces the old XTTS (GPU + non-commercial license) engine.
"""

import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from pydub import AudioSegment

from services.state_guard import DERIVED_STATE_LOCK, current_generation, ensure_current_generation

logger = logging.getLogger(__name__)

VOICE = os.getenv("KOKORO_VOICE", "af_heart")
LANG = os.getenv("KOKORO_LANG", "en-us")

TTS_MAX_CHARS = 400  # Kokoro has no hard char cap; chunking just keeps progress granular.
SILENCE_MS = 200
BITRATE = "192k"


def _ffmpeg_exe():
    """Path to the ffmpeg to mux the mp3. Prefer the self-contained binary shipped by
    imageio-ffmpeg (bundled into the frozen desktop builds - Windows/macOS have no system
    ffmpeg), then an explicit override, then a system ffmpeg on PATH."""
    override = (os.getenv("FFMPEG_BINARY") or "").strip()
    if override:
        return override
    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        # PyInstaller's data collection can drop the exec bit on the bundled binary; restore it
        # so the subprocess call doesn't fail with Permission denied (no-op on Windows).
        if os.name == "posix" and os.path.isfile(exe) and not os.access(exe, os.X_OK):
            os.chmod(exe, os.stat(exe).st_mode | 0o111)
        return exe
    except Exception:
        return "ffmpeg"

# Lazily-loaded model, kept warm for the process (loading the ONNX graph isn't free).
_kokoro = None


def _get_kokoro():
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro
        from services.narration import model as tts_model

        _kokoro = Kokoro(str(tts_model.model_path()), str(tts_model.voices_path()))
    return _kokoro


def clean_for_speech(text):
    """Strip markdown + TTS-hostile symbols from the script so Kokoro doesn't vocalize them
    ("asterisk asterisk", "hash"). The model is *asked* for clean prose but a local model can't
    be trusted to comply, so this deterministic pass is the real guarantee."""
    # Links / images: [label](url) -> label; bare URLs dropped.
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"https?://\S+", "", text)
    # Code fences + inline code.
    text = text.replace("```", " ").replace("`", "")
    # Line-start structure: headings, blockquotes, list markers.
    text = re.sub(r"(?m)^\s{0,3}#{1,6}\s*", "", text)
    text = re.sub(r"(?m)^\s{0,3}>\s?", "", text)
    text = re.sub(r"(?m)^\s{0,3}([-*+]|\d{1,2}[.)])\s+", "", text)
    # Emphasis markers (bold/italic/strike). Underscores only when used as emphasis
    # (doubled, or wrapping a word) so intra-word snake_case survives.
    text = re.sub(r"\*+", "", text)
    text = text.replace("~~", "")
    text = re.sub(r"__([^_]+)__", r"\1", text)
    text = re.sub(r"(?<!\w)_([^_]+)_(?!\w)", r"\1", text)
    # Tables + common non-speakable glyphs.
    text = text.replace("|", " ").replace("•", ", ")
    text = text.replace("–", "-").replace("—", ", ")
    text = (text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'"))
    # Collapse leftover whitespace.
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_into_chunks(text, max_chars=TTS_MAX_CHARS):
    """<=max_chars, split on sentence then clause boundaries (ported from episode-maker).
    Keeps each synthesis call short so progress updates stay frequent."""
    text = re.sub(r"[ \t]+", " ", text.replace("\r\n", "\n"))
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    sentences = re.split(r"(?<=[\.\!\?])\s+", text.replace("\n", " "))
    chunks = []
    cur = ""
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if len(s) > max_chars:
            for p in re.split(r"(?<=[,;:])\s+", s):
                p = p.strip()
                if not p:
                    continue
                if len(cur) + len(p) + 1 <= max_chars:
                    cur = (cur + " " + p).strip()
                else:
                    if cur:
                        chunks.append(cur)
                    cur = p
            continue
        if len(cur) + len(s) + 1 <= max_chars:
            cur = (cur + " " + s).strip()
        else:
            if cur:
                chunks.append(cur)
            cur = s
    if cur:
        chunks.append(cur)
    return chunks


def _to_segment(samples, sample_rate):
    """Kokoro returns a float32 waveform in [-1, 1]; wrap it as a pydub AudioSegment
    (16-bit mono) without touching disk."""
    pcm16 = np.clip(samples * 32767.0, -32768, 32767).astype(np.int16)
    return AudioSegment(pcm16.tobytes(), frame_rate=int(sample_rate), sample_width=2, channels=1)


def _system_subprocess_env():
    """Environment for spawning a *system* binary (ffmpeg) from a possibly-frozen process.

    PyInstaller's bootloader points LD_LIBRARY_PATH (DYLD_* on macOS) at the app's bundled libs
    in sys._MEIPASS and stashes the caller's original in `<VAR>_ORIG`. A system binary that
    inherits the bundled path loads our incompatible libraries and fails - so restore the
    original path (or drop the injected one if there was none) when frozen. A no-op when running
    normally (not frozen)."""
    env = dict(os.environ)
    if getattr(sys, "frozen", False):
        for var in ("LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH", "DYLD_FRAMEWORK_PATH"):
            orig = env.get(f"{var}_ORIG")
            if orig is not None:
                env[var] = orig
            else:
                env.pop(var, None)
    return env


def _concat_to_mp3(part_paths, out_path, work_dir):
    """Concatenate WAV parts into a single mp3 via ffmpeg's concat demuxer - streams the parts
    sequentially so memory never holds the whole audio (unlike loading them all in pydub)."""
    list_path = os.path.join(work_dir, "parts.txt")
    with open(list_path, "w", encoding="utf-8") as f:
        for p in part_paths:
            # The concat demuxer needs single-quoted paths with embedded quotes escaped.
            f.write(f"file '{p.replace(chr(39), chr(39) + chr(92) + chr(39) + chr(39))}'\n")
    try:
        subprocess.run(
            [_ffmpeg_exe(), "-y", "-f", "concat", "-safe", "0", "-i", list_path,
             "-b:a", BITRATE, out_path],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
            env=_system_subprocess_env(),
        )
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or b"").decode("utf-8", "replace")[-2000:]
        logger.error("ffmpeg concat failed (%d parts): %s", len(part_paths), stderr)
        raise


def synthesize(script, out_path, progress):
    """Synthesize the script to an mp3 at out_path; return its duration in minutes.

    Streams one chunk at a time to disk (temp WAV files) and concatenates with ffmpeg, so peak
    memory is one chunk regardless of narration length."""
    generation = current_generation()
    kokoro = _get_kokoro()
    chunks = split_into_chunks(clean_for_speech(script))
    total = len(chunks)
    if not chunks:
        raise ValueError("Narration script was empty after cleaning; nothing to synthesize.")

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    work_dir = tempfile.mkdtemp(prefix="narration-", dir=os.path.dirname(out_path))
    part_paths = []
    total_ms = 0

    try:
        for i, chunk in enumerate(chunks):
            ensure_current_generation(generation)  # cancel promptly if a reset lands mid-synthesis
            samples, sample_rate = kokoro.create(chunk, voice=VOICE, speed=1.0, lang=LANG)
            seg = _to_segment(samples, sample_rate)
            # Silence at the segment's own rate so every WAV part is uniform (mono/16-bit/same
            # rate) - the ffmpeg concat demuxer requires consistent parameters across parts.
            seg = seg + AudioSegment.silent(duration=SILENCE_MS, frame_rate=seg.frame_rate)
            part = os.path.join(work_dir, f"part-{i:05d}.wav")
            seg.export(part, format="wav")
            part_paths.append(part)
            total_ms += len(seg)
            progress("synthesizing", 55 + int(44 * (i + 1) / max(total, 1)),
                     f"synthesizing ({i + 1}/{total})")

        with DERIVED_STATE_LOCK:
            ensure_current_generation(generation)
            _concat_to_mp3(part_paths, out_path, work_dir)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
    return round(total_ms / 1000.0 / 60.0, 2)
