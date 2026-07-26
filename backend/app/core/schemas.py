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