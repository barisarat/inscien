"""The local reference library: papers whose reference lists were read off their own PDFs.

Each paper is a directory under `library/` holding `paper.json` (metadata, checksum, the parsed
and resolved references) written by `tools/build.mjs`. Nothing in this module calls an API - the
artifacts are complete on disk, which is the whole point of the pipeline: the reference list came
from the paper, not from a publisher's Crossref deposit, so it does not depend on the network and
cannot be truncated by one.

Read fresh off disk on every request. The library is a few dozen small JSON files, so caching
would buy nothing and would mean restarting the service after every build.
"""

import json
import logging
from collections import defaultdict
from pathlib import Path

from inscien.core.paths import library_dir
from inscien.services.library import narrations

logger = logging.getLogger(__name__)


def _paper_dirs():
    root = Path(library_dir())
    if not root.is_dir():
        return []
    return sorted(d for d in root.iterdir() if d.is_dir() and (d / "paper.json").is_file())


def load_paper(slug: str):
    """One paper's artifact, or None if it is missing or unreadable."""
    path = Path(library_dir(), slug, "paper.json")
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError) as exc:
        logger.warning("Couldn't read %s: %s", path, exc)
        return None


def _summary(paper: dict) -> dict:
    checksum = paper.get("checksum") or {}
    resolution = paper.get("resolution") or {}
    return {
        "slug": paper.get("slug"),
        # The Zotero item this artifact was built from - the join to the Zotero tree in the
        # sidebar. Older builds (pre-staging) had it patched in by hand.
        "zoteroKey": paper.get("zoteroKey"),
        "source": paper.get("source"),
        "title": paper.get("title") or paper.get("slug"),
        "year": paper.get("year"),
        "doi": paper.get("doi"),
        "citedBy": paper.get("citedBy"),
        "builtAt": paper.get("builtAt"),
        "referenceCount": checksum.get("extracted") or len(paper.get("references") or []),
        # Kept because it is the reason this app exists: how many of the paper's real references
        # the citation API did not know about.
        "apiReferenceCount": checksum.get("apiReferenceCount"),
        "missingFromApi": checksum.get("missingFromApi"),
        "resolved": resolution.get("confirmed"),
        "unresolved": resolution.get("unresolved"),
    }


def list_papers() -> list[dict]:
    """Every built paper, newest build first, for the library sidebar."""
    papers = [load_paper(d.name) for d in _paper_dirs()]
    out = [_summary(p) for p in papers if p]
    out.sort(key=lambda p: (p.get("title") or "").lower())
    return out


def _month(ref: dict, year):
    """Publication month 1-12, or None.

    Two sources, both guarded on the YEAR agreeing with the one the reference printed. An arXiv id
    carries the v1 submission date and OpenAlex carries the record date, and a reference often
    cites a later revision - placing a 2016-11 arXiv id at November on the 2018 column would be a
    confident lie. A node with no month sits at the centre of its column.
    """
    month = ref.get("month")
    if isinstance(month, int) and 1 <= month <= 12:
        return month
    date = (ref.get("resolved") or {}).get("date")
    if isinstance(date, str) and len(date) >= 7:
        try:
            if year is None or int(date[:4]) == int(year):
                candidate = int(date[5:7])
                if 1 <= candidate <= 12:
                    return candidate
        except ValueError:
            pass
    return None


def _ref_node_id(ref: dict, slug: str) -> str:
    """The id a reference merges on.

    Title-normalized, NOT the OpenAlex id, and deliberately so: the same work can be resolved in
    one paper and left unresolved in another, and keying on the resolved id would split those into
    two nodes - losing exactly the shared-reference signal the map exists to show. `key` is written
    by the same normalization on both sides (see tools/parse-refs.mjs `titleKey`).
    """
    key = (ref.get("key") or "").strip()
    if key:
        return f"key:{key}"
    return f"raw:{slug}:{ref.get('n')}"


def _zotero_record(zotero_key) -> dict:
    """{authors: ["First Last", ...], venue} for an owned paper, from the Zotero snapshot. Empty
    when the paper has no key or the library is unreadable - the map never depends on Zotero."""
    if not zotero_key:
        return {}
    try:
        from inscien.services.zotero.reader import item_metadata

        meta = item_metadata(zotero_key) or {}
    except Exception:
        logger.debug("Zotero record unavailable for %s", zotero_key, exc_info=True)
        return {}
    authors = []
    for name in meta.get("authors") or []:
        last, _, first = name.partition(", ")
        authors.append(f"{first} {last}".strip() if first else last)
    return {"authors": authors, "venue": meta.get("venue")}


def graph(slugs: list[str]) -> dict:
    """The reference map over the selected papers.

    Owned nodes are the selected papers; external nodes are the union of everything they cite,
    merged by title key. An external node's `citedBy` is its within-selection degree (how many of
    your papers cite it), which is what makes a shared reference render larger - the one signal
    that only appears once several papers are built.

    A reference that is itself one of the selected papers does not become an external node: the
    edge points at the owned node instead, so the library's internal structure shows up.
    """
    loaded = [(slug, load_paper(slug)) for slug in slugs]
    known = [(slug, paper) for slug, paper in loaded if paper]
    missing = [slug for slug, paper in loaded if not paper]

    known_narrations = narrations.bundles()
    owned_by_key = {}
    for slug, paper in known:
        key = (paper.get("key") or "").strip()
        if key:
            owned_by_key[f"key:{key}"] = slug

    nodes, edges = [], []
    # Distinct CITING PAPERS per reference, not occurrences. A bibliography can list the same work
    # twice - Faggioli 2023 has TREC CAsT at both [23] and [24] - and counting occurrences turned
    # that into a reference "cited by two papers", complete with the shared ring. A duplicate entry
    # in one paper is a typesetting artifact, not overlap between papers.
    citing_papers = defaultdict(set)
    ext_meta = {}
    seen_edges = set()

    for slug, paper in known:
        record = _zotero_record(paper.get("zoteroKey"))
        narration = narrations.status_for(paper.get("source"), paper.get("title"), known_narrations)
        nodes.append({
            "id": slug,
            "label": paper.get("title") or slug,
            "type": "owned",
            # Authors and venue for the node card come from the Zotero record, live: the artifact
            # holds only what the build needed, and the record is the curated form anyway.
            "authors": record.get("authors") or [],
            "venue": record.get("venue"),
            "narrationUrl": narration.get("url"),
            "year": paper.get("year"),
            "date": None,
            "month": None,
            "globalCitedBy": paper.get("citedBy"),
            "doi": paper.get("doi"),
            # Colours the map by what kind of thing it is; the library has no collections.
            "collection": "paper",
        })
        for ref in paper.get("references") or []:
            node_id = _ref_node_id(ref, slug)
            owned_target = owned_by_key.get(node_id)
            if owned_target:
                if owned_target != slug and (slug, owned_target) not in seen_edges:
                    seen_edges.add((slug, owned_target))
                    edges.append({"from": slug, "to": owned_target})
                continue
            citing_papers[node_id].add(slug)
            ext_meta.setdefault(node_id, ref)
            if (slug, node_id) not in seen_edges:
                seen_edges.add((slug, node_id))
                edges.append({"from": slug, "to": node_id})

    for node_id, ref in ext_meta.items():
        resolved = ref.get("resolved") or {}
        nodes.append({
            "id": node_id,
            "label": ref.get("title") or ref.get("raw") or node_id,
            "type": "external",
            "authors": ref.get("authors") or [],
            "year": ref.get("year"),
            "date": None,
            "month": _month(ref, ref.get("year")),
            "citedBy": len(citing_papers[node_id]),
            "globalCitedBy": resolved.get("citedBy"),
            "doi": resolved.get("doi") or ref.get("doi"),
            "collection": ref.get("type") or "unknown",
            "arxivId": ref.get("arxivId"),
            "venue": ref.get("venue"),
            "resolved": resolved.get("confidence") == "confirmed",
            "citedBySource": resolved.get("citedBySource") or ("openalex" if resolved.get("citedBy") is not None else None),
        })

    # Selection-level totals, so the UI can state them once at the top instead of repeating
    # per-paper detail down the sidebar. `references` counts DISTINCT works: with several papers
    # selected it is smaller than the sum of their reference counts, and the gap is the overlap.
    # Every extracted reference is accounted for:
    #     extracted = nodes + merged + internal
    # "merged" is a reference that folded into a node another reference already created - the same
    # work cited by two of your papers, or listed twice inside one bibliography (Faggioli has TREC
    # CAsT at both [23] and [24]). "internal" is a reference that IS one of the selected papers, so
    # it became an edge rather than a node. Without stating these the header simply reads fewer
    # references than the paper has, which looks like extraction lost some.
    extracted = sum(len(paper.get("references") or []) for _, paper in known)
    internal_refs = sum(
        1
        for slug, paper in known
        for ref in (paper.get("references") or [])
        if owned_by_key.get(_ref_node_id(ref, slug))
    )
    summary = {
        "papers": len(known),
        "extracted": extracted,
        "internalRefs": internal_refs,
        "merged": extracted - internal_refs - len(ext_meta),
        "references": len(ext_meta),
        "shared": sum(1 for papers_citing in citing_papers.values() if len(papers_citing) > 1),
        "internalEdges": sum(1 for e in edges if e["to"] in owned_by_key.values()),
        "missingFromApi": sum((p.get("checksum") or {}).get("missingFromApi") or 0 for _, p in known),
        "unresolved": sum(
            1 for ref in ext_meta.values()
            if (ref.get("resolved") or {}).get("confidence") != "confirmed"
        ),
    }

    # `unmapped` keeps the key the frontend already understands; here it can only mean "asked for
    # a paper that has not been built", never "the API had nothing", which is the point.
    return {"nodes": nodes, "edges": edges, "unmapped": missing, "noDoi": [], "summary": summary}


def slugs_by_zotero_key() -> dict:
    """{zoteroKey: slug} over the built library - what lets a Zotero tree row know it is built."""
    out = {}
    for d in _paper_dirs():
        paper = load_paper(d.name)
        if paper and paper.get("zoteroKey"):
            out[paper["zoteroKey"]] = paper.get("slug") or d.name
    return out
