from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func

from core.db import Base


class AppSettings(Base):
    """Single-row, single-user settings — the user's "usage params".

    InScien is local-only: just the display name, the chosen local Ollama model, and the
    Ollama URL are used. (Older databases may still carry legacy `llm_provider` /
    `openai_api_key` columns; they are unmapped here and simply ignored.)
    """
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, default=1)
    display_name = Column(String(120), nullable=True)
    llm_model = Column(String(120), nullable=True)
    ollama_base_url = Column(String(200), nullable=True)
    updated_at = Column(
        DateTime(timezone=True), nullable=False,
        server_default=func.now(), onupdate=func.now(),
    )
