"""Similarity map — the Map's default lens.

A content-similarity graph over the user's *own* papers, built from their paper-level
embeddings (one vector per paper, mean of its chunk vectors; see `qdrant_store`). Pure vector
math + ONE bounded LLM call per cluster for a short label — no agent loop, no retrieval Q&A.

Nodes = the in-scope papers. Edges = k-NN similarity links above a cutoff (so the graph
clusters instead of becoming a hairball). Connected components → clusters → a short topic label,
which is the "organize my library" payoff. The force-graph layout turns this into visible
territory.
"""

import logging
from collections import defaultdict

from services.lab.qdrant_store import (
    backfill_paper_vectors,
    get_paper_vectors,
    query_similar_papers,
)
from services.llm.client import chat_create, text_of

logger = logging.getLogger(__name__)

SIM_K = 4              # neighbors considered per paper
SIM_CUTOFF = 0.55     # cosine cutoff (bge-small) — below this, papers aren't "related"
MAX_CLUSTERS_LABELED = 12


def _resolve_titles(item_keys):
    from routers.papers import resolve_titles  # lazy: avoid router<->service import cycle

    return resolve_titles(item_keys)


def _collections(item_keys):
    from services.zotero.reader import item_primary_collection

    try:
        return item_primary_collection(item_keys)
    except Exception:
        logger.exception("collection grouping lookup failed")
        return {}


def _components(node_ids, edges):
    """Connected components over the undirected similarity graph (union-find)."""
    parent = {n: n for n in node_ids}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for e in edges:
        a, b = e["source"], e["target"]
        if a in parent and b in parent:
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

    groups = defaultdict(list)
    for n in node_ids:
        groups[find(n)].append(n)
    return list(groups.values())


def _label_cluster(titles):
    """One short topic label for a cluster, from a sample of its paper titles. Bounded LLM
    call; returns None on any failure (the graph renders without labels)."""
    sample = "; ".join(titles[:8])
    prompt = (
        "Give a SHORT topic label (2-4 words) for a cluster of research papers with these "
        "titles. Respond with ONLY the label, no quotes.\n\n" + sample
    )
    try:
        out = text_of(chat_create(messages=[{"role": "user", "content": prompt}], max_tokens=200))
        cleaned = out.strip().strip('"').strip()
        return cleaned[:40] if cleaned else None
    except Exception:
        logger.exception("cluster label failed")
        return None


def similarity_map(item_keys, with_labels=True):
    """{nodes, edges, missing}. `missing` = in-scope items with no paper vector yet (not indexed)."""
    item_keys = list(dict.fromkeys(item_keys))
    if not item_keys:
        return {"nodes": [], "edges": [], "missing": []}

    # Build any missing paper vectors from already-indexed chunk vectors (no reparse).
    try:
        backfill_paper_vectors(item_keys)
    except Exception:
        logger.exception("paper-vector backfill failed; proceeding with whatever exists")

    vectors = get_paper_vectors(item_keys)
    present = [k for k in item_keys if k in vectors]
    missing = [k for k in item_keys if k not in vectors]
    titles = _resolve_titles(present)
    collections = _collections(present)

    # k-NN edges, deduped undirected, keeping the strongest weight per pair.
    edge_weight = {}
    for k in present:
        for nb in query_similar_papers(vectors[k], present, SIM_K, exclude_id=k):
            if nb["score"] < SIM_CUTOFF:
                continue
            pair = tuple(sorted((k, nb["sourceId"])))
            if nb["score"] > edge_weight.get(pair, 0):
                edge_weight[pair] = nb["score"]
    edges = [{"source": a, "target": b, "weight": round(w, 3)} for (a, b), w in edge_weight.items()]

    # Clusters (largest first) + labels.
    cluster_of, cluster_label = {}, {}
    for idx, comp in enumerate(sorted(_components(present, edges), key=len, reverse=True)):
        for n in comp:
            cluster_of[n] = idx
        if with_labels and len(comp) >= 2 and idx < MAX_CLUSTERS_LABELED:
            cluster_label[idx] = _label_cluster([titles.get(n, n) for n in comp])

    nodes = [
        {
            "id": k,
            "label": titles.get(k, k),
            "type": "owned",
            "cluster": cluster_of.get(k),
            "clusterLabel": cluster_label.get(cluster_of.get(k)),
            "collection": collections.get(k),
        }
        for k in present
    ]
    return {"nodes": nodes, "edges": edges, "missing": missing}
