"""Smoke test for the fused-map algorithm core (no vector store / OpenAlex / LLM needed).

Run inside the backend container:  python scripts/check_fused_map.py

Exercises the pure functions that carry the clustering quality + citation-fusion fix:
  1. Louvain finds 2 communities on two dense groups joined by one bridge edge - the case
     the old connected-components clustering collapsed into ONE blob.
  2. Louvain is deterministic (same input -> identical labels across runs).
  3. A directly-cited pair is kept as an edge even when its cosine is below the semantic floor
     (the "citation rescues a pair the embeddings missed").
"""

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

import numpy as np

from services.map.fused import _build_edges, _communities, _direct_edges, _coupling_scores


def _fail(msg):
    print(f"FAIL: {msg}")
    sys.exit(1)


def test_two_communities_with_bridge():
    # Two triangles {0,1,2} and {3,4,5}, strongly connected within, one weak bridge 2-3.
    def e(i, j, w):
        return {"i": i, "j": j, "weight": w}

    edges = [
        e(0, 1, 1.0), e(1, 2, 1.0), e(0, 2, 1.0),
        e(3, 4, 1.0), e(4, 5, 1.0), e(3, 5, 1.0),
        e(2, 3, 0.25),  # the bridge that connected-components would have merged on
    ]
    labels = _communities(6, edges)
    groups = {}
    for node, c in enumerate(labels):
        groups.setdefault(c, set()).add(node)
    comms = sorted(groups.values(), key=min)
    if len(set(labels)) != 2 or comms != [{0, 1, 2}, {3, 4, 5}]:
        _fail(f"expected 2 communities {{0,1,2}} {{3,4,5}}, got {labels}")
    print("ok: two dense groups + a bridge -> 2 communities (not one blob)")


def test_determinism():
    def e(i, j, w):
        return {"i": i, "j": j, "weight": w}

    edges = [e(0, 1, 1.0), e(1, 2, 1.0), e(0, 2, 1.0),
             e(3, 4, 1.0), e(4, 5, 1.0), e(3, 5, 1.0), e(2, 3, 0.25)]
    a = _communities(6, edges)
    b = _communities(6, edges)
    if a != b:
        _fail(f"non-deterministic clustering: {a} != {b}")
    print("ok: clustering is deterministic across runs")


def test_citation_rescue():
    present = ["A", "B"]
    cos = np.array([[0.0, 0.30], [0.30, 0.0]], dtype="float32")  # below SEM_FLOOR -> sem 0
    direct = _direct_edges(present, {"oaB": "B"}, {"A": {"oaB"}})  # A cites B
    couple = _coupling_scores(present, {"A": {"oaB"}, "B": set()}, {})
    edges = _build_edges(present, cos, direct, couple)
    if len(edges) != 1:
        _fail(f"expected 1 rescued edge, got {len(edges)}: {edges}")
    edge = edges[0]
    if edge["semantic"] != 0.0 or not edge["direct"]:
        _fail(f"expected semantic=0 + direct=True, got {edge}")
    print("ok: a directly-cited low-cosine pair is rescued as an edge")


if __name__ == "__main__":
    test_two_communities_with_bridge()
    test_determinism()
    test_citation_rescue()
    print("\nAll fused-map core checks passed.")
