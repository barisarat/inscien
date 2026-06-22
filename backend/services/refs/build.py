"""Build + read the intra-corpus reference graph.

Explicit build (CLI / endpoint): for every paper in the chunk index, extract its own
identity + reference list, then match each reference against the other corpus papers
(DOI exact, else fuzzy title) to form intra-corpus citation edges. Nodes are ONLY your
papers — external references are not nodes (singletons are expected). The skills read
the prebuilt manifest; they never build on the fly.
"""

import json
import re
from collections import defaultdict
from pathlib import Path

from services.lab.manifest_loader import load_manifest_chunks
from services.lab.pdf_parser import parse_pdf, pdf_title
from services.lab.settings import get_lab_settings
from services.refs.extract import paper_identity, parse_references, references_section


def _tokens(title):
    return [t for t in re.sub(r"[^a-z0-9 ]", " ", (title or "").lower()).split() if t]


def _match_reference(ref, identities, exclude):
    """Return the corpus docId this reference points at, or None. DOI exact first,
    else fuzzy title (token Jaccard >= 0.6, both titles >= 4 tokens)."""
    ref_doi = (ref.get("doi") or "").strip().lower()
    ref_tokens = set(_tokens(ref.get("title")))

    for doc_id, ident in identities.items():
        if doc_id == exclude:
            continue
        if ref_doi and ident.get("doi") and ref_doi == ident["doi"]:
            return doc_id
        doc_tokens = set(_tokens(ident.get("title")))
        if len(ref_tokens) >= 4 and len(doc_tokens) >= 4:
            union = ref_tokens | doc_tokens
            if union and len(ref_tokens & doc_tokens) / len(union) >= 0.6:
                return doc_id
    return None


def _corpus_docs():
    """Unique documents from the chunk manifest: docId -> {title, fileName}."""
    manifest = load_manifest_chunks()
    docs = {}
    for chunk in manifest["chunks"]:
        sid = chunk.get("sourceId")
        if not sid or sid in docs:
            continue
        meta = chunk.get("metadata") or {}
        docs[sid] = {"title": chunk.get("title", ""), "fileName": meta.get("fileName", "")}
    return docs


def _write(data, path):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def build_references(progress=None):
    emit = progress or (lambda _msg: None)
    settings = get_lab_settings()
    papers_dir = Path(settings["papers_dir"])

    docs = _corpus_docs()
    emit(f"{len(docs)} document(s) in the index")

    documents = {}
    identities = {}
    for index, (doc_id, info) in enumerate(docs.items(), start=1):
        emit(f"[{index}/{len(docs)}] {info['fileName']} …")
        # Resolve the PDF: Zotero items live in storage/ (by itemKey); loose files in
        # papers_dir (by filename). Without the Zotero branch only papers_dir files build,
        # so a Zotero corpus collapses to whatever happens to be copied into papers/.
        path = None
        try:
            from services.zotero.reader import resolve_pdf_path
            zotero_path = resolve_pdf_path(doc_id)
            if zotero_path:
                path = Path(zotero_path)
        except Exception:
            path = None
        if path is None:
            candidate = papers_dir / Path(info["fileName"]).name
            if candidate.exists():
                path = candidate
        if path is None or not path.exists():
            emit("    file missing — skipped")
            continue

        blocks = parse_pdf(str(path))
        identity = paper_identity(blocks, info.get("title") or pdf_title(str(path)) or "")
        refs = parse_references(references_section(blocks))
        emit(f"    title='{identity['title'][:50]}' doi={identity['doi'] or '-'} refs={len(refs)}")

        documents[doc_id] = {
            "title": identity["title"] or info.get("title", ""),
            "doi": identity["doi"],
            "references": refs,
        }
        identities[doc_id] = identity

    emit("Matching references against the corpus …")
    edges = []
    for from_id, doc in documents.items():
        for ref in doc["references"]:
            target = _match_reference(ref, identities, exclude=from_id)
            if target:
                edges.append({"from": from_id, "to": target, "viaTitle": ref["title"][:120]})

    out = {"documents": documents, "edges": edges}
    _write(out, settings["references_index_path"])
    emit(f"Done. {len(documents)} document(s), {len(edges)} intra-corpus edge(s).")
    return {
        "ok": True,
        "documents": len(documents),
        "edges": len(edges),
        "path": settings["references_index_path"],
    }


def load_references():
    path = Path(get_lab_settings()["references_index_path"])
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None


def corpus_graph():
    """Nodes (your papers) + intra-corpus edges, or None if not built yet."""
    data = load_references()
    if not data:
        return None
    cited_by = defaultdict(int)
    for edge in data["edges"]:
        cited_by[edge["to"]] += 1
    nodes = [
        {
            "id": doc_id,
            "title": doc.get("title") or doc_id,
            "refCount": len(doc.get("references", [])),
            "citedBy": cited_by.get(doc_id, 0),
        }
        for doc_id, doc in data["documents"].items()
    ]
    return {"nodes": nodes, "edges": data["edges"]}


def search_references(query):
    """References across the corpus matching `query` (title/DOI substring), or None if
    not built. Flags whether the referenced paper is itself in the library."""
    data = load_references()
    if not data:
        return None
    q = (query or "").strip().lower()
    if not q:
        return []
    q_tokens = set(_tokens(query))

    identities = {
        doc_id: {"title": doc.get("title"), "doi": doc.get("doi")}
        for doc_id, doc in data["documents"].items()
    }
    matches = []
    for doc_id, doc in data["documents"].items():
        for ref in doc.get("references", []):
            # Match against the FULL citation text (raw incl. venue/journal, title,
            # authors, doi) — not just the paper title — so journal/author/DOI/fragment
            # searches all work. Substring first, then token overlap for slight wording.
            haystack = " ".join(
                x for x in (
                    (ref.get("raw", "") or ""),
                    (ref.get("title", "") or ""),
                    (ref.get("authors", "") or ""),
                    (ref.get("doi", "") or ""),
                ) if x
            ).lower()
            hit = q in haystack
            if not hit and len(q_tokens) >= 2:
                hay_tokens = set(_tokens(haystack))
                if hay_tokens and len(q_tokens & hay_tokens) / len(q_tokens) >= 0.6:
                    hit = True
            if hit:
                target = _match_reference(ref, identities, exclude=doc_id)
                matches.append({
                    "paperDocId": doc_id,
                    "paperTitle": doc.get("title") or doc_id,
                    "reference": ref,
                    "inCorpus": bool(target),
                    "matchedDocId": target,
                })
                if len(matches) >= 50:
                    return matches
    return matches
