from pydantic import BaseModel, Field


class AgentAnswerRequest(BaseModel):
    query: str = Field(..., min_length=2)
    session_id: int | None = None
    # Active Zotero selection (a set of itemKeys = chunk sourceIds). When present,
    # retrieval is scoped to these items; None/empty = the whole indexed library.
    item_keys: list[str] | None = None
