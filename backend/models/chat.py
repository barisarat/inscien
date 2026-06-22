from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.sql import func

from core.db import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    # Single-user/local: a plain owner id (no users table / FK). Defaults to the
    # one implicit local user so existing repository filters keep working.
    user_id = Column(Integer, nullable=True, index=True, default=1)
    title = Column(String(200), nullable=False, default="New chat", server_default="New chat")
    # Chat-scoped state carried across turns to resolve references — currently the
    # active Zotero selection (itemKeys) the agent should scope retrieval to.
    working_set = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    seq = Column(Integer, nullable=False, default=0)
    role = Column(String(12), nullable=False)  # user | assistant
    content = Column(Text, nullable=False)
    widgets = Column(JSON, nullable=True)
    citations = Column(JSON, nullable=True)
    context_summary = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        # History loads ORDER BY (seq, id) per session; index the lookup+sort path
        # so loading a session's messages (widget JSON included) stays cheap.
        Index("ix_chat_messages_session_seq", "session_id", "seq"),
    )
