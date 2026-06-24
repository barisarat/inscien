"""Fused map — the Atlas's single graph over the user's *own* papers.

ONE weighted graph that blends three relationship signals between in-scope papers, then finds
communities over it (numpy Louvain). This replaces the old similarity-only map (semantic kNN +
connected-components), which over-merged on a single bridging edge and threw away both the vector
geometry and the *literal* citation links we already have data for.

Signals (all undirected on the map, computed only over the owned/in-scope set):
  - semantic   — cosine of paper-level vectors (mean of chunk vectors). Continuous, leads.
  - direct     — A's reference list contains B (OpenAlex id / DOI). Binary, reinforces/rescues.
  - coupling   — A and B share references (bibliographic coupling) and/or share citers
                 (co-citation). Normalized by overlap-over-min-size.

Fusion is additive (`w = W_SEM*sem + W_DIRECT*direct + W_COUPLE*couple`) so semantic dominates but
a citation-linked pair the embeddings missed is still rescued above the keep threshold. Clusters
come from the *same* fused graph via Louvain, so the floating groups you see ARE the clusters.

Pure vector/graph math + ONE bounded LLM call per cluster for a short label — no agent loop.
"""

import logging
from collections import defaultdict

import numpy as np

from services.lab.qdrant_store import backfill_paper_vectors, get_paper_vectors
from services.llm.client import chat_create, text_of
from services.refs import refstore

logger = logging.getLogger(__name__)

# --- signal normalization -------------------------------------------------------------------
SEM_FLOOR = 0.45      # cosine at/below this contributes 0 (noise floor for bge-small paper means)
SEM_KNN = 6           # semantic neighbours kept per paper (sparsify the dense cosine block)

# --- fusion weights (semantic leads; citation reinforces / rescues) -------------------------
W_SEM = 1.00          # weight on the rescaled semantic term (alone can reach ~1.0)
W_DIRECT = 0.60       # weight on a direct citation between A,B (alone clears EDGE_KEEP → rescue)
W_COUPLE = 0.45       # weight on bibliographic coupling / co-citation
COUPLE_BLEND = 0.5    # within coupling: blend of (bib-coupling, co-citation) when both present

# --- edge keep thresholds -------------------------------------------------------------------
EDGE_KEEP = 0.20      # min fused weight to keep an edge
CITE_RESCUE = True    # always keep a directly-cited pair regardless of EDGE_KEEP
HUB_FRAC = 0.40       # skip an external ref shared by > this fraction of the corpus (generic anchor)

# --- clustering -----------------------------------------------------------------------------
LOUVAIN_SEED = 1234   # determinism (seeded node-visit order)
RESOLUTION = 1.0      # modularity resolution (lower → bigger communities)
MAX_CLUSTERS_LABELED = 12
MIN_LABEL_SIZE = 2


# --- small reused helpers (lifted from the retired similarity.py) ----------------------------

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


# --- citation signal extraction --------------------------------------------------------------

def _ref_id(ref):
    """A reference/citer id, whether the record is a raw OpenAlex url (unresolved, as written at
    index time) or a resolved dict {id, title, ...}."""
    if isinstance(ref, str):
        return ref
    if isinstance(ref, dict):
        return ref.get("id")
    return None


def _load_citation_signals(present):
    """Pull the per-paper citation signals for the mapped subset of `present` from the refstore
    cache. Returns dicts used to compute direct + coupling edges.

      mapped_keys  — set of in-scope keys with a current OpenAlex record
      key_by_oaid  — {openalexId: itemKey} for reverse lookup (direct citation)
      ref_ids      — {itemKey: set(referenced openalexIds)}
      cite_ids     — {itemKey: set(citing openalexIds)}  (only where citingWorks present)
    """
    cache = refstore._load()
    mapped_keys, ref_ids, cite_ids, key_by_oaid = set(), {}, {}, {}
    for k in present:
        rec = cache.get(k)
        if not refstore._is_mapped(rec):
            continue
        mapped_keys.add(k)
        oaid = rec.get("openalexId")
        if oaid:
            key_by_oaid[oaid] = k
        ref_ids[k] = {rid for rid in (_ref_id(r) for r in (rec.get("references") or [])) if rid}
        cw = {cid for cid in (_ref_id(c) for c in (rec.get("citingWorks") or [])) if cid}
        if cw:
            cite_ids[k] = cw
    return mapped_keys, key_by_oaid, ref_ids, cite_ids


def _direct_edges(present, key_by_oaid, ref_ids):
    """{(a,b): direction} for in-scope pairs where one paper cites the other. Keys are sorted
    (a<b); direction is 'AtoB' (a cites b), 'BtoA' (b cites a), or 'both'."""
    cites = defaultdict(bool)  # (citer, cited) -> True
    for citer, ids in ref_ids.items():
        for rid in ids:
            cited = key_by_oaid.get(rid)
            if cited and cited != citer:
                cites[(citer, cited)] = True
    out = {}
    for (citer, cited) in cites:
        a, b = (citer, cited) if citer < cited else (cited, citer)
        forward = cites.get((a, b), False)   # a cites b
        backward = cites.get((b, a), False)  # b cites a
        out[(a, b)] = "both" if (forward and backward) else ("AtoB" if forward else "BtoA")
    return out


def _coupling_scores(present, ref_ids, cite_ids):
    """{(a,b): couple in [0,1]} from shared references (bibliographic coupling) blended with
    shared citers (co-citation). Built via an inverted index; hub anchors are skipped."""
    n = len(present)
    hub_cap = max(2, int(HUB_FRAC * n)) if n else 2

    def _overlap_counts(per_key_ids):
        posting = defaultdict(list)
        for k, ids in per_key_ids.items():
            for ext in ids:
                posting[ext].append(k)
        shared = defaultdict(int)
        for ext, keys in posting.items():
            if len(keys) < 2 or len(keys) > hub_cap:
                continue
            for i in range(len(keys)):
                for j in range(i + 1, len(keys)):
                    a, b = (keys[i], keys[j]) if keys[i] < keys[j] else (keys[j], keys[i])
                    shared[(a, b)] += 1
        return shared

    bib_shared = _overlap_counts(ref_ids)
    cocite_shared = _overlap_counts(cite_ids)

    def _norm(shared, ids_by_key, a, b):
        denom = max(1, min(len(ids_by_key.get(a, ())), len(ids_by_key.get(b, ()))))
        return shared.get((a, b), 0) / denom

    out = {}
    for pair in set(bib_shared) | set(cocite_shared):
        a, b = pair
        bib = _norm(bib_shared, ref_ids, a, b)
        if pair in cocite_shared:
            cocite = _norm(cocite_shared, cite_ids, a, b)
            score = COUPLE_BLEND * bib + (1 - COUPLE_BLEND) * cocite
        else:
            score = bib
        if score > 0:
            out[pair] = score
    return out


# --- graph construction ----------------------------------------------------------------------

def _semantic_block(present, vectors):
    """L2-normalize the paper vectors and return the n×n cosine matrix (one matmul)."""
    mat = np.asarray([vectors[k] for k in present], dtype="float32")
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    unit = mat / norms
    cos = unit @ unit.T
    np.fill_diagonal(cos, 0.0)
    return cos


def _build_edges(present, cos, direct, couple):
    """Fuse the three signals into kept, decomposed edges. `direct`/`couple` are keyed by
    string-sorted item-key pairs, so every lookup canonicalizes to that order."""
    n = len(present)
    idx = {k: i for i, k in enumerate(present)}
    sem = np.clip((cos - SEM_FLOOR) / (1.0 - SEM_FLOOR), 0.0, 1.0)

    def _pair(i, j):  # canonical index order so a pair is added once, not twice
        return (i, j) if i < j else (j, i)

    # Candidate pairs: semantic kNN (cap the hairball) ∪ every citation/coupling pair.
    cand = set()
    if n > 1:
        k = min(SEM_KNN, n - 1)
        nn = np.argpartition(-sem, kth=k, axis=1)[:, : k + 1]
        for i in range(n):
            for j in nn[i]:
                j = int(j)
                if j != i and sem[i, j] > 0:
                    cand.add(_pair(i, j))
    for (a, b) in direct:
        cand.add(_pair(idx[a], idx[b]))
    for (a, b) in couple:
        cand.add(_pair(idx[a], idx[b]))

    edges = []
    for (i, j) in cand:
        a, b = present[i], present[j]
        key = (a, b) if a < b else (b, a)  # match the string-sorted keys of direct/couple
        s = float(sem[i, j])
        d = key in direct
        c = couple.get(key, 0.0)
        w = W_SEM * s + W_DIRECT * (1.0 if d else 0.0) + W_COUPLE * c
        if w >= EDGE_KEEP or (CITE_RESCUE and d):
            edges.append({
                "i": i, "j": j, "src": key[0], "dst": key[1], "weight": w,
                "semantic": round(s, 3), "coupling": round(c, 3),
                "direct": d, "direction": direct.get(key),
            })
    return edges


# --- community detection (numpy Louvain) -----------------------------------------------------

def _build_level(n, edge_list):
    """Adjacency (dict per node, self-loops allowed), weighted degree, and total weight m."""
    adj = [defaultdict(float) for _ in range(n)]
    degree = [0.0] * n
    m = 0.0
    for i, j, w in edge_list:
        m += w
        if i == j:
            adj[i][i] += w
            degree[i] += 2 * w
        else:
            adj[i][j] += w
            adj[j][i] += w
            degree[i] += w
            degree[j] += w
    return adj, degree, m


def _one_level(n, adj, degree, m, resolution, rng):
    """Local moving: repeatedly move each node to the neighbouring community giving the best
    modularity gain, until no move helps. Returns node→community labels."""
    com = list(range(n))
    tot = list(degree)
    two_m = 2.0 * m
    eps = 1e-12
    improved = True
    while improved:
        improved = False
        for node in rng.permutation(n):
            node = int(node)
            ci = com[node]
            neigh = defaultdict(float)
            for j, w in adj[node].items():
                if j != node:
                    neigh[com[j]] += w
            degc_totw = degree[node] / two_m
            tot[ci] -= degree[node]  # pull node out of its community
            best_com = ci
            best_gain = neigh.get(ci, 0.0) - resolution * tot[ci] * degc_totw
            for c, wc in neigh.items():
                gain = wc - resolution * tot[c] * degc_totw
                if gain > best_gain + eps:
                    best_gain, best_com = gain, c
            tot[best_com] += degree[node]
            com[node] = best_com
            if best_com != ci:
                improved = True
    return com


def _communities(n, edges, resolution=RESOLUTION, seed=LOUVAIN_SEED):
    """Multilevel Louvain over the fused graph. Deterministic for a fixed seed. Returns a list
    of length n mapping each node to a community id (not yet size-ordered)."""
    if n == 0:
        return []
    rng = np.random.default_rng(seed)
    labels = list(range(n))  # original node → current-level node
    cur_n = n
    cur_edges = [(e["i"], e["j"], float(e["weight"])) for e in edges]
    while True:
        adj, degree, m = _build_level(cur_n, cur_edges)
        if m == 0:
            break
        com = _one_level(cur_n, adj, degree, m, resolution, rng)
        dense, new_com = {}, []
        for node in range(cur_n):
            c = com[node]
            if c not in dense:
                dense[c] = len(dense)
            new_com.append(dense[c])
        labels = [new_com[lbl] for lbl in labels]
        num = len(dense)
        if num == cur_n or num <= 1:  # converged (no aggregation) or single community
            break
        agg = defaultdict(float)
        for i, j, w in cur_edges:
            a, b = new_com[i], new_com[j]
            agg[(a, b) if a <= b else (b, a)] += w
        cur_edges = [(a, b, w) for (a, b), w in agg.items()]
        cur_n = num
    return labels


# --- orchestrator ----------------------------------------------------------------------------

def fused_map(item_keys, with_labels=True):
    """The Atlas graph for an in-scope set of papers.

    Returns {nodes, edges, clusters, missing, unmapped}:
      nodes    — owned papers with cluster id/label, collection, and metadata.
      edges    — fused, decomposed (semantic/coupling/citation) undirected links.
      clusters — {id, label, size}, largest first.
      missing  — in-scope keys with no paper vector yet (not indexed).
      unmapped — in-scope keys that have a vector but no OpenAlex record (semantic-only nodes).
    """
    item_keys = list(dict.fromkeys(item_keys))
    if not item_keys:
        return {"nodes": [], "edges": [], "clusters": [], "missing": [], "unmapped": []}

    # Build any missing paper vectors from already-indexed chunk vectors (no reparse).
    try:
        backfill_paper_vectors(item_keys)
    except Exception:
        logger.exception("paper-vector backfill failed; proceeding with whatever exists")

    vectors = get_paper_vectors(item_keys)
    present = [k for k in item_keys if k in vectors]
    missing = [k for k in item_keys if k not in vectors]
    if not present:
        return {"nodes": [], "edges": [], "clusters": [], "missing": missing, "unmapped": []}

    # Signals → fused edges.
    mapped_keys, key_by_oaid, ref_ids, cite_ids = _load_citation_signals(present)
    cos = _semantic_block(present, vectors)
    direct = _direct_edges(present, key_by_oaid, ref_ids)
    couple = _coupling_scores(present, ref_ids, cite_ids)
    edges = _build_edges(present, cos, direct, couple)

    # Communities over the fused graph, relabelled largest-first.
    raw = _communities(len(present), edges)
    sizes = defaultdict(int)
    for c in raw:
        sizes[c] += 1
    order = {c: rank for rank, (c, _) in enumerate(sorted(sizes.items(), key=lambda kv: (-kv[1], kv[0])))}
    cluster_of = {present[i]: order[c] for i, c in enumerate(raw)}

    # Metadata + per-cluster members (for labels and node payloads).
    titles = _resolve_titles(present)
    collections = _collections(present)
    cache = refstore._load()
    members = defaultdict(list)
    for k in present:
        members[cluster_of[k]].append(k)

    cluster_label = {}
    if with_labels:
        for cid, ks in members.items():
            if len(ks) >= MIN_LABEL_SIZE and cid < MAX_CLUSTERS_LABELED:
                cluster_label[cid] = _label_cluster([titles.get(x, x) for x in ks])

    nodes = []
    for k in present:
        meta = _node_meta(k)
        rec = cache.get(k) if refstore._is_mapped(cache.get(k)) else None
        cid = cluster_of[k]
        nodes.append({
            "id": k,
            "label": meta.get("title") or titles.get(k, k),
            "type": "owned",
            "cluster": cid,
            "clusterLabel": cluster_label.get(cid),
            "collection": collections.get(k),
            "authors": meta.get("authors") or [],
            "year": meta.get("year") or (rec.get("year") if rec else None),
            "date": rec.get("date") if rec else None,
            "doi": meta.get("doi") or (rec.get("doi") if rec else None),
            "globalCitedBy": rec.get("citedBy") if rec else None,
            "mapped": k in mapped_keys,
        })

    out_edges = [
        {
            "source": e["src"],
            "target": e["dst"],
            "weight": round(e["weight"], 3),
            "semantic": e["semantic"],
            "coupling": e["coupling"],
            "citation": {"direct": e["direct"], "direction": e["direction"]},
        }
        for e in edges
    ]
    clusters = [
        {"id": cid, "label": cluster_label.get(cid), "size": len(ks)}
        for cid, ks in sorted(members.items(), key=lambda kv: kv[0])
    ]
    return {
        "nodes": nodes,
        "edges": out_edges,
        "clusters": clusters,
        "missing": missing,
        "unmapped": [k for k in present if k not in mapped_keys],
    }


def _node_meta(item_key):
    from services.zotero.reader import item_metadata

    try:
        return item_metadata(item_key) or {}
    except Exception:
        logger.exception("item metadata lookup failed for %s", item_key)
        return {}
