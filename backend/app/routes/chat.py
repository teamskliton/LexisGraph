"""
Chat API Router — AI Legal Assistant & Persistent Conversation Management.

Endpoints:
- POST /chat: Submit a question, continue or start a conversation thread (batch mode).
- POST /chat/stream: Submit a question and receive real-time SSE token-by-token streaming AI response.
- GET /chat/conversations: List all conversation sessions for the authenticated user (with search & pinning).
- POST /chat/conversations: Create a new conversation session.
- PATCH /chat/conversations/{id}: Rename, pin/unpin, or archive/restore a conversation session.
- POST /chat/conversations/{id}/duplicate: Duplicate a conversation session and message history.
- GET /chat/conversations/{id}/export: Export conversation history as Markdown, Text, or JSON.
- GET /chat/conversations/{conversation_id}: Retrieve full chronological message history for a specific conversation.
- DELETE /chat/conversations/{conversation_id}: Delete/Archive a conversation session.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.db.models import User
from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    ConversationDetailResponse,
    ConversationSessionResponse,
    CreateConversationRequest,
    UpdateConversationRequest,
)
from app.services.chat_service import process_chat_request, stream_chat_request
from app.services.memory_service import (
    create_conversation_session,
    delete_conversation,
    duplicate_conversation,
    export_conversation,
    get_conversation_detail,
    list_user_conversations,
    update_conversation,
)

router = APIRouter(prefix="", tags=["Chat"])
logger = logging.getLogger(__name__)


@router.post(
    "/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit a question to AI Legal Assistant with hybrid RAG, citations, and persistent memory (batch mode)",
)
def chat_endpoint(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatResponse:
    """
    POST /chat (Batch mode)
    """
    return process_chat_request(db=db, current_user=current_user, payload=payload)


@router.post(
    "/chat/stream",
    status_code=status.HTTP_200_OK,
    summary="Submit a question to AI Legal Assistant with real-time SSE token streaming",
)
def chat_stream_endpoint(
    request: Request,
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    POST /chat/stream (SSE streaming mode)
    """
    generator = stream_chat_request(
        request=request,
        db=db,
        current_user=current_user,
        payload=payload,
    )
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/chat/conversations",
    response_model=list[ConversationSessionResponse],
    status_code=status.HTTP_200_OK,
    summary="List all conversation sessions for authenticated user",
)
def list_conversations_endpoint(
    organization_id: uuid.UUID | None = None,
    search: str | None = None,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ConversationSessionResponse]:
    """
    GET /chat/conversations
    """
    return list_user_conversations(
        db,
        current_user.id,
        organization_id=organization_id,
        search=search,
        include_archived=include_archived,
    )


@router.post(
    "/chat/conversations",
    response_model=ConversationSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new conversation session",
)
def create_conversation_endpoint(
    payload: CreateConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationSessionResponse:
    """
    POST /chat/conversations
    """
    return create_conversation_session(db, current_user.id, payload)


@router.patch(
    "/chat/conversations/{conversation_id}",
    response_model=ConversationSessionResponse,
    status_code=status.HTTP_200_OK,
    summary="Update conversation title, pin status, or archive status",
)
def update_conversation_endpoint(
    conversation_id: uuid.UUID,
    payload: UpdateConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationSessionResponse:
    """
    PATCH /chat/conversations/{conversation_id}
    """
    return update_conversation(db, current_user.id, conversation_id, payload)


@router.post(
    "/chat/conversations/{conversation_id}/duplicate",
    response_model=ConversationDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Duplicate a conversation session and all messages",
)
def duplicate_conversation_endpoint(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationDetailResponse:
    """
    POST /chat/conversations/{conversation_id}/duplicate
    """
    return duplicate_conversation(db, current_user.id, conversation_id)


@router.get(
    "/chat/conversations/{conversation_id}/export",
    status_code=status.HTTP_200_OK,
    summary="Export conversation history as Markdown, Plain Text, or JSON",
)
def export_conversation_endpoint(
    conversation_id: uuid.UUID,
    format: str = Query(default="markdown", description="Export format: 'markdown', 'text', or 'json'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """
    GET /chat/conversations/{conversation_id}/export
    """
    content, filename = export_conversation(db, current_user.id, conversation_id, export_format=format)
    media_type = "application/json" if format.lower() == "json" else "text/plain"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/chat/conversations/{conversation_id}",
    response_model=ConversationDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get full message history for a specific conversation session",
)
def get_conversation_endpoint(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationDetailResponse:
    """
    GET /chat/conversations/{conversation_id}
    """
    return get_conversation_detail(db, current_user.id, conversation_id)


@router.delete(
    "/chat/conversations/{conversation_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete or archive a conversation session",
)
def delete_conversation_endpoint(
    conversation_id: uuid.UUID,
    soft: bool = Query(default=True, description="Soft delete (archive) if True"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    DELETE /chat/conversations/{conversation_id}
    """
    delete_conversation(db, current_user.id, conversation_id, soft_delete=soft)
    return {
        "status": "success",
        "message": "Conversation session archived" if soft else "Conversation session permanently deleted",
        "conversation_id": str(conversation_id),
    }
