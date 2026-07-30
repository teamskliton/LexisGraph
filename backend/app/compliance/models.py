"""
Compliance domain database models.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, JSON, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym

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
    between regulation and policy documents in PostgreSQL.
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

    # Foreign key to regulations.id (Global Regulation)
    regulation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("regulations.id", ondelete="CASCADE"),
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

    # Document SHA-256 Checksums for compliance report caching
    policy_hash: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )

    regulation_hash: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )

    # Overall compliance score (0.0 to 100.0 or 0.0 to 1.0, null when pending)
    overall_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Clause metrics summary
    total_clauses: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=0,
    )

    compliant_clauses: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=0,
    )

    partial_clauses: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=0,
    )

    non_compliant_clauses: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=0,
    )

    # Status enum: PENDING, PROCESSING, COMPLETED, FAILED
    status: Mapped[ComplianceReportStatus] = mapped_column(
        SQLEnum(ComplianceReportStatus, name="compliancereportstatus"),
        nullable=False,
        default=ComplianceReportStatus.PENDING,
        index=True,
    )

    # Alias report_status to status for requirement compatibility
    report_status = synonym("status")

    # Compliance summary narrative or detailed text
    summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Recommendations stored as PostgreSQL JSONB (with SQLite JSON variant for unit tests)
    recommendations: Mapped[dict | list | None] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=True,
    )

    # Performance / execution timing metric
    processing_time_seconds: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Schema version for future report versioning compatibility
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
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
        index=True,
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
        back_populates="compliance_reports",
        lazy="select",
    )

    regulation: Mapped["Regulation"] = relationship(
        "Regulation",
        foreign_keys=[regulation_id],
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
