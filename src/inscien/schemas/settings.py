from typing import Optional

from pydantic import BaseModel


class SettingsOut(BaseModel):
    displayName: str
    zoteroDataDir: str         # the user's Zotero data folder (or "" to fall back to env/default)
    zoteroDataDirDetected: str  # auto-detected Zotero folder (contains zotero.sqlite), or "" if none


class SettingsIn(BaseModel):
    displayName: Optional[str] = None
    zoteroDataDir: Optional[str] = None
