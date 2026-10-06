from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func

from inscien.core.db import Base


class AppSettings(Base):
    """Single-row, single-user settings.

    `zotero_data_dir` is stored here so the app can be configured entirely in-app (no env, no
    terminal). It still honors an env override (`ZOTERO_DATA_DIR`) when the DB value is blank.

    A DB created by 0.3.x also carries `llm_provider` / `llm_model` / `ollama_base_url` /
    `openai_api_key` columns from the retired Narrate feature. They are deliberately not mapped
    here: the ORM never reads or writes them, and `llm_provider` carries a NOT NULL DDL default,
    so a legacy table keeps working untouched.
    """
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, default=1)
    display_name = Column(String(120), nullable=True)
    zotero_data_dir = Column(String(500), nullable=True)
    updated_at = Column(
        DateTime(timezone=True), nullable=False,
        server_default=func.now(), onupdate=func.now(),
    )
