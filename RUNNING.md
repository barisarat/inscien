# Running & shipping InScien

How to run InScien in **development** (host-native, no Docker) and how the shipped **desktop
app** serves everything from one process. For what InScien *is*, see [`README.md`](README.md);
for architecture internals, [`CLAUDE.md`](CLAUDE.md) and [`INSCIEN-BRIEF.md`](INSCIEN-BRIEF.md);
for building the installers, [`PACKAGING.md`](PACKAGING.md).

InScien is **local-first and single-user**: one machine, no auth, no cloud. Generation runs
against a **native Ollama on the host** (or an optional OpenAI key); everything else runs locally.

---

## Development (run from source)

No Docker, no `.env`. Two processes on native ports - the backend (FastAPI) on `:8000` and the
Next dev server on `:3000`. Config lives in the in-app **Settings** page (Zotero folder, Ollama
URL, OpenAI key, model), so there is nothing to configure on disk.

Host prereqs: **[`uv`](https://docs.astral.sh/uv/)**, **Node**, and **`espeak-ng`** (Kokoro TTS
phonemization). Install with your package manager: `apt install espeak-ng` /
`brew install espeak-ng` / `sudo pacman -S --needed uv espeak-ng` (on Arch, Node comes from
`nodejs-lts-jod` - keep it; do not let pacman swap in the bleeding-edge `nodejs` package). The
backend pins to Python 3.12; `uv venv --python 3.12` (run by `make setup`) fetches it
automatically, so no system Python 3.12 is needed. `ffmpeg` is bundled (`imageio-ffmpeg`), and
the ~1GB Kokoro voice downloads on demand from the Narrate UI on first use.

Run `make setup` **first** (once), then start the two servers in separate terminals:

```bash
make setup        # one-time: backend venv + deps, frontend deps - RUN THIS FIRST
make backend      # terminal 1: uvicorn --reload on http://localhost:8000
make frontend     # terminal 2: Next dev server (HMR) on http://localhost:3000
```

If `make backend` reports `.venv/bin/uvicorn: No such file` or `make frontend` reports
`Cannot find module 'pdfjs-dist'`, you skipped `make setup` (or deps changed) - run it.

Open **http://localhost:3000**. The frontend talks to the backend cross-origin
(`:3000` -> `:8000`), which the backend allows by default (`main.py` defaults `CORS_ORIGINS` to
localhost). First run: open Settings, set your Zotero data folder, and connect a model if you
want narration.

---

## Production: the desktop app

There is no production server or Docker image. The shipped artifact is a **cross-OS desktop app**
(Tauri shell + the backend frozen by PyInstaller into a sidecar). It is built by
[`.github/workflows/release.yml`](.github/workflows/release.yml) on a `v*` tag; the full runbook
is in [`PACKAGING.md`](PACKAGING.md).

What matters here is *how it serves*: **one process, one origin** - the same shape as dev's
backend, minus the separate Next dev server.

1. **The frontend is a static export.** `next.config.ts` sets `output: "export"`, so
   `next build` emits plain HTML/JS/CSS to `frontend/out/` (no Node server at runtime).
   `trailingSlash: true` makes routes emit `.../index.html` so a static file server resolves them.
2. **FastAPI serves those files.** `backend/main.py` mounts the export with
   `StaticFiles(directory=FRONTEND_DIST, html=True)` at `/`, **after** all `/api/*` routers and
   `/health`, so API routes always win and the UI gets everything else. The mount is a **no-op in
   dev** (`FRONTEND_DIST` is unset, so the Next dev server handles the UI instead).
3. **The API is same-origin.** A production build (`NODE_ENV=production`) leaves `API_BASE` empty,
   so the browser calls **relative** `/api/...` paths - **no CORS**, and the bundle is
   port-agnostic. (In dev `API_BASE` defaults to `http://localhost:8000`.)
4. **Citation data is a plain file.** Each paper's OpenAlex record (references / citers) is cached
   in a single `data/openalex.json` - no database, no extra service. The Map is built from it;
   there is no embedding or vector store.

---

## Data, persistence & reset

All durable state lives under **one base dir**: the repo-root `data/` folder in host dev (override
with `INSCIEN_DATA_DIR`), or the OS per-user app-data dir in the desktop app (Tauri sets
`INSCIEN_DATA_DIR`).

| Path | What |
|---|---|
| `data/inscien.db` | SQLite - app settings (incl. the OpenAI key + Zotero folder) |
| `data/openalex.json` | OpenAlex citation cache (each paper's references / citers) |
| `data/zotero-snapshot.sqlite` | Private read-only copy of your Zotero DB |
| narration mp3s, job state, Kokoro weights | Caches / derived artifacts |

Your **Zotero library is the only irreplaceable input**; everything under `data/` is **derived**
and rebuildable by re-fetching from the UI.

**Reset** (drops the OpenAlex citation cache + clears jobs, then re-fetch from the UI):

```bash
curl -X POST http://localhost:8000/api/zotero/reset
```

There is no reset button in the UI - it's an API-only operation.

### Health & diagnostics
- `GET /health` - liveness (dependency-free).
- `GET /health/ready` - readiness: probes SQLite (+ Ollama, informational).

---

## Configuration

Day-to-day config is in the **Settings page** (`/api/settings`): generation provider/model, Ollama
URL, OpenAI key, and Zotero data folder. These are stored in SQLite and override the code defaults.

A few advanced knobs are read only from the environment - export them in the shell before
`make backend` if you need to change them:

| Var | Default | Purpose |
|---|---|---|
| `ZOTERO_DATA_DIR` | (set in Settings) | Zotero data dir (`zotero.sqlite` + `storage/`); the Settings value wins |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | Where the backend reaches your native Ollama (also in Settings) |
| `KOKORO_VOICE` | `af_heart` | Narration voice |
| `OPENALEX_MAILTO` | `getinscien@gmail.com` | Contact for OpenAlex's polite pool (faster, fewer 429s) |
| `INSCIEN_DATA_DIR` | repo-root `data/` | Base dir for all durable state |

---

## Implementation notes (static-export specifics)

Things that are non-obvious because the shipped UI is a static export served by FastAPI:

- **API base.** `src/lib/api.ts`: `NEXT_PUBLIC_API_URL ?? (dev ? "http://localhost:8000" : "")`.
  Empty = same origin (production/desktop); dev defaults to the local backend. Inlined at build time.
- **Root redirect.** `/ -> /ask` is a **client-side** redirect (`src/app/page.tsx`), because a
  static export has no server to issue an HTTP redirect.
- **pdf.js worker.** `new URL(..., import.meta.url)` doesn't resolve under static export, so
  `scripts/copy-pdf-worker.mjs` copies the worker from `pdfjs-dist` into `public/`
  (`predev`/`prebuild` hooks) and it's served at `/pdf.worker.min.mjs`. The backend also registers
  a `.mjs -> text/javascript` MIME type - browsers reject a module worker served with the wrong
  content-type.
- **PDF filenames.** Citations stream PDFs via `FileResponse(filename=...,
  content_disposition_type="inline")`, which RFC 5987-encodes non-ASCII filenames (HTTP headers
  are latin-1; a raw Unicode hyphen would otherwise 500).
