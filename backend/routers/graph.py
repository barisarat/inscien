"""Reference-graph build endpoint (parity with /api/lab/reindex).

The graph + reference-search SKILLS only read the prebuilt manifest; this endpoint (and
scripts/build_references.py) are the explicit build step that produces it.
"""

from fastapi import APIRouter, HTTPException

from services.refs.build import corpus_graph
from services.refs.graph_jobs import get_job, start_job

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("")
def graph_get():
    """The prebuilt intra-corpus citation map (or null if it hasn't been built yet)."""
    return {"graph": corpus_graph()}


@router.post("/build")
def graph_build():
    """Kick off the (minutes-long) reference build as a background job."""
    return {"jobId": start_job()}


@router.get("/build/{job_id}")
def graph_build_status(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job
