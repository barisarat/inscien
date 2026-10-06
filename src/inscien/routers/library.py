"""The reference library: papers built from their own PDFs, and the map over them.

This replaces the OpenAlex-per-DOI path for reference data. The API is still used, but only
during the build (`tools/build.mjs`) and only for identity and citation counts - never for the
reference list itself, which OpenAlex reports partially or not at all for arXiv and ACL records.
By the time the app reads it, everything is a local file.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from inscien.services.library.store import graph, list_papers, load_paper

router = APIRouter(prefix="/api/library", tags=["library"])


class SlugsIn(BaseModel):
    slugs: list[str]


@router.get("/papers")
def library_papers():
    """Every built paper, for the sidebar."""
    return {"papers": list_papers()}


@router.get("/papers/{slug}")
def library_paper(slug: str):
    """One paper in full, including every reference and its resolution."""
    paper = load_paper(slug)
    if paper is None:
        raise HTTPException(status_code=404, detail="paper not found")
    return paper


@router.post("/graph")
def library_graph(body: SlugsIn):
    """The reference map over the selected papers. Assembled from disk - no jobs, no fetching."""
    return graph(body.slugs)
