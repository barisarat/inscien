# InScien

A local-first, private research assistant over your own library of research PDFs. Ask
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
# 1. Drop your research PDFs into papers/
cp /path/to/your/*.pdf papers/

# 2. Start the stack
docker compose up        # backend :8200, frontend :3200, qdrant :6335

# 3. Build the search index from papers/ (first run, and whenever papers/ changes)
docker compose exec backend python scripts/inscien_ingest.py
# or, once the stack is up:  curl -XPOST http://localhost:8200/api/lab/reindex
```

Then open **http://localhost:3200** and start asking questions.

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
- **Ingestion** — `backend/services/lab/pdf_parser.py` (PyMuPDF, two-column reading-order
  aware) → sub-page passages → embeddings → Qdrant. Re-run after changing `papers/`.
- **Frontend** (Next.js, `frontend/`) — the chat UI at `:3200`.

See `CLAUDE.md` for the full architecture notes and `INSCIEN-BRIEF.md` for the design
rationale.

## Your data & backups

Two host folders hold everything that's yours:

- **`papers/`** — your source PDFs (mounted read-only into the backend).
- **`data/`** — all durable app state: the SQLite DB (chat history + settings), the search
  index, and narration audio.

Qdrant's vectors live in the `qdrant_data` Docker volume. They're a **rebuildable cache** —
regenerated from `papers/` by the ingest script — so they're not something you need to back up.

The distinction: **`papers/` + `data/` are irreplaceable; the index and vectors are derived.**

- **Back up** = copy `papers/` and `data/`. That's your whole library and history.
- `docker compose down` preserves everything (both folders and the Qdrant volume).
- `docker compose down -v` also removes the Qdrant volume — but your DB in `data/` is safe
  (it's a plain host file, not a volume). Rebuild the vectors with
  `docker compose exec backend python scripts/inscien_ingest.py`.

### Configuration
Key env vars (set on the backend service in `compose.yaml`, overridable via `.env` —
see `.env.example`): `OLLAMA_BASE_URL`, `PAPERS_DIR`, `QDRANT_URL`, `DATABASE_URL`,
`KOKORO_VOICE`.

## License

MIT — see [LICENSE](LICENSE).
