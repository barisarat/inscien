"""
Database connection and session management.

InScien is single-user and local-first, so the default store is a file-based
SQLite database (no MySQL server to run). Set `DATABASE_URL` to override —
e.g. `sqlite:////workspace/data/inscien.db` (default) or a full
`mysql+pymysql://...` URL — otherwise one is composed from the `DB_*` vars.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session, declarative_base

Base = declarative_base()


def _norm(s: str | None) -> str:
    return "" if s is None else s.strip()


def _compose_url(dialect: str, user: str, password: str, host: str, port: str, dbname: str) -> str:
    pw = _norm(password)
    cred = f"{user}" if pw == "" else f"{user}:{pw}"
    return f"{dialect}://{cred}@{host}:{port}/{dbname}"


def _get_database_url() -> str:
    # Explicit URL wins (the local-first default points it at SQLite).
    explicit = _norm(os.getenv("DATABASE_URL"))
    if explicit:
        return explicit

    dialect = os.getenv("DB_DIALECT", "sqlite")
    if dialect.startswith("sqlite"):
        path = _norm(os.getenv("SQLITE_PATH")) or "/workspace/data/inscien.db"
        return f"sqlite:///{path}"

    db_host = os.getenv("DB_HOST", "localhost")
    db_port = os.getenv("DB_PORT", "3306")
    db_name = os.getenv("DB_NAME", "inscien_db")
    db_user = os.getenv("DB_USER", "root")
    db_pass = _norm(os.getenv("DB_PASS", "InScien2026db!"))
    return _compose_url(dialect, db_user, db_pass, db_host, db_port, db_name)


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
