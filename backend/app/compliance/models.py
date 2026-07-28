"""
Compliance domain database models.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class ComplianceReportStatus(str, enum.Enum):
    """Compliance report processing status."""

    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ComplianceReport(Base):
    """
    Compliance report entity representing automated compliance checks
    between regulation and policy documents.
    """

    __tablename__ = "compliance_reports"

    # Primary key — UUID4, server-generated
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Foreign key to organizations.id
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Foreign key to documents.id (Regulation document)
    regulation_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Foreign key to documents.id (Policy document)
    policy_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Overall compliance score (0.0 to 100.0 or 0.0 to 1.0, null when pending)
    overall_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Status enum: PENDING, PROCESSING, COMPLETED, FAILED
    status: Mapped[ComplianceReportStatus] = mapped_column(
        SQLEnum(ComplianceReportStatus, name="compliancereportstatus"),
        nullable=False,
        default=ComplianceReportStatus.PENDING,
    )

    # Compliance summary narrative or detailed text
    summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Foreign key to users.id — creator of the report
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Timestamps
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

    # ORM Relationships
    organization: Mapped["Organization"] = relationship(
        "Organization",
        lazy="select",
    )

    regulation_document: Mapped["Document"] = relationship(
        "Document",
        foreign_keys=[regulation_document_id],
        lazy="select",
    )

    policy_document: Mapped["Document"] = relationship(
        "Document",
        foreign_keys=[policy_document_id],
        lazy="select",
    )

    creator: Mapped["User"] = relationship(
        "User",
        foreign_keys=[created_by],
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<ComplianceReport(id={self.id}, org={self.organization_id}, "
            f"status={self.status.value!r}, score={self.overall_score})>"
        )
