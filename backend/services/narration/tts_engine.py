"""Text-to-speech synthesis via Kokoro (ONNX, CPU).

Kokoro is a small Apache-2.0 voice model that runs fast on CPU through onnxruntime — the
same runtime fastembed already uses — so narration needs no GPU and no torch. The model
weights (`kokoro-*.onnx` + `voices-*.bin`) are baked into the backend image, so synthesis
works fully offline. This replaces the old XTTS (GPU + non-commercial license) engine.
"""

import os
import re

import numpy as np
from pydub import AudioSegment

from services.state_guard import DERIVED_STATE_LOCK, current_generation, ensure_current_generation

MODEL_PATH = os.getenv("KOKORO_MODEL_PATH", "/opt/kokoro/kokoro-v1.0.onnx")
VOICES_PATH = os.getenv("KOKORO_VOICES_PATH", "/opt/kokoro/voices-v1.0.bin")
VOICE = os.getenv("KOKORO_VOICE", "af_heart")
LANG = os.getenv("KOKORO_LANG", "en-us")

TTS_MAX_CHARS = 400  # Kokoro has no hard char cap; chunking just keeps progress granular.
SILENCE_MS = 200
BITRATE = "192k"

# Lazily-loaded model, kept warm for the process (loading the ONNX graph isn't free).
_kokoro = None


def _get_kokoro():
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro
        _kokoro = Kokoro(MODEL_PATH, VOICES_PATH)
    return _kokoro


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


def synthesize(script, out_path, progress):
    """Synthesize the script to an mp3 at out_path; return its duration in minutes."""
    generation = current_generation()
    kokoro = _get_kokoro()
    chunks = split_into_chunks(script)
    total = len(chunks)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    silence = AudioSegment.silent(duration=SILENCE_MS)
    full = AudioSegment.empty()

    for i, chunk in enumerate(chunks):
        samples, sample_rate = kokoro.create(chunk, voice=VOICE, speed=1.0, lang=LANG)
        full += _to_segment(samples, sample_rate) + silence
        progress("synthesizing", 55 + int(44 * (i + 1) / max(total, 1)),
                 f"synthesizing ({i + 1}/{total})")

    with DERIVED_STATE_LOCK:
        ensure_current_generation(generation)
        full.export(out_path, format="mp3", bitrate=BITRATE)
    return round(len(full) / 1000.0 / 60.0, 2)
