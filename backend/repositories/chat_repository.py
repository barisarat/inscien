from sqlalchemy import func
from sqlalchemy.orm import load_only

from models.chat import ChatMessage, ChatSession


def create_session(db, user_id, title):
    session = ChatSession(user_id=user_id, title=(title or "New chat")[:200])
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def list_sessions(db, user_id):
    return (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user_id)
        .order_by(ChatSession.updated_at.desc())
        .all()
    )


def get_session(db, user_id, session_id):
    return (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user_id, ChatSession.id == session_id)
        .first()
    )


def get_messages(db, session_id):
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.seq.asc(), ChatMessage.id.asc())
        .all()
    )


def get_messages_light(db, session_id):
    """Messages without the widget/citation JSON blobs — all the agent needs to
    rebuild model history. The full loader stays for session restore, which
    genuinely re-renders the charts."""
    return (
        db.query(ChatMessage)
        .options(load_only(
            ChatMessage.seq,
            ChatMessage.role,
            ChatMessage.content,
            ChatMessage.context_summary,
        ))
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.seq.asc(), ChatMessage.id.asc())
        .all()
    )


def append_message(db, session_id, role, content, widgets=None, citations=None,
                   context_summary=None):
    next_seq = (
        db.query(func.coalesce(func.max(ChatMessage.seq), -1))
        .filter(ChatMessage.session_id == session_id)
        .scalar()
    ) + 1

    message = ChatMessage(
        session_id=session_id,
        seq=next_seq,
        role=role,
        content=content or "",
        widgets=widgets,
        citations=citations,
        context_summary=context_summary,
    )
    db.add(message)
    # Touch the session so it sorts to the top of the list.
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session is not None:
        session.updated_at = func.now()
    db.commit()
    db.refresh(message)
    return message


def update_working_set(db, session_id, working_set):
    """Persist the chat-scoped working-set inventory for a session."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session is None:
        return None
    session.working_set = working_set
    db.commit()
    return session


def rename_session(db, user_id, session_id, title):
    session = get_session(db, user_id, session_id)
    if not session:
        return None
    session.title = (title or "New chat")[:200]
    db.commit()
    db.refresh(session)
    return session


def delete_session(db, user_id, session_id):
    session = get_session(db, user_id, session_id)
    if not session:
        return False
    db.delete(session)
    db.commit()
    return True
