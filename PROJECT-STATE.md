# InScien — Project State & Handoff

A working note to resume from in a new session. For the original product brief see
[`INSCIEN-BRIEF.md`](INSCIEN-BRIEF.md), for architecture conventions [`CLAUDE.md`](CLAUDE.md),
and for how to run it [`RUNNING.md`](RUNNING.md). This file captures **where the product is
now, why, what changed recently, what's legacy, and what's next.**

_Last updated: 2026-06 (Map milestone shipped, v1 — operational, untuned)._

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

### Map (the milestone — code-complete, **untuned**)
- **Indexing foundation** — `services/zotero/ingest.py`: `MAX_INDEX_PAGES` (default 15) caps
  per-doc parsing so books/long items don't bloat the index; each item gets a **paper-level
  vector** = mean of its chunk vectors, in a new Qdrant collection `inscien_lab_paper_vectors`.
  `services/lab/qdrant_store.py`: `ensure/recreate/upsert/get/query_similar/backfill` paper
  vectors (backfill = mean of existing chunk vectors, **no reparse**).
- **Similarity lens** — `services/map/similarity.py` + `routers/map.py`
  (`POST /api/map/similarity`): kNN graph over paper vectors, connected-component clusters, one
  bounded LLM label per cluster. Nodes colored by Zotero collection.
- **Citations lens** — `services/refs/`: `openalex.py` `fetch_citing_works` (forward `cites:`),
  `refstore.py` `fetch_citing_items` + `citing_graph` + `_map_record` (`GAP_MIN`, `CITING_LIMIT`),
  `fetch_jobs.py` `start_citing_job`, `routers/graph.py` `/citing-fetch` + `/citing`. Gaps = a
  frontend filter over References (externals cited by ≥`GAP_MIN` of your papers).
- **Scope + grouping** — `routers/zotero.py` `/indexed-keys` (whole library), `reader.py`
  `item_primary_collection` (item→collection for color). Frontend: `GraphMode.tsx` (lens + facet
  + scope chips), `GraphView.tsx` (`collectionColor`). Map is the **default tab**
  (`WorkspaceProvider` initial mode `graph`, relabeled "Map" in `ActionBar`).

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

## 6. Known weak point + next steps

**Status: Map milestone is _done_ (built + operational) but _not tuned_.** User's read: "useful
but not fully ready." It's a tuning + visualization gap, not a value gap.

**The weak link:** clustering. Connected-components over a thresholded kNN graph is crude (merges
into one blob or shatters into singletons).

**Next steps, prioritized:**
1. **Clustering rewrite** — cluster in **embedding space** (k-means / HDBSCAN on the paper
   vectors in `services/map/similarity.py`) instead of graph components; color/label **by
   cluster**; tune `SIM_CUTOFF` / `SIM_K`. _Highest leverage._
2. **Visualization** — render cluster labels/hulls **on the canvas** (`GraphView.tsx`), use edge
   weight in the force layout, collection-color as a toggle. The "see the territory" payoff.
3. **Scale/perf** — whole-library readability + faster first-open backfill.
4. **Citations polish** — make **Gaps** actionable (open/add-to-Zotero affordance).
5. **Two-mode finalization** — execute the §5 retirement.

**Eval rubric** (how to judge "useful"): does opening the Map *tell you something or help you
act*? Concrete tests: known-related papers land in the same cluster; not a hairball nor dust;
labels match; gap papers look like ones you should own; Library scope stays readable/fast.

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
