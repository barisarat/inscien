from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func

from core.db import Base


class AppSettings(Base):
    """Single-row, single-user settings — the user's "usage params".

    `llm_provider` selects the generation backend: "local" (the default — the user's local
    Ollama) or "openai" (an OpenAI / OpenAI-compatible endpoint, opt-in). `llm_model` holds the
    active model id for whichever provider is selected. The OpenAI API key is NOT stored here —
    it is read from the `OPENAI_API_KEY` environment variable (see services/llm/client.py).
    """
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, default=1)
    display_name = Column(String(120), nullable=True)
    llm_provider = Column(String(20), nullable=False, server_default="local")
    llm_model = Column(String(120), nullable=True)
    ollama_base_url = Column(String(200), nullable=True)
    updated_at = Column(
        DateTime(timezone=True), nullable=False,
        server_default=func.now(), onupdate=func.now(),
    )
