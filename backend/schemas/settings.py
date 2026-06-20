from typing import Optional

from pydantic import BaseModel


class SettingsOut(BaseModel):
    displayName: str
    llmModel: str            # the chosen local Ollama model id
    ollamaBaseUrl: str


class SettingsIn(BaseModel):
    displayName: Optional[str] = None
    llmModel: Optional[str] = None
    ollamaBaseUrl: Optional[str] = None
