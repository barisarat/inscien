"""Paper -> narration script -> audio.

Map-reduce script generation (a local 7B can't one-shot a paper):
  parse -> 3500-char chunks -> faithful per-chunk digests (Ollama) ->
  one compose call over the digests (the narration prompt) -> faithfulness flag ->
  <=230-char TTS chunks -> XTTS v2 -> pydub stitch -> mp3.

Ports the user's prior code: format-trascribe (split_text / call_ollama) and
local-tts/episode-maker (split_into_chunks / XTTS / pydub).
"""

import os
import re
import time

import fitz  # PyMuPDF
import requests
from pydub import AudioSegment

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434/api/generate")
LLM_MODEL = os.getenv("TTS_LLM_MODEL", "qwen2.5:7b")
SPEAKER = os.getenv("TTS_SPEAKER", "Viktor Menelaos")
PAPERS_DIR = os.getenv("PAPERS_DIR", "/workspace/papers")
AUDIO_DIR = os.getenv("AUDIO_DIR", "/workspace/jobs/audio")

LANGUAGE = "en"
DOC_CHUNK = 3500
TTS_MAX_CHARS = 230
SILENCE_MS = 200
BITRATE = "192k"
MAX_RETRIES = 3

_HEADING = re.compile(r"(?im)^\s*(references|bibliography)\s*$")

# Lazily-loaded XTTS model (kept warm for the process).
_tts = None


def _get_tts():
    global _tts
    if _tts is None:
        import torch
        from TTS.api import TTS
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    return _tts


# --- text extraction --------------------------------------------------------

def _column_index(block, mid):
    x0, x1 = block[0], block[2]
    return 0 if (x0 + x1) / 2.0 < mid else 1


def parse_paper(pdf_path):
    """Full paper text in reading order, with the references section stripped."""
    doc = fitz.open(pdf_path)
    lines = []
    try:
        for page_index in range(doc.page_count):
            page = doc.load_page(page_index)
            blocks = [b for b in page.get_text("blocks")
                      if len(b) >= 5 and (b[4] or "").strip()]
            mid = page.rect.width / 2.0
            blocks.sort(key=lambda b: (_column_index(b, mid), round(b[1], 1), b[0]))
            for b in blocks:
                lines.append(" ".join(b[4].split()))
    finally:
        doc.close()

    text = "\n".join(lines)
    m = list(_HEADING.finditer(text))
    if m:
        text = text[:m[-1].start()]
    return text.strip()


def clean_text(text):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def split_text(text, chunk_size=DOC_CHUNK):
    """~chunk_size chars, split on sentence boundaries. Ported from format-trascribe."""
    text = re.sub(r"\s+", " ", clean_text(text)).strip()
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        if end < len(text):
            split_point = text.rfind(". ", start, end)
            if split_point == -1:
                split_point = text.rfind("? ", start, end)
            if split_point == -1:
                split_point = text.rfind("! ", start, end)
            if split_point == -1:
                split_point = text.rfind(" ", start, end)
            if split_point != -1 and split_point > start:
                end = split_point + 1
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end
    return chunks


def split_into_chunks(text, max_chars=TTS_MAX_CHARS):
    """<=max_chars, sentence then clause. Ported from episode-maker; keeps XTTS under
    its ~250-char English limit (longer -> truncated audio)."""
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


# --- LLM (Ollama) -----------------------------------------------------------

def free_gpu_for_synthesis():
    """Free VRAM before XTTS runs. The narration pipeline is sequential (LLM first,
    then TTS), and on a small GPU the resident Ollama model (e.g. Qwen-7B, ~5GB) plus
    XTTS (~2GB) won't both fit — so unload the LLM here. Ollama is a SEPARATE host
    process, so this must go through its API (keep_alive:0), not torch."""
    try:
        requests.post(
            OLLAMA_URL,
            json={"model": LLM_MODEL, "prompt": "", "keep_alive": 0, "stream": False},
            timeout=60,
        )
    except Exception:
        pass
    time.sleep(2)  # let the driver reclaim the freed memory
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def call_ollama(prompt, max_tokens=1200):
    """POST to Ollama /api/generate (non-stream, temp 0, retries). Ported."""
    payload = {
        "model": LLM_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0, "num_predict": max_tokens},
    }
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.post(OLLAMA_URL, json=payload, timeout=600)
            resp.raise_for_status()
            return resp.json()["response"].strip()
        except Exception as exc:
            last_error = exc
            time.sleep(2)
    raise last_error


def digest_prompt(chunk, index, total):
    return f"""
You are extracting the key technical content from one section of a research paper, to
later build an audio explanation. Write concise notes (bullet points) capturing only:
- the problem / motivation, if present
- the core idea, method, or model introduced
- why it works, conceptually
- the main results or findings
- any stated significance

Rules:
- Be faithful; do not invent anything not in the text.
- No equations, citation numbers, table/figure references, or hyperparameter values.
- Keep it compact.

This is section {index} of {total}.

Section text:
{chunk}
""".strip()


def compose_prompt(digests_text):
    # The user's prompt #2, adapted to run over the section digests (not the full paper).
    return f"""
You are given structured notes (section digests) of a machine learning research paper below.

Your task is to produce a standalone audio narration script that explains the paper for an
expert CS / ML / data science audience. This is an original explanatory narration based on the
paper's ideas, not a reading of the notes.

Output requirements
- A single continuous script, suitable for direct text-to-speech narration.
- Target length: 8 to 10 minutes of spoken audio.
- Use original language and structure. Do not mirror the notes point-by-point.
- Do not quote directly.
- Do not include equations, table references, citation numbers, URLs, or figure descriptions.
- Do not mention "this paper", "the authors", "this narration", "the notes", "the listener",
  or any meta commentary.
- Do not include introductions or outros unrelated to the paper content.

Style and tone
- Neutral, clear, technically accurate; an expert explanation, not a beginner tutorial.
- Focus on ideas, intuition, motivation, and implications, not implementation details.
- Avoid overly long sentences; ensure smooth flow for audio delivery.
- Use connective phrasing such as "The key idea", "In contrast", "The main result", or
  "The implication is", without addressing a listener.

Content guidance — explain the problem and why it mattered; the core ideas and model concepts;
why the approach works conceptually; how success is evaluated and what the main results show;
and the broader significance. Avoid step-by-step algorithms, hyperparameter values, and detailed
numeric tables. The goal is a decision-grade mental model of the paper.

Section digests begin below.

{digests_text}
""".strip()


def faithfulness_note(script, digests_text):
    """Light, non-blocking check: does the script claim things absent from the digests?"""
    prompt = (
        "You are checking an audio narration script against the source notes it was built "
        "from. Briefly: does the script introduce specific claims (results, numbers, methods) "
        "NOT supported by the notes? Answer in one short sentence starting with OK or WARN.\n\n"
        f"Notes:\n{digests_text}\n\nScript:\n{script}"
    )
    try:
        return call_ollama(prompt, max_tokens=120)
    except Exception:
        return "OK (check skipped)"


# --- synthesis --------------------------------------------------------------

def synthesize(script, out_path, progress):
    chunks = split_into_chunks(script, TTS_MAX_CHARS)
    total = len(chunks)
    tts = _get_tts()

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    tmp_dir = out_path + "_chunks"
    os.makedirs(tmp_dir, exist_ok=True)

    silence = AudioSegment.silent(duration=SILENCE_MS)
    full = AudioSegment.empty()

    for i, chunk in enumerate(chunks):
        wav_path = os.path.join(tmp_dir, f"chunk_{i:04d}.wav")
        tts.tts_to_file(text=chunk, file_path=wav_path, language=LANGUAGE, speaker=SPEAKER)
        full += AudioSegment.from_wav(wav_path) + silence
        progress("synthesizing", 55 + int(44 * (i + 1) / max(total, 1)),
                 f"synthesizing ({i + 1}/{total})")

    full.export(out_path, format="mp3", bitrate=BITRATE)
    return round(len(full) / 1000.0 / 60.0, 2)


# --- orchestration ----------------------------------------------------------

def run_narration(job_id, file_name, progress):
    """Full pipeline. `progress(stage, percent, detail)` updates the job."""
    pdf_path = os.path.join(PAPERS_DIR, os.path.basename(file_name))
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"Paper not found: {pdf_path}")

    progress("parsing", 5, "parsing the paper")
    text = parse_paper(pdf_path)
    if not text:
        raise ValueError("No extractable text (is this a scanned PDF?)")

    chunks = split_text(text)
    digests = []
    for i, chunk in enumerate(chunks):
        progress("digesting", 5 + int(35 * i / max(len(chunks), 1)),
                 f"digesting ({i + 1}/{len(chunks)})")
        digests.append(call_ollama(digest_prompt(chunk, i + 1, len(chunks)), max_tokens=500))

    digests_text = "\n\n".join(digests)

    progress("composing", 45, "writing the narration")
    script = call_ollama(compose_prompt(digests_text), max_tokens=2500)

    progress("verifying", 50, "checking faithfulness")
    note = faithfulness_note(script, digests_text)

    # Free the LLM from VRAM so XTTS has room (sequential pipeline; small GPU).
    progress("verifying", 53, "freeing the GPU")
    free_gpu_for_synthesis()

    out_path = os.path.join(AUDIO_DIR, f"{job_id}.mp3")
    duration = synthesize(script, out_path, progress)

    progress("done", 100, "done")
    return {"audio_path": out_path, "duration_min": duration, "faithfulness": note,
            "script_chars": len(script)}
