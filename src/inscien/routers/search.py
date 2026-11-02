"""Search and Ask over the indexed papers (see inscien/search/).

    GET /api/search/status   what is available: the extra, the index, Ollama and its models
    GET /api/search/titles   type-ahead: papers by title or author
    GET /api/search          passages for a query
    GET /api/search/ask      quotes answering a question, plus a short response

A result names its paper by Zotero itemKey and its page; the UI opens it through /api/papers.
"""

import json
import os

from fastapi import APIRouter, HTTPException, Query

from inscien import search
from inscien.core.paths import search_index_path

router = APIRouter(prefix="/api/search", tags=["search"])

NOT_INSTALLED = "Search is not installed: pip install 'inscien[search]'"
NOT_INDEXED = "The library is not indexed yet."


def _conn():
    if not search.installed():
        raise HTTPException(status_code=409, detail=NOT_INSTALLED)
    if not os.path.exists(search_index_path()):
        raise HTTPException(status_code=409, detail=NOT_INDEXED)
    from inscien.search.index import connect
    return connect(readonly=True)


def _keys(collection: int | None):
    if collection is None:
        return None
    from inscien.services.zotero import reader
    return reader.resolve_collection_items(collection, recursive=True)


def _model(model: str | None, needed: bool) -> str | None:
    if not needed:
        return None
    from inscien.search import llm
    names = llm.models()
    if names is None:
        raise HTTPException(status_code=503, detail="Ollama is not running.")
    chosen = model or llm.default_model()
    if not chosen or chosen not in names:
        raise HTTPException(status_code=409, detail="No such model in Ollama.")
    return chosen


def _row(row: dict) -> dict:
    return {"chunkId": row["id"], "itemKey": row["item_key"], "title": row["title"], "authors": row["authors"],
            "year": row["year"], "venue": row["venue"], "page": row["page"], "text": row["text"],
            "bbox": json.loads(row["bbox_json"]) if row["bbox_json"] else None,
            "dropped": bool(row.get("dropped"))}


@router.get("/status")
def status():
    installed = search.installed()
    out = {"installed": installed, "indexed": False, "papers": 0, "passages": 0, "models": None, "defaultModel": None,
           "minYear": None, "maxYear": None}
    if not installed:
        return out
    from inscien.search import llm
    out["models"] = llm.models()
    out["defaultModel"] = llm.default_model()
    if os.path.exists(search_index_path()):
        conn = _conn()
        try:
            out["papers"] = conn.execute("SELECT COUNT(*) FROM papers WHERE status = 'ok'").fetchone()[0]
            out["passages"] = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
            out["minYear"], out["maxYear"] = conn.execute("SELECT MIN(year), MAX(year) FROM papers WHERE status = 'ok'").fetchone()
            out["indexed"] = out["papers"] > 0
        finally:
            conn.close()
    return out


@router.get("/titles")
def titles(q: str = ""):
    if not q.strip() or not search.installed() or not os.path.exists(search_index_path()):
        return {"papers": []}
    from inscien.search import query
    conn = _conn()
    try:
        return {"papers": [{"itemKey": r["item_key"], "title": r["title"], "authors": r["authors"], "year": r["year"]}
                           for r in query.titles(conn, q)]}
    finally:
        conn.close()


def _passages(q, mode, rerank, limit, per_paper, year_from, year_to, collection, model):
    from inscien.search import llm, query
    if mode not in query.MODES or rerank not in query.RERANKS:
        raise HTTPException(status_code=400, detail="Unknown mode or rerank.")
    conn = _conn()
    try:
        return query.passages(conn, q, mode, rerank, limit, per_paper, year_from, year_to, _keys(collection),
                              _model(model, rerank == "llm"))
    except llm.LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    finally:
        conn.close()


@router.get("")
def run_search(q: str = "", mode: str = "hybrid", rerank: str = "off",
               limit: int = Query(20, ge=1, le=100), perPaper: int = Query(3, ge=1, le=20),
               yearFrom: int | None = None, yearTo: int | None = None, collection: int | None = None,
               model: str | None = None):
    if not q.strip():
        return {"results": []}
    rows = _passages(q.strip(), mode, rerank, limit, perPaper, yearFrom, yearTo, collection, model)
    return {"results": [_row(r) for r in rows]}


@router.get("/ask")
def ask(q: str = "", mode: str = "hybrid", rerank: str = "off", passages: int = Query(10, ge=3, le=30),
        perPaper: int = Query(3, ge=1, le=20), yearFrom: int | None = None, yearTo: int | None = None,
        collection: int | None = None, model: str | None = None):
    if not q.strip():
        return {"summary": "", "quotes": []}
    from inscien.search import answer, llm
    chosen = _model(model, True)
    rows = _passages(q.strip(), mode, rerank, passages, perPaper, yearFrom, yearTo, collection, chosen)
    pdfs = {}
    conn = _conn()
    try:
        for r in conn.execute("SELECT item_key, pdf FROM papers").fetchall():
            pdfs[r["item_key"]] = r["pdf"]
    finally:
        conn.close()
    try:
        result = answer.compose(q.strip(), rows, chosen, lambda key: pdfs.get(key) if os.path.exists(pdfs.get(key) or "") else None)
    except llm.LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {**result, "model": chosen}
