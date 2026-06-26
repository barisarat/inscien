# Running & shipping InScien

How to run InScien in **development** and **production**, how the production image is built
and served, and the operational rules for both. For what InScien *is*, see
[`README.md`](README.md); for architecture internals, [`CLAUDE.md`](CLAUDE.md) and
[`INSCIEN-BRIEF.md`](INSCIEN-BRIEF.md).

InScien is **local-first and single-user**: one machine, no auth, no cloud. Generation runs
against a **native Ollama on the host** (see `README.md`); everything else runs in Docker.

---

## TL;DR

```bash
# Production — what you actually run. One container, prebuilt UI, served on :8200.
docker compose -f compose.prod.yaml up --build

# Development — only when editing the code. Hot-reload backend + Next dev server.
docker compose up
```

Run **one at a time** (they share `./data`, the port, and the Compose project name). Switch
with `docker compose down` → `up` the other.

---

## The two run modes

| | **Production** (`compose.prod.yaml`) | **Development** (`compose.yaml`) |
|---|---|---|
| Command | `docker compose -f compose.prod.yaml up --build` | `docker compose up` |
| Containers | **1** (`app`) | **2** (`backend`, `frontend`) |
| Open | `http://localhost:8200` | `http://localhost:3200` |
| Frontend | Prebuilt **static export**, served by FastAPI | Next dev server (HMR) on `:3200` |
| Backend | `uvicorn` (no reload), source **baked into the image** | `uvicorn --reload`, source **bind-mounted** |
| API origin | Same origin (relative `/api/...`) → **no CORS** | Cross-origin (`:3200` → `:8200`) → CORS on |
| `npm install` at boot | No (built once at image-build time) | Yes (into a volume) |
| Use it for | Actually using InScien | Editing the frontend/backend |

Both modes:
- depend only on a **native Ollama** on the host (`OLLAMA_BASE_URL`),
- mount your **Zotero library read-only** and read it via a private snapshot,
- persist all durable state to **`./data`** (including the embedded vector store).

---

## Production: how it's served

Production is **one process serving everything on one origin** — there is no separate
frontend server.

1. **The frontend is a static export.** `next.config.ts` sets `output: "export"`, so
   `next build` emits plain HTML/JS/CSS to `frontend/out/` (no Node server needed at
   runtime). `trailingSlash: true` makes routes emit `…/index.html` so a static file server
   resolves them.
2. **FastAPI serves those files.** `backend/main.py` mounts the export with
   `StaticFiles(directory=FRONTEND_DIST, html=True)` at `/`, **after** all `/api/*` routers
   and `/health`, so API routes always take precedence and the UI gets everything else. The
   mount is a **no-op in development** (the env var is unset, so the Next dev server handles
   the UI instead).
3. **The API is same-origin.** The production build sets `NEXT_PUBLIC_API_URL=""`, so the
   browser calls **relative** `/api/...` paths. This means **no CORS**, and the bundle is
   **port-agnostic** — the same build works behind any host/port.
4. **Paper vectors are a plain file.** One title+abstract embedding per item persists to a
   single `./data/paper-vectors.json` (no vector database, no vector-store container); the Map's
   cosine similarity runs in numpy.

Net result: `app` on `:8200` serves the UI, the API, citations (PDF streaming), and
narration audio — all from one container.

---

## Shipping logic: the production image

Built by [`Dockerfile.prod`](Dockerfile.prod) as a **multi-stage build** (context = repo
root, so it can see both `frontend/` and `backend/`):

- **Stage 1 (`node`)** — `npm ci` then `npm run build` with `NEXT_PUBLIC_API_URL=""`,
  producing the static export at `/build/out`. A `prebuild` step copies the pdf.js worker
  into `public/` (see *Implementation notes*).
- **Stage 2 (`ubuntu` + Python)** — installs the backend deps into a venv, **bakes in the
  Kokoro TTS weights** (offline narration), copies the **backend source** in (not
  bind-mounted — this is a shippable image), and copies the **static export** from stage 1
  to `/workspace/frontend-dist` (pointed to by `FRONTEND_DIST`).

The image keeps the same `entrypoint.sh` as dev: it adopts the bind-mounted `./data` dir's
owner and **drops privileges** to that user, so everything persisted there stays host-owned
with no manual `chown`. The container then runs `uvicorn main:app` (no `--reload`).

`.dockerignore` keeps the root build context small and prevents host `node_modules`/`.next`
from clobbering the clean in-image build.

> **Why Docker (and not a bare `run.sh`)?** Deliberate: Docker is the environment-isolation
> boundary, so there's no host Python/Node/version drift to debug. The single-origin,
> relative-API build above is also the exact shape a future desktop binary (e.g. Tauri)
> would wrap, if InScien ever targets non-technical users.

---

## Development

```bash
docker compose up        # backend :8200 (hot reload), frontend :3200 (Next dev server)
```

Use this when editing code: the backend source is bind-mounted with `uvicorn --reload`, and
the Next dev server gives HMR. The frontend talks to the backend cross-origin
(`NEXT_PUBLIC_API_URL=http://localhost:8200`), which is why CORS is enabled here
(`CORS_ORIGINS=http://localhost:3200`). Open **`http://localhost:3200`**.

---

## Operational rules

### One stack at a time
Dev and prod **cannot run simultaneously**. They share:
- the host port `8200`,
- the `./data` directory, and
- the Compose project name `inscien`.

Always `docker compose down` one before `up`-ing the other.

### Switching / first-run gotchas
Because both files use the project name `inscien` but different service names, switching can
warn about **orphan containers** and — if a previous `up` half-failed (e.g. the port was
busy) — leave a stale container with **no published ports**. Clean recreate:

```bash
docker compose -f compose.prod.yaml down
docker compose -f compose.prod.yaml up --build --force-recreate --remove-orphans
```

Verify the port actually published:

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep inscien
# expect: inscien-app-1   0.0.0.0:8200->8000/tcp, [::]:8200->8000/tcp
```

If the **PORTS column is empty**, the container is running but unmapped — `--force-recreate`
fixes it. If `localhost:8200` fails but `127.0.0.1:8200` works, it's an IPv4/IPv6 resolution
quirk, not the app.

### Health & diagnostics
- `GET /health` — liveness (dependency-free; what the container healthcheck uses).
- `GET /health/ready` — readiness: probes SQLite + the paper-vector store (+ Ollama, informational).

---

## Data, persistence & reset

All durable state lives in **`./data`** (a host-owned bind mount), so it survives
`down`/`down -v`:

| Path | What |
|---|---|
| `data/inscien.db` | SQLite — chat history, settings, sync ledger |
| `data/paper-vectors.json` | Paper vectors (one title+abstract embedding per item) |
| `data/pdf-index.json` | Chunk manifest (powers BM25 + carries page metadata) |
| `data/zotero-snapshot.sqlite` | Private read-only copy of your Zotero DB |
| `data/.fastembed/`, narration mp3s, job state | Caches / derived artifacts |

Your **Zotero library is the only irreplaceable input**; the index and vectors under
`data/` are **derived** and rebuildable by re-indexing.

**Reset the index** (drops the paper vectors + manifest + ledger together, then re-index from the UI):

```bash
curl -X POST http://localhost:8200/api/zotero/reset
```

There is no reset button in the UI — it's an API-only operation.

---

## Configuration

Set overrides in `.env` (copied from `.env.example`); Compose reads it automatically for
both files.

| Var | Default | Purpose |
|---|---|---|
| `ZOTERO_HOST_DIR` | `./zotero` | Host Zotero data dir (has `zotero.sqlite` + `storage/`), mounted read-only |
| `OLLAMA_BASE_URL` | `http://host.docker.internal:11434/v1` | Where the backend reaches your native Ollama |
| `KOKORO_VOICE` | `af_heart` | Narration voice |
| `INSCIEN_VECTORS_PATH` | `<data>/paper-vectors.json` | Override the paper-vector store file location |

The generation **model** and Ollama URL are also editable at runtime via the Settings page
(`/api/settings`), which override the env defaults.

---

## Implementation notes (static-export specifics)

Things that are non-obvious because the UI is a static export served by FastAPI:

- **Relative API base.** `src/lib/api.ts` uses `NEXT_PUBLIC_API_URL ?? ""`. Empty = same
  origin (prod); the dev compose sets it to `http://localhost:8200`. Inlined at build time.
- **Root redirect.** `/ → /ask` is a **client-side** redirect (`src/app/page.tsx`), because
  a static export has no server to issue an HTTP redirect.
- **pdf.js worker.** `new URL(..., import.meta.url)` doesn't resolve under static export, so
  `scripts/copy-pdf-worker.mjs` copies the worker from `pdfjs-dist` into `public/`
  (`predev`/`prebuild` hooks) and it's served at `/pdf.worker.min.mjs`. The backend also
  registers a `.mjs → text/javascript` MIME type — browsers reject a module worker served
  with the wrong content-type.
- **PDF filenames.** Citations stream PDFs via `FileResponse(filename=…,
  content_disposition_type="inline")`, which RFC 5987-encodes non-ASCII filenames (HTTP
  headers are latin-1; a raw Unicode hyphen would otherwise 500).
