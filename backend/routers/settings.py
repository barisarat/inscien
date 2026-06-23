import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.db import get_db
from repositories import settings_repository as settings_repo
from schemas.settings import SettingsIn, SettingsOut
from services.llm.client import DEFAULT_OLLAMA_URL, list_ollama_models_status

router = APIRouter(prefix="/api/settings", tags=["settings"])

ALLOWED_PROVIDERS = {"local", "openai"}
# Placeholder suggestion for the free-text cloud model field (not validated).
CLOUD_MODEL_HINT = "gpt-5.4-nano"


def _openai_key_present() -> bool:
    return bool((os.getenv("OPENAI_API_KEY") or "").strip())


def _to_out(row) -> SettingsOut:
    return SettingsOut(
        displayName=row.display_name or "",
        llmProvider=(row.llm_provider or "local"),
        llmModel=row.llm_model or "",
        ollamaBaseUrl=row.ollama_base_url or "",
        openAiApiKeyPresent=_openai_key_present(),
    )


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return _to_out(settings_repo.get_settings(db))


@router.get("/models")
def list_models(db: Session = Depends(get_db)):
    """Selectable LOCAL models — every model served by the user's Ollama. Cloud (OpenAI) models
    are free-text (ids drift), so they're not enumerated here; `cloudModelHint` is just a
    placeholder suggestion for the input field."""
    row = settings_repo.get_settings(db)
    base = (row.ollama_base_url or "").strip() or DEFAULT_OLLAMA_URL

    status = list_ollama_models_status(base)
    options = [
        {"value": f"local|{model_id}", "label": f"{model_id} · local",
         "provider": "local", "model": model_id}
        for model_id in status["models"]
    ]
    # ollamaReachable lets the UI tell "Ollama is down" from "Ollama is up but has no models".
    return {"options": options, "ollamaReachable": status["reachable"], "cloudModelHint": CLOUD_MODEL_HINT}


@router.put("", response_model=SettingsOut)
def update_settings(body: SettingsIn, db: Session = Depends(get_db)):
    fields = {}
    if body.displayName is not None:
        fields["display_name"] = body.displayName.strip()
    if body.llmProvider is not None:
        provider = body.llmProvider.strip().lower()
        if provider not in ALLOWED_PROVIDERS:
            raise HTTPException(status_code=422, detail="llmProvider must be 'local' or 'openai'.")
        fields["llm_provider"] = provider
    if body.llmModel is not None:
        fields["llm_model"] = body.llmModel.strip()
    if body.ollamaBaseUrl is not None:
        fields["ollama_base_url"] = body.ollamaBaseUrl.strip()

    # Guard against a stranded state: don't let the user select cloud without a key in the
    # environment or without a model. Compute the *effective* values (incoming if present, else
    # what's already stored).
    row = settings_repo.get_settings(db)
    effective_provider = fields.get("llm_provider", (row.llm_provider or "local"))
    if effective_provider == "openai":
        if not _openai_key_present():
            raise HTTPException(
                status_code=422,
                detail="Set OPENAI_API_KEY in the environment and restart before selecting the cloud provider.",
            )
        effective_model = fields.get("llm_model", (row.llm_model or "")).strip()
        if not effective_model:
            raise HTTPException(
                status_code=422,
                detail="Enter a cloud model id (e.g. gpt-5.4-nano) before selecting the cloud provider.",
            )

    row = settings_repo.update_settings(db, fields)
    return _to_out(row)
