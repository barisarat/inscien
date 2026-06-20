"""Reference-graph build endpoint (parity with /api/lab/reindex).

The graph + reference-search SKILLS only read the prebuilt manifest; this endpoint (and
scripts/build_references.py) are the explicit build step that produces it.
"""

from fastapi import APIRouter

from services.refs.build import build_references

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.post("/build")
def graph_build():
    return build_references()
