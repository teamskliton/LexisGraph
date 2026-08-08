"""
Pydantic schemas.

Pydantic v2 models for request validation, response serialisation, and
JWT token payloads.  All response models use ``from_attributes=True``
(SQLAlchemy → Pydantic) and exclude sensitive fields such as
``hashed_password``.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------------------------------------------------------------------------
# User schemas
# ---------------------------------------------------------------------------


class UserBase(BaseModel):
    """Shared fields for User create/read schemas."""

    email: EmailStr = Field(..., description="Unique email address")
    username: str = Field(..., min_length=3, max_length=50, description="Unique username")
    full_name: str = Field(..., min_length=1, max_length=255, description="Display name")


class UserCreate(UserBase):
    """
    Payload for creating a new user.

    Requires a plain-text password which is hashed before storage.
    """

    password: str = Field(..., min_length=8, max_length=128, description="Plain-text password (8–128 chars)")


class UserLogin(BaseModel):
    """Payload for username/email + password authentication."""

    username: str = Field(..., description="Username or email address")
    password: str = Field(..., description="Plain-text password")


class UserResponse(UserBase):
    """
    Public user representation returned by the API.

    ``hashed_password`` is deliberately excluded.
    ``from_attributes=True`` enables direct conversion from SQLAlchemy model instances.
    """

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID = Field(..., description="Server-generated UUID4")
    email: EmailStr
    username: str
    full_name: str
    is_active: bool = Field(default=True, description="Soft-disable flag")
    is_superuser: bool = Field(default=False, description="Superuser flag")
    created_at: datetime = Field(..., description="UTC timestamp of creation")
    updated_at: datetime = Field(..., description="UTC timestamp of last update")


# ---------------------------------------------------------------------------
# Organization schemas
# ---------------------------------------------------------------------------


class OrganizationBase(BaseModel):
    """Shared fields for Organization create/update schemas."""

    name: str = Field(..., min_length=1, max_length=150, description="Organization name")
    description: str | None = Field(None, max_length=500, description="Organization description")
    industry: str | None = Field(None, max_length=100, description="Industry the organization operates in")
    website: str | None = Field(None, max_length=255, description="Organization website URL")
    logo_url: str | None = Field(None, max_length=50000, description="URL or data string to the organization logo")


class OrganizationCreate(OrganizationBase):
    """
    Payload for creating a new organization.

    ``created_by`` is set from the authenticated user, not provided in the payload.
    """


class OrganizationUpdate(BaseModel):
    """
    Partial payload for updating an organization.

    All fields are optional — only provided fields are updated.
    """

    name: str | None = Field(None, min_length=1, max_length=150, description="Organization name")
    description: str | None = Field(None, max_length=500, description="Organization description")
    industry: str | None = Field(None, max_length=100, description="Industry the organization operates in")
    website: str | None = Field(None, max_length=255, description="Organization website URL")
    logo_url: str | None = Field(None, max_length=50000, description="URL or data string to the organization logo")


class OrganizationResponse(OrganizationBase):
    """
    Public organization representation returned by the API.

    ``from_attributes=True`` enables direct conversion from SQLAlchemy model instances.
    Excludes internal SQLAlchemy fields.
    """

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID = Field(..., description="Server-generated UUID4")
    created_by: uuid.UUID = Field(..., description="UUID of the user who created this organization")
    created_at: datetime = Field(..., description="UTC timestamp of creation")
    updated_at: datetime = Field(..., description="UTC timestamp of last update")


# ---------------------------------------------------------------------------
# JWT / token schemas
# ---------------------------------------------------------------------------


class Token(BaseModel):
    """OAuth2 token response — returned after successful authentication."""

    model_config = ConfigDict(from_attributes=True)

    access_token: str = Field(..., description="Encoded JWT access token")
    token_type: str = Field(default="bearer", description="Fixed value ``bearer``")
    expires_in: int = Field(..., description="Token lifetime in seconds")


class TokenPayload(BaseModel):
    """
    Decoded JWT payload.

    ``sub`` is the only required claim; all other fields are optional
    and are added by ``create_access_token()`` automatically.
    """

    sub: str | None = Field(default=None, description="Subject — user identifier")
    exp: datetime | None = Field(default=None, description="Expiration timestamp")
    iat: datetime | None = Field(default=None, description="Issued-at timestamp")
    type: str | None = Field(default=None, description="Token type (e.g. ``access``)")


# ---------------------------------------------------------------------------
# Document schemas
# ---------------------------------------------------------------------------


class DocumentType(str, Enum):
    """Document type classification."""

    REGULATION = "REGULATION"
    POLICY = "POLICY"


class ProcessingStatus(str, Enum):
    """Document processing status."""

    UPLOADED = "UPLOADED"
    PROCESSING = "PROCESSING"
    PROCESSED = "PROCESSED"
    FAILED = "FAILED"


class DocumentBase(BaseModel):
    """Shared fields for Document schemas."""

    original_filename: str = Field(..., description="Original name of the uploaded file")
    stored_filename: str = Field(..., description="Server-generated storage name")
    file_path: str = Field(..., description="Full path to the stored file")
    file_size: int = Field(..., description="Size of the file in bytes")
    mime_type: str = Field(..., description="MIME type of the file")
    checksum: str = Field(..., description="SHA-256 checksum of the file")
    document_type: DocumentType = Field(..., description="Document type: REGULATION or POLICY")


class DocumentResponse(DocumentBase):
    """
    Document response returned by the API.

    ``from_attributes=True`` enables direct conversion from SQLAlchemy model instances.
    """

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID = Field(..., description="Server-generated UUID4")
    organization_id: uuid.UUID = Field(..., description="Organization this document belongs to")
    uploaded_by: uuid.UUID = Field(..., description="UUID of the user who uploaded this document")
    processing_status: ProcessingStatus = Field(
        ..., description="Processing status: UPLOADED, PROCESSING, PROCESSED, FAILED"
    )
    progress: int = Field(default=0, description="Processing progress percentage (0-100)")
    current_step: str | None = Field(default=None, description="Active pipeline step label")
    processing_started_at: datetime | None = Field(default=None, description="UTC timestamp when processing started")
    processed_at: datetime | None = Field(default=None, description="UTC timestamp of terminal state")
    error_message: str | None = Field(default=None, description="Error message if processing failed")
    created_at: datetime = Field(..., description="UTC timestamp of upload")
    updated_at: datetime = Field(..., description="UTC timestamp of last update")


class DocumentStatusResponse(BaseModel):
    """
    Slim status-only response for ``GET /documents/{id}/status``.

    Exposes the fields needed by the client to render a progress indicator
    without returning the full document payload.
    """

    model_config = ConfigDict(from_attributes=False)

    document_id: uuid.UUID = Field(..., description="UUID of the document")
    status: ProcessingStatus = Field(..., description="Current processing status")
    progress: int = Field(..., description="Processing progress percentage (0-100)")
    current_step: str | None = Field(default=None, description="Active pipeline step label")
    error_message: str | None = Field(default=None, description="Error message if status is FAILED")
    processing_started_at: datetime | None = Field(default=None, description="UTC timestamp when processing started")
    processed_at: datetime | None = Field(default=None, description="UTC timestamp of terminal state")


# ---------------------------------------------------------------------------
# Regulation schemas
# ---------------------------------------------------------------------------

class RegulationBase(BaseModel):
    """Shared fields for Regulation schemas."""

    title: str = Field(..., description="Title of the regulation")
    act_name: str | None = Field(default=None, description="Name of the act")
    version: str | None = Field(default=None, description="Version of the regulation")
    jurisdiction: str | None = Field(default=None, description="Jurisdiction")
    document_hash: str = Field(..., description="SHA-256 checksum of the file")
    is_global: bool = Field(default=True, description="Whether this regulation is global")
    original_filename: str = Field(..., description="Original name of the uploaded file")
    stored_filename: str = Field(..., description="Server-generated storage name")
    file_path: str = Field(..., description="Full path to the stored file")
    file_size: int = Field(..., description="Size of the file in bytes")
    mime_type: str = Field(..., description="MIME type of the file")


class RegulationResponse(RegulationBase):
    """Regulation response returned by the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID = Field(..., description="Server-generated UUID4")
    uploaded_by: uuid.UUID = Field(..., description="UUID of the user who uploaded this document")
    processing_status: ProcessingStatus = Field(
        ..., description="Processing status: UPLOADED, PROCESSING, PROCESSED, FAILED"
    )
    progress: int = Field(default=0, description="Processing progress percentage (0-100)")
    current_step: str | None = Field(default=None, description="Active pipeline step label")
    processing_started_at: datetime | None = Field(default=None, description="UTC timestamp when processing started")
    processed_at: datetime | None = Field(default=None, description="UTC timestamp of terminal state")
    error_message: str | None = Field(default=None, description="Error message if processing failed")
    created_at: datetime = Field(..., description="UTC timestamp of upload")
    updated_at: datetime = Field(..., description="UTC timestamp of last update")


class RegulationStatusResponse(BaseModel):
    """Slim status-only response for Regulation."""

    model_config = ConfigDict(from_attributes=False)

    id: uuid.UUID = Field(..., description="UUID of the regulation")
    status: ProcessingStatus = Field(..., description="Current processing status")
    progress: int = Field(..., description="Processing progress percentage (0-100)")
    current_step: str | None = Field(default=None, description="Active pipeline step label")
    error_message: str | None = Field(default=None, description="Error message if status is FAILED")
    processing_started_at: datetime | None = Field(default=None, description="UTC timestamp when processing started")
    processed_at: datetime | None = Field(default=None, description="UTC timestamp of terminal state")

# ---------------------------------------------------------------------------
# Chat schemas
# ---------------------------------------------------------------------------


from app.schemas.chat import ChatRequest, ChatResponse, SourceCitation