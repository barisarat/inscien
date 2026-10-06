"""Kokoro synthesis and mp3 encoding.

kokoro-onnx + onnxruntime, on the CPU by default. `--device cuda` (or INSCIEN_TTS_DEVICE=cuda)
uses the CUDA provider when onnxruntime-gpu is installed in its place: measured at 33x realtime
on an RTX 3060.

onnxruntime falls back to CPU PER NODE and does so silently, so `OnnxBackend` asserts that
the session really accepted CUDA rather than trusting that it did.

Audio is streamed unit-by-unit into ffmpeg's stdin as raw PCM: peak memory is one unit no
matter how long the paper, and there is no half-gigabyte of temporary WAV files.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

SAMPLE_RATE = 24000  # Kokoro's output rate
VOICE_DEFAULT = "af_heart"
# A build with no --voice draws one of these at random (cli.py), so the batch does not
# come out single-voiced by default. Chosen by ear on the LLMs-for-IR survey, which was
# built with all four and a picker; `inscien sample` is the cheap way to revisit.
VOICE_SHORTLIST = ("af_heart", "af_sky", "am_echo", "bm_fable")
SPEED_DEFAULT = 1.15  # ~152 wpm; Kokoro at 1.0 measures ~132, slow for a long listen

KOKORO_BASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
WEIGHT_FILES = (
    ("kokoro-v1.0.onnx", f"{KOKORO_BASE}/kokoro-v1.0.onnx"),
    ("voices-v1.0.bin", f"{KOKORO_BASE}/voices-v1.0.bin"),
)


def weights_dir():
    """Where the ~340 MB Kokoro weights live: INSCIEN_HOME/weights, downloaded on first use."""
    from ..core.paths import home_path

    return Path(home_path("weights"))


def ensure_weights(directory=None, log=print):
    """Resolve (model, voices), downloading them once with a progress line if missing."""
    import urllib.request

    directory = Path(directory) if directory else weights_dir()
    paths = []
    for name, url in WEIGHT_FILES:
        target = directory / name
        paths.append(target)
        if target.exists() and target.stat().st_size > 0:
            continue
        directory.mkdir(parents=True, exist_ok=True)
        log(f"downloading {name} (one time)")
        tmp = target.with_suffix(target.suffix + ".part")

        shown = [-1]

        # One line per 10%: the progress also lands in the job log, where a line per chunk floods it.
        def hook(count, block, total, _name=name):
            if total > 0:
                pct = min(100, int(count * block * 100 / total)) // 10 * 10
                if pct != shown[0]:
                    shown[0] = pct
                    sys.stderr.write(f"  {_name}: {pct}%\n")
                    sys.stderr.flush()

        urllib.request.urlretrieve(url, tmp, reporthook=hook)
        tmp.replace(target)
    return paths[0], paths[1]


# --------------------------------------------------------------------------------------
# Backends
# --------------------------------------------------------------------------------------

class OnnxBackend:
    name = "onnx"

    def __init__(self, device="cpu", voice=VOICE_DEFAULT, speed=SPEED_DEFAULT,
                 weights=None, log=print):
        try:
            import onnxruntime as ort
            from kokoro_onnx import Kokoro
        except ImportError as exc:
            raise RuntimeError(f"onnx backend unavailable ({exc}); pip install kokoro-onnx "
                               "onnxruntime") from exc

        # onnxruntime >=1.19 ships without CUDA/cuDNN; they come from the nvidia-*-cu12
        # wheels, which are not on the default library path. Without preloading, session
        # creation "succeeds" and everything quietly runs on the CPU.
        if device == "cuda" and hasattr(ort, "preload_dlls"):
            try:
                ort.preload_dlls()
            except Exception as exc:
                log(f"note: ort.preload_dlls() failed ({exc}); relying on system CUDA")

        model_file, voices_file = ensure_weights(weights, log=log)
        self.voice, self.speed, self.device = voice, speed, device

        wanted = (["CUDAExecutionProvider", "CPUExecutionProvider"] if device == "cuda"
                  else ["CPUExecutionProvider"])
        available = ort.get_available_providers()
        if device == "cuda" and "CUDAExecutionProvider" not in available:
            raise RuntimeError(
                f"CUDAExecutionProvider not available (onnxruntime sees {available}). "
                "Install onnxruntime-gpu in place of onnxruntime, or use --device cpu.")

        session = ort.InferenceSession(str(model_file), providers=wanted)
        got = session.get_providers()
        log(f"onnxruntime {ort.__version__}, providers: {got}")
        if device == "cuda" and "CUDAExecutionProvider" not in got:
            raise RuntimeError("session refused CUDAExecutionProvider; it would run on CPU")

        if hasattr(Kokoro, "from_session"):
            self.kokoro = Kokoro.from_session(session, str(voices_file))
        elif device == "cuda":
            raise RuntimeError("this kokoro-onnx has no Kokoro.from_session, so the CUDA "
                               "session cannot be used; upgrade it or use --device cpu")
        else:
            self.kokoro = Kokoro(str(model_file), str(voices_file))

    def synth(self, text, speed=None):
        samples, rate = self.kokoro.create(
            text, voice=self.voice, speed=speed or self.speed, lang="en-us")
        if rate != SAMPLE_RATE:
            raise RuntimeError(f"unexpected sample rate {rate}")
        return np.asarray(samples, dtype=np.float32).reshape(-1)


def get_backend(name="onnx", device="cpu", voice=VOICE_DEFAULT, speed=SPEED_DEFAULT,
                weights=None, log=print):
    return OnnxBackend(device=device, voice=voice, speed=speed, weights=weights, log=log)


# --------------------------------------------------------------------------------------
# Audio shaping
# --------------------------------------------------------------------------------------

def trim_edges(samples, threshold=0.0015, keep_ms=12):
    """Strip Kokoro's own leading/trailing padding.

    Kokoro emits 50-150ms of near-silence around each utterance and the amount varies with
    the final phoneme. Left in, every configured pause is really "pause plus an unknown
    amount" - trimming is what makes the prosody numbers mean what they say.
    """
    loud = np.nonzero(np.abs(samples) > threshold)[0]
    if loud.size == 0:
        return samples
    keep = int(SAMPLE_RATE * keep_ms / 1000)
    return samples[max(0, loud[0] - keep):min(len(samples), loud[-1] + keep)]


def fade_edges(samples, ms=12):
    """Cosine fades so a trimmed edge does not click against the silence."""
    n = min(int(SAMPLE_RATE * ms / 1000), len(samples) // 2)
    if n <= 0:
        return samples
    ramp = 0.5 * (1 - np.cos(np.linspace(0, np.pi, n)))
    out = samples.copy()
    out[:n] *= ramp
    out[-n:] *= ramp[::-1]
    return out


def room_tone(ms, level, rng):
    """Very low noise instead of digital zero.

    Absolute silence between phrases is the tell that a recording was assembled rather than
    spoken. Around -66 dBFS is inaudible as noise but stops the gaps sounding switched-off.
    """
    n = int(SAMPLE_RATE * ms / 1000)
    if n <= 0:
        return np.zeros(0, dtype=np.float32)
    if level <= 0:
        return np.zeros(n, dtype=np.float32)
    noise = rng.standard_normal(n).astype(np.float32)
    # Short moving-average lowpass so it reads as room rather than hiss. A one-pole IIR would
    # be a truer filter but needs an n-tap convolution, which is quadratic on a 1s gap.
    kernel = np.ones(64, dtype=np.float32) / 64.0
    out = np.convolve(noise, kernel, mode="same")
    peak = float(np.max(np.abs(out))) or 1.0
    return (out / peak * level).astype(np.float32)


# --------------------------------------------------------------------------------------
# Sentence pauses inside a unit
#
# Planned gaps exist only BETWEEN synthesis units, and profile `b` makes a whole paragraph
# one unit - so every full stop inside a paragraph gets only the pause Kokoro itself renders
# (roughly 150-250ms, and `speed` shortens it further). That is well under the beat a person
# leaves between sentences, and at a paragraph a time it is what makes a long narration sound
# recited rather than spoken.
#
# Splitting the paragraph into sentence units would give exact control and is what profile
# `c` does; it loses, because Kokoro restarts its intonation contour on every call. So the
# paragraph stays ONE call and the pause is widened afterwards, in the rendered audio: find
# the near-silence Kokoro already left at each boundary and pad it to the planned length.
# The declination survives, and the boundaries found this way are MEASURED sentence times,
# which is what keeps the read-along cues honest now that silence is being inserted.
# --------------------------------------------------------------------------------------

MIN_ADDED_MS = 120


def quiet_runs(samples, min_ms=40, frame_ms=10, floor_ratio=0.02):
    """[(start, end)] sample indexes of near-silent runs at least `min_ms` long.

    The threshold is relative to this utterance's own loud level (90th percentile frame RMS,
    so a single peak cannot set it), because Kokoro's output level varies with the voice and
    the sentence.

    `min_ms` was 70, chosen to sit above a stop consonant's closure (20-60ms), which is the
    only other true silence inside spoken prose. That got the trade backwards: a boundary
    Kokoro rendered tighter than 70ms was not found, so it was not padded, and those are
    exactly the transitions that sound rushed - the rule skipped its own worst cases. At 40ms
    a long closure can be picked up instead of the real boundary, which costs a pause in a
    slightly wrong place; `_match_boundaries` prefers the longest run nearest the predicted
    position, so it has to be both longer and better placed than the real stop to win.
    """
    hop = max(1, int(SAMPLE_RATE * frame_ms / 1000))
    count = len(samples) // hop
    if count < 3:
        return []
    frames = np.asarray(samples[:count * hop], dtype=np.float32).reshape(count, hop)
    rms = np.sqrt(np.mean(frames * frames, axis=1))
    threshold = max(float(np.percentile(rms, 90)) * floor_ratio, 1e-4)
    quiet = rms < threshold

    edges = np.diff(quiet.astype(np.int8))
    starts = list(np.flatnonzero(edges == 1) + 1)
    ends = list(np.flatnonzero(edges == -1) + 1)
    if quiet[0]:
        starts.insert(0, 0)
    if quiet[-1]:
        ends.append(count)

    min_frames = max(1, int(round(min_ms / frame_ms)))
    return [(int(a) * hop, int(b) * hop)
            for a, b in zip(starts, ends) if b - a >= min_frames]


def _match_boundaries(samples, sentences, runs):
    """One quiet run per sentence boundary, in order - or None where nothing fits.

    Each boundary is predicted by character share (speaking time tracks characters closely)
    and then matched to a real run near that prediction. Scoring by length MINUS distance
    picks the sentence-final pause over a comma that happens to sit nearer the estimate, and
    the search only ever moves forward, so the matches cannot cross.
    """
    total_chars = sum(len(s) for s in sentences) or 1
    predicted, cursor = [], 0
    for sentence in sentences[:-1]:
        cursor += len(sentence)
        predicted.append(len(samples) * cursor / total_chars)

    # Generous, because the character-share estimate drifts inside a long paragraph; the
    # ordering constraint and the length term are what keep a wrong pick unlikely.
    tolerance = max(SAMPLE_RATE * 1.5, len(samples) * 0.12)
    # Distance is in samples and can run to tens of thousands, length only to a few thousand,
    # so an unweighted difference would be pure proximity. At this weight a clearly longer
    # run wins over a comma that sits nearer the estimate, and two similar runs go to the
    # nearer one.
    distance_weight = 0.25
    chosen, first = [], 0
    for want in predicted:
        best, best_score = None, None
        for index in range(first, len(runs)):
            start, end = runs[index]
            centre = (start + end) / 2
            distance = abs(centre - want)
            if distance > tolerance:
                # Runs are ordered, so everything past the window is out of reach too.
                if centre > want:
                    break
                continue
            score = (end - start) - distance_weight * distance
            if best_score is None or score > best_score:
                best, best_score = index, score
        chosen.append(best)
        if best is not None:
            first = best + 1
    return chosen


def widen_sentence_gaps(samples, sentences, gaps, room_level, rng):
    """Pad each sentence boundary to its planned gap. Returns (samples, boundaries).

    `boundaries` holds one sample index per interior boundary - the middle of the finished
    pause, which is where a read-along cue should change - or None where no quiet run could
    be matched, in which case that boundary is left exactly as Kokoro rendered it.
    """
    if len(sentences) < 2 or len(gaps) != len(sentences) - 1:
        return samples, []

    runs = quiet_runs(samples)
    if len(runs) < len(gaps):
        # Kokoro's "silence" is not digital zero and how quiet it is varies with the voice.
        # Rather than guess one threshold, relax it once when the strict pass found fewer
        # runs than there are boundaries to fill; -26 dB relative is still far below any
        # voiced speech.
        relaxed = quiet_runs(samples, floor_ratio=0.06)
        if len(relaxed) > len(runs):
            runs = relaxed
    if not runs:
        return samples, [None] * len(gaps)
    chosen = _match_boundaries(samples, sentences, runs)

    pieces, boundaries = [], []
    read, written = 0, 0
    for index, run in enumerate(chosen):
        if run is None:
            boundaries.append(None)
            continue
        start, end = runs[run]
        if start < read:                      # a run already consumed by an earlier splice
            boundaries.append(None)
            continue
        middle = (start + end) // 2
        have_ms = (end - start) / SAMPLE_RATE * 1000.0
        # MIN_ADDED is not redundant with the target. What counts as "quiet" starts during the
        # fading tail of the last syllable, so `have_ms` is measured generously and can exceed
        # the silence a listener actually hears - and then the pad computes to nearly nothing
        # at exactly the boundaries that sounded rushed. A floor guarantees every boundary a
        # real added beat whatever the measurement said.
        add_ms = max(gaps[index] - have_ms, MIN_ADDED_MS)
        pieces.append(samples[read:middle])
        written += middle - read
        filler = room_tone(add_ms, room_level, rng)
        if len(filler):
            pieces.append(filler)
        boundaries.append(written + len(filler) // 2)
        written += len(filler)
        read = middle
    pieces.append(samples[read:])
    return np.concatenate(pieces) if len(pieces) > 1 else samples, boundaries


# --------------------------------------------------------------------------------------
# Encoding
# --------------------------------------------------------------------------------------

def ffmpeg_exe():
    override = (os.getenv("FFMPEG_BINARY") or "").strip()
    if override:
        return override
    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if os.name == "posix" and os.path.isfile(exe) and not os.access(exe, os.X_OK):
            os.chmod(exe, os.stat(exe).st_mode | 0o111)
        return exe
    except Exception:
        found = shutil.which("ffmpeg")
        if not found:
            raise RuntimeError("no ffmpeg; pip install imageio-ffmpeg")
        return found


def open_encoder(out_path, bitrate="96k"):
    """ffmpeg reading raw mono s16le on stdin - one streaming encode, no temp files.

    96k mono is transparent for speech; the 192k the earlier prototype used doubled the file
    for no audible gain, which matters at three hours.
    """
    cmd = [
        ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error",
        "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "-",
        "-c:a", "libmp3lame", "-b:a", bitrate, str(out_path),
    ]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)


def to_pcm16(samples):
    return (np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
