"""Selection-scoped literature discovery map (OpenAlex-powered).

The Graph workspace mode maps a *selection* of papers: each selected paper plus the works
it cites (fetched from OpenAlex by DOI) become nodes. Fetching is a background job (one
OpenAlex call per paper); the map itself is assembled from the cache on demand.

Privacy: only each selected paper's public DOI is sent to OpenAlex - no PDF, notes, or
library content. See `services/refs/openalex.py`.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.refs.fetch_jobs import get_job, start_citing_job, start_job, start_prefetch_job
from services.refs.refstore import citing_graph, discovery_graph, fetch_status, mapped_keys

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


@router.get("/prefetch-status")
def graph_prefetch_status():
    """How many DOI-bearing papers still need a citation fetch - drives the 'Fetch citations (N)'
    action so the user opts in rather than auto-running a long whole-library fetch."""
    from services.zotero.reader import library_items
    doi_keys = {it["itemKey"] for it in library_items() if it.get("doi")}
    done = set(mapped_keys())
    return {"pending": len(doi_keys - done), "total": len(doi_keys)}


@router.post("/prefetch")
def graph_prefetch():
    """Fetch references + citers for the whole library (DOI-bearing items) as one background job,
    so any later selection's map renders from cache. Runs references first (papers become
    References-mappable at ~50%), then citers. Polls via GET /fetch/{job_id}."""
    from services.zotero.reader import library_items
    keys = [it["itemKey"] for it in library_items() if it.get("doi")]
    return {"jobId": start_prefetch_job(keys), "count": len(keys)}


@router.get("/mapped-keys")
def graph_mapped_keys():
    """itemKeys that already have a cached OpenAlex map (navigator 'mapped' dot)."""
    return {"keys": mapped_keys()}


@router.post("")
def graph_discovery(body: ItemKeysIn):
    """Assemble the References map (what your papers cite) over the mapped subset."""
    return discovery_graph(body.itemKeys)


@router.post("/citing-fetch")
def graph_citing_fetch(body: ItemKeysIn):
    """Kick off the OpenAlex Cited-by fetch (what cites your papers) as a background job.
    Polls via the shared GET /fetch/{job_id}."""
    return {"jobId": start_citing_job(body.itemKeys)}


@router.post("/citing")
def graph_citing(body: ItemKeysIn):
    """Assemble the Cited-by map (works that cite your papers) over the mapped subset."""
    return citing_graph(body.itemKeys)
