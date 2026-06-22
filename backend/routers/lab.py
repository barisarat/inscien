import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session

from core.db import get_db
from schemas.lab import (
    LabAnswerRequest,
    LabAnswerResponse,
    LabSearchRequest,
    LabSearchResponse,
)
from services.lab.answer_service import answer_lab, stream_lab_answer
from services.lab.search_service import search_lab


router = APIRouter(prefix="/api/lab", tags=["lab"])
security = HTTPBearer(auto_error=False)


def _request_metadata(request: Request):
    forwarded_for = request.headers.get("x-forwarded-for", "")
    client_ip = forwarded_for.split(",")[0].strip()

    if not client_ip and request.client:
        client_ip = request.client.host

    return {
        "route": str(request.url.path),
        "client_ip": client_ip or "",
        "client_user_agent": request.headers.get("user-agent", ""),
    }


@router.post("/search", response_model=LabSearchResponse)
def lab_search(body: LabSearchRequest):
    return search_lab(body.query, body.limit)


@router.post("/answer", response_model=LabAnswerResponse)
def lab_answer(
    body: LabAnswerRequest,
    request: Request,
    db: Session = Depends(get_db),
    credentials=Depends(security),
):
    anonymous_id = request.headers.get("x-lab-anonymous-id", "").strip()[:120]

    return answer_lab(
        query=body.query,
        limit=body.limit,
        db=db,
        credentials=credentials,
        anonymous_id=anonymous_id,
        request_metadata=_request_metadata(request),
    )


@router.post("/answer/stream")
def lab_answer_stream(
    body: LabAnswerRequest,
    request: Request,
    credentials=Depends(security),
):
    anonymous_id = request.headers.get("x-lab-anonymous-id", "").strip()[:120]
    request_metadata = _request_metadata(request)

    def event_stream():
        for chunk in stream_lab_answer(
            query=body.query,
            limit=body.limit,
            credentials=credentials,
            anonymous_id=anonymous_id,
            request_metadata=request_metadata,
        ):
            yield f"data: {json.dumps(chunk)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )