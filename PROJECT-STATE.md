# InScien — Project State & Handoff

A working note to resume from in a new session. For the original product brief see
[`INSCIEN-BRIEF.md`](INSCIEN-BRIEF.md), for architecture conventions [`CLAUDE.md`](CLAUDE.md),
and for how to run it [`RUNNING.md`](RUNNING.md). This file captures **where the product is
now, why, what changed recently, what's legacy, and what's next.**

_Last updated: 2026-06 (Atlas rebuild — fused graph + Louvain, citations-in-indexing, inspect
panel; code-complete, backend awaiting in-container verification)._

---

## 1. What InScien is now (post-pivot)

A **local-first, single-user** companion over the user's own **Zotero library**. The product
has **pivoted** to two transformation-shaped modes, and away from chat/agent/query features:

- **Map** (default) — a visual atlas of your library. **Scope × Lens**:
  - *Scope*: current selection / a Zotero collection / whole library.
  - *Lens*: **Similarity** (embeddings, default) and **Citations** (OpenAlex) with facets
    **References / Cited-by / Gaps**.
- **Narrate** — paper → explanatory script → Kokoro CPU TTS (unchanged, works well).

**Guiding principle:** prefer features that *transform the library into a view/modality*
(low input, robust, legible) over features that *answer queries* (commodity, fragile). Use the
LLM as a **bounded function** (e.g. label a cluster, write a narration script), **never as an
agent loop**. The Map's geometry is 100% deterministic vector/graph math; the only model call
is one optional, fail-open cluster-label per cluster.

Differentiation = **Zotero-native + page-precise + the integration of these views over your own
library** — not the model, and not any single feature (each has competitors; the bundle native
to your library is the edge).

---

## 2. How it runs (stack)

- **Backend** FastAPI · **Frontend** Next.js · **Vector store** Qdrant **embedded (local mode)**
  — no Qdrant container; persists under `data/qdrant`. SQLite at `data/inscien.db`. All durable
  state in `./data`.
- **Generation**: local **Ollama** by default; **optional OpenAI** (or OpenAI-compatible) — key
  is **env-only** (`OPENAI_API_KEY`), never stored in the DB; provider/model chosen in Settings.
- **Run**: dev = `docker compose up` (two containers, hot reload, ports 8200/3200); prod =
  `docker compose -f compose.prod.yaml up --build` (one container, static UI served by FastAPI on
  8200). **One stack at a time** (shared `./data` + port). See [`RUNNING.md`](RUNNING.md).
- **Corpus**: set `ZOTERO_HOST_DIR` to your Zotero data dir (mounted read-only, read via a
  private snapshot). Index items from the navigator (`POST /api/zotero/index`, additive).

---

## 3. What's implemented (current map of the app)

### Map = the Atlas (one fused graph; clustering rebuilt)
- **The fused graph** — `services/map/fused.py` + `routers/map.py` (`POST /api/map`): ONE weighted
  graph over the owned papers blending three signals — **semantic** (paper-vector cosine, one numpy
  matmul), **direct citation** (A's references contain B, by OpenAlex id/DOI), and **bibliographic
  coupling** (shared refs / shared citers, normalized, hub-skipped). Fusion is additive
  (`w = W_SEM·sem + W_DIRECT·direct + W_COUPLE·couple`; semantic leads, citation rescues). Clusters
  come from **numpy Louvain** (`_communities`, multilevel modularity, deterministic) over that same
  graph — replacing the old connected-components blob/shatter. One bounded LLM label per cluster.
  Edges carry **decomposed** components (`semantic`/`coupling`/`citation`) so the frontend can do
  emphasis modes. (Old `services/map/similarity.py` + `/api/map/similarity` deleted.)
- **Indexing foundation** — `services/zotero/ingest.py`: `MAX_INDEX_PAGES` (default 15) caps per-doc
  parsing; each item gets a **paper-level vector** (mean of chunk vectors) in
  `inscien_lab_paper_vectors`; and now a **best-effort OpenAlex fetch** (`_enrich_citations`,
  fail-open, network outside the lock) so the Atlas's citation signals are ready with **no fetch
  gate**. `services/lab/qdrant_store.py`: paper-vector ensure/recreate/upsert/get/backfill (no
  reparse).
- **Citation satellite layer** — still `services/refs/` (`discovery_graph`/`citing_graph`, now
  tolerant of unresolved raw-id refs via `_as_ref`). In the UI these are **emphasis overlays** on
  the same stable map (Connections: Cites → / ← Cited by / Both / Gaps), fetched + resolved lazily.
- **Frontend (one stable canvas)** — `GraphView.tsx` (react-force-graph-2d): layout computed once
  and **pinned** (positions survive emphasis/satellite toggles), cluster **hulls + labels**, color
  by cluster/collection, emphasis dim/highlight, node-click **inspect panel** (`NodeInspector.tsx`:
  metadata + Open PDF / Narrate / Open DOI — Narrate selects the paper and jumps to the Narrate
  tab). `GraphMode.tsx` is the **Scope → Connections → View** rail. Map is the default tab; only
  Map + Narrate are shown in `ActionBar` now (ask/verify/compare/write hidden, backends kept).

### Narrate
Unchanged: `services/narration/` (Kokoro CPU TTS), `NarrateMode.tsx`. **Good, leave as-is.**

### Kept-but-legacy tabs (NOT removed yet)
`WorkspaceMode = ask | verify | compare | write | narrate | graph`. The **ask/verify/compare/
write** tabs and their backends still exist and work, but are slated for **retirement** (see §5).

---

## 4. Recent changes this session (newest first)

1. **Map milestone (Scope × Lens)** — see §3. Phases 1–5 all shipped.
2. **Verify skill — BUILT THEN ABANDONED.** A claim-checker (`services/verify/`,
   `routers/verify.py`, `services/rag/grounding.py` `judge_claim`, `VerifyMode.tsx`,
   `VerdictCard.tsx`). Decided it's query-shaped/fragile and dropped from the product direction.
   **Code is still present and wired** (a Verify tab exists) — it's dead weight to remove in §5.
3. **Optional OpenAI provider** — `services/llm/client.py` branches local/openai
   (`resolve_llm_config`; uses `max_completion_tokens` + omits temperature for cloud models);
   env-only key; `routers/settings.py` + `schemas/settings.py` + `models/app_settings.py`
   (`llm_provider` col) + `core/db.py` `ensure_app_settings_columns`; Settings UI provider toggle;
   `OPENAI_API_KEY`/`OPENAI_BASE_URL` wired in both compose files + `.env.example`.
4. **Production single-image path** — `Dockerfile.prod` + `compose.prod.yaml`; frontend static
   export (`next.config.ts` `output:"export"`), FastAPI serves it (`main.py` StaticFiles mount),
   relative API base (`api.ts` `API_BASE=""`); pdf.js worker copied to `public/`
   (`scripts/copy-pdf-worker.mjs`). Documented in [`RUNNING.md`](RUNNING.md).
5. **Embedded Qdrant** — dropped the Qdrant container; `qdrant-client` local mode at
   `data/qdrant` (`qdrant_store.get_qdrant_client` singleton; `QDRANT_URL` is now an opt-in
   escape hatch). Compose/README updated.

---

## 5. Legacy / to-retire (the "two-mode finalization")

The product is **Map + Narrate**. These should be removed in a dedicated cleanup pass (kept for
now to de-risk):
- **Tabs/UI**: `ask` (chat), `verify`, `compare`, `write` — and their frontend modes
  (`AskClient` chat path, `VerifyMode`, `CompareMode`, `WriteMode`) + `ActionBar` entries.
- **Backend**: the agentic harness (`services/agent/`, `tools.py`, the `/api/agent/stream` SSE),
  `services/verify/` + `routers/verify.py`, `services/compare/` + `routers/compare.py`,
  `services/writeup/` + `routers/write.py`. Keep retrieval/embeddings/grounding bits only if a
  surviving feature uses them (Map does not; Narrate uses its own pipeline).
- Net effect: a **smaller, more reliable** app with no agent loop. (Verify especially is dead.)

---

## 6. Status + next steps

**Status: the Atlas rebuild is _code-complete_ and passes frontend typecheck/lint; backend awaits
in-container verification** (no Python in the authoring env). The old clustering weak link
(connected-components → blob/shatter) is replaced by fused-graph Louvain; citations are folded into
indexing and into the same map as emphasis overlays; the node inspect panel ties Map → Narrate.

**Verify in the container** (see §7 of the implementation, summarized here):
- `python scripts/check_fused_map.py` — Louvain finds 2 communities on a bridged 2-group graph
  (the old code merged to one), is deterministic, and a low-cosine directly-cited pair is rescued.
- Index a DOI item → confirm a `mapped` record lands in `data/openalex.json` during the job and
  `/api/map` renders citation edges with **no** confirm gate; index offline → still succeeds.
- e2e: collection → floating labeled clusters; Hulls/Clusters toggles; Connections overlays don't
  move the ground; click → inspect panel; Narrate this → Narrate tab; only Map + Narrate tabs.

**Next steps, prioritized:**
1. **Tune the fusion + Louvain** on the real library against the eval rubric — `W_SEM/W_DIRECT/
   W_COUPLE`, `SEM_FLOOR/SEM_KNN`, `EDGE_KEEP`, `RESOLUTION`, `HUB_FRAC` in `services/map/fused.py`.
2. **Scale/perf** — `fused_map` calls `item_metadata` per node (N snapshot reads); batch it for
   Library scope. Cap edges/labels for very large scopes.
3. **Citations polish** — make **Gaps** actionable (open/add-to-Zotero affordance).
4. **Two-mode finalization** — the tabs are hidden; execute the §5 backend retirement when ready.

**Eval rubric** (how to judge "useful"): does opening the Atlas *tell you something or help you
act*? Known-related papers land in the same cluster; not a hairball nor dust; labels match;
citation overlays reveal real structure; gap papers look like ones you should own; Library stays
readable.

---

## 7. Operational notes
- **No reset needed for the Map** on an existing index — paper vectors **backfill** from existing
  chunk vectors on first Similarity open. The **page cap** only applies on (re)index; do a reset +
  re-index (`POST /api/zotero/reset`, no UI button) to apply it to already-indexed long items.
- Cluster labels + narration scripts use `chat_create` (local or OpenAI per Settings); the Map's
  structure does **not** need a model and works with it off.
- Tunables (env): `MAX_INDEX_PAGES`, `OPENALEX_CITING_LIMIT`, `OPENALEX_GAP_MIN`,
  `QDRANT_PAPER_COLLECTION`, `OPENAI_API_KEY`/`OPENAI_BASE_URL`. Code constants:
  `SIM_K`/`SIM_CUTOFF`/`MAX_CLUSTERS_LABELED` in `services/map/similarity.py`.
- The latest implementation plan is at
  `~/.claude/plans/yes-that-works-let-s-enchanted-wilkinson.md` (Map milestone).
