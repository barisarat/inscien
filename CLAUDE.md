# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project overview

**InScien** is a local-first, private research assistant over the user's own library of
research PDFs. It answers questions with **page-precise, verifiable citations** in a
multi-turn chat. It was forked from FinanceLab (a FastAPI + Next.js agentic platform) by
keeping the harness — the hand-rolled tool-calling agent loop, the hybrid dense+BM25
retrieval engine, and the `/ask` chat frontend — and stripping the entire finance domain.

Single-user, local, no auth. Stack: FastAPI backend + Next.js frontend + Qdrant. Chat
history is SQLite. **Local-only by design**: all generation (answers + grounding judges)
runs against the user's local Ollama via its OpenAI-compatible endpoint — there is no
cloud/provider path, so privacy, zero cost, and offline operation are architectural
guarantees, not settings (`services/llm/client.py`). Quality scales with the chosen local
model; a bigger model is the user's quality dial.

## Running the stack

```bash
docker compose up                  # backend :8200, frontend :3200, qdrant :6335
# After the papers/ folder changes, (re)build the index:
docker compose exec backend python scripts/inscien_ingest.py
# or: curl -XPOST http://localhost:8200/api/lab/reindex
```

A local Ollama must be running (set `OLLAMA_BASE_URL` if not the default
`host.docker.internal:11434/v1`); no API keys are needed. PDFs live in `papers/` (mounted
read-only at `/workspace/papers`). SQLite DB + the chunk manifest live under
`backend/data/` (`inscien.db`, `pdf-index.json`).

## Architecture

**The agent (RAG-cite skill).** `POST /api/agent/stream` (SSE) runs the tool-calling loop
in `services/agent/agent_service.py` against the OpenAI Responses API. For v1 there is a
single tool — `search_internal_content` (library retrieval) in `services/agent/tools.py`.
The loop retrieves, then streams a final answer grounded in the retrieved passages with
inline `[n]` citations. SSE events: `stage` / `citations` / `delta` / `final` / `error`.
Each turn is persisted to SQLite (`ChatSession`/`ChatMessage`, `models/chat.py`,
`repositories/chat_repository.py`) under one implicit `LOCAL_USER_ID`, and prior turns +
a compact `(context: …)` recap are replayed so follow-ups resolve. System prompt:
`services/agent/prompt.py`.

**Retrieval + citations (`services/lab/`).** Hybrid retrieval (`search_service.py`):
dense vectors from Qdrant + an in-process BM25 index over the chunk manifest, fused
0.65/0.35, then diversified per (document, page). Embeddings: fastembed `bge-small-en-v1.5`
(384-dim, `embedding_service.py`). `answer_service.py` selects context, builds citations
(carrying `page` + `passage`), and also powers the simpler single-shot `/api/lab/answer`.
`prompt_service.build_context_blocks` renders numbered sources with their page so the model
cites pages.

**Ingestion (net-new).** `services/lab/pdf_parser.py` (PyMuPDF, two-column reading-order
fix, page + bbox) → `services/lab/pdf_ingest.py` (sub-page passages with overlap, each
tagged with `metadata.page`/`bbox`; content-hash doc ids = idempotent) → writes the chunk
manifest → embeds → rebuilds Qdrant. Entry points: `scripts/inscien_ingest.py` and
`POST /api/lab/reindex`. `manifest_loader.py` reads the single manifest at
`settings.chunk_index_path`. The parser is a swappable interface (Docling/Marker later).

**Config.** `services/lab/settings.py` (env-driven: `QDRANT_*`, `PAPERS_DIR`,
`INSCIEN_INDEX_PATH`, `LAB_ANSWER_MODEL`). DB via `core/db.py` (`DATABASE_URL`, SQLite default).

## Status / roadmap

- ✅ Phase 0–1: fork, strip finance, slim stack, SQLite, no auth.
- ✅ Phase 2: PDF ingestion with page metadata; page-aware retrieval + citations.
- ⏳ Phase 3: the two grounding judge loops (retrieval-sufficiency inside the tool;
  answer-grounding verification after drafting) — `services/rag/grounding.py`.
- ⏳ Phase 4: frontend — de-auth so chat sessions work without login, strip finance
  widgets, render `Title · p.N` + passage-on-click, rebrand.

## Conventions

- Standalone scripts insert the backend root on `sys.path` and `load_dotenv()` themselves.
- No migration framework — `Base.metadata.create_all` builds tables on startup.
- Frontend styling: reuse the design tokens in `frontend/src/app/globals.css`; accent blue
  is for links/active states, not badges/pills (badges use `--surface-muted`).
- The full design rationale lives in `/workspace/INSCIEN-BRIEF.md`.
