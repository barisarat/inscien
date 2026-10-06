"""The FastAPI app: the API, the bundle files, and the built UI on one origin."""

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

from inscien.core.db import engine, Base, ensure_app_settings_columns
from inscien.routers.settings import router as settings_router
from inscien.routers.papers import router as papers_router
from inscien.routers.library import router as library_router
from inscien.routers.zotero import router as zotero_router
from inscien.routers.narrations import router as narrations_router
from inscien.routers.jobs import router as jobs_router
import os

ENV_NAME = os.getenv("ENV_NAME", "development")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # No migration framework: additively add columns that create_all can't add to an
    # already-existing table (e.g. zotero_data_dir on a returning user's app_settings).
    ensure_app_settings_columns()
    # The background job does not survive a restart - fail one that was mid-run.
    from inscien.services.library.host_job import recover as recover_host_job
    recover_host_job()
    yield


from inscien import __version__

if ENV_NAME == "production":
    app = FastAPI(title="InScien", version=__version__, docs_url=None, redoc_url=None,
                  openapi_url=None, lifespan=lifespan)
else:
    app = FastAPI(title="InScien", version=__version__, lifespan=lifespan)

# Dev runs the Next dev server and the API on separate localhost origins, so CORS is needed.
# Default to localhost (zero-config host dev); `CORS_ORIGINS` overrides. Prod/desktop serve the
# UI same-origin, so the list is never consulted there - and localhost-only is safe to ship.
_DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
_configured = [o.strip() for o in (os.getenv("CORS_ORIGINS") or "").split(",") if o.strip()]
ALLOWED_ORIGINS = _configured or _DEV_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(settings_router)
app.include_router(papers_router)
app.include_router(library_router)
app.include_router(zotero_router)
app.include_router(narrations_router)
app.include_router(jobs_router)


# INSCIEN_READONLY=1 refuses every write except the listener's own - the reader's position and
# the finished flag under /api/progress, which merge one slug at a time. For a process that has
# to face a network you do not control. Reads pass unchanged.
READONLY = (os.getenv("INSCIEN_READONLY") or "").strip().lower() in ("1", "true", "yes")


@app.middleware("http")
async def refuse_writes_when_readonly(request, call_next):
    if READONLY and request.method not in ("GET", "HEAD", "OPTIONS") and not request.url.path.startswith("/api/progress/"):
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail": "read-only"}, status_code=403)
    return await call_next(request)


@app.get("/health")
async def health():
    # Liveness only - fast and dependency-free, so a healthcheck reflects "the API process is
    # serving" and never flaps on anything external. See /health/ready.
    return {"status": "ok"}


@app.get("/health/ready")
def health_ready():
    """Readiness: probe the app's own store (SQLite) without ever failing the request."""
    from sqlalchemy import text
    from inscien.core.db import SessionLocal

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

    return {"db": db_ok, "ready": db_ok}


# Serve the built frontend (Next static export) when present: the wheel ships it as
# inscien/webui, and the CLI points FRONTEND_DIST at it, so the UI and API share one origin.
# Mounted LAST so the API routes take precedence; html=True resolves /map -> /map/index.html.
# In development FRONTEND_DIST is unset (the Next dev server serves the UI on its own port).
FRONTEND_DIST = os.getenv("FRONTEND_DIST")
if FRONTEND_DIST and os.path.isdir(FRONTEND_DIST):
    import mimetypes
    from fastapi.staticfiles import StaticFiles

    # The pdf.js worker is an ES module (.mjs); browsers refuse to load a module worker
    # unless it's served with a JavaScript MIME type, and Python's mimetypes doesn't always
    # register .mjs. Set it before mounting so StaticFiles guesses the right type.
    mimetypes.add_type("text/javascript", ".mjs")

    class FrontendFiles(StaticFiles):
        # The HTML pages must revalidate on every load. Next names its chunks by content hash,
        # so a rebuilt UI is a new set of chunk urls referenced from an unchanged page url, and
        # a browser that kept the old page from its heuristic cache would keep running the old
        # app. no-cache still allows the conditional GET, so an unchanged page costs one 304.
        # The hashed chunks keep the default: they never change under the same name.
        def file_response(self, *args, **kwargs):
            response = super().file_response(*args, **kwargs)
            if str(response.media_type or "").startswith("text/html"):
                response.headers["Cache-Control"] = "no-cache"
            return response

    app.mount("/", FrontendFiles(directory=FRONTEND_DIST, html=True), name="frontend")