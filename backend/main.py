from dotenv import load_dotenv
load_dotenv()

import logging

# Ensure app logs (tracebacks from services) reach the console. basicConfig is a no-op
# if the root logger already has handlers, so it won't fight uvicorn/gunicorn config.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.db import engine, Base
from routers.agent import router as agent_router
from routers.chat import router as chat_router
from routers.settings import router as settings_router
from routers.papers import router as papers_router
from routers.graph import router as graph_router
from routers.narrate import router as narrate_router
from routers.compare import router as compare_router
from routers.write import router as write_router
from routers.zotero import router as zotero_router
import os

ENV_NAME = os.getenv("ENV_NAME", "development")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import models.zotero_sync  # noqa: F401 — register the sync-ledger table
    Base.metadata.create_all(bind=engine)
    # In-process jobs don't survive a restart — fail any that were mid-run.
    from services.compare.jobs import recover_stale as recover_compare
    from services.writeup.jobs import recover_stale as recover_writeup
    from services.narration.jobs import recover_stale as recover_narration
    from services.zotero.jobs import recover_stale as recover_zotero
    from services.refs.fetch_jobs import recover_stale as recover_graph_fetch
    recover_compare()
    recover_writeup()
    recover_narration()
    recover_zotero()
    recover_graph_fetch()
    yield


if ENV_NAME == "production":
    app = FastAPI(
        title="InScien Backend API",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
else:
    app = FastAPI(
        title="InScien Backend API",
        version="0.1.0",
        lifespan=lifespan,
    )

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in (os.getenv("CORS_ORIGINS") or "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agent_router)
app.include_router(chat_router)
app.include_router(settings_router)
app.include_router(papers_router)
app.include_router(graph_router)
app.include_router(narrate_router)
app.include_router(compare_router)
app.include_router(write_router)
app.include_router(zotero_router)


@app.get("/health")
async def health():
    # Liveness only — fast and dependency-free, so the compose healthcheck reflects "the API
    # process is serving" and never flaps on a host Ollama being down. See /health/ready.
    return {"status": "ok"}


@app.get("/health/ready")
def health_ready():
    """Readiness/diagnostics: probe each dependency without ever failing the request. Ollama
    is informational (it lives on the host and may legitimately be down); readiness needs only
    the API's own stores (SQLite + Qdrant)."""
    from sqlalchemy import text
    from core.db import SessionLocal
    from services.lab.qdrant_store import check_qdrant_connection
    from services.llm.client import list_ollama_models_status

    db_ok = False
    try:
        session = SessionLocal()
        try:
            session.execute(text("SELECT 1"))
            db_ok = True
        finally:
            session.close()
    except Exception:
        logging.getLogger("health").exception("readiness: DB probe failed")

    qdrant_ok = False
    try:
        qdrant_ok = bool(check_qdrant_connection().get("ok"))
    except Exception:
        logging.getLogger("health").warning("readiness: Qdrant unreachable", exc_info=True)

    try:
        ollama_ok = bool(list_ollama_models_status().get("reachable"))
    except Exception:
        ollama_ok = False

    return {"db": db_ok, "qdrant": qdrant_ok, "ollama": ollama_ok, "ready": db_ok and qdrant_ok}