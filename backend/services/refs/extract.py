"""Extract a paper's reference list and its own identity from the PDF.

LLM-parse approach (fully offline via the local model): locate the References section
in the PyMuPDF text, feed it to the model to structure each entry. This is the
make-or-break step and the flakiest on messy/non-LaTeX papers — GROBID is the future
upgrade behind the same interface.
"""

import json
import re

from services.llm.client import chat_create, text_of

# A standalone "References"/"Bibliography" heading line (parse_pdf puts each block on
# its own line, so a heading block sits alone).
_HEADING = re.compile(r"(?im)^\s*(references|bibliography)\s*$")
_DOI = re.compile(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+")
_REF_WINDOW_CHARS = 3500
_MAX_REFS = 200


def _blocks_text(blocks):
    return "\n".join(b["text"] for b in blocks if b.get("text"))


def references_section(blocks):
    """Return the bibliography text (everything after the last References heading)."""
    text = _blocks_text(blocks)
    matches = list(_HEADING.finditer(text))
    if matches:
        return text[matches[-1].end():].strip()
    # Fallback: last loose occurrence of the word.
    loose = list(re.finditer(r"(?i)\breferences\b", text))
    return text[loose[-1].end():].strip() if loose else ""


def _json_array(raw):
    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return []
    try:
        data = json.loads(raw[start:end + 1])
        return data if isinstance(data, list) else []
    except (ValueError, TypeError):
        return []


def parse_references(text):
    """LLM-parse the references section into [{title,authors,year,doi}]."""
    if not text:
        return []

    collected = []
    for i in range(0, len(text), _REF_WINDOW_CHARS):
        window = text[i:i + _REF_WINDOW_CHARS]
        prompt = (
            "Extract every bibliographic reference from the text below into JSON. "
            "Return ONLY a JSON array; each item exactly "
            '{"raw": "<the full verbatim reference text>", "title": "...", "authors": "...", '
            '"year": "...", "doi": "..."} '
            "(doi empty if absent; never invent a title or doi; split combined entries; "
            "`raw` is the original citation string including venue/journal).\n\n"
            + window
        )
        try:
            resp = chat_create(messages=[{"role": "user", "content": prompt}], max_tokens=1500)
            collected.extend(_json_array(text_of(resp)))
        except Exception:
            continue
        if len(collected) >= _MAX_REFS:
            break

    out = []
    for r in collected[:_MAX_REFS]:
        if not isinstance(r, dict):
            continue
        title = (r.get("title") or "").strip()
        if not title:
            continue
        authors = (r.get("authors") or "").strip()
        year = str(r.get("year") or "").strip()
        # `raw` = full citation string (incl. venue/journal) so search can match any
        # part of it; reconstruct from fields if the model didn't echo it.
        raw = (r.get("raw") or "").strip() or " ".join(p for p in (authors, title, year) if p)
        out.append({
            "raw": raw,
            "title": title,
            "authors": authors,
            "year": year,
            "doi": (r.get("doi") or "").strip().lower(),
        })
    return out


def paper_identity(blocks, meta_title=""):
    """The paper's OWN title + DOI — its identity for intra-corpus matching."""
    title = (meta_title or "").strip()
    first_page = " ".join(b["text"] for b in blocks if b.get("page") == 1)

    doi = ""
    m = _DOI.search(first_page)
    if m:
        doi = m.group(0).rstrip(".").lower()

    if not title:
        for b in blocks:
            if b.get("page") == 1 and len(b.get("text", "")) > 8:
                title = b["text"]
                break

    return {"title": title.strip(), "doi": doi}
