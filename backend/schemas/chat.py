from typing import Any, Optional

from pydantic import BaseModel, Field


class RenameSessionIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class TurnIn(BaseModel):
    """Persist a completed out-of-band skill turn (compare/write/narrate) into a chat
    session — these run as background jobs outside the agent stream, so the client saves
    the finished turn on completion. Creates the session when sessionId is null."""
    sessionId: Optional[int] = None
    title: Optional[str] = None
    userContent: str
    assistantContent: str = ""
    citations: Optional[list[Any]] = None
    widgets: Optional[list[Any]] = None
