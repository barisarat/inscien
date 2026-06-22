# InScien

A local-first, private research assistant over your own **Zotero library**. Ask
questions in a multi-turn chat and get answers with **page-precise, verifiable citations**.
Everything — retrieval *and* generation — runs on your machine against a local
[Ollama](https://ollama.com); no API keys, no cloud, no data ever leaves your computer.

- **Private by construction.** There is no cloud/provider code path. Privacy, zero cost, and
  offline operation are architectural guarantees, not settings.
- **Page-precise citations.** Answers cite the document and page, with the source passage on
  click, so every claim is traceable.
- **No GPU required.** Chat, retrieval, and audio narration all run on CPU. Quality scales
  with the local model you choose — a bigger model is your quality dial.

## Prerequisites

1. **Docker** — [Docker Desktop](https://www.docker.com/products/docker-desktop/) on macOS or
   Windows, or Docker Engine + Compose on Linux.
2. **Ollama, installed natively on your host** (not in Docker). Install from
   [ollama.com](https://ollama.com), then pull a model:
   ```bash
   ollama pull qwen2.5:7b      # a good default; pull a larger model for higher quality
   ```
   Ollama must be running before you start the stack. Running it natively (rather than in a
   container) is deliberate: it's how Ollama gets GPU acceleration — Metal on macOS, CUDA on
   Linux/Windows. InScien itself never needs a GPU.

No NVIDIA GPU, no CUDA toolkit, and no API keys are required on any platform.

## Quickstart

```bash
# 1. Point InScien at your Zotero data directory (the folder with zotero.sqlite + storage/).
#    Copy the example env file and set ZOTERO_HOST_DIR — find the path in
#    Zotero → Settings → Advanced → "Data Directory Location".
cp .env.example .env
#    then edit .env:  ZOTERO_HOST_DIR=/path/to/your/Zotero

# 2. Start the stack
docker compose up        # backend :8200, frontend :3200, qdrant :6335
```

Then open **http://localhost:3200**, browse your Zotero collections in the sidebar, and
**index** the items you want to search — InScien parses their PDFs and builds the search
index. Re-index whenever you add papers in Zotero. Now start asking questions.

InScien mounts your Zotero folder **read-only** and reads through a private snapshot, so
your live library is never modified.

If Ollama isn't at the default `host.docker.internal:11434`, set `OLLAMA_BASE_URL` for the
backend service (it expects the OpenAI-compatible endpoint, e.g.
`http://host.docker.internal:11434/v1`).

## Choosing your model

InScien answers with whatever local model you select — that choice is your quality dial.
Pull any model into Ollama (`ollama pull <model>`), then pick it from the in-app **Settings**
page, which lists every model your local Ollama is serving. Small models are fast and light;
larger models give better answers and narration. There is no cloud option by design.

## Narration

Ask InScien to read a paper aloud — type `/narrate <paper title>` in the chat. It parses the
paper, drafts an explanatory script with your local model, and synthesizes an audio narration
with [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) (Apache-2.0) **on CPU**. The voice
model is baked into the image, so narration works fully offline. Generation runs in the
background; you keep working and the player appears when it's ready.

## Platform support

| Platform | Status | Notes |
|----------|--------|-------|
| Linux    | ✅ | Docker Engine + native Ollama. |
| macOS    | ✅ | Docker Desktop + native Ollama (Ollama uses Metal on the host). |
| Windows  | ✅ | Docker Desktop + native Ollama. |

The same `docker compose up` works identically everywhere — no GPU and no platform-specific
setup beyond installing Docker and Ollama.

## How it works

- **Backend** (FastAPI, `backend/`) — a hand-rolled tool-calling agent loop
  (`POST /api/agent/stream`, SSE) that retrieves from your library and streams a grounded
  answer with inline `[n]` citations. Chat history is SQLite; narration runs here too.
- **Retrieval** (`backend/services/lab/`) — hybrid dense (Qdrant) + BM25 retrieval over PDF
  passages tagged with page + bounding box, so citations land on the right page.
- **Ingestion** (`backend/services/zotero/`) — reads your Zotero library, then parses the
  selected items' PDFs (`pdf_parser.py`, PyMuPDF, two-column reading-order aware) →
  sub-page passages → embeddings → Qdrant. Additive: indexing more items never disturbs
  what's already indexed.
- **Frontend** (Next.js, `frontend/`) — the chat UI at `:3200`.

See `CLAUDE.md` for the full architecture notes and `INSCIEN-BRIEF.md` for the design
rationale.

## Your data & backups

Your source PDFs live in **your Zotero library** (mounted read-only — InScien never
touches it). The only InScien-owned state is:

- **`data/`** — all durable app state: the SQLite DB (chat history + settings), the search
  index, and narration audio.

Qdrant's vectors live in the `qdrant_data` Docker volume. They're a **rebuildable cache** —
regenerated by re-indexing from Zotero — so they're not something you need to back up.

The distinction: **your Zotero library + `data/` are irreplaceable; the index and vectors
are derived.**

- **Back up** = your Zotero library (as you already do) plus `data/` (chat history + settings).
- `docker compose down` preserves everything (`data/` and the Qdrant volume).
- `docker compose down -v` also removes the Qdrant volume — but your DB in `data/` is safe
  (it's a plain host file, not a volume). Rebuild the vectors by re-indexing from Zotero.

### Configuration
Key env vars (set on the backend service in `compose.yaml`, overridable via `.env` —
see `.env.example`): `OLLAMA_BASE_URL`, `ZOTERO_HOST_DIR`, `QDRANT_URL`, `DATABASE_URL`,
`KOKORO_VOICE`.

## License

MIT — see [LICENSE](LICENSE).
