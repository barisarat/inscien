# Graph v1: OpenAlex-powered external-node discovery map

## Context

The graph should be a **selection-scoped literature discovery map** — each selected paper plus the works it cites become nodes, revealing shared anchors and how the selection opens into the field. The previous plan extracted references by **parsing PDFs locally** (LLM, minutes per build, noisy dedup, missing years). That's too heavy and low-quality.

**Decision:** get reference data from **OpenAlex** (free, **no account/API key**, open CC0 data) instead of parsing PDFs. Given a paper's DOI, OpenAlex returns its references as **canonical IDs + clean titles/years/DOIs** in seconds. This makes dedup *exact and free* (same work = same OpenAlex ID), gives **reliable publication years** (the chronological view, v2), and removes all PDF parsing. Confirmed: **594/~750** of the user's Zotero items have a DOI.

**This is the one online feature.** It sends **only each selected paper's public DOI** to OpenAlex to fetch public reference metadata — **no PDF, notes, or library content leaves the machine.** Everything else in InScien stays local/offline. The UI states this plainly. Built maps are cached, so they keep working offline.

**v1 = DOI-only.** Papers without a DOI (or not in OpenAlex) are shown as owned nodes flagged "no DOI — not mapped." (Title-search fallback, forward-citations, topic-coloring, and chronological layout are **v2**.)

## Grounding (verified)
- Zotero DOI lives in `itemData` (`fieldName='DOI'`). `services/zotero/reader.py` `item_metadata(itemKey)` returns title/authors/year/itemType — **add `doi`** via the existing `_field_value(con, item_id, "DOI")`. `resolve_pdf_path` stays (owned-node PDF open).
- Reuse the **job runner pattern** (`services/compare/jobs.py` / the `graph_jobs.py` I added): ThreadPoolExecutor, persisted job JSON, progress cb, `recover_stale` in `main.py on_startup`.
- Reuse the **per-item cache + status-icon pattern**: `listNarrations`→navigator badge (`ZoteroNavigator.tsx` `load()`), and the index ledger idea (cache keyed by itemKey).
- `routers/graph.py` currently has `GET /api/graph` (corpus_graph), `POST /api/graph/build` + `GET /api/graph/build/{id}` (PDF-parse job). `requirements.txt` already has `httpx` (used by the LLM client) for the OpenAlex calls.
- Frontend: `GraphMode.tsx` (load/build/poll), `GraphView.tsx` (`react-force-graph-2d`; map node shape), `ZoteroNavigator.tsx`, `api.ts`.
- **Drop the PDF-parse graph path:** `build_references`/`corpus_graph`/`graph_jobs.py` and the just-added `/api/graph/build*` become dead for the graph (keep `build.py`'s reference-text parser only if wanted for an offline fallback later; otherwise remove from the UI).

## Backend

### 1. Reader — expose DOI
`item_metadata`: add `doi = _field_value(con, item_id, "DOI")` (normalize: strip, lowercase, strip a leading `https://doi.org/`). Add a `doi(item_key)` convenience if useful.

### 2. OpenAlex client — `services/refs/openalex.py` (new)
- `fetch_work(doi)` → `GET https://api.openalex.org/works/https://doi.org/{doi}` with a `User-Agent: InScien (mailto:…optional)` header (no key). Returns `{openalexId, year, citedByCount, referencedWorks:[ids]}` or None (404 / no DOI). Tolerate errors (network/None).
- `resolve_works(ids)` → batch `GET /works?filter=openalex_id:{id1|id2|…}&select=id,display_name,publication_year,doi,cited_by_count&per-page=100` in chunks of ≤50 ids. Returns `{id: {title, year, doi, citedBy}}`.
- Thin, dependency-light (use `httpx`); polite (small concurrency, retry-once on transient).

### 3. Reference cache (replaces the PDF-parse cache) — `services/refs/refstore.py` (new, or fold into build.py)
- Per-paper record keyed by **itemKey**, persisted to a JSON cache (reuse `references_index_path` with the new schema, or a dedicated `openalex.json`):
  `{ itemKey: { doi, openalexId, year, citedBy, references:[{id,title,year,doi,citedBy}], status:"mapped"|"no_doi"|"not_found", fetchedAt } }`.
- `mapped_keys()` → itemKeys with `status=="mapped"`. `fetch_status(item_keys)` → `{mapped, unmapped, noDoi}` (unmapped = not in cache; `noDoi`/`not_found` surfaced so the UI can explain coverage).
- `fetch_items(item_keys, progress)`: for each key → reader DOI → if none, cache `status:"no_doi"`; else `fetch_work` → cache result; collect all `referencedWorks` ids across the batch → `resolve_works` once → fill reference metadata. **Skip keys already cached** (idempotent; refetch only if missing). Per-paper progress.

### 4. Discovery assembly — `discovery_graph(item_keys)` (new)
Over the **mapped** subset of `item_keys`:
- **Owned nodes** = selected papers (`reader.item_metadata` → title, year), `type:"owned"`, `doi`.
- **External nodes** = union of all `references` across the selection, **deduped by OpenAlex id** (exact). Each = `{id, label:title, type:"external", year, citedBy: (# selected papers referencing it), globalCitedBy, doi}`.
- **Edges** = `{from: itemKey, to: refId}`.
- Return `{nodes, edges, unmapped:[…], noDoi:[…]}` so the UI shows coverage.

### 5. Jobs + endpoints
- `services/refs/fetch_jobs.py` (mirror `compare/jobs.py`): background `fetch_items(keys, progress)`, per-paper progress; `recover_stale` in `main.py`.
- `routers/graph.py`:
  - `POST /api/graph/fetch {itemKeys}` → `{jobId}`; `GET /api/graph/fetch/{id}` → status/progress.
  - `POST /api/graph/fetch-status {itemKeys}` → `{mapped, unmapped, noDoi}` (the confirm count).
  - `GET /api/graph/mapped-keys` → `{keys}` (library icon).
  - `POST /api/graph {itemKeys}` → `discovery_graph(itemKeys)`. Remove the old `GET /api/graph` + `/build*` from the UI path.

## Frontend

### 6. `GraphMode.tsx` — scope = selection; fetch → confirm → progress → render
- `fetchStatus(selectedKeys)`. If `unmapped.length`: show a confirm card — **"Fetch references for N papers from OpenAlex"** + the **disclosure line** (below) + **Build map**. On confirm → `startGraphFetch(unmapped)` → poll `getGraphFetch(jobId)` (progress) → `fetchDiscoveryGraph(selectedKeys)` → render.
- All mapped → fetch + render directly. `0` selected → prompt "Select papers to map their literature."
- After render, show coverage: "Mapped N · no DOI M" (so gaps are explicit).
- **Disclosure (always visible in Graph):** *"The citation map uses OpenAlex (open scholarly data). It sends each selected paper's DOI to fetch its public references — nothing else leaves your machine. This is the only feature that needs internet."*

### 7. `GraphView.tsx` — node types
Style `node.type`: **owned** = filled accent (sized by global citedBy), **external** = muted/outline (sized by within-selection `citedBy` → shared anchors look bigger). Year in label/tooltip. `onOpenNode`: owned → `openPdf`; **external → open its DOI** (`https://doi.org/{doi}`) in a new tab (discovery). Map the new `{id,label,type,year,citedBy,doi}` / `{from,to}` shape.

### 8. `ZoteroNavigator.tsx` — "mapped" status icon
`load()` also calls `mappedKeys()` (like `listNarrations`); per item row show a compact muted indicator (a small graph/refs dot) when mapped — beside the indexed badge, tiny, not crowding the title.

### 9. `api.ts`
`graphFetchStatus(itemKeys)`, `startGraphFetch(itemKeys)`, `getGraphFetch(jobId)`, `fetchDiscoveryGraph(itemKeys)`, `mappedKeys()`.

## Phasing (each shippable)
1. **OpenAlex client + reader DOI + cache + fetch job + endpoints** (backend). Verify via `docker compose exec`.
2. **`discovery_graph` + `POST /api/graph`.** Verify node/edge/citedBy/year shape.
3. **GraphMode fetch/confirm/progress/render + disclosure + GraphView node types.**
4. **Navigator "mapped" icon.**

## Verification (fe :3200 / be :8200; needs internet)
- `docker compose exec backend python -c "from services.refs.openalex import fetch_work, resolve_works; w=fetch_work('10.48550/arXiv.1706.03762'); print(w['year'], len(w['referencedWorks'])); print(list(resolve_works(w['referencedWorks'][:5]).values())[:2])"` → a year + dozens of referenced ids + resolved titles/years.
- `docker compose exec backend python -c "from services.zotero.reader import item_metadata; print(item_metadata('<KEY>')['doi'])"` → the DOI.
- `... fetch_items(['<KEY_A>','<KEY_B>'], print)` then re-run → second run **skips** (cached). `discovery_graph([...])` → owned nodes = mapped papers; external nodes deduped with `citedBy`/`year`/`doi`; edges paper→ref; `noDoi` lists any without a DOI.
- UI: select 2–3 papers → **Graph** → "Fetch references for N papers" + disclosure → confirm → quick progress → **dense external-node map** (owned filled, shared externals bigger); external node click → opens its DOI page; coverage line shows mapped/no-DOI. Re-open same selection → instant (cached). Library rows show the **mapped** icon.

## Critical files
- New: `backend/services/refs/openalex.py`, `backend/services/refs/refstore.py` (or extend `build.py`), `backend/services/refs/fetch_jobs.py`
- Modify: `backend/services/zotero/reader.py` (DOI), `backend/routers/graph.py` (fetch/status/mapped/discovery; drop build* from UI), `backend/main.py` (recover_stale)
- Frontend: `GraphMode.tsx`, `components/GraphView.tsx`, `components/navigation/ZoteroNavigator.tsx`, `lib/api.ts`
- Reuse: job pattern (`compare/jobs.py`), navigator status-icon pattern (`listNarrations`), `item_metadata`/`resolve_pdf_path`, `httpx` (already a dep)
- Drop from the graph path: `build_references`/`corpus_graph`/`graph_jobs.py` + `/api/graph/build*` (PDF parsing no longer used for the graph)
- **v2 deferred:** title-search fallback for no-DOI papers; forward citations (who-cites-yours); topic/concept coloring; chronological (year-axis) layout; optional Semantic Scholar source.
