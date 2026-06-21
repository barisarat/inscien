from pydantic import BaseModel, Field


class AgentMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class AgentAnswerRequest(BaseModel):
    query: str = Field(..., min_length=2)
    history: list[AgentMessage] = Field(default_factory=list)
    session_id: int | None = None
    limit: int = Field(default=10, ge=1, le=20)
    # Explicit skill from a `/command` (ask | graph | refs); None = let the agent infer.
    skill: str | None = None
    # Active Zotero selection (a set of itemKeys = chunk sourceIds). When present,
    # retrieval is scoped to these items; None/empty = the whole indexed library.
    item_keys: list[str] | None = None
