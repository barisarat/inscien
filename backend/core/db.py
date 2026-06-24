"""
Database connection and session management.

InScien is single-user and local-first, so the store is a file-based SQLite
database (no server to run). `DATABASE_URL` overrides the location/backend —
the compose file sets it to `sqlite:////workspace/data/inscien.db`.
"""

import logging
import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, scoped_session, declarative_base

from core.paths import data_path

logger = logging.getLogger(__name__)

Base = declarative_base()


def _norm(s: str | None) -> str:
    return "" if s is None else s.strip()


def _get_database_url() -> str:
    # Explicit URL wins; otherwise default to the local-first SQLite store.
    explicit = _norm(os.getenv("DATABASE_URL"))
    if explicit:
        return explicit
    path = _norm(os.getenv("SQLITE_PATH")) or data_path("inscien.db")
    return f"sqlite:///{path}"


DATABASE_URL = _get_database_url()

if DATABASE_URL.startswith("sqlite"):
    # SQLite is accessed across FastAPI's threadpool / the streaming generator's
    # own session, so disable the same-thread check. No pool recycling needed.
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        future=True,
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=3600,
        future=True,
    )

SessionLocal = scoped_session(
    sessionmaker(bind=engine, autocommit=False, autoflush=False)
)


def get_db():
    """FastAPI dependency - yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_app_settings_columns() -> None:
    """Additively reconcile `app_settings` columns on a pre-existing DB.

    There is no migration framework — `Base.metadata.create_all` builds missing *tables* but
    never adds missing *columns* to a table that already exists. So a returning user's
    `app_settings` won't gain `llm_provider` on its own. Add it with an idempotent, guarded
    `ALTER TABLE ... ADD COLUMN` (SQLite backfills existing rows from the literal DEFAULT). A
    brand-new DB already has the column via the model, so this is a no-op there; a legacy DB
    that already carries the column is also a clean no-op.
    """
    inspector = inspect(engine)
    if "app_settings" not in inspector.get_table_names():
        return  # fresh DB — create_all builds it with the column already present

    existing = {c["name"] for c in inspector.get_columns("app_settings")}
    additive = {
        "llm_provider": "ALTER TABLE app_settings ADD COLUMN llm_provider VARCHAR(20) NOT NULL DEFAULT 'local'",
        "openai_api_key": "ALTER TABLE app_settings ADD COLUMN openai_api_key VARCHAR(200)",
        "zotero_data_dir": "ALTER TABLE app_settings ADD COLUMN zotero_data_dir VARCHAR(500)",
    }
    for column, ddl in additive.items():
        if column in existing:
            continue
        try:
            with engine.begin() as conn:
                conn.execute(text(ddl))
            logger.info("app_settings: added missing column %s", column)
        except Exception:
            # A concurrent boot or a legacy duplicate column must never crash startup.
            logger.warning("app_settings: could not add column %s (may already exist)", column, exc_info=True)
