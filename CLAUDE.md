# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project overview

**InScien** is a local, private companion over the user's own **Zotero library**, with two
modalities: a **Map** (a citation graph of the library - what your papers cite and what cites them,
from OpenAlex; no model) and **Narrate** (turn a paper into spoken audio). It was forked from
FinanceLab (a FastAPI + Next.js platform) by keeping the Next.js workbench shell and stripping the
finance domain. The original chat/agent ("RAG-cite"), the `/compare` and `/write` skills, and
(later) the whole embedding / indexing / semantic-map layer were **retired**; the shipped product
is Map + Narrate.

Single-user, local, no auth. Stack: FastAPI backend + Next.js frontend (static export). SQLite for
app state; the citation data is a JSON cache (`data/openalex.json`). Distributed as a **cross-OS
desktop app** (Tauri, with the backend frozen into a sidecar). Narration scripts run against the
user's local Ollama by default, or an optional OpenAI key - both configured in-app. The Map needs
no model at all (just OpenAlex over each paper's DOI).

## Running the stack

Dev runs natively on the host (no Docker, no `.env`); config lives in the in-app Settings page.
Host prereqs: `uv`, Node, `espeak-ng` (Kokoro phonemization). The backend pins to Python 3.12;
`uv` fetches it automatically (no system 3.12 needed).

```bash
make setup        # one-time: backend venv + deps, frontend deps
make backend      # terminal 1: uvicorn --reload on :8000
make frontend     # terminal 2: Next dev server on :3000
```

There is no indexing step: browse Zotero collections in the sidebar and select papers - the Map
fetches their citations from OpenAlex on demand. An opt-in "Fetch citations" action warms the
whole library's references in the background, so any selection then renders instantly. A local
Ollama is needed only for narration. Point InScien at the Zotero data dir via the Settings page
(`ZOTERO_DATA_DIR` is an env fallback). Desktop installers are built by the release CI on a `v*`
tag; to build locally, see `PACKAGING.md`. Full run/serve details in `RUNNING.md`.

## Architecture

**Map (`routers/graph.py` + `services/refs/`).** The Map is the **OpenAlex citation graph** of the
selected papers - no LLM, no embeddings. Two lenses: **References** (what your papers cite,
`discovery_graph`) and **Cited-by** (what cites them, `citing_graph`), assembled from the cache
(`refstore.py`, `data/openalex.json`). Fetching is a background job (`fetch_jobs.py` on the shared
`JobRunner`): one OpenAlex call per paper by DOI (`openalex.py`, polite pool). A whole-library
**prefetch** of references warms the cache (`POST /api/graph/prefetch`, opt-in); selection fetches
cover anything uncached and are cancellable (`POST /api/graph/cancel/{id}`). A paper is mappable
only if OpenAlex returns a record **with references** (`ready_keys`); ~1 in 5 records (mostly arXiv
preprints) have none and are greyed in the library. Frontend: `GraphMode.tsx` (Lens = References |
Cited-by, render-from-cache-first + progressive streaming, no-connection nodes dropped) +
`GraphView.tsx` (force-directed graph); library is `ZoteroNavigator.tsx`.

**Narrate (`routers/narrate.py` + `services/narration/`).** A background job (`jobs.py`, on the
shared `JobRunner`) runs the pipeline (`pipeline.py`): resolve the paper's PDF -> parse -> draft
an explanatory script with the LLM client -> clean for speech -> synthesize with **Kokoro** on
CPU (`tts_engine.py`) -> mux to mp3 with a bundled **ffmpeg** (`imageio-ffmpeg`, so no system
ffmpeg is needed). The ~1 GB Kokoro voice is **downloaded on demand** (`model.py`,
`GET/POST /api/narrate/model[/download]`, with a UI progress bar). No SSE; the UI polls the job.
Frontend: `NarrateMode.tsx`.

**Citations (`services/refs/`).** `openalex.py` is a thin OpenAlex client (free, CC0, no key; the
polite pool via a constant `mailto`, self-throttled under ~10/s, bounded retries). `refstore.py`
caches each paper's record keyed by Zotero itemKey in `data/openalex.json`, with status `mapped`
(resolved) / `no_doi` / `not_found`; references are resolved to titles/years, and citers
(`citingWorks`) are fetched lazily for the Cited-by lens. `fetch_jobs.py` runs the single-worker
fetch jobs (prefetch / selection / cancel). There are no embeddings, no vector store, no BM25, and
no clustering - those (and the old chat agent) are retired.

**Library (Zotero, `services/zotero/`).** Reads the user's Zotero library through a **private
snapshot** - `reader.py` `shutil.copy`s `zotero.sqlite` to `data/zotero-snapshot.sqlite` and
queries the copy, never the live DB (and serves the existing snapshot if the live source is
absent). Collections, items, and metadata (incl. DOI) are read **live** from the snapshot
(`library_items`, `item_metadata`); there is no index, manifest, or ledger - the only derived state
is the OpenAlex citation cache. `routers/zotero.py` serves the collection tree + items;
`routers/papers.py` `corpus_papers` (the narration registry) is sourced straight from the reader.

**PDFs (`routers/papers.py`).** Streams the original PDF inline (the browser honors a `#page=N`
fragment); the doc id is the Zotero `itemKey`, resolved to its file in the Zotero storage tree.
Opening a paper from the Map shows its source PDF in a side panel.

**Settings / models (`routers/settings.py`, `services/llm/client.py`).** A single `AppSettings`
DB row holds `llm_provider` (local | openai), `llm_model`, `ollama_base_url`, `openai_api_key`,
and `zotero_data_dir`. The OpenAI key and Zotero folder are **DB-first with env fallback**, so a
distributed desktop build is configured entirely in-app (the key lives only in local SQLite and
is never returned by the API; the router exposes only an `openAiApiKeyPresent` flag). `client.py`
talks the OpenAI-compatible **chat-completions** API to whichever provider is active, with env
fallbacks `DEFAULT_LOCAL_MODEL` + `OLLAMA_BASE_URL`.

**Config / paths.** `core/paths.py` `data_dir()` reads `INSCIEN_DATA_DIR` - one base dir routing
all durable state (SQLite, the OpenAlex cache `data/openalex.json`, Kokoro weights, the Zotero
snapshot, job dirs). Zotero paths in `services/zotero/settings.py`. DB via `core/db.py`
(`DATABASE_URL`, SQLite default). `OPENALEX_MAILTO` sets the polite-pool contact.

## Packaging / distribution

**Desktop (`src-tauri/`).** A Tauri 2 shell spawns the backend frozen by **PyInstaller**
(`backend/run_server.py` + `backend/inscien.spec`, one-file) as a sidecar; the frozen backend
serves BOTH the API and the static UI on one loopback port (the `FRONTEND_DIST` static mount in
`main.py`), and the webview points at it. ML weights are not bundled (the Kokoro voice downloads on
demand). Linux runtime fixes live in `main.rs` (disable WebKit DMABUF for bare WMs;
append system GStreamer plugin paths so `<audio>` plays), and `tts_engine` restores
`LD_LIBRARY_PATH_ORIG` when spawning ffmpeg from the frozen process. Cross-OS installers are built
by `.github/workflows/release.yml` on a `v*` tag (unsigned v1). Full runbook in `PACKAGING.md`.

**Marketing + docs site (`site/`).** Astro + Starlight, static-exported to **GitHub Pages** via
`.github/workflows/site.yml` (deploys from `main`, independent of the installer pipeline).

## Status

- Map + Narrate shipped. The Map is **citation-only** (OpenAlex References / Cited-by); the earlier
  semantic/embedding map, the vector store, and the whole indexing step were removed. In-app config
  (Zotero folder + OpenAI key). Public site live at https://inscien.com/.
- Retired - do not reintroduce without intent: the chat / RAG-cite agent (`/api/agent/stream`,
  `search_internal_content`, the old `services/rag/` grounding loops), the `/compare` and `/write`
  skills, AND the embedding / indexing / semantic-map layer (fastembed, the vector store,
  `services/map/fused.py`, `/api/map`, the chunk manifest, the `ZoteroSyncItem` ledger). Gone from
  routers, services, and the frontend.

## Conventions

- Standalone scripts insert the backend root on `sys.path` and `load_dotenv()` themselves;
  `main.py` skips `load_dotenv()` when frozen (env comes from the Tauri parent).
- No migration framework - `Base.metadata.create_all` builds tables on startup, and
  `core/db.ensure_app_settings_columns` additively adds new `app_settings` columns.
- **Plain ASCII copy** in all user-facing text and docs: no em/en dashes, curly quotes, or
  ellipses; use `-` and `...`.
- Frontend styling: reuse the design tokens in `frontend/src/app/globals.css`; use shadcn/ui
  out of the box (never invent a design); accent blue is for links/active states, not
  badges/pills (badges use `--surface-muted`).
- **Padding/margin utilities need `!`.** `globals.css` has an UNLAYERED reset
  (`* { margin:0; padding:0 }`). Unlayered CSS beats Tailwind's `@layer utilities` regardless of
  specificity, so plain `px-*`/`pl-*`/`m-*` classes are silently overridden to 0 (the class is in
  the DOM but computes to 0 - looks like the change "didn't apply"). Use the important prefix
  (`!pl-4`, `!px-4`) for any padding/margin, matching the existing `!px-*` usages. Only margin and
  padding are affected; `gap`/`bg`/`text`/`border` utilities work normally. See the comment at the
  reset in `globals.css` before considering a systemic fix (layering the reset shifts spacing
  app-wide).
