"""The narration PLAN for a paper, without a model: which lines are the main text, and how to slice it.

Writes, into a work directory:
  paper-raw.txt    one text line per layout line, page markers between pages (the line numbers
                   every other file refers to)
  plan.json        what `slicing.Narrator` reads: skip ranges, headings, lead-ins, paragraph
                   starts, acronym expansions, slices and the spoken title line
  plan-review.txt  every skipped range with its reason and first line, to skim

What each decision becomes:
  references, appendices, acknowledgments   the earliest such heading past the first quarter
                                            ends the body; everything after is skipped
  headings                                  numbered lines in heading font, all-caps short lines
                                            in heading font, "Abstract"; a wrapped heading is joined
  captions                                  "Table N" / "Figure N" lines plus their continuation
  table rows, in-figure labels              the contiguous row-like lines touching a caption block
  footnotes                                 small-font lines low on a page, plus the marker before
  display formulas                          symbol-heavy or fragment lines, equation numbers
  running headers/footers, page numbers     text repeated across pages, bare numbers
  slices                                    runs of whole sections reaching a target size
  title line                                largest font on page one, then the author lines
Everything errs toward DROPPING a borderline line inside a table or figure region and toward
KEEPING one elsewhere: a stray row is audible, a lost sentence is not.

The input is the page text as items in content order: string, baseline x/y (y measured up from
the bottom), width, height, a font id, the font's generic family, and whether a line ends after it.
"""

import json
import math
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from inscien.narrate import jsre as R

GREEK_BMP = ("ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡ"
             "ϴΣΤΥΦΧΨΩ∇αβγδεζηθ"
             "ικλμνξοπρςστυφχψω"
             "∂ϵϑϰϕϱϖ")
EXEMPT = {"LLM", "AI", "ML", "NLP", "API", "IR", "TREC", "GPU", "CPU", "PDF", "URL", "HTML", "RAG", "BLEU", "ROUGE",
          "BERT", "GPT", "QA", "NDCG", "MAP", "MRR", "USA", "UK", "EU"}
KNOWN = {"LLM", "LLMS", "AI", "ML", "NLP", "API", "APIS", "QA", "GPU", "CPU", "HTTP", "PDF", "RAG", "BLEU", "ROUGE",
         "GLUE", "BERT", "IR", "TREC", "NDCG", "MAP", "MRR", "USA", "UK", "US", "ACM", "IEEE", "PAGE"}
MIN, TARGET, MAX = 60, 170, 250


def jlen(s: str) -> int:
    """JavaScript string length (UTF-16 code units)."""
    return len(s.encode("utf-16-le")) // 2


def fixed(v: float, digits: int) -> str:
    return str(Decimal(v).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP))


def letters(s: str) -> int:
    return len(R.findall(r"[A-Za-z]", s))


def digitsy(s: str) -> int:
    return len(R.findall(r"[0-9.%\-+−–,]", s))


def non_space(s: str) -> str:
    return R.sub(r"\s", "", s)


def detrack(t: str) -> str:
    """Tracked capitals arrive spaced ("T A B L E 1"): join a run of one- and two-letter capitals."""
    return R.sub(r"\b(?:[A-Z]{1,2} ){3,}[A-Z]{1,2}\b", lambda m: m.group(0).replace(" ", ""), t)


def heading_text(t: str) -> str:
    """Wiley's "2 | METHODS": the bar and the tracking are normalized before the heading tests."""
    h = R.sub(r"^(\d+(?:\.\d+)*)\s*\|\s*", "$1 ", t, "")
    h = R.sub(r"^\|\s*", "", h, "")
    return R.sub(r"\s+", " ", detrack(h)).strip()


def _math_char(ch: str) -> str:
    cp = ord(ch)
    if cp <= 0x1D6A3:
        r = (cp - 0x1D400) % 52
        return chr(65 + r) if r < 26 else chr(97 + r - 26)
    if 0x1D6A8 <= cp <= 0x1D7CB:
        i = (cp - 0x1D6A8) % 58
        return GREEK_BMP[i] if i < len(GREEK_BMP) else ch
    if cp >= 0x1D7CE:
        return str((cp - 0x1D7CE) % 10)
    return ch


def math_ascii(s: str) -> str:
    """Mathematical Alphanumeric Symbols -> plain letters, a run spaced off letter by letter (a run
    of italic letters is a variable with its subscript, never a word)."""
    return R.sub(r"[\U0001D400-\U0001D7FF]+", lambda m: " ".join(_math_char(c) for c in m.group(0)), s)


def symbol_font(t: str) -> str:
    """A symbol font's "=" and "+" arrive as U+00BC and U+00FE, its parentheses as U+00F0 U+00DE."""
    t = R.sub(r"(?<=\s|^)¼(?=\s|$)", "=", t)
    t = R.sub(r"(?<=\s|^)þ(?=\s|$)", "+", t)
    return R.sub(r"(\S+)\s*ð\s*Þ", "($1)", t)


class Line(dict):
    """A text line; a dict so a shallow copy shares the font sets, as the planner relies on."""


# ---- 1. lines with layout --------------------------------------------------------------------

def build_lines(pages: list[dict]) -> list:
    lines = []
    for p, pg in enumerate(pages, 1):
        height = pg["height"]
        styles = pg.get("styles") or {}
        lines.append({"marker": p})
        start = len(lines) - 1
        cur = None

        def flush():
            nonlocal cur
            if cur and cur["text"].strip():
                cur["text"] = symbol_font(R.sub(r"\s+", " ", cur["text"]).strip())
                cur["ratio"] = cur["y"] / height
                lines.append(cur)
            cur = None

        for item in pg["items"]:
            # Rotated text is a margin stamp: the transform's x axis is [0, size], not [size, 0].
            if abs(item["t1"]) > abs(item["t0"]):
                if cur:
                    flush()
                continue
            y, x = item["y"], item["x"]
            h = item["h"]
            # A superscript or subscript is a smaller item a few points off the baseline: it belongs
            # to the line. A footnote marker is the same kind of item - a bare digit - and is dropped.
            small_off = bool(cur and h > 0 and h < cur["size"] * 0.92 and abs(y - cur["baseY"]) > 2
                             and abs(y - cur["baseY"]) <= 4.5 and R.test(r"^\s*[A-Za-z0-9+\-−]{1,4}\s*$", item["str"]))
            if small_off and R.test(r"^\s*\d{1,2}\s*$", item["str"]) and R.test(r"[.,;:!?A-Za-z]$", cur["text"]) \
                    and not R.test(r"\de$", cur["text"]):
                continue
            if cur and not small_off and abs(y - cur["baseY"]) > 2:
                flush()
            if not cur:
                cur = Line(page=p, y=y, baseY=y, x=x, size=0, fonts=set(), ids=[], items=[], text="")
            s = math_ascii(item["str"])
            if cur["size"] > 0 and h > 0 and h < cur["size"] * 0.92 and R.test(r"^[A-Za-z0-9]{1,3}$", s.strip()):
                s = " " + s.strip() + " "
            cur["text"] += s
            cur["xEnd"] = max(cur.get("xEnd") or 0, x + (item["w"] or 0))
            cur["items"].append({"str": s, "id": item.get("font") or ""})
            cur["size"] = max(cur["size"], h or 0)
            if item.get("font"):
                cur["fonts"].add(styles.get(item["font"], item["font"]))
                if item["font"] not in cur["ids"]:
                    cur["ids"].append(item["font"])
            if item.get("eol"):
                flush()
        flush()
        # Fragments on one baseline that continue to the right with less than a gutter between
        # them are one line (a font change splits a sentence with inline math). Two columns share
        # a baseline but not the x continuity, so they stay apart.
        page_lines = lines[start:]
        del lines[start:]
        merged = []
        for l in page_lines:
            prev = merged[-1] if merged else None
            if l.get("marker") or not prev or prev.get("marker") or prev["page"] != l["page"] \
                    or abs(prev["y"] - l["y"]) > 1.5 or l["x"] < (prev.get("xEnd") or 0) - 3 \
                    or l["x"] - (prev.get("xEnd") or 0) > 30:
                merged.append(l)
                continue
            glue = "" if R.test(r"^[.,;:)\]]", l["text"]) or R.test(r"[(\[]$", prev["text"]) else " "
            prev["text"] = R.sub(r"\s+", " ", prev["text"] + glue + l["text"]).strip()
            prev["xEnd"] = max(prev.get("xEnd") or 0, l.get("xEnd") or 0)
            prev["size"] = max(prev["size"], l["size"])
            prev["fonts"] |= l["fonts"]
            for i in l["ids"]:
                if i not in prev["ids"]:
                    prev["ids"].append(i)
            prev["items"].extend(l["items"])
        lines.extend(merged)
    return lines


# ---- 1b. bold lead-ins -----------------------------------------------------------------------

def split_leadins(lines: list) -> list:
    """A line that opens in a face the body never uses and switches to the body face mid-line is
    split at the switch, so the lead-in becomes its own line (and its own paragraph, with a pause)."""
    id_count = {}
    for l in lines:
        if l and not l.get("marker") and letters(l["text"]) >= 40 and len(l["ids"]) == 1:
            id_count[l["ids"][0]] = id_count.get(l["ids"][0], 0) + 1
    ids_sorted = sorted(id_count.items(), key=lambda kv: -kv[1])
    body_ids0 = {k for i, (k, c) in enumerate(ids_sorted) if i == 0 or c >= ids_sorted[0][1] * 0.5}

    def all_bold(l):
        return bool(l and not l.get("marker") and l.get("items")
                    and all(i["id"] not in body_ids0 or not i["str"].strip() for i in l["items"])
                    and letters(l["text"]) >= 4 and jlen(l["text"]) < 90 and not R.test(r"^\d", l["text"]))

    def starts_lead(t):
        return R.test(r"^(?:[A-Z(]|[ivx]+\)|\([ivx]+\))", t)

    out = []
    for l in lines:
        if not l or l.get("marker") or not l.get("items") or len(l["items"]) < 2 or R.test(r"^\d", l["text"]) or not body_ids0:
            out.append(l)
            continue
        k, head = 0, ""
        while k < len(l["items"]) and l["items"][k]["id"] not in body_ids0:
            head += l["items"][k]["str"]
            k += 1
        tail_text = R.sub(r"\s+", " ", "".join(i["str"] for i in l["items"][k:])).strip()
        head = R.sub(r"\s+", " ", head).strip()
        prev = out[-1] if out else None
        continues = 0 < k < len(l["items"]) and all_bold(prev) and prev["page"] == l["page"] \
            and R.test(r"^[a-z]", head) and starts_lead(prev["text"])
        ok_head = (continues or starts_lead(head)) and R.test(r"^[A-Z]", tail_text)
        if k == 0 or k == len(l["items"]) or (letters(head) < 8 and not continues) or jlen(head) > 90 \
                or letters(tail_text) < 8 or not ok_head:
            out.append(l)
            continue

        def part(items, text, **extra):
            ids = []
            for i in items:
                if i["id"] not in ids:
                    ids.append(i["id"])
            return Line({**l, "text": text, "items": items, "ids": ids, **extra})
        if continues:
            joined = R.sub(r"-$", "", prev["text"], "") + head if R.test(r"-$", prev["text"]) else prev["text"] + " " + head
            prev["text"] = R.sub(r"[:.]$", "", joined, "")
            prev["leadin"] = True
            out.append(part(l["items"][k:], tail_text))
            continue
        out.append(part(l["items"][:k], R.sub(r"[:.]$", "", head, ""), leadin=True))
        out.append(part(l["items"][k:], tail_text))
    return out


# ---- 2..7. the plan ----------------------------------------------------------------------------

def plan_paper(pages: list[dict], num_pages: int, source_name: str) -> tuple[str, dict, str, list[str]]:
    """(paper-raw.txt text, plan, plan-review.txt text, log lines)."""
    split = split_leadins(build_lines(pages))
    raw_out, leadins = [], []
    for l in split:
        if l.get("marker"):
            raw_out.append(f"===== PAGE {l['marker']} =====")
            continue
        l["n"] = len(raw_out) + 1
        raw_out.append(l["text"])
        if l.get("leadin"):
            leadins.append({"n": l["n"], "text": l["text"]})
    real = [l for l in split if l and not l.get("marker")]
    N = len(raw_out)

    # ---- 2. the body font and per-line features
    size_hist = {}
    for l in real:
        if letters(l["text"]) >= 40:
            k = fixed(l["size"], 1)
            size_hist[k] = size_hist.get(k, 0) + 1
    body = float(sorted(size_hist.items(), key=lambda kv: -kv[1])[0][0]) if size_hist else 10.0

    def styles(fonts):
        return any(R.test(r"bold|cmbx|black|heavy|semibold|medi|demi", f, "i") for f in fonts)
    id_hist = {}
    for l in real:
        if letters(l["text"]) >= 40:
            for i in l["ids"]:
                id_hist[i] = id_hist.get(i, 0) + 1
    body_ids = {k for k, _ in sorted(id_hist.items(), key=lambda kv: -kv[1])[:2]}

    def off_body_face(l):
        return len(l["ids"]) > 0 and all(i not in body_ids for i in l["ids"])

    def mathy(fonts):
        return any(R.test(r"cmmi|cmsy|cmex|msam|msbm|math|symbol", f, "i") for f in fonts)

    def is_prose(l):
        t = l["text"]
        return letters(t) >= 30 and letters(t) / max(1, jlen(non_space(t))) > 0.6 and l["size"] >= body - 0.6

    def is_caption(l):
        return R.test(r"^(Table|Figure|Fig\.?)\s*\d+[a-z]?\s*(?:[.:|]|\s+[A-Z])", detrack(l["text"]), "i")

    def is_bare_number(l):
        return R.test(r"^\d{1,6}\s*$", l["text"])
    FOOTNOTE_MARK = r"^[\d∗*†‡§¶]{1,2}\s*$"

    def is_superscript_only(l):
        return R.test(r"^[′∗*\x27†‡\d]{1,2}$", l["text"]) and l["size"] < body - 1

    def is_url(l):
        return R.test(r"^(https?:\/\/|www\.)", l["text"], "i") or R.test(r"^[a-z0-9-]+\.[a-z]{2,}\/\S*$", l["text"])

    def is_row_like(l):
        t = l["text"]
        ns = non_space(t)
        if not ns:
            return True
        if digitsy(t) / jlen(ns) >= 0.35 and letters(t) < 40:
            return True
        if l["size"] < body - 0.6 and letters(t) < 60:
            return True
        cond = jlen(t) < 45 and not R.test(r"[.!?]$", t) and R.test(r"^[A-Z][a-z]+ [a-z]", t)
        if (False if cond else (jlen(t) < 45 and not R.test(r"[.!?:]$", t))):
            return True
        return False

    def is_formula_like(l):
        t = l["text"]
        ns = non_space(t)
        if not ns:
            return False
        if R.test(r"^[,;]", t.strip()) and jlen(t.strip()) > 3:
            return False
        if R.test(r"https?:|www\.|\w\.(?:io|org|com|net|edu|gov)\/|[A-Za-z0-9]{20,}|[a-z]{3,}-$|\)\.?\s+[A-Z][a-z]+", t):
            return False
        toks = R.split(r"\s+", t.strip())
        if 1 <= len(toks) <= 8 and all(R.test(r"^[A-Z]{1,3}$|^[=+\-*/()|]+$", x) for x in toks) \
                and any(R.test(r"^[A-Z]{1,3}$", x) for x in toks) and jlen(t.strip()) <= 40 and len(toks) >= 2:
            return True
        if R.test(r"^[A-Z][a-z]+\s*=\s*$", t.strip()):
            return True
        if mathy(l["fonts"]) and letters(t) / jlen(ns) < 0.6:
            return True
        sym = len(R.findall(r"[=+−∑∫√≤≥∈∀∃∏|{}\[\]()^_′α-ωΑ-Ω∆Δ]", t))
        if jlen(ns) <= 3 and R.test(r"[^A-Za-z]", ns):
            return True
        if R.test(r"\(\d{1,2}\)\s*$", t) and letters(t) < 40:
            return True
        if R.test(r"\b(?:19|20)\d{2}[a-z]?\b|\bet al\b", t):
            return False
        if sym >= 2 and letters(t) < 25 and jlen(t) < 70 and \
                len(R.findall(r"[Α-ω∆Δ∈∩∪∑∏∫√≤≥=]", t)) >= 1:
            return True
        if letters(t) / jlen(ns) < 0.45 and sym >= 2 and jlen(t) < 70:
            return True
        return False

    def ends_sentence(t):
        return R.test(r"[.!?][\"')’”\]]?$", (t or "").strip())

    # ---- 3. skips
    skip = {}

    def mark(l, why):
        if l and l["n"] not in skip:
            skip[l["n"]] = why

    def shape(t):
        return R.sub(r"\d+", "#", t.lower())
    seen = {}
    for l in real:
        seen.setdefault(shape(l["text"]), set()).add(l["page"])
    min_pages = 2 if num_pages <= 4 else 3
    venue = ""
    for l in real:
        k = shape(l["text"])
        in_band = l["ratio"] > 0.9 or l["ratio"] < 0.1
        need = 2 if in_band else min_pages
        on_most = len(seen.get(k, ())) >= max(3, num_pages * 0.6)
        tl = jlen(l["text"])
        if (tl < (220 if in_band else 120) and len(seen.get(k, ())) >= need
                and (in_band or l["size"] < body - 1 or (tl < 40 and on_most and not is_prose(l)))) or (on_most and tl >= 40):
            mark(l, "running header/footer")
            v = R.match(r"\b(SIGIR(?:-AP)?|ECIR|ICTIR|CIKM|WSDM|EMNLP|ACL|NAACL|NeurIPS|ICLR|ICML|TREC|CLEF|BMJ [A-Za-z ]+"
                        r"|Findings of [A-Za-z:]+ ?\d{4})\b[^.]{0,30}?(\d{4})?", l["text"])
            if v and not venue:
                venue = R.sub(r"[,;].*$", "", v.group(0), "").strip()
        if is_bare_number(l) or is_superscript_only(l):
            mark(l, "page number / marker")
        if is_url(l):
            mark(l, "url")

    # publisher stamps above the title on page one
    p1 = [l for l in real if l["page"] == 1]
    best = None
    for l in p1:
        if letters(l["text"]) >= 8 and (not best or l["size"] > best["size"]):
            best = l
    title_y = best["ratio"] if best else None
    if title_y:
        for l in p1:
            if l["ratio"] > title_y + 0.02:
                mark(l, "above the title")

    # front matter that sits AFTER the abstract in ACM layouts: from its label to the next heading
    for i, l in enumerate(real):
        if not R.test(r"^(ccsconcepts|keywords|indexterms|acmreferenceformat|additionalkeywords)", R.sub(r"\s+", "", l["text"].lower())) \
                or l["n"] > N * 0.25:
            continue
        for j in range(i, len(real)):
            c = real[j]
            if j > i and R.test(r"^\d+(\.\d+)*\.?\s+[A-Z]", detrack(R.sub(r"^(\d+(?:\.\d+)*)\s*\|\s*", "$1 ", c["text"], ""))) \
                    and c["size"] >= body - 0.3:
                break
            mark(c, "front matter")
            if j - i > 40:
                break

    # end of the body: references, appendix, acknowledgments past the first quarter
    end_at, end_reason = N + 1, None
    SECTION_END = (r"^(references|bibliography|acknowledge?ments?|authoraffiliations|authorcontributions|contributors|funding"
                   r"|competinginterests|conflictofinterest|dataavailability|ethicsapproval|patientconsent"
                   r"|provenanceandpeerreview|orcid|supportinginformation)")
    APPENDIX_END = r"^appendix(es)?([a-z]|\d{1,2})?[.:]?$"
    RUNIN_END = (r"^(?:acknowledge?ments?|disclosureofinterests?|declarationofinterests?|competinginterests?"
                 r"|conflictsofinterest|dataavailability|funding|authorcontributions)[.:]")
    for i, l in enumerate(real):
        if l["n"] < N * 0.25:
            continue
        despaced = R.sub(r"\s+", "", l["text"].lower())
        if jlen(l["text"]) < 60 and R.test(SECTION_END, despaced) and l["n"] < end_at:
            end_at, end_reason = l["n"], "section"
        if R.test(RUNIN_END, despaced) and l["n"] < end_at:
            end_at, end_reason = l["n"], "section"
        if jlen(l["text"]) < 60 and R.test(APPENDIX_END, despaced):
            # Veto only when the line before is prose left mid-sentence (a wrapped cross-reference).
            prev = real[i - 1] if i > 0 else None
            continues = prev and is_prose(prev) and not ends_sentence(prev["text"])
            if not continues and l["n"] < end_at:
                end_at, end_reason = l["n"], "appendix"
        if R.test(r"^[A-Z]\s+[A-Z][A-Za-z ]{3,50}$", l["text"]) and l["n"] > N * 0.7 and l["size"] >= body and l["n"] < end_at:
            end_at, end_reason = l["n"], "appendix"  # "A Prompts" style appendix
    for l in real:
        if l["n"] >= end_at:
            mark(l, "after body (references/appendix)")

    # headings
    headings = []
    last_top = 0
    for i, l in enumerate(real):
        if l["n"] in skip:
            continue
        ht = heading_text(l["text"])
        num = R.match(r"^(\d+(?:\.\d+)*)\.?\s+([A-Z].{2,90})$", ht)
        if num:
            top, sub = int(num[1].split(".")[0]), "." in num[1]
            in_sequence = top == last_top if sub else (top == last_top + 1 or (last_top == 0 and top <= 2))
            if not in_sequence or top > 30:
                continue
        caps_tokens = R.split(r"\s+", ht)
        caps = R.test(r"^[A-Z][A-Z0-9 ,:&\-]{3,60}$", ht) and letters(ht) >= 4 \
            and any(R.test(r"^[A-Z]{5,}$", t) for t in caps_tokens) and len(set(caps_tokens)) == len(caps_tokens)
        abs_ = R.test(r"^abstract\b", l["text"], "i") and jlen(l["text"]) < 40
        nx0 = real[i + 1] if i + 1 < len(real) else None
        short_numbered = bool(num and "." in num[1] and jlen(l["text"]) < 70 and not R.test(r"[.!?,;]$", l["text"]) and nx0
                              and (is_prose(nx0) or R.test(r"^[A-Z]", nx0["text"])
                                   or (jlen(nx0["text"]) < 60 and not R.test(r"[.!?]$", nx0["text"]))))
        heading_font = l["size"] >= body + 0.4 or styles(l["fonts"]) or off_body_face(l) or short_numbered
        if not (abs_ or (num and heading_font and letters(num[2]) >= 3) or (caps and heading_font)):
            continue
        text = R.sub(r"[.:]\s*$", "", ht, "") if abs_ else ht
        nx = nx0
        next_is_heading = nx and R.test(r"^\d+(?:\.\d+)*\.?\s+[A-Z]", heading_text(nx["text"]))

        def prose_like(m):
            return letters(m["text"]) >= 30 and letters(m["text"]) / max(1, jlen(non_space(m["text"]))) > 0.6
        if nx and not next_is_heading and not abs_ and nx["page"] == l["page"] and abs(nx["size"] - l["size"]) < 0.3 \
                and jlen(nx["text"]) < 70 and not R.test(r"[.!?]$", l["text"]) and not is_prose(nx) and not prose_like(nx):
            text += " " + nx["text"]
            mark(nx, "heading continuation")
        text = R.sub(r"\s*[.:]$", "", text, "")
        level = len(num[1].split(".")) if num else 1
        headings.append({"n": l["n"], "text": text, "level": level, "page": l["page"]})
        if num:
            last_top = int(num[1].split(".")[0])
        mark(l, "heading")
    heading_ns = {h["n"] for h in headings}

    abstract_heading = next((h["n"] for h in headings if R.test(r"^abstract", h["text"], "i")), None)
    abstract_leadin = next((l["n"] for l in real if l["page"] == 1 and R.test(r"^abstract\b\s*[.:—-]?\s", l["text"], "i")), None)
    body_start = abstract_heading or abstract_leadin or next((l["n"] for l in real if l["ratio"] < 0.7 and is_prose(l)), None) or 1

    def is_table_row(l):
        t = l["text"]
        return not R.test(r"[.!?:;,]$", t.strip()) and (
            R.test(r"[✓✗✔✘]", t) or len(R.findall(r"(?<![A-Za-z])\d+(?:\.\d+)?(?![A-Za-z])", t)) >= 2) \
            and len(R.split(r"\s+", t)) <= 12

    def rowish(l):
        return is_row_like(l) or is_formula_like(l) or is_table_row(l)

    # captions and the regions touching them
    by_n = {l["n"]: l for l in real}
    idx_of = {l["n"]: i for i, l in enumerate(real)}
    for l in real:
        if not is_caption(l) or l["n"] in skip:
            continue
        i = idx_of[l["n"]]
        small = l["size"] < body - 0.3
        j = i
        while j < len(real) and real[j]["page"] == l["page"]:
            c = real[j]
            if j > i and (is_caption(c) or c["n"] in heading_ns):
                break
            if j > i and ((c["size"] >= body - 0.3) if small else (R.test(r"[.]\s*$", real[j - 1]["text"]) or j - i > 8)):
                break
            mark(c, "caption")
            j += 1
        # a same-size caption often runs on as prose; if a row-like run starts within four lines,
        # those lines are still the caption
        look, prose_run = j, 0
        while look < len(real) and real[look]["page"] == l["page"] and prose_run < 4 and is_prose(real[look]) \
                and real[look]["n"] not in heading_ns:
            look += 1
            prose_run += 1
        if prose_run and look < len(real) and real[look]["page"] == l["page"] \
                and (is_row_like(real[look]) or is_formula_like(real[look])) and not is_prose(real[look]):
            for k in range(j, look):
                mark(real[k], "caption")
            j = look
        cap_end = j
        k = cap_end
        while k < len(real) and real[k]["page"] == l["page"]:
            c = real[k]
            if c["n"] in skip and skip[c["n"]] != "page number / marker":
                break
            if c["n"] in heading_ns:
                break
            nxt = real[k + 1] if k + 1 < len(real) and real[k + 1]["page"] == l["page"] and real[k + 1]["n"] not in heading_ns else None
            if not rowish(c) and not (nxt and rowish(nxt) and not is_prose(c)):
                break
            if is_prose(c) and not is_table_row(c):
                break
            mark(c, "table/figure region")
            k += 1
        k = i - 1
        while k >= 0 and real[k]["page"] == l["page"]:
            c = real[k]
            if c["n"] in skip and not R.test(r"page number|caption", skip[c["n"]]):
                break
            if c["n"] in heading_ns:
                break
            if not rowish(c) or (is_prose(c) and not is_table_row(c)):
                break
            mark(c, "table/figure region")
            k -= 1

    # table rows with no caption nearby
    def numeric(x):
        ns = non_space(x["text"])
        return jlen(ns) >= 4 and digitsy(x["text"]) / jlen(ns) >= 0.5
    for i, l in enumerate(real):
        if l["n"] in skip or l["n"] < body_start or l["n"] >= end_at:
            continue
        if numeric(l) and letters(l["text"]) == 0:
            mark(l, "table rows (unanchored)")
            continue
        if not numeric(l):
            continue
        b = i
        while b + 1 < len(real) and numeric(real[b + 1]) and real[b + 1]["page"] == l["page"]:
            b += 1
        if b - i + 1 >= 3:
            for k in range(i, b + 1):
                mark(real[k], "table rows (unanchored)")

    # the publisher's licence block, matched by wording, front of the paper only, set below the body
    LICENCE = (r"^(copyright\b|©|\(c\)\s*\d{4}|permission to make digital or hard copies|licen[sc]ed under"
               r"|use permitted under|this work is licen[sc]ed|distributed under the terms)")
    for i, l in enumerate(real):
        if l["n"] in skip:
            continue
        if not R.test(LICENCE, l["text"].strip(), "i") or l["size"] > body - 0.5 or l["n"] > N * 0.25:
            continue
        mark(l, "licence block")
        last, taken = l["n"], 0
        for j in range(i + 1, len(real)):
            if taken >= 6:
                break
            c = real[j]
            if c["page"] != l["page"] or c["n"] != last + 1 or abs(c["size"] - l["size"]) > 0.3:
                break
            mark(c, "licence block")
            last = c["n"]
            taken += 1

    # footnotes: small font low on the page, plus the bare marker line before the block
    for i, l in enumerate(real):
        if l["n"] in skip:
            continue
        prev_real = real[i - 1] if i > 0 else None
        after_marker = bool(prev_real and prev_real["page"] == l["page"] and R.test(FOOTNOTE_MARK, prev_real["text"])
                            and prev_real["size"] < body - 2)
        if (l["size"] <= body - 1.2 or (after_marker and l["size"] <= body - 0.5)) and l["ratio"] < 0.34 \
                and letters(l["text"]) >= 3 and not is_caption(l):
            if after_marker:
                mark(prev_real, "footnote")
            j = i + 1
            while j < len(real) and real[j]["page"] == l["page"] and real[j]["size"] <= body - 0.5 and real[j]["ratio"] < 0.34:
                mark(real[j], "footnote")
                j += 1
            mark(l, "footnote")
            prev = real[i - 1] if i > 0 else None
            if prev and (is_bare_number(prev) or R.test(FOOTNOTE_MARK, prev["text"])):
                mark(prev, "footnote marker")

    # text drawn INSIDE a figure: markedly smaller than the body AND in a face the body never uses,
    # from the first heading that is not the abstract on
    figure_start = next((h["n"] for h in headings if h["n"] > body_start and not R.test(r"^abstract", h["text"], "i")), body_start)
    for l in real:
        if l["n"] in skip or l["n"] < figure_start or l["n"] >= end_at:
            continue
        if l["n"] in heading_ns or is_caption(l):
            continue
        if l["size"] <= body - 1.5 and off_body_face(l):
            mark(l, "in-figure text")

    # display formulas: contiguous runs of formula-like lines inside the body
    def lower_words(t):
        return len(R.findall(r"\b[a-z]{3,}\b", t))
    for i, l in enumerate(real):
        if l["n"] in skip or l["n"] < body_start or l["n"] >= end_at:
            continue
        if not is_formula_like(l):
            continue
        a = b = i
        while a - 1 >= 0 and real[a - 1]["n"] not in skip and is_formula_like(real[a - 1]) and real[a - 1]["page"] == l["page"]:
            a -= 1
        if R.test(r"\(\d{1,2}\)\s*$", l["text"]):
            while a - 1 >= 0 and real[a - 1]["n"] not in skip and real[a - 1]["page"] == l["page"] and not is_prose(real[a - 1]) \
                    and jlen(real[a - 1]["text"]) < 70 and lower_words(real[a - 1]["text"]) < 2 and i - a < 6:
                a -= 1
        while b + 1 < len(real) and real[b + 1]["n"] not in skip and is_formula_like(real[b + 1]) and real[b + 1]["page"] == l["page"]:
            b += 1
        for k in range(a, b + 1):
            mark(real[k], "display formula")
    for l in real:
        if l["n"] < body_start:
            mark(l, "title page")

    # ---- 4. title line
    page1 = [l for l in real if l["page"] == 1 and l["n"] < body_start]
    max_size = max([l["size"] for l in page1] + [0])

    def is_name(t):
        s = R.sub(r"[\d*†‡()]+", "", t).strip()
        w = R.split(r"\s+", s)
        return 2 <= len(w) <= 4 and jlen(s) < 40 and not R.test(r",|@|\bof\b|\bfor\b|\band\b", s, "i") and s != s.upper() \
            and all(R.test(r"^(?:[A-Z][a-z][A-Za-z\x27\-]*\.?|(?:[A-Z]\.)+|de|da|van|von|der|le|la|di)$", x) for x in w)
    title_lines, title_sizes, seen_title, title_end = [], [], False, -1
    for l in page1:
        if not seen_title and l["size"] >= max_size - 0.5:
            seen_title = True
        if not seen_title:
            continue
        if (is_name(R.sub(r",\s*$", "", l["text"], "")) and l["size"] < max_size - 1) or R.test(r"@", l["text"]) \
                or l["size"] < max_size - 3 or l["size"] < body + 1:
            break
        if title_lines and l["size"] < title_sizes[-1] - 0.5 and not R.test(r"[:.?!]$", title_lines[-1]):
            title_lines[-1] += ":"
        title_lines.append(l["text"])
        title_sizes.append(l["size"])
        title_end = l["n"]
    authors = []
    for l in page1:
        if l["n"] <= title_end or len(authors) >= 3:
            continue
        for a in R.split(r",|\band\b", l["text"]):
            s = R.sub(r"\s+,", "", R.sub(r"[\d*†‡()]+", "", a)).strip()
            if is_name(s) and len(authors) < 3:
                authors.append(s)

    def fold(t):
        t = R.sub(r"[‘’]", "'", t)
        t = R.sub(r"[“”]", '"', t)
        t = R.sub(r"[–—]", "-", t)
        t = R.sub(r"é", "e", t)
        return R.sub(r"[^\x20-\x7E]", "", t)
    title = fold(R.sub(r"\s+", " ", " ".join(title_lines)).strip())
    by = (", ".join(authors[:-1]) + ", " + authors[-1]) if len(authors) > 1 else (authors[0] if authors else "the authors")
    title_line = fold(f"{title}. By {by}, and colleagues." + (f" Published in {venue}." if venue else ""))

    # table text the row rules missed: a short unpunctuated line between two cut table or figure
    # lines is a column label or a cell
    leadin_ns = {x["n"] for x in leadins}
    for i in range(1, len(real) - 1):
        l = real[i]
        if l["n"] in skip:
            continue

        def is_cut(m):
            return m and m["n"] in skip and not R.test(r"heading", skip[m["n"]])
        if is_cut(real[i - 1]) and is_cut(real[i + 1]) and letters(l["text"]) < 30 and not R.test(r"[.!?:;]$", l["text"]) \
                and l["n"] not in leadin_ns:
            mark(l, "table text (between cut lines)")

    # ---- 5. slices: runs of whole sections reaching TARGET kept lines, none past MAX
    def kept(n):
        return 1 <= n <= N and n in by_n and n not in skip

    def kept_count(a, b):
        return sum(1 for n in range(a, b + 1) if kept(n))
    body_headings = [h for h in headings if body_start <= h["n"] < end_at]
    cuts = sorted(set([body_start] + [h["n"] for h in body_headings]))
    sections = [[c, (cuts[i + 1] if i + 1 < len(cuts) else end_at) - 1] for i, c in enumerate(cuts)]

    def sentence_end(n):
        return n in by_n and R.test(r"[.!?]$", by_n[n]["text"])

    def split_long(rng):
        a, b = rng
        if kept_count(a, b) <= MAX:
            return [[a, b]]
        mid = math.floor((a + b) / 2)
        for k in range(60):
            c = mid + (k if k % 2 else -k)
            if a < c < b and kept(c) and sentence_end(c):
                mid = c
                break
        return split_long([a, mid]) + split_long([mid + 1, b])
    sections = [s for rng in sections for s in split_long(rng)]
    merged, cur = [], None
    for a, b in sections:
        if not cur:
            cur = [a, b]
            continue
        if kept_count(cur[0], cur[1]) >= TARGET or kept_count(cur[0], b) > MAX:
            merged.append(cur)
            cur = [a, b]
        else:
            cur[1] = b
    if cur:
        merged.append(cur)
    if len(merged) > 1 and kept_count(*merged[-1]) < MIN:
        t = merged.pop()
        merged[-1][1] = t[1]

    def slug(s):
        return R.sub(r"^-|-$", "", R.sub(r"[^a-z0-9]+", "-", s.lower()))[:28]
    slices = []
    for i, (a, b) in enumerate(merged):
        hs = [h["text"] for h in body_headings if a <= h["n"] <= b]
        first = hs[0] if hs else ("start" if i == 0 else "part")
        slices.append({"out": f"{i + 1:02d}-{slug(first)}.txt", "from": a, "to": b})

    # ---- 5b. paragraph starts, from the layout: an indented first line, or a previous line that
    # ended a sentence and stopped short of the column's right edge
    cols_by_page = {}
    for l in real:
        if not is_prose(l) or letters(l["text"]) < 40:
            continue
        cols = cols_by_page.setdefault(l["page"], [])
        c = next((c for c in cols if abs(c["x"] - l["x"]) <= 6), None)
        if not c:
            c = {"x": l["x"], "ends": [], "count": 0}
            cols.append(c)
        c["count"] += 1
        c["ends"].append(l.get("xEnd") or 0)
    for cols in cols_by_page.values():
        for c in cols:
            c["ends"].sort()
            c["right"] = c["ends"][math.floor((len(c["ends"]) - 1) * 0.8)]

    def column_of(l):
        best = None
        for c in cols_by_page.get(l["page"], []):
            if c["count"] < 3:
                continue
            d = l["x"] - c["x"]
            if -6 <= d < 60 and (not best or abs(d) < abs(l["x"] - best["x"])):
                best = c
        return best
    paragraphs = []
    prev_kept = prev_real = None
    for l in real:
        in_body = kept(l["n"]) and body_start <= l["n"] < end_at
        if in_body:
            col = column_of(l)
            start = not prev_kept or (prev_real and prev_real["n"] in heading_ns) or l["n"] in leadin_ns
            if not start and col:
                same_inset = prev_kept is prev_real and prev_kept["page"] == l["page"] and abs(prev_kept["x"] - l["x"]) <= 2 \
                    and l["x"] - col["x"] > 4 and letters(prev_kept["text"]) >= 40 and not R.test(r"^(\d+[.)]|[•·▪–-])\s", l["text"])
                indented = not same_inset and 4 < l["x"] - col["x"] < 40 and letters(l["text"]) >= 20 and R.test(r"^[A-Z0-9\"(]", l["text"])
                pc = column_of(prev_kept)
                prev_short = ends_sentence(prev_kept["text"]) and (not pc or (prev_kept.get("xEnd") or 0) < pc["right"] - 0.12 * (pc["right"] - pc["x"]))
                start = indented or prev_short
            if start:
                paragraphs.append(l["n"])
        if kept(l["n"]):
            prev_kept = l
        prev_real = l

    # acronyms the paper expands at first use are expanded at every occurrence, unless they are
    # spoken as written; the initials of the words before the parenthesis must spell the acronym
    expand = {}
    for l in real:
        if not kept(l["n"]) or l["n"] < body_start or l["n"] >= end_at:
            continue
        for m in R.js(r"((?:[A-Za-z][a-z]+)(?:[ -][A-Za-z][a-z]*){1,7})\s+\(([A-Za-z]{2,8}?)(s?)\)").finditer(l["text"]):
            acr, plural = m.group(2), m.group(3)
            if acr.upper() in EXEMPT or acr in expand or acr + "s" in expand:
                continue
            if jlen(acr) >= 3 and R.test(r"[AEIOU]", acr.upper()) and not R.test(r"^[AEIOU]+$", acr.upper()):
                continue
            words = R.split(r"[ -]", m.group(1))
            caps = acr.upper()
            initials, frm = "", -1
            for i in range(len(words) - 1, -1, -1):
                if R.test(r"^(?:of|and|the|for|in|on|to|a|an|by|with)$", words[i], "i"):
                    continue
                initials = words[i][0].upper() + initials
                if initials == caps:
                    frm = i
                    break
                if len(initials) >= len(caps):
                    break
            if frm < 0:
                continue
            phrase = m.group(1)[m.group(1).index(words[frm]):]
            if frm == 0 and R.test(r"^[A-Z][a-z-]+ [a-z]", phrase):
                phrase = phrase[0].lower() + phrase[1:]
            if plural:
                expand[acr + "s"] = phrase
                expand[acr] = R.sub(r"s$", "", phrase, "")
            else:
                expand[acr] = phrase
                expand[acr + "s"] = phrase + "s"

    # acronym candidates, for the reader of the review
    acr_count = {}
    for l in real:
        if kept(l["n"]):
            for t in R.findall(r"\b[A-Z][A-Z0-9]{1,7}\b", l["text"]):
                if t not in KNOWN and not R.test(r"^\d+$", t):
                    acr_count[t] = acr_count.get(t, 0) + 1
    candidates = [f"{t} ({c})" for t, c in sorted(((t, c) for t, c in acr_count.items() if c >= 3), key=lambda kv: -kv[1])]

    # ---- 7. the plan and the review
    ranges = []
    for n in range(1, N + 1):
        if n not in by_n or n not in skip:
            continue
        last = ranges[-1] if ranges else None
        if last and last[1] == n - 1 and last[2] == skip[n]:
            last[1] = n
        else:
            ranges.append([n, n, skip[n]])
    plan = {
        "paper": f"{title}{' (' + venue + ')' if venue else ''}",
        "source_pdf": source_name,
        "title_line": title_line,
        "skip": ranges,
        "drop": ["^===== PAGE \\d+ =====$", "^\\d{1,5}\\s*$", "^https?://", "^[\\u2032\\u2217*'\\u2020\\u2021]+\\s*$"],
        "headings": [h["text"] for h in body_headings],
        "leadins": [x["text"] for x in leadins if body_start <= x["n"] < end_at and x["n"] not in skip],
        "paragraphs": paragraphs,
        "expand": expand,
        "slices": slices,
    }
    body_kept = kept_count(body_start, end_at - 1)
    review = [f"# {source_name}",
              f"body font {body:g}pt, {N} raw lines, body {body_start}-{end_at - 1}, {body_kept} lines kept",
              f"title line: {title_line}", "", "headings:",
              *[f"  {h['n']}  {'  ' * (h['level'] - 1)}{h['text']}" for h in body_headings], "",
              "lead-ins (own paragraph, not headings):", *[f"  {x['n']}  {x['text']}" for x in leadins if body_start <= x["n"] < end_at], "",
              f"paragraph starts: {len(paragraphs)} lines", "",
              "expanded at every occurrence (from the paper's own first-use glosses):",
              *[f"  {k}  ->  {v}" for k, v in expand.items() if not k.endswith("s") or k[:-1] not in expand], "",
              f"acronym candidates (not expanded): {', '.join(candidates[:20]) or 'none'}", "",
              "skipped:", *[f"{a:5d}-{str(b).ljust(5)} {why.ljust(28)} {(by_n[a]['text'] if a in by_n else '')[:70]}" for a, b, why in ranges], ""]
    log = [f"{source_name}: {N} lines, body font {body:g}pt, body {body_start}-{end_at - 1}, kept {body_kept}, "
           f"{len(body_headings)} headings, {len(slices)} slices"]
    # A body that stops mid-sentence is a boundary that fired inside a paragraph - the one failure
    # this plan cannot show any other way.
    last = next((l for l in reversed(real) if body_start <= l["n"] < end_at and l["n"] not in skip and is_prose(l)), None)
    if last and not ends_sentence(last["text"]) and end_reason == "appendix":
        log.append(f"  WARNING: the body ends mid-sentence at line {last['n']} - \"{last['text'][-60:]}\". "
                   f"A references/appendix boundary probably fired inside a paragraph; check line {end_at}.")
    return "\n".join(raw_out) + "\n", plan, "\n".join(review), log


def write_plan(pages: list[dict], num_pages: int, source_pdf: Path, work: Path) -> dict:
    raw, plan, review, log = plan_paper(pages, num_pages, Path(source_pdf).name)
    work = Path(work)
    work.mkdir(parents=True, exist_ok=True)
    (work / "paper-raw.txt").write_text(raw, encoding="utf-8")
    (work / "plan.json").write_text(json.dumps(plan, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (work / "plan-review.txt").write_text(review, encoding="utf-8")
    for line in log:
        print(line)
    return plan
