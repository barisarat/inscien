"""Claim-verification endpoints.

Single-phase (no propose step — the claim IS the input): start a background job that checks
the claim against the user's selected papers, then poll it.

  POST /api/verify          {claim, docIds}  -> {jobId}        (background)
  GET  /api/verify/{jobId}                    -> {status, stage, progress, result?}
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from routers.papers import corpus_papers
from services.verify.jobs import get_job, start_job
from services.verify.pipeline import MAX_VERIFY_PAPERS

router = APIRouter(prefix="/api/verify", tags=["verify"])


class VerifyIn(BaseModel):
    claim: str
    docIds: list[str]


def _valid_doc_ids(doc_ids):
    """Keep only ids present in the library, de-duped and order-preserving."""
    known = {d["docId"] for d in corpus_papers()}
    out = []
    for doc_id in doc_ids:
        if doc_id in known and doc_id not in out:
            out.append(doc_id)
    return out


@router.post("")
def start(body: VerifyIn):
    claim = (body.claim or "").strip()
    if not claim:
        raise HTTPException(status_code=400, detail="Enter a claim to check.")

    doc_ids = _valid_doc_ids(body.docIds)
    if not doc_ids:
        raise HTTPException(status_code=400, detail="Select at least one paper to check against.")
    if len(doc_ids) > MAX_VERIFY_PAPERS:
        raise HTTPException(
            status_code=400,
            detail=f"Check at most {MAX_VERIFY_PAPERS} papers at once — narrow your selection.",
        )

    return {"jobId": start_job(claim, doc_ids)}


@router.get("/{job_id}")
def status(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job
