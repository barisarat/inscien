from pydantic import BaseModel, Field


class LabSearchRequest(BaseModel):
    query: str = Field(..., min_length=2)
    limit: int = Field(default=10, ge=1, le=30)


class LabSearchResult(BaseModel):
    score: float
    sourceType: str
    sourceId: str
    chunkId: str
    parentId: str
    title: str
    description: str
    category: str
    sectionTitle: str
    url: str
    externalUrl: str
    contentMode: str
    text: str
    metadata: dict


class LabSearchResponse(BaseModel):
    query: str
    count: int
    results: list[LabSearchResult]


class LabCitation(BaseModel):
    title: str
    url: str
    sourceType: str
    category: str
    sectionTitle: str
    contentMode: str


class LabAnswerRequest(BaseModel):
    query: str = Field(..., min_length=2)
    limit: int = Field(default=10, ge=1, le=20)


class LabAnswerResponse(BaseModel):
    query: str
    answer: str
    citations: list[LabCitation]
    related: list[LabCitation]
    retrievedCount: int
    insufficientContext: bool