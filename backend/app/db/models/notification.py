"""
Notification model for in-app compliance alerts.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Notification(Base):
    """
    In-App Notification entity stored in PostgreSQL.

    Attributes
    ----------
    id : UUID
        Primary key — server-generated UUID4.
    user_id : UUID
        Recipient user ID.
    organization_id : UUID
        Organization ID for multi-tenant isolation.
    type : str
        Controlled notification type (FINDING_ASSIGNED, FINDING_STATUS_CHANGED, FINDING_COMMENTED, FINDING_REOPENED).
    title : str
        Human-readable notification title.
    message : str
        Notification body message.
    is_read : bool
        Read/unread state.
    finding_id : UUID | None
        Associated finding ID.
    report_id : UUID | None
        Associated report ID.
    created_at : datetime
        UTC timestamp when notification occurred.
    """

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    message: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    is_read: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True,
    )

    finding_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("report_findings.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    report_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("compliance_reports.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    user: Mapped["User"] = relationship("User", lazy="select")
    organization: Mapped["Organization"] = relationship("Organization", lazy="select")

    def __repr__(self) -> str:
        return f"<Notification(id={self.id}, user_id={self.user_id}, type={self.type!r}, read={self.is_read})>"
