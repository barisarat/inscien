import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer

from schemas.agent import AgentAnswerRequest
from services.agent.agent_service import stream_agent_answer


router = APIRouter(prefix="/api/agent", tags=["agent"])
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


@router.post("/stream")
def agent_answer_stream(
    body: AgentAnswerRequest,
    request: Request,
    credentials=Depends(security),
):
    anonymous_id = request.headers.get("x-lab-anonymous-id", "").strip()[:120]
    request_metadata = _request_metadata(request)
    history = [{"role": m.role, "content": m.content} for m in body.history]

    def event_stream():
        for chunk in stream_agent_answer(
            query=body.query,
            history=history,
            session_id=body.session_id,
            limit=body.limit,
            credentials=credentials,
            anonymous_id=anonymous_id,
            request_metadata=request_metadata,
            skill=body.skill,
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
