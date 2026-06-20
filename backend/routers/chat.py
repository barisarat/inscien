from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.db import get_db
from repositories import chat_repository as chats
from schemas.chat import RenameSessionIn, TurnIn


router = APIRouter(prefix="/api/chat", tags=["chat"])

# InScien is single-user/local — every session belongs to one implicit user.
LOCAL_USER_ID = 1


def _session_summary(s):
    return {
        "id": s.id,
        "title": s.title,
        "createdAt": s.created_at.isoformat() if s.created_at else None,
        "updatedAt": s.updated_at.isoformat() if s.updated_at else None,
    }


def _message_dto(m):
    return {
        "role": m.role,
        "content": m.content,
        "widgets": m.widgets or [],
        "citations": m.citations or [],
        "contextSummary": m.context_summary or "",
        "createdAt": m.created_at.isoformat() if m.created_at else None,
    }


@router.post("/turn")
def save_turn(body: TurnIn, db: Session = Depends(get_db)):
    """Persist a completed background-skill turn (user + assistant) into a chat session,
    creating the session if needed. Returns the session id so the client can adopt it."""
    session = chats.get_session(db, LOCAL_USER_ID, body.sessionId) if body.sessionId else None
    if session is None:
        session = chats.create_session(db, LOCAL_USER_ID, (body.title or body.userContent)[:80])
    chats.append_message(db, session.id, "user", body.userContent)
    chats.append_message(
        db, session.id, "assistant", body.assistantContent,
        widgets=body.widgets, citations=body.citations,
    )
    return {"sessionId": session.id}


@router.get("/sessions")
def list_sessions(db: Session = Depends(get_db)):
    return {"sessions": [_session_summary(s) for s in chats.list_sessions(db, LOCAL_USER_ID)]}


@router.get("/sessions/{session_id}")
def get_session(session_id: int, db: Session = Depends(get_db)):
    session = chats.get_session(db, LOCAL_USER_ID, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    return {
        "id": session.id,
        "title": session.title,
        "messages": [_message_dto(m) for m in chats.get_messages(db, session.id)],
    }


@router.patch("/sessions/{session_id}")
def rename_session(session_id: int, body: RenameSessionIn, db: Session = Depends(get_db)):
    session = chats.rename_session(db, LOCAL_USER_ID, session_id, body.title)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return _session_summary(session)


@router.delete("/sessions/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_db)):
    if not chats.delete_session(db, LOCAL_USER_ID, session_id):
        raise HTTPException(status_code=404, detail="Chat session not found")
    return {"ok": True}
