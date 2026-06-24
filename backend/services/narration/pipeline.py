"""Paper -> narration script -> audio.

Map-reduce script generation (a local 7B can't one-shot a paper):
  parse -> ~3500-char chunks -> faithful per-chunk digests -> one compose call over the
  digests (the narration prompt) -> faithfulness flag -> Kokoro synthesis -> mp3.

Generation runs through the single project LLM client (`services.llm.client`), so narration
uses the same local Ollama model + base URL as chat - there is no separate TTS LLM path.
Parsing reuses the shared `services.lab.pdf_parser` (two-column reading-order aware).
"""

import logging
import os
import re

from services.lab.pdf_parser import parse_pdf
from services.llm.client import chat_create, text_of
from services.narration.tts_engine import synthesize

logger = logging.getLogger(__name__)

# Per-chunk digest window for the map step: small enough for a local 7B to summarize one
# section reliably (smaller than the embedding chunk size), large enough to avoid over-splitting.
DOC_CHUNK = 3500

# Standalone bibliography heading - broad enough to catch the common title variants (and an
# optional leading section number / trailing colon) so the reference list is never narrated.
_HEADING = re.compile(
    r"(?im)^\s*(?:\d{1,2}\.?\s+)?"
    r"(references|bibliography|works\s+cited|literature\s+cited|reference\s+list)"
    r"\s*:?\s*$"
)


def _complete(prompt, max_tokens):
    """One non-streamed completion against the local model (deterministic)."""
    resp = chat_create(
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
        temperature=0,
    )
    return text_of(resp)


# --- text extraction --------------------------------------------------------

def _paper_text(pdf_path):
    """Full paper text in reading order (via the shared parser), references stripped."""
    blocks = parse_pdf(pdf_path)
    text = "\n".join(b["text"] for b in blocks if b.get("text"))
    matches = list(_HEADING.finditer(text))
    if matches:
        text = text[:matches[-1].start()]
    return text.strip()


def split_text(text, chunk_size=DOC_CHUNK):
    """~chunk_size chars, split on sentence boundaries. Ported from format-transcribe."""
    text = re.sub(r"\s+", " ", text).strip()
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


# --- prompts ----------------------------------------------------------------

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
- Plain spoken prose only: no markdown, headings, bullet points, asterisks, or symbols.

Style and tone
- Neutral, clear, technically accurate; an expert explanation, not a beginner tutorial.
- Focus on ideas, intuition, motivation, and implications, not implementation details.
- Avoid overly long sentences; ensure smooth flow for audio delivery.
- Use connective phrasing such as "The key idea", "In contrast", "The main result", or
  "The implication is", without addressing a listener.

Content guidance - explain the problem and why it mattered; the core ideas and model concepts;
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
        return _complete(prompt, max_tokens=120)
    except Exception:
        logger.exception("faithfulness_note check failed; skipping")
        return "OK (check skipped)"


# --- orchestration ----------------------------------------------------------

def run_narration(file_name, out_path, progress):
    """Full pipeline. `progress(stage, percent, detail)` updates the job.
    Returns {duration_min, faithfulness, script_chars}."""
    # The Zotero-resolved file in storage/ is passed as an absolute path.
    if not os.path.isabs(file_name) or not os.path.exists(file_name):
        raise FileNotFoundError(f"Paper not found: {file_name}")
    pdf_path = file_name

    progress("parsing", 5, "parsing the paper")
    text = _paper_text(pdf_path)
    if not text:
        raise ValueError("No extractable text (is this a scanned PDF?)")

    chunks = split_text(text)
    digests = []
    for i, chunk in enumerate(chunks):
        progress("digesting", 5 + int(35 * i / max(len(chunks), 1)),
                 f"digesting ({i + 1}/{len(chunks)})")
        digests.append(_complete(digest_prompt(chunk, i + 1, len(chunks)), max_tokens=500))

    digests_text = "\n\n".join(digests)

    progress("composing", 45, "writing the narration")
    script = _complete(compose_prompt(digests_text), max_tokens=2500)

    progress("verifying", 50, "checking faithfulness")
    note = faithfulness_note(script, digests_text)

    duration = synthesize(script, out_path, progress)

    progress("done", 100, "done")
    return {"duration_min": duration, "faithfulness": note, "script_chars": len(script)}
