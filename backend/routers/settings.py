from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.db import get_db
from repositories import settings_repository as settings_repo
from schemas.settings import SettingsIn, SettingsOut
from services.llm.client import DEFAULT_OLLAMA_URL, list_ollama_models

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _to_out(row) -> SettingsOut:
    return SettingsOut(
        displayName=row.display_name or "",
        llmModel=row.llm_model or "",
        ollamaBaseUrl=row.ollama_base_url or "",
    )


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return _to_out(settings_repo.get_settings(db))


@router.get("/models")
def list_models(db: Session = Depends(get_db)):
    """Selectable models — every model served by the user's local Ollama. InScien is
    local-only; there is no cloud option."""
    row = settings_repo.get_settings(db)
    base = (row.ollama_base_url or "").strip() or DEFAULT_OLLAMA_URL

    options = [
        {"value": f"local|{model_id}", "label": f"{model_id} · local",
         "provider": "local", "model": model_id}
        for model_id in list_ollama_models(base)
    ]
    return {"options": options}


@router.put("", response_model=SettingsOut)
def update_settings(body: SettingsIn, db: Session = Depends(get_db)):
    fields = {}
    if body.displayName is not None:
        fields["display_name"] = body.displayName.strip()
    if body.llmModel is not None:
        fields["llm_model"] = body.llmModel.strip()
    if body.ollamaBaseUrl is not None:
        fields["ollama_base_url"] = body.ollamaBaseUrl.strip()

    row = settings_repo.update_settings(db, fields)
    return _to_out(row)
