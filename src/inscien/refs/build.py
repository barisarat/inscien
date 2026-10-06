"""`inscien build <pdf>`: a paper PDF -> its library entry, library/<slug>/{paper.json, extract.json}.

A PDF staged from the app arrives with a sidecar `<paper>.json` beside it - the Zotero itemKey,
title, authors, DOI and year - so the command is just the path: DOI and year come from the
sidecar unless a flag overrides them, the slug is derived from first author, year and title, and
paper.json records `zoteroKey`, which is how the sidebar knows this Zotero item is built.

Three separable steps, so a later fix does not mean re-reading the PDF:
    extract  (structure)  -> extract.json   mechanical, no judgement
    parse    (fields)     -> in memory      unambiguous only, flags the rest
    enrich   (identity)   -> paper.json     OpenAlex, Crossref and S2, guarded by title match
Each announces itself as `==> k/3 <label>` for the app's job pane. Re-running is safe.
"""

import hashlib
import json
import unicodedata
from datetime import date
from pathlib import Path

import regex as re

from inscien.core.paths import library_dir
from inscien.refs.enrich import enrich, fetch_paper, resolved_index, s2_paper
from inscien.refs.extract import date_from_texts, extract_pages, title_from_pages
from inscien.refs.parse import detect_field_order, parse_entry, title_key
from inscien.refs.pdftext import pdf_pages

STOP = {"a", "an", "the", "of", "for", "on", "in", "and", "with", "to", "is", "are", "can", "do", "does"}


def _slugify(s) -> str:
    s = unicodedata.normalize("NFKD", str(s or "").lower())
    s = re.sub(r"[̀-ͯ]", "", s)
    s = re.sub(r"['’]", "", s)
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s))


def _library() -> list[dict]:
    out = []
    for f in sorted(Path(library_dir()).glob("*/paper.json")):
        try:
            out.append(json.loads(f.read_text(encoding="utf-8")))
        except (ValueError, OSError):
            continue
    return out


def build(pdf, slug: str | None = None, doi: str | None = None, year: int | None = None,
          force: bool = False, refresh: bool = False, zotero_key: str | None = None) -> Path:
    pdf = Path(pdf)
    if not pdf.is_file():
        raise FileNotFoundError(f"no such file: {pdf}")
    stamp = date.today().isoformat()
    sidecar_path = pdf.with_suffix(".json")
    sidecar = json.loads(sidecar_path.read_text(encoding="utf-8")) if sidecar_path.is_file() else None
    zotero_key = zotero_key or (sidecar or {}).get("zoteroKey")
    asked_year = year or (sidecar or {}).get("year")

    # Sidecar slug: "<first author surname>-<year>-<first three title words>".
    sidecar_slug = None
    if sidecar and sidecar.get("title"):
        first = _slugify(((sidecar.get("authors") or [""])[0] or "").split(",")[0])
        words = [w for w in _slugify(sidecar["title"]).split("-") if w and w not in STOP][:3]
        sidecar_slug = "-".join(str(x) for x in [first, sidecar.get("year"), *words] if x)
    slug = slug or sidecar_slug or _slugify(pdf.stem)[:60]

    page1, _ = pdf_pages(pdf, upright_only=False, limit=4)
    pdf_title = title_from_pages(page1[0]) if page1 else None
    record_title = (sidecar or {}).get("title")
    # What the paper says about itself outranks both the APIs and the filename.
    pdf_date = date_from_texts([" ".join(i["str"] for i in p["items"]) for p in page1])
    source_hash = hashlib.sha1(pdf.read_bytes()).hexdigest()

    # Refuse a paper the library already holds: a duplicate counts its references twice, so every
    # one of them looks "cited by two papers" - noise that looks exactly like the signal.
    existing = _library()
    clash = next((p for p in existing if p.get("slug") != slug and (p.get("sourceHash") == source_hash
                  or (p.get("key") and p.get("key") == title_key(pdf_title or "")))), None)
    if clash and not force:
        why = "the same file" if clash.get("sourceHash") == source_hash else "the same title"
        raise ValueError(f'"{clash["slug"]}" is already in the library with {why}; '
                         f"a duplicate would make its references look shared. Use --force if this is deliberate.")

    print(f"building {slug}{' (from Zotero sidecar)' if sidecar else ''}", flush=True)
    if pdf_date:
        print(f"  date        the paper states {pdf_date['year']}-{pdf_date['month']:02d}")
        if asked_year and asked_year != pdf_date["year"]:
            print(f"  warning: year {asked_year} disagrees with the paper's own date; using {pdf_date['year']}")

    print("==> 1/3 extract the reference list", flush=True)
    pages, num_pages = pdf_pages(pdf)
    ex = extract_pages(pages, num_pages)
    if ex.get("error"):
        raise ValueError(f"extract failed: {ex['error']}")
    if ex.get("noReferences"):
        print("  no references: this paper cites nothing")
    else:
        stopped = ex.get("stoppedAt")
        print(f"  {ex['count']} {ex['style']} entries from p{ex['refPagesFrom']}"
              + (f' (stopped at "{stopped["text"][:40]}", {stopped["why"]})' if stopped else ""))
    for w in ex["warnings"]:
        print(f"  warning: {w}")

    print("==> 2/3 parse the entries", flush=True)
    order = detect_field_order(ex["entries"])
    parsed = [parse_entry(e, order) for e in ex["entries"]]
    review = [r["n"] for r in parsed if r.get("needsReview")]
    print(f"  {len(parsed)} {order} records, {len(review)} need review" + (f" -> {review}" if review else ""))

    print("==> 3/3 resolve the references", flush=True)
    index = {} if refresh else resolved_index(existing)
    doi = doi or (sidecar or {}).get("doi")
    out_dir = Path(library_dir()) / slug
    prev_path = out_dir / "paper.json"
    prev = json.loads(prev_path.read_text(encoding="utf-8")) if prev_path.is_file() else None
    fetched = fetch_paper(doi) if doi else None
    s2_self = s2_paper(doi) if doi else None
    # A failed lookup must never look like "this paper has no metadata": keep the previous build's.
    paper_work = fetched or ({"matchedTitle": prev.get("title"), "matchedYear": prev.get("year"),
                              "openalexId": prev.get("openalexId"), "citedBy": prev.get("citedBy"),
                              "apiReferenceCount": (prev.get("checksum") or {}).get("apiReferenceCount")} if prev else None)
    stale = not fetched and not s2_self and bool(paper_work)
    if doi and not fetched:
        print(f"  warning: paper lookup failed - keeping metadata from {(prev or {}).get('builtAt') or 'the previous build'}")
    refs = enrich(parsed, stamp, index)
    reused = sum(1 for r in refs if (r.get("resolved") or {}).get("fromLibrary"))
    confirmed = [r for r in refs if (r.get("resolved") or {}).get("confidence") == "confirmed"]
    print(f"  {len(confirmed)}/{len(refs)} resolved" + (f" ({reused} reused from the library, {len(refs) - reused} fetched)" if reused else ""))

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "extract.json").write_text(json.dumps(ex, indent=2, ensure_ascii=False), encoding="utf-8")
    api_count = (paper_work or {}).get("apiReferenceCount")
    name = record_title or pdf_title or (paper_work or {}).get("matchedTitle") or (prev or {}).get("title") or (s2_self or {}).get("title")
    paper = {
        "slug": slug,
        "source": pdf.name,
        "zoteroKey": zotero_key,
        "builtAt": stamp,
        "sourceHash": source_hash,
        "title": name or None,
        # The same normalization as every reference key, so a reference to a paper that is ALSO in
        # the library collapses into that node instead of duplicating it.
        "key": title_key(name or "") or None,
        # The paper's own printed date, then an explicit year: an API answers for the version IT
        # indexed (often the arXiv v1), and you know which version you are holding.
        "year": (pdf_date or {}).get("year") or asked_year or (paper_work or {}).get("matchedYear")
                or (s2_self or {}).get("year") or (prev or {}).get("year"),
        "month": (pdf_date or {}).get("month"),
        "doi": doi or None,
        "openalexId": (paper_work or {}).get("openalexId"),
        "citedBy": (s2_self or {}).get("citationCount") if (s2_self or {}).get("citationCount") is not None
                   else (paper_work or {}).get("citedBy"),
        "citedBySource": "s2" if s2_self else ("openalex" if paper_work else None),
        "citedByAt": (prev or {}).get("citedByAt") if stale else (stamp if (s2_self or paper_work) else None),
        "checksum": {
            "extracted": len(refs),
            "apiReferenceCount": api_count,
            "missingFromApi": None if api_count is None else len(refs) - api_count,
            "s2ReferenceCount": (s2_self or {}).get("referenceCount"),
        },
        "resolution": {
            "confirmed": len(confirmed),
            "unresolved": len(refs) - len(confirmed),
            "unresolvedRefs": [r["n"] for r in refs if (r.get("resolved") or {}).get("confidence") != "confirmed"],
        },
        "references": refs,
    }
    if stale:
        paper["metadataStale"] = True
    (out_dir / "paper.json").write_text(json.dumps(paper, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  wrote {out_dir / 'paper.json'}")
    # The printed numbering is the self-contained check on completeness for a numbered list.
    if ex.get("style") == "numbered":
        printed = [e["printed"] for e in ex["entries"] if isinstance(e.get("printed"), int)]
        ok = len(printed) == len(refs) and printed and printed[0] == 1 and all(n == i + 1 for i, n in enumerate(printed))
        print(f"  numbering   {f'1..{len(refs)}, no gaps' if ok else 'NOT contiguous - the list is incomplete'}")
    if (s2_self or {}).get("referenceCount"):
        print(f"  references  {len(refs)} from this PDF (S2 lists {s2_self['referenceCount']} for its copy)")
    return out_dir
