"""
Chat schemas for AI Legal Assistant.

Pydantic v2 models for request validation and response serialization.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    """Payload for submitting a question to the Chat RAG endpoint."""

    question: str = Field(..., min_length=1, max_length=2000, description="User question or prompt")
    organization_id: uuid.UUID = Field(..., description="UUID of the organization to query")
    conversation_id: str | None = Field(default=None, description="Optional conversation identifier")


class SourceCitation(BaseModel):
    """Rich Citation specifying document ID, clause ID, section, page, similarity, type, and source origin."""

    document_id: str | None = Field(default=None, description="Document UUID string if available")
    clause_id: str | None = Field(default=None, description="Clause UUID string if available")
    document: str = Field(..., description="Original filename or document title")
    section: str | None = Field(default=None, description="Section header or clause number")
    clause: str = Field(..., description="Relevant clause text snippet")
    clause_number: str | None = Field(default=None, description="Clause number or ID")
    page: int | None = Field(default=1, description="Page number in source document")
    similarity: float | None = Field(default=0.9, description="Calculated similarity score (0.0 to 1.0)")
    type: str | None = Field(default="Regulation", description="Document type: 'Regulation' or 'Policy'")
    confidence_score: float = Field(..., description="Relevance / similarity confidence score")
    search_source: str = Field(default="Both", description="Source origin: 'Vector Search', 'Graph Search', or 'Both'")


class RecommendedAction(BaseModel):
    """Actionable legal recommendation button."""

    type: str = Field(..., description="Action type: 'compare_policy', 'view_document', 'view_graph', 'export_report', etc.")
    title: str = Field(..., description="Short button title")
    description: str = Field(..., description="Description of recommended action")


class RelatedDocument(BaseModel):
    """Related legal document or regulation in corpus."""

    id: str = Field(..., description="Document or Regulation UUID string")
    title: str = Field(..., description="Document or Regulation title")
    similarity: float = Field(..., description="Relevance score (0.0 to 1.0)")


class ChatResponse(BaseModel):
    """Structured response from the Chat RAG endpoint with recommendations."""

    answer: str = Field(..., description="LLM generated answer or evidence status message")
    sources: list[SourceCitation] = Field(default_factory=list, description="Citations used in constructing the answer")
    follow_up_questions: list[str] = Field(default_factory=list, description="3 contextual follow-up questions")
    recommended_actions: list[RecommendedAction] = Field(default_factory=list, description="Contextual legal action buttons")
    related_documents: list[RelatedDocument] = Field(default_factory=list, description="Related legal documents identified in corpus")
    conversation_id: str = Field(..., description="Unique conversation session identifier")


class CreateConversationRequest(BaseModel):
    """Payload to explicitly create a new conversation session."""

    title: str | None = Field(default="New Conversation", description="Optional conversation title")
    organization_id: uuid.UUID | None = Field(default=None, description="Optional associated organization UUID")


class UpdateConversationRequest(BaseModel):
    """Payload to update a conversation session (rename, pin, archive)."""

    title: str | None = Field(default=None, description="New title for the conversation")
    is_pinned: bool | None = Field(default=None, description="Toggle pinned status")
    is_archived: bool | None = Field(default=None, description="Toggle archived status")


class ConversationSessionResponse(BaseModel):
    """Public representation of a conversation session for listing."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(..., description="Unique conversation session UUID")
    title: str = Field(..., description="Automatically generated or customized conversation title")
    organization_id: uuid.UUID | None = Field(default=None, description="Associated organization UUID")
    is_pinned: bool = Field(default=False, description="Whether thread is pinned to top")
    is_archived: bool = Field(default=False, description="Whether thread is archived")
    message_count: int = Field(default=0, description="Total number of messages in the conversation")
    created_at: datetime = Field(..., description="UTC creation timestamp")
    updated_at: datetime = Field(..., description="UTC last updated timestamp")


class ConversationMessageResponse(BaseModel):
    """Public representation of a single message within a conversation."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(..., description="Unique message UUID")
    conversation_id: uuid.UUID = Field(..., description="Parent conversation session UUID")
    role: str = Field(..., description="Message role: 'user', 'assistant', or 'system'")
    message: str = Field(..., description="Message body text")
    sources: list[SourceCitation] | None = Field(default=None, description="Sources/citations if role is assistant")
    follow_up_questions: list[str] | None = Field(default=None, description="Suggested follow-up questions")
    recommended_actions: list[RecommendedAction] | None = Field(default=None, description="Recommended legal actions")
    related_documents: list[RelatedDocument] | None = Field(default=None, description="Related documents")
    created_at: datetime = Field(..., description="UTC timestamp of message creation")


class ConversationDetailResponse(BaseModel):
    """Complete message history response for a single conversation session."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(..., description="Unique conversation session UUID")
    title: str = Field(..., description="Conversation title")
    organization_id: uuid.UUID | None = Field(default=None, description="Associated organization UUID")
    is_pinned: bool = Field(default=False, description="Whether thread is pinned")
    is_archived: bool = Field(default=False, description="Whether thread is archived")
    created_at: datetime = Field(..., description="UTC creation timestamp")
    updated_at: datetime = Field(..., description="UTC last updated timestamp")
    messages: list[ConversationMessageResponse] = Field(default_factory=list, description="Full message history ordered by time")
