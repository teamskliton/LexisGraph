"""
User model.

Uses SQLAlchemy 2.0 declarative style with Mapped[] annotations.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class User(Base):
    """
    Application user.

    Attributes
    ----------
    id : UUID
        Primary key — server-generated UUID4.
    email : str
        Unique email address.
    username : str
        Unique username.
    full_name : str
        Display name.
    hashed_password : str
        Bcrypt hash of the plain password (not the password itself).
    is_active : bool
        Soft-disable flag.  Inactive users cannot authenticate.
    is_superuser : bool
        Grants full permissions without explicit assignment.
    created_at : datetime
        UTC timestamp when the user was first created.
    updated_at : datetime
        UTC timestamp of the last modification.
    """

    __tablename__ = "users"

    # Primary key — UUID4, server-generated (INSERT leaves this out).
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    email: Mapped[str] = mapped_column(
        String(320),        # RFC 5321 allows local-part@domain up to 320 chars
        unique=True,
        nullable=False,
        index=True,
    )

    username: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )

    full_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    hashed_password: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    is_superuser: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, username={self.username!r})>"