"""Second half of extraction: raw reference strings -> structured records.

This handles only what is UNAMBIGUOUS. Everything it is unsure about is written to `needsReview`
with the evidence attached. It never silently picks between two readings.

The one case worth naming: a line-final hyphen. In justified text it is usually LaTeX syllable
hyphenation ("Luko-" + "suite" -> "Lukosuite"), but it is sometimes a real compound ("Few-" +
"shot" -> "Few-shot"). No rule separates them without a dictionary, so the default is to remove
it and EVERY case is recorded with both readings. Confirmed compounds live in compounds.json and
apply to every paper on the next parse.

Five entry shapes, told apart by `detect_field_order`:

    acm          [12] Authors. 2024. Title. Venue.
    author-year  Bai, Y., ... Title. Venue, Year.
    springer     12. Surname, I., Surname, I.: Title. In: Venue, pp. 1-2 (2018)
    vancouver    1. Surname AB, Surname C. Title. Journal. 2015;13(3):132-140.

Patterns that rely on \\b, \\w or \\d use ASCII semantics (the `A` flag), as a reference list's
digits and punctuation are ASCII; the name patterns use Unicode letter classes.
"""

import json
import unicodedata
from pathlib import Path

import regex as re

A = re.ASCII

# Bibliographic apparatus that can trail a title: a URL (sometimes broken across a line as
# "https: //doi.org/..."), a DOI, an arXiv id, or a bare parenthesised year. It is stripped BEFORE
# the title is cut, because the cut looks for a venue starting with a capital or "In", and a URL
# starts with neither - and the title is the merge key, so a trailing URL would keep the same
# work cited cleanly elsewhere from ever joining it.
APPARATUS_TAIL = re.compile(
    r"\s*(?:arXiv\s+(?:preprint|e-?prints?)|https?:\s*//\S+|doi:\s*\S+"
    r"|arXiv:\d{4}\.\d{4,5}(?:v\d+)?(?:\s*\[[^\]]*\])?|\(\s*\d{4}\s*\)\.?)", re.I | A)
ARXIV = re.compile(r"arXiv:\s*(\d{4}\.\d{4,5})(v\d+)?", re.I | A)
DOI = re.compile(r"\b(10\.\d{4,9}/[^\s,;)]+)", A)


def _ws(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def strip_apparatus(text: str) -> str:
    return _ws(APPARATUS_TAIL.sub(" ", text or ""))


_COMPOUNDS_FILE = Path(__file__).with_name("compounds.json")
COMPOUNDS = {w.lower() for w in json.loads(_COMPOUNDS_FILE.read_text(encoding="utf-8")).get("keepHyphen", [])}


def _bare(word: str) -> str:
    return re.sub(r"^[^A-Za-z0-9_]+|[^A-Za-z0-9_-]+$", "", word)


def dehyphenate(lines: list[str]) -> tuple[str, list[dict]]:
    """Join an entry's lines, resolving line-final hyphens (see the module note)."""
    choices = []
    out = ""
    for i, cur in enumerate(lines):
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        m = re.match(r"(.*?)(\S+)-\Z", cur)
        if m and nxt:
            tail = re.match(r"(\S+)", nxt)
            if tail:
                hyphenated = f"{m[2]}-{tail[1]}"
                # A hyphen inside a URL or DOI is part of the address, never a syllable break:
                # joining "...2024.ACL-LONG.165" into "ACLLONG" produces a link to nowhere.
                in_link = bool(re.search(r"://|^10\.|/", m[2]))
                keep = in_link or _bare(hyphenated).lower() in COMPOUNDS
                choices.append({"joined": m[2] + tail[1], "hyphenated": hyphenated,
                                "chose": "hyphenated" if keep else "joined",
                                "source": "compounds.json" if keep else "default"})
                out += m[1] + m[2] + ("-" if keep else "")
                continue  # no space: the next line continues the word
        out += cur + (" " if i < len(lines) - 1 else "")
    # Control characters are accent artifacts of the text layer ("Bucs\x13an" for Bucsan) and
    # break every name pattern; nothing legitimate is below U+0020.
    return _ws(re.sub(r"[\x00-\x1f]", "", out)), choices


def _split_authors(text: str) -> list[str]:
    """ACM style: "A, B, C, and D" -> a list."""
    parts = re.split(r",\s*and\s+|\s+and\s+|,\s*", re.sub(r"\s+", " ", text))
    return [a.strip() for a in parts if a.strip()]


def fix_title_spacing(title: str) -> str:
    """Restore the space some PDFs kern away after a colon ("Super-naturalinstructions:generalization").
    The title is the merge key, so this decides whether it joins the same work cited elsewhere."""
    return _ws(re.sub(r":(?=[A-Za-z])", ": ", title or ""))


def title_key(title: str) -> str:
    """Merge key for cross-paper identity: the title, lowercased, alphanumerics only."""
    text = unicodedata.normalize("NFKD", (title or "").lower())
    text = re.sub(r"[̀-ͯ]", "", text)
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august",
               "september", "october", "november", "december"]
MONTH = "January|February|March|April|May|June|July|August|September|October|November|December"


def month_of(text: str, year, arxiv_id) -> int | None:
    """Publication month when the entry supplies one without an API call: an arXiv id encodes
    YYMM (used only when its year MATCHES the printed year - a reference often cites a later
    revision than v1), or an author-year entry prints the month name."""
    if arxiv_id:
        m = re.match(r"(\d\d)(\d\d)\.", arxiv_id, A)
        if m:
            month = int(m[2])
            if 2000 + int(m[1]) == year and 1 <= month <= 12:
                return month
    named = re.search(r"\b(" + MONTH + r")\b", text, re.I | A)
    if named:
        return MONTH_NAMES.index(named[1].lower()) + 1
    return None


def _finish(rec: dict) -> dict:
    rec["title"] = fix_title_spacing(rec.get("title"))
    rec["key"] = title_key(rec["title"])
    rec["month"] = month_of(rec["raw"], rec.get("year"), rec.get("arxivId"))
    if not rec["needsReview"]:
        del rec["needsReview"]
    return rec


def _length_checks(rec: dict) -> None:
    title = rec.get("title")
    if not title or len(title) < 8:
        rec["needsReview"].append("title looks too short")
    if title and len(title) > 250:
        rec["needsReview"].append("title looks too long - venue may have run into it")


def _ids(rec: dict, text: str, doi_trim: str) -> None:
    ax = ARXIV.search(text)
    if ax:
        rec["arxivId"], rec["venue"], rec["type"] = ax[1], "arXiv", "preprint"
    doi = DOI.search(text)
    if doi:
        rec["doi"] = re.sub(doi_trim, "", doi[1])


def parse_entry(entry: dict, order: str) -> dict:
    if order == "vancouver":
        return parse_vancouver(entry)
    if order == "springer":
        return parse_springer(entry)
    if order != "acm":
        return parse_author_year(entry)

    text, choices = dehyphenate(entry["lines"])
    rec = {"n": entry["n"], "raw": text, "needsReview": []}
    if choices:
        rec["hyphenChoices"] = choices

    head = re.match(r"(.+?)\.\s(\d{4})[a-z]?\.\s(.+)$", text, A)
    if not head:
        rec["needsReview"].append('does not match "Authors. Year. Rest" - parse by hand')
        return rec
    rec["authors"] = _split_authors(head[1])
    rec["year"] = int(head[2])
    # Some bibliographies print the year twice ("... Sun. 2024. 2024. Internet of agents").
    body = re.sub(r"^(?:19|20)\d\d[a-z]?\.\s+", "", head[3], flags=A)

    # Title runs to the first sentence-ending punctuation followed by a capital, a digit or
    # "arXiv", measured after the trailing apparatus is removed.
    rest = strip_apparatus(body)
    cut = re.match(r"(.+?\.)\s+(?=(?:In\b|arXiv|[A-Z0-9]))", rest, A)
    if cut:
        rec["title"] = re.sub(r"\.$", "", cut[1]).strip()
        rec["venueRaw"] = rest[len(cut[1]):].strip()
    else:
        rec["title"] = re.sub(r"\.$", "", rest).strip()
        rec["venueRaw"] = ""
        # A preprint or a DOI-only entry legitimately has no venue.
        if not ARXIV.search(text) and not DOI.search(text):
            rec["needsReview"].append("no venue found after the title")

    _ids(rec, text, r"\.$")
    if not rec.get("arxivId"):
        in_proc = re.match(r"In\s+(.+?)(?:\.|$)", rec["venueRaw"], A)
        if in_proc:
            rec["venue"], rec["type"] = in_proc[1].strip(), "conference"
        elif rec["venueRaw"]:
            rec["venue"], rec["type"] = re.sub(r"\.$", "", rec["venueRaw"]).strip(), "article"
    # A short-name in parentheses is the canonical venue tag - "(SIGIR 2024)".
    tag = re.search(r"\(([A-Z][A-Za-z-]{2,12}\s*'?\d{2,4})\)", rec["venueRaw"], A)
    if tag:
        rec["venueTag"] = re.sub(r"\s+", " ", tag[1])

    _length_checks(rec)
    if not rec["authors"]:
        rec["needsReview"].append("no authors parsed")
    if rec["year"] < 1900 or rec["year"] > 2100:
        rec["needsReview"].append(f"implausible year {rec['year']}")
    return _finish(rec)


# --- author shapes ---------------------------------------------------------------------------

PARTICLE = r"(?:(?:van|von|de|del|dos|da|di|der|den|le|la|du)\s+)*"
SURNAME = PARTICLE + r"\p{Lu}[\p{L}'’-]*(?:\s+\p{Lu}[\p{L}'’-]*)?"
INITIALS = r"(?:\p{Lu}\.(?:-\p{Lu}\.)?\s*)+"
ONE_AUTHOR = re.compile(r"^(?:and\s+)?" + SURNAME + r",\s+" + INITIALS)
# A surname with no initials, which only ever appears immediately before the final "and".
MONONYM = re.compile(r"^(?:and\s+)?" + SURNAME + r",\s+(?=and\s)")
ET_AL = re.compile(r"^(?:et\s+al\.|e\.\s*a\.)\s*")
CORPORATE = re.compile(r"^(\p{Lu}[\p{L}\p{N}&-]*)\.\s+")

# Trailing apparatus stripped before the year is read, as each of these carries digits.
APPARATUS = re.compile(
    r"\s*(?:URL\s+\S+|ISSN\s+[\d-]+X?|doi:\s*\S+|arXiv:\d{4}\.\d{4,5}(?:v\d+)?\s*\[[^\]]*\]"
    r"|original-date:\s*\S+|Place:.*$|version:\s*\d+)", re.I | A)


def _split_initials_after(text: str):
    """"Bai, Y., Kadavath, S., ... et al." - initials after the surname, author by author."""
    rest, consumed = text, []
    for _ in range(60):
        m = ET_AL.match(rest)
        if m:
            consumed.append("et al.")
            rest = rest[len(m[0]):]
            break
        m = ONE_AUTHOR.match(rest) or MONONYM.match(rest)
        if not m:
            break
        consumed.append(re.sub(r"[,\s]+$", "", re.sub(r"^and\s+", "", m[0])).strip())
        # Consume the separator too, or the scanner stalls on the ", " before the next author.
        rest = re.sub(r"^[,;]\s*", "", rest[len(m[0]):])
    if not consumed:
        corp = CORPORATE.match(text)
        if corp:
            return [corp[1]], text[len(corp[0]):]
        return [], text
    return consumed, rest


INITIALS_STYLE = re.compile(r"\p{Lu}[\p{L}'’-]+,\s+\p{Lu}\.")
INITIALS_FIRST = re.compile(r"^" + INITIALS + r"\s*\p{Lu}")
IF_AUTHOR = re.compile(r"^(?:and\s+)?" + INITIALS + r"\s*" + SURNAME)


def _split_initials_first(text: str):
    """"V. Veselovsky, M. H. Ribeiro, and R. West." - the list ends at the ". " after a surname."""
    rest, consumed = text, []
    for _ in range(60):
        m = ET_AL.match(rest)
        if m:
            consumed.append("et al.")
            rest = rest[len(m[0]):]
            break
        m = IF_AUTHOR.match(rest)
        if not m:
            break
        consumed.append(re.sub(r"^and\s+", "", m[0]).strip())
        rest = rest[len(m[0]):]
        if re.match(r"\.\s", rest):
            rest = re.sub(r"^\.\s*", "", rest)
            break
        rest = re.sub(r"^[,;]?\s*", "", rest)
    return (consumed, rest) if consumed else ([], text)


def _split_full_names(text: str):
    """"Rohan Anil, Andrew M Dai, ... et al." - ended by the first sentence period."""
    et = re.match(r"(.*?)(?:,\s*)?\b(?:et\s+al\.|e\.\s*a\.)\s+", text, A)
    if et:
        return [a.strip() for a in re.split(r",\s*", et[1]) if a.strip()], text[len(et[0]):]
    # The first ". " whose preceding token is not a lone initial ends the author list.
    for m in re.finditer(r"\.\s+", text):
        before = text[:m.start()]
        if re.search(r"(?:^|[\s.])\p{Lu}$", before):
            continue  # a middle initial, keep going
        return ([a.strip() for a in re.split(r",\s*|\s+and\s+", before) if a.strip()],
                text[m.end():])
    return [], text


# --- field order -----------------------------------------------------------------------------

# An ACM entry puts the year immediately after the authors, and nothing else does.
ACM_HEAD = re.compile(r"^.+?\.\s(?:19|20)\d{2}[a-z]?\.\s\S", A)
# Springer LNCS: the author list ends at the colon after an initial; the year is in parentheses.
SPRINGER_HEAD = re.compile(
    r"^(?:\d{1,3}\.\s+)?[^:]{5,240}\p{Lu}\.(?:,?\s*et al\.)?:\s+\S.*\((?:19|20)\d\d[a-z]?\)\s*\.?$")
# Vancouver: initials AFTER the surname with no dots; a surname is one to four words.
VANCOUVER_AUTHOR = r"(?:\p{L}[\p{L}'’-]*\s){1,4}\p{Lu}{1,3}(?:-\p{Lu})?"
VANCOUVER_HEAD = re.compile(
    r"^(?:\d{1,3}\.\s+)?" + VANCOUVER_AUTHOR + r"(?:,\s*" + VANCOUVER_AUTHOR + r")*(?:,\s*et al)?\.\s+\S")


def _entry_text(entry: dict) -> str:
    return entry.get("raw") or " ".join(entry.get("lines") or []) or ""


def detect_field_order(entries: list[dict]) -> str:
    """The field order is measured, not inferred from the marker style: a list can use "[n]"
    markers like ACM and order its fields like ICML."""
    sample = [e for e in entries if len(_entry_text(e)) > 40]
    if not sample:
        return "author-year"
    flat = [re.sub(r"\s+", " ", _entry_text(e)) for e in sample]
    if sum(1 for t in flat if VANCOUVER_HEAD.search(t)) / len(sample) >= 0.6:
        return "vancouver"
    if sum(1 for t in flat if SPRINGER_HEAD.search(t)) / len(sample) >= 0.6:
        return "springer"
    acm = sum(1 for e in sample if ACM_HEAD.search(_entry_text(e)))
    return "acm" if acm / len(sample) >= 0.6 else "author-year"


# --- the three non-ACM parsers ---------------------------------------------------------------

def parse_vancouver(entry: dict) -> dict:
    text, choices = dehyphenate(entry["lines"])
    text = re.sub(r"^\d{1,3}\.\s+", "", text, flags=A)
    rec = {"n": entry["n"], "raw": text, "needsReview": []}
    if choices:
        rec["hyphenChoices"] = choices
    _ids(rec, text, r"[.,]$")

    head = re.match(r"((?:" + VANCOUVER_AUTHOR + r"(?:,\s*)?)+(?:et al)?)\.\s+(.+)$", text)
    if not head:
        rec["needsReview"].append('does not match "Surname AB, Surname C. Title. Journal. Year;vol:pages" - parse by hand')
        return rec
    rec["authors"] = [a.strip() for a in re.split(r",\s*", head[1]) if a.strip()]
    body = head[2]
    # The title ends at the first ". ", "? " or "! " before a letter or digit (the journal may
    # open lowercase: "medRxiv"); the year opens the volume string.
    cut = re.match(r"(.+?[.?!])\s+(?=[\p{L}0-9])", body)
    rec["title"] = re.sub(r"[.]$", "", cut[1] if cut else body).strip()
    tail = body[len(cut[1]):].strip() if cut else ""
    yr = re.search(r"\b((?:19|20)\d\d)\b", tail, A)
    if yr:
        rec["year"] = int(yr[1])
    if not rec.get("arxivId") and tail:
        venue = re.split(r"\.\s*(?=(?:19|20)\d\d\b)|\s+(?=(?:19|20)\d\d;)", tail, flags=A)[0]
        venue = re.sub(r"[.,;]\s*$", "", re.sub(r"\s*doi:.*$", "", venue, flags=re.I)).strip()
        if venue:
            rec["venue"] = venue
            rec["type"] = "preprint" if re.match(r"arxiv$", venue, re.I) else "article"
    if not rec.get("year"):
        rec["needsReview"].append("no year found")
    _length_checks(rec)
    if not rec["authors"]:
        rec["needsReview"].append("no authors parsed")
    return _finish(rec)


def parse_springer(entry: dict) -> dict:
    text, choices = dehyphenate(entry["lines"])
    text = re.sub(r"^\d{1,3}\.\s+", "", text, flags=A)
    rec = {"n": entry["n"], "raw": text, "needsReview": []}
    if choices:
        rec["hyphenChoices"] = choices
    _ids(rec, text, r"[.,]$")

    head = re.match(r"(.+?\p{Lu}\.(?:,?\s*et al\.)?):\s+(.+)$", text)
    if not head:
        rec["needsReview"].append('does not match "Authors: Title. Venue (Year)" - parse by hand')
        return rec
    # One author per "Surname, I." pair: split at the comma BEFORE a surname followed by ", I.".
    rec["authors"] = [a.strip() for a in re.split(
        r",\s*(?=(?:\p{Lu}[\p{L}'’-]+\s+)?\p{Lu}[\p{L}'’-]+,\s*\p{Lu}\.)", head[1]) if a.strip()]
    # The year is the LAST parenthesised one: "(2018)", "(07 2023)", "(Sept 2023)".
    years = [int(m[1]) for m in re.finditer(r"\((?:[A-Za-z]+\.?\s+|\d{1,2}\s+)?((?:19|20)\d\d)[a-z]?\)", head[2], A)]
    if years:
        rec["year"] = years[-1]
    body = strip_apparatus(head[2])
    # Title ends at ". In:" when the entry has one, else at the first ". " before a capital.
    in_at = re.search(r"\.\s+In:\s", body, A)
    if in_at and in_at.start() > 0:
        cut = in_at.start() + 1
    else:
        m = re.match(r"(.+?\.)\s+(?=[A-Z])", body, A)
        cut = len(m[1]) if m else -1
    rec["title"] = re.sub(r"\.$", "", body[:cut] if cut > 0 else body).strip()
    rec["venueRaw"] = body[cut:].strip() if cut > 0 else ""
    if not rec.get("arxivId") and rec["venueRaw"]:
        in_proc = re.match(r"In:\s*(.+?)(?:,\s*pp?\.|,\s*vol\.|\.\s|$)", rec["venueRaw"], A)
        if in_proc:
            rec["venue"], rec["type"] = in_proc[1].strip(), "conference"
        else:
            venue = re.sub(r"[.,]\s*$", "", re.sub(r"\s+\d.*$", "", rec["venueRaw"], flags=A)).strip()
            rec["venue"], rec["type"] = venue, "article"
    if not rec.get("year"):
        rec["needsReview"].append("no year found")
    _length_checks(rec)
    if not rec["authors"]:
        rec["needsReview"].append("no authors parsed")
    return _finish(rec)


def parse_author_year(entry: dict) -> dict:
    text, choices = dehyphenate(entry["lines"])
    rec = {"n": entry["n"], "raw": text, "needsReview": []}
    if choices:
        rec["hyphenChoices"] = choices
    _ids(rec, text, r"[.,]$")

    # Initials-first is tested FIRST: an entry in that shape also contains "Surname, I." pairs
    # and would otherwise be scanned as initials-after.
    if INITIALS_FIRST.search(text):
        authors, rest = _split_initials_first(text)
    elif INITIALS_STYLE.search(text[:90]):
        authors, rest = _split_initials_after(text)
    else:
        authors, rest = _split_full_names(text)
    rec["authors"] = authors
    if not authors:
        rec["needsReview"].append("could not read an author list")

    # Title ends at the first ". " OR at a trailing ", [Month] YYYY", whichever comes first.
    # "?" and "!" are deliberately NOT terminators; they occur inside real titles.
    cleaned = strip_apparatus(rest)
    stop = re.search(r"\.\s", cleaned, A)
    dated = re.search(r",\s+(?:" + MONTH + r")?\s*(?:19|20)\d\d", cleaned, A)
    cuts = sorted(i for i in (stop.start() if stop else -1, dated.start() if dated else -1) if i > 0)
    cut = cuts[0] if cuts else None
    rec["title"] = re.sub(r"[.,]\s*$", "", cleaned[:cut] if cut is not None else cleaned).strip()
    # The tail is cut from the UNSTRIPPED rest at the same index, as the parser always has.
    tail = rest[cut:] if cut is not None else ""

    clean = _ws(APPARATUS.sub(" ", tail))
    years = [int(m[0]) for m in re.finditer(r"\b(19|20)\d\d\b", clean, A)]
    if years:
        rec["year"] = years[-1]
    else:
        any_year = [int(m[0]) for m in re.finditer(r"\b(19|20)\d\d\b", APPARATUS.sub(" ", text), A)]
        if any_year:
            rec["year"] = any_year[-1]
    if not rec.get("year"):
        rec["needsReview"].append("no year found")

    if not rec.get("arxivId"):
        venue = re.sub(r"^In\s+", "", re.sub(r"^[.,]\s*", "", clean))
        venue = re.split(r",\s*(?:19|20)\d\d", venue, flags=A)[0]
        if venue:
            rec["venue"] = re.sub(r"[.,]\s*$", "", venue).strip()
            rec["type"] = "conference" if re.search(r"\bIn\b|Proceedings|Conference", tail, re.I | A) else "article"

    _length_checks(rec)
    # The author scanner failing silently yields a confident record whose title is really the
    # tail of the author list. Leftover ", X." initials mean the split went wrong.
    if re.match(r"\s*,", rec["title"]) or re.search(r",\s+\p{Lu}\.(?:,|\s|$)", rec["title"]):
        rec["needsReview"].append("title still contains author-list punctuation - the author split failed")
    return _finish(rec)


def parse_all(entries: list[dict]) -> list[dict]:
    order = detect_field_order(entries)
    return [parse_entry(e, order) for e in entries]
