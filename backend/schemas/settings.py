from typing import Optional

from pydantic import BaseModel


class SettingsOut(BaseModel):
    displayName: str
    llmProvider: str          # "local" | "openai"
    llmModel: str             # active model id for the selected provider
    ollamaBaseUrl: str
    zoteroDataDir: str         # the user's Zotero data folder (or "" to fall back to env/default)
    zoteroDataDirDetected: str  # auto-detected Zotero folder (contains zotero.sqlite), or "" if none
    openAiApiKeyPresent: bool  # whether a key is set (DB or env) - never the key itself


class SettingsIn(BaseModel):
    displayName: Optional[str] = None
    llmProvider: Optional[str] = None  # validated to {"local","openai"} in the router
    llmModel: Optional[str] = None
    ollamaBaseUrl: Optional[str] = None
    zoteroDataDir: Optional[str] = None
    # Write-only: stored in local SQLite, never returned. Only applied when non-empty, so saving
    # other settings doesn't wipe an existing key.
    openAiApiKey: Optional[str] = None
