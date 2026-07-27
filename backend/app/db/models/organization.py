"""
Organization model.

Uses SQLAlchemy 2.0 declarative style with Mapped[] annotations.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Organization(Base):
    """
    Organization entity.

    Attributes
    ----------
    id : UUID
        Primary key — server-generated UUID4.
    name : str
        Organization name (required, max 150 chars).
    description : str | None
        Optional description of the organization.
    industry : str | None
        Industry the organization operates in.
    website : str | None
        Organization's website URL.
    logo_url : str | None
        URL to the organization's logo image.
    created_by : UUID
        Foreign key referencing the user who created this organization.
    created_at : datetime
        UTC timestamp when the organization was created.
    updated_at : datetime
        UTC timestamp of the last modification.
    owner : User
        Relationship to the User who owns this organization.
    """

    __tablename__ = "organizations"

    # Primary key — UUID4, server-generated (INSERT leaves this out).
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
        index=True,
    )

    description: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    industry: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    website: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    logo_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    # Foreign key to users.id — the user who created this organization.
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
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

    # Relationship to the owner user.
    owner: Mapped["User"] = relationship(
        "User",
        back_populates="organizations",
        lazy="select",
    )

    # Relationship to documents belonging to this organization.
    documents: Mapped[list["Document"]] = relationship(
        "Document",
        back_populates="organization",
        lazy="select",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Organization(id={self.id}, name={self.name!r})>"