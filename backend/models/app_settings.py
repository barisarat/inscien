from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func

from core.db import Base


class AppSettings(Base):
    """Single-row, single-user settings - the user's "usage params".

    `llm_provider` selects the generation backend: "local" (the default - the user's local
    Ollama) or "openai" (an OpenAI / OpenAI-compatible endpoint, opt-in). `llm_model` holds the
    active model id for whichever provider is selected.

    `openai_api_key` and `zotero_data_dir` are stored here so a distributed desktop build can be
    configured entirely in-app (no env/terminal). Both still honor an env override
    (`OPENAI_API_KEY`, `ZOTERO_DATA_DIR`) when the DB value is blank. The key lives only in the
    user's local SQLite, never leaves the machine except to the OpenAI endpoint, and the API
    never returns it (only a `present` flag).
    """
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, default=1)
    display_name = Column(String(120), nullable=True)
    llm_provider = Column(String(20), nullable=False, server_default="local")
    llm_model = Column(String(120), nullable=True)
    ollama_base_url = Column(String(200), nullable=True)
    openai_api_key = Column(String(200), nullable=True)
    zotero_data_dir = Column(String(500), nullable=True)
    updated_at = Column(
        DateTime(timezone=True), nullable=False,
        server_default=func.now(), onupdate=func.now(),
    )
