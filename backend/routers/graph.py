"""Selection-scoped literature discovery map (OpenAlex-powered).

The Graph workspace mode maps a *selection* of papers: each selected paper plus the works
it cites (fetched from OpenAlex by DOI) become nodes. Fetching is a background job (one
OpenAlex call per paper); the map itself is assembled from the cache on demand.

Privacy: only each selected paper's public DOI is sent to OpenAlex — no PDF, notes, or
library content. See `services/refs/openalex.py`.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.refs.fetch_jobs import get_job, start_job
from services.refs.refstore import discovery_graph, fetch_status, mapped_keys

router = APIRouter(prefix="/api/graph", tags=["graph"])


class ItemKeysIn(BaseModel):
    itemKeys: list[str]


@router.post("/fetch-status")
def graph_fetch_status(body: ItemKeysIn):
    """Coverage of a selection: {mapped, unmapped, noDoi} (drives the confirm card)."""
    return fetch_status(body.itemKeys)


@router.post("/fetch")
def graph_fetch(body: ItemKeysIn):
    """Kick off the OpenAlex reference fetch for a selection as a background job."""
    return {"jobId": start_job(body.itemKeys)}


@router.get("/fetch/{job_id}")
def graph_fetch_job(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@router.get("/mapped-keys")
def graph_mapped_keys():
    """itemKeys that already have a cached OpenAlex map (navigator 'mapped' dot)."""
    return {"keys": mapped_keys()}


@router.post("")
def graph_discovery(body: ItemKeysIn):
    """Assemble the discovery map over the mapped subset of the selection."""
    return discovery_graph(body.itemKeys)
