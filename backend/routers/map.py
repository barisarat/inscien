"""Map endpoints — the Similarity lens (content map over the user's own papers).

  POST /api/map/similarity {itemKeys, labels?}  -> {nodes, edges, missing}   (sync)

The Citations lens lives in `routers/graph.py` (OpenAlex). This is pure vector math + a
bounded label call, so it's synchronous.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from services.map.similarity import similarity_map

router = APIRouter(prefix="/api/map", tags=["map"])


class SimilarityIn(BaseModel):
    itemKeys: list[str]
    labels: bool = True


@router.post("/similarity")
def similarity(body: SimilarityIn):
    return similarity_map(body.itemKeys, with_labels=body.labels)
