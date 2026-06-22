"""
Database connection and session management.

InScien is single-user and local-first, so the store is a file-based SQLite
database (no server to run). `DATABASE_URL` overrides the location/backend —
the compose file sets it to `sqlite:////workspace/data/inscien.db`.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session, declarative_base

Base = declarative_base()


def _norm(s: str | None) -> str:
    return "" if s is None else s.strip()


def _get_database_url() -> str:
    # Explicit URL wins; otherwise default to the local-first SQLite store.
    explicit = _norm(os.getenv("DATABASE_URL"))
    if explicit:
        return explicit
    path = _norm(os.getenv("SQLITE_PATH")) or "/workspace/data/inscien.db"
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
