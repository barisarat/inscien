"""Map endpoints — the Atlas (one fused graph over the user's own papers).

  POST /api/map {itemKeys, labels?}  -> {nodes, edges, clusters, missing, unmapped}   (sync)

The fused graph blends semantic similarity + direct citation + bibliographic coupling and
communities it (numpy Louvain). The external reference/citer satellites stay on `routers/graph.py`
(OpenAlex). This is pure vector/graph math + a bounded label call, so it's synchronous.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from services.map.fused import fused_map

router = APIRouter(prefix="/api/map", tags=["map"])


class MapIn(BaseModel):
    itemKeys: list[str]
    labels: bool = True


@router.post("")
def map_(body: MapIn):
    return fused_map(body.itemKeys, with_labels=body.labels)
