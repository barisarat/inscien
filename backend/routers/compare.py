"""Cross-paper comparison endpoints.

Two-phase, by design: a fast synchronous **propose** call suggests the comparison axes
(the user confirms/edits), then **start** kicks off the long per-cell grounded extraction
as a background job the UI polls.

  POST /api/compare/propose {docIds}              -> {dimensions}     (seconds)
  POST /api/compare         {docIds, dimensions}  -> {jobId}          (background)
  GET  /api/compare/{jobId}                        -> {status, stage, progress, result?}
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from routers.papers import corpus_papers
from services.compare.jobs import get_job, start_job
from services.compare.pipeline import MAX_DIMENSIONS, MAX_PAPERS, propose_dimensions

router = APIRouter(prefix="/api/compare", tags=["compare"])


class ProposeIn(BaseModel):
    docIds: list[str]


class CompareIn(BaseModel):
    docIds: list[str]
    dimensions: list[str]


def _valid_doc_ids(doc_ids):
    """Keep only ids present in the library, de-duped and order-preserving."""
    known = {d["docId"] for d in corpus_papers()}
    out = []
    for doc_id in doc_ids:
        if doc_id in known and doc_id not in out:
            out.append(doc_id)
    return out


@router.post("/propose")
def propose(body: ProposeIn):
    doc_ids = _valid_doc_ids(body.docIds)
    if len(doc_ids) < 2:
        raise HTTPException(status_code=400, detail="Pick at least two papers to compare.")
    if len(doc_ids) > MAX_PAPERS:
        raise HTTPException(status_code=400, detail=f"Compare at most {MAX_PAPERS} papers at once.")
    return {"dimensions": propose_dimensions(doc_ids)}


@router.post("")
def start(body: CompareIn):
    doc_ids = _valid_doc_ids(body.docIds)
    if len(doc_ids) < 2:
        raise HTTPException(status_code=400, detail="Pick at least two papers to compare.")
    if len(doc_ids) > MAX_PAPERS:
        raise HTTPException(status_code=400, detail=f"Compare at most {MAX_PAPERS} papers at once.")

    dimensions = [d.strip() for d in body.dimensions if d and d.strip()][:MAX_DIMENSIONS]
    if not dimensions:
        raise HTTPException(status_code=400, detail="Add at least one comparison dimension.")

    return {"jobId": start_job(doc_ids, dimensions)}


@router.get("/{job_id}")
def status(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job
