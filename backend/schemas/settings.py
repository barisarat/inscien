from typing import Optional

from pydantic import BaseModel


class SettingsOut(BaseModel):
    displayName: str
    llmProvider: str          # "local" | "openai"
    llmModel: str             # active model id for the selected provider
    ollamaBaseUrl: str
    openAiApiKeyPresent: bool  # whether OPENAI_API_KEY is set in the env (never the key itself)


class SettingsIn(BaseModel):
    displayName: Optional[str] = None
    llmProvider: Optional[str] = None  # validated to {"local","openai"} in the router
    llmModel: Optional[str] = None
    ollamaBaseUrl: Optional[str] = None
    # No openAiApiKey field — the key is env-only (OPENAI_API_KEY), never written via the API.
