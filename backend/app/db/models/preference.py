"""
Notification preferences model for user notification settings.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class NotificationPreference(Base):
    """
    User notification preferences entity stored in PostgreSQL.
    """

    __tablename__ = "notification_preferences"

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

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    finding_assignments_in_app: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    finding_assignments_email: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    review_requests_in_app: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    review_requests_email: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    mentions_replies_in_app: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    mentions_replies_email: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    deadlines_in_app: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deadlines_email: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    analysis_results_in_app: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    analysis_results_email: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    workspace_activity_in_app: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    workspace_activity_email: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", lazy="select")
    organization: Mapped["Organization"] = relationship("Organization", lazy="select")

    def __repr__(self) -> str:
        return f"<NotificationPreference(user_id={self.user_id}, org_id={self.organization_id})>"
