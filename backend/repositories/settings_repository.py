from models.app_settings import AppSettings


SETTINGS_ID = 1


def get_settings(db):
    """Return the singleton settings row, creating it with defaults if absent."""
    row = db.query(AppSettings).filter(AppSettings.id == SETTINGS_ID).first()
    if row is None:
        row = AppSettings(id=SETTINGS_ID)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


# Only these fields may be written from the API. The OpenAI key is NOT here — it's env-only
# (OPENAI_API_KEY), never persisted.
_UPDATABLE = {"display_name", "llm_provider", "llm_model", "ollama_base_url"}


def update_settings(db, fields):
    row = get_settings(db)
    for key, value in fields.items():
        if key in _UPDATABLE:
            setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row
