from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from core.db import Base


class AppSettings(Base):
    """Single-row, single-user settings — the user's "usage params".

    InScien is local-only: just the display name, the chosen local Ollama model, and the
    Ollama URL are used. The `llm_provider` / `openai_api_key` columns are legacy and kept
    only for schema stability (no migration framework) — they are never read or written.
    """
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, default=1)
    display_name = Column(String(120), nullable=True)
    llm_model = Column(String(120), nullable=True)
    ollama_base_url = Column(String(200), nullable=True)
    # Legacy / unused (local-only). Retained so the existing SQLite table still matches.
    llm_provider = Column(String(20), nullable=False, default="local", server_default="local")
    openai_api_key = Column(Text, nullable=True)
    updated_at = Column(
        DateTime(timezone=True), nullable=False,
        server_default=func.now(), onupdate=func.now(),
    )
