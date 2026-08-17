"""
Activity model for tracking user actions and system events.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Activity(Base):
    """
    User activity log entity stored in PostgreSQL.

    Attributes
    ----------
    id : UUID
        Primary key — server-generated UUID4.
    user_id : UUID
        Foreign key referencing the user who performed the action.
    event_type : str
        Type of event: ORGANIZATION_CREATED, POLICY_UPLOADED, REGULATION_UPLOADED,
        COMPLIANCE_STARTED, COMPLIANCE_COMPLETED, PDF_DOWNLOADED, AI_CHAT_STARTED.
    title : str
        Human-readable activity summary title.
    description : str
        Detailed description of the activity event.
    icon_type : str
        Icon identifier for frontend rendering (building, file, report, download, chat).
    extra_data : dict | None
        Optional metadata (e.g. org_id, document_id, report_id).
    created_at : datetime
        UTC timestamp when the activity occurred.
    """

    __tablename__ = "activities"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    event_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    icon_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="file",
    )

    extra_data: Mapped[dict | None] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    user: Mapped["User"] = relationship(
        "User",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<Activity(id={self.id}, user_id={self.user_id}, event={self.event_type!r})>"
