"""
Memory Service — Persistent Conversation Memory Management.

Handles PostgreSQL session state, automated title generation, bounded sliding window
history retrieval (latest 10 messages), full-text search, thread lifecycle (pin/archive/rename),
duplication, export, and conversation CRUD operations.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.models import ConversationMessage, ConversationSession
from app.schemas.chat import (
    ConversationDetailResponse,
    ConversationMessageResponse,
    ConversationSessionResponse,
    CreateConversationRequest,
    RecommendedAction,
    RelatedDocument,
    SourceCitation,
    UpdateConversationRequest,
)

logger = logging.getLogger(__name__)

DEFAULT_HISTORY_LIMIT = 10


def _parse_conversation_uuid(conversation_id: str) -> uuid.UUID:
    """Parse string to UUID, falling back to deterministic UUID5 for custom string identifiers."""
    clean_str = str(conversation_id).strip()
    try:
        return uuid.UUID(clean_str)
    except ValueError:
        return uuid.uuid5(uuid.NAMESPACE_DNS, clean_str)


def generate_conversation_title(question: str | None) -> str:
    """
    Automatically generate a readable conversation title from the user's initial question.

    Examples:
    - "What are the rules under Code of Wages for overtime?" -> "Code of Wages Discussion"
    - "Review POSH policy compliance details" -> "POSH Compliance Review"
    - Fallback: Truncated query string formatted cleanly.
    """
    if not question or not question.strip():
        return "New Conversation"

    clean_text = question.strip()

    # Rule-based domain keyword matching
    lower = clean_text.lower()
    if "wage" in lower or "salary" in lower or "compensation" in lower:
        return "Code of Wages Discussion"
    if "posh" in lower or "harassment" in lower:
        return "POSH Compliance Review"
    if "retention" in lower or "data protection" in lower or "gdpr" in lower:
        return "Data Retention & Protection Review"
    if "termination" in lower or "severance" in lower or "notice" in lower:
        return "Employee Termination Policy Review"
    if "leave" in lower or "maternity" in lower or "paternity" in lower:
        return "Leave Policy Inquiry"

    # Fallback title generation: clean punctuation and limit length
    words = re.findall(r"\w+", clean_text)
    if not words:
        return "New Conversation"

    title_words = words[:6]
    title = " ".join(w.capitalize() for w in title_words)
    if len(title) > 40:
        title = title[:40].rsplit(" ", 1)[0]
    return title or "New Conversation"


def create_conversation_session(
    db: Session,
    user_id: uuid.UUID,
    payload: CreateConversationRequest,
) -> ConversationSessionResponse:
    """Explicitly create a new conversation session for the authenticated user."""
    title = payload.title.strip() if payload.title and payload.title.strip() else "New Conversation"
    new_session = ConversationSession(
        id=uuid.uuid4(),
        user_id=user_id,
        organization_id=payload.organization_id,
        title=title,
        is_pinned=False,
        is_archived=False,
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    return ConversationSessionResponse(
        id=new_session.id,
        title=new_session.title,
        organization_id=new_session.organization_id,
        is_pinned=new_session.is_pinned,
        is_archived=new_session.is_archived,
        message_count=0,
        created_at=new_session.created_at,
        updated_at=new_session.updated_at,
    )


def get_or_create_session(
    db: Session,
    user_id: uuid.UUID,
    organization_id: uuid.UUID | None,
    conversation_id: str | None = None,
    first_question: str | None = None,
) -> ConversationSession:
    """
    Fetch an existing conversation session verifying user ownership,
    or create a new conversation session with an automatically generated title.
    """
    if conversation_id and str(conversation_id).strip():
        conv_uuid = _parse_conversation_uuid(str(conversation_id))
        session = db.get(ConversationSession, conv_uuid)
        if session is not None and isinstance(session, ConversationSession):
            if session.user_id != user_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Conversation session not found or access denied",
                )
            return session

    # Create new session if conversation_id is not provided or not existing in DB
    title = generate_conversation_title(first_question)
    new_uuid = _parse_conversation_uuid(str(conversation_id)) if conversation_id and str(conversation_id).strip() else uuid.uuid4()
    
    new_session = ConversationSession(
        id=new_uuid,
        user_id=user_id,
        organization_id=organization_id,
        title=title,
        is_pinned=False,
        is_archived=False,
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    logger.info(
        "[MEMORY_SERVICE] Created new session: id=%s user_id=%s title=%r",
        new_session.id,
        user_id,
        title,
    )
    return new_session


def get_recent_history(
    db: Session,
    conversation_id: uuid.UUID,
    limit: int = DEFAULT_HISTORY_LIMIT,
) -> list[ConversationMessage]:
    """
    Retrieve the most recent `limit` messages (default 10) for context injection,
    returned in chronological order (ASC).
    """
    stmt = (
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at.desc(), ConversationMessage.id.desc())
        .limit(limit)
    )
    recent_desc = db.scalars(stmt).all()
    return list(reversed(recent_desc))


_last_message_time: datetime | None = None


def _get_monotonic_now() -> datetime:
    """Return a strictly increasing timestamp for message ordering."""
    global _last_message_time
    now = datetime.now(timezone.utc)
    if _last_message_time is not None and now <= _last_message_time:
        now = _last_message_time + timedelta(milliseconds=10)
    _last_message_time = now
    return now


def save_message_pair(
    db: Session,
    conversation_id: uuid.UUID,
    user_message: str,
    assistant_message: str,
    sources: list[dict] | None = None,
    metadata: dict | None = None,
) -> tuple[ConversationMessage, ConversationMessage]:
    """
    Persist user question and assistant answer messages in PostgreSQL,
    updating the session's updated_at timestamp.
    """
    user_now = _get_monotonic_now()
    assistant_now = _get_monotonic_now()

    user_msg = ConversationMessage(
        id=uuid.uuid4(),
        conversation_id=conversation_id,
        role="user",
        message=user_message,
        sources_json=None,
        created_at=user_now,
    )
    assistant_msg = ConversationMessage(
        id=uuid.uuid4(),
        conversation_id=conversation_id,
        role="assistant",
        message=assistant_message,
        sources_json=sources,
        metadata_json=metadata,
        created_at=assistant_now,
    )

    db.add(user_msg)
    db.add(assistant_msg)

    # Touch session updated_at timestamp
    session = db.get(ConversationSession, conversation_id)
    if session:
        session.updated_at = assistant_now

    db.commit()
    db.refresh(user_msg)
    db.refresh(assistant_msg)

    logger.info(
        "[MEMORY_SERVICE] Saved message pair for conversation_id=%s",
        conversation_id,
    )
    return user_msg, assistant_msg


def list_user_conversations(
    db: Session,
    user_id: uuid.UUID,
    organization_id: uuid.UUID | None = None,
    search: str | None = None,
    include_archived: bool = False,
) -> list[ConversationSessionResponse]:
    """
    Retrieve all conversation sessions belonging to the authenticated user,
    with title, pinned status, archived status, last updated timestamp, and total message count.
    Supports full-text query matching on session titles and message contents.
    Ordered by is_pinned DESC, updated_at DESC.
    """
    stmt = (
        select(
            ConversationSession.id,
            ConversationSession.title,
            ConversationSession.organization_id,
            ConversationSession.is_pinned,
            ConversationSession.is_archived,
            ConversationSession.created_at,
            ConversationSession.updated_at,
            func.count(ConversationMessage.id).label("message_count"),
        )
        .outerjoin(ConversationMessage, ConversationSession.id == ConversationMessage.conversation_id)
        .where(ConversationSession.user_id == user_id)
    )

    if not include_archived:
        stmt = stmt.where(ConversationSession.is_archived == False)

    if organization_id:
        stmt = stmt.where(ConversationSession.organization_id == organization_id)

    if search and search.strip():
        q_pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                ConversationSession.title.ilike(q_pattern),
                ConversationMessage.message.ilike(q_pattern),
            )
        )

    stmt = stmt.group_by(
        ConversationSession.id,
        ConversationSession.title,
        ConversationSession.organization_id,
        ConversationSession.is_pinned,
        ConversationSession.is_archived,
        ConversationSession.created_at,
        ConversationSession.updated_at,
    ).order_by(ConversationSession.is_pinned.desc(), ConversationSession.updated_at.desc())

    rows = db.execute(stmt).all()

    results: list[ConversationSessionResponse] = []
    for row in rows:
        results.append(
            ConversationSessionResponse(
                id=row.id,
                title=row.title,
                organization_id=row.organization_id,
                is_pinned=bool(row.is_pinned),
                is_archived=bool(row.is_archived),
                message_count=row.message_count or 0,
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
        )

    return results


def update_conversation(
    db: Session,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    payload: UpdateConversationRequest,
) -> ConversationSessionResponse:
    """Update title, is_pinned, or is_archived attributes of a conversation session."""
    session = db.get(ConversationSession, conversation_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation session not found or access denied",
        )

    if payload.title is not None:
        session.title = payload.title.strip() or "Untitled Conversation"
    if payload.is_pinned is not None:
        session.is_pinned = payload.is_pinned
    if payload.is_archived is not None:
        session.is_archived = payload.is_archived

    session.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)

    # Calculate message count
    msg_count = db.scalar(
        select(func.count(ConversationMessage.id)).where(ConversationMessage.conversation_id == session.id)
    ) or 0

    return ConversationSessionResponse(
        id=session.id,
        title=session.title,
        organization_id=session.organization_id,
        is_pinned=session.is_pinned,
        is_archived=session.is_archived,
        message_count=msg_count,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def duplicate_conversation(
    db: Session,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
) -> ConversationDetailResponse:
    """Duplicate a conversation session and all its messages."""
    original = db.get(ConversationSession, conversation_id)
    if original is None or original.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation session not found or access denied",
        )

    new_session = ConversationSession(
        id=uuid.uuid4(),
        user_id=user_id,
        organization_id=original.organization_id,
        title=f"{original.title} (Copy)",
        is_pinned=False,
        is_archived=False,
    )
    db.add(new_session)
    db.commit()

    # Copy messages
    messages = db.scalars(
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at.asc())
    ).all()

    for msg in messages:
        copied_msg = ConversationMessage(
            id=uuid.uuid4(),
            conversation_id=new_session.id,
            role=msg.role,
            message=msg.message,
            sources_json=msg.sources_json,
            metadata_json=msg.metadata_json,
            created_at=msg.created_at,
        )
        db.add(copied_msg)

    db.commit()
    return get_conversation_detail(db, user_id, new_session.id)


def export_conversation(
    db: Session,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    export_format: str = "markdown",
) -> tuple[str, str]:
    """
    Export conversation history as Markdown (.md), Plain Text (.txt), or JSON (.json).
    Returns (content_string, filename).
    """
    detail = get_conversation_detail(db, user_id, conversation_id)
    clean_title = re.sub(r"[^\w\s-]", "", detail.title).strip().replace(" ", "_") or "Conversation"

    if export_format.lower() == "json":
        data = {
            "title": detail.title,
            "conversation_id": str(detail.id),
            "created_at": detail.created_at.isoformat(),
            "messages": [
                {
                    "role": m.role,
                    "message": m.message,
                    "created_at": m.created_at.isoformat(),
                    "sources": [s.model_dump() for s in m.sources] if m.sources else [],
                }
                for m in detail.messages
            ],
        }
        return json.dumps(data, indent=2), f"{clean_title}.json"

    if export_format.lower() == "text":
        lines = [
            f"LexisGraph AI Legal Assistant — Conversation Export",
            f"Title: {detail.title}",
            f"Date: {detail.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}",
            "=" * 60,
            "",
        ]
        for m in detail.messages:
            role_header = "USER" if m.role.lower() == "user" else "AI LEGAL ASSISTANT"
            lines.append(f"[{m.created_at.strftime('%H:%M')}] {role_header}:")
            lines.append(m.message)
            if m.sources:
                lines.append("\n  Legal Citations:")
                for s in m.sources:
                    lines.append(f"  - {s.document} ({s.section or 'Section'}): \"{s.clause[:80]}...\"")
            lines.append("-" * 40)
            lines.append("")
        return "\n".join(lines), f"{clean_title}.txt"

    # Default Markdown format
    md_lines = [
        f"# {detail.title}",
        f"*Exported from LexisGraph AI Legal Assistant on {detail.created_at.strftime('%B %d, %Y')}*\n",
        "---",
        "",
    ]
    for m in detail.messages:
        if m.role.lower() == "user":
            md_lines.append(f"### 👤 User ({m.created_at.strftime('%H:%M')})\n")
            md_lines.append(f"{m.message}\n")
        else:
            md_lines.append(f"### 🤖 LexisGraph AI ({m.created_at.strftime('%H:%M')})\n")
            md_lines.append(f"{m.message}\n")
            if m.sources:
                md_lines.append("**Legal Evidence & Citations:**")
                for s in m.sources:
                    md_lines.append(f"- **{s.document}** ({s.section or 'Section'}): *\"{s.clause}\"*")
                md_lines.append("")
        md_lines.append("---\n")

    return "\n".join(md_lines), f"{clean_title}.md"


def get_conversation_detail(
    db: Session,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
) -> ConversationDetailResponse:
    """
    Retrieve full message history for a specific conversation session ordered chronologically.
    """
    session = db.get(ConversationSession, conversation_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation session not found or access denied",
        )

    stmt = (
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at.asc(), ConversationMessage.id.asc())
    )
    messages = db.scalars(stmt).all()

    msg_responses: list[ConversationMessageResponse] = []
    for msg in messages:
        sources_list: list[SourceCitation] | None = None
        if msg.sources_json and isinstance(msg.sources_json, list):
            sources_list = [SourceCitation(**src) for src in msg.sources_json if isinstance(src, dict)]

        meta = msg.metadata_json or {}
        follow_ups = meta.get("follow_up_questions") if isinstance(meta, dict) else None
        actions_raw = meta.get("recommended_actions") if isinstance(meta, dict) else None
        docs_raw = meta.get("related_documents") if isinstance(meta, dict) else None

        rec_actions = [RecommendedAction(**a) for a in actions_raw] if actions_raw and isinstance(actions_raw, list) else None
        rel_docs = [RelatedDocument(**d) for d in docs_raw] if docs_raw and isinstance(docs_raw, list) else None

        msg_responses.append(
            ConversationMessageResponse(
                id=msg.id,
                conversation_id=msg.conversation_id,
                role=msg.role,
                message=msg.message,
                sources=sources_list,
                follow_up_questions=follow_ups,
                recommended_actions=rec_actions,
                related_documents=rel_docs,
                created_at=msg.created_at,
            )
        )

    return ConversationDetailResponse(
        id=session.id,
        title=session.title,
        organization_id=session.organization_id,
        is_pinned=session.is_pinned,
        is_archived=session.is_archived,
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=msg_responses,
    )


def delete_conversation(
    db: Session,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    soft_delete: bool = True,
) -> bool:
    """
    Delete a conversation session.
    If soft_delete=True, marks is_archived=True. Otherwise hard deletes session.
    """
    session = db.get(ConversationSession, conversation_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation session not found or access denied",
        )

    if soft_delete:
        session.is_archived = True
        session.updated_at = datetime.now(timezone.utc)
    else:
        db.delete(session)

    db.commit()

    logger.info(
        "[MEMORY_SERVICE] Deleted (soft=%s) conversation_id=%s for user_id=%s",
        soft_delete,
        conversation_id,
        user_id,
    )
    return True
