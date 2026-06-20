"""Write-with-citations endpoints — the agentic literature-review pipeline.

Two-phase: a fast synchronous **plan** (top-N candidate papers + proposed extraction
dimensions) the user confirms, then a **background job** that runs
extract → compare → synthesize → write and is polled for progress/result.

  POST /api/write/plan {topic}                       -> {papers, dimensions}   (seconds)
  POST /api/write      {topic, docIds, dimensions}   -> {jobId}                (background)
  GET  /api/write/{jobId}                              -> {status, stage, progress, result?}
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from routers.papers import corpus_papers
from services.writeup.jobs import get_job, start_job
from services.writeup.pipeline import MAX_DIMENSIONS, MAX_PAPERS, propose_plan

router = APIRouter(prefix="/api/write", tags=["write"])


class PlanIn(BaseModel):
    topic: str


class WriteIn(BaseModel):
    topic: str
    docIds: list[str]
    dimensions: list[str]


@router.post("/plan")
def plan(body: PlanIn):
    topic = (body.topic or "").strip()
    if len(topic) < 2:
        raise HTTPException(status_code=400, detail="Enter a topic to write about.")
    return propose_plan(topic)


@router.post("")
def start(body: WriteIn):
    topic = (body.topic or "").strip()
    if len(topic) < 2:
        raise HTTPException(status_code=400, detail="Enter a topic to write about.")

    known = {d["docId"] for d in corpus_papers()}
    doc_ids = [d for d in dict.fromkeys(body.docIds) if d in known][:MAX_PAPERS]
    if not doc_ids:
        raise HTTPException(status_code=400, detail="Select at least one paper for the review.")

    dimensions = [d.strip() for d in body.dimensions if d and d.strip()][:MAX_DIMENSIONS]
    if not dimensions:
        raise HTTPException(status_code=400, detail="Add at least one extraction dimension.")

    return {"jobId": start_job(topic, doc_ids, dimensions)}


@router.get("/{job_id}")
def status(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job
