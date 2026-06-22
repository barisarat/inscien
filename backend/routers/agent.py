import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from schemas.agent import AgentAnswerRequest
from services.agent.agent_service import stream_agent_answer


router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.post("/stream")
def agent_answer_stream(body: AgentAnswerRequest):
    def event_stream():
        for chunk in stream_agent_answer(
            query=body.query,
            session_id=body.session_id,
            item_keys=set(body.item_keys) if body.item_keys else None,
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
