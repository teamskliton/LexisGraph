"""
Finding Remediation and Remediation Evidence models for LexisGraph.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.compliance.models import ReportFinding
    from app.db.models.document import Document
    from app.db.models.organization import Organization
    from app.db.models.user import User


class FindingRemediation(Base):
    """
    Remediation entity tracking corrective action work for a compliance finding.
    """

    __tablename__ = "finding_remediations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    finding_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("report_findings.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="Remediation Plan",
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    due_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )

    priority: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="HIGH",
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="NOT_STARTED",
        index=True,
    )

    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

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

    verified_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    verification_note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    admin_approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    admin_approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    admin_note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Relationships
    finding: Mapped["ReportFinding"] = relationship(
        "ReportFinding",
        backref="remediation_record",
        lazy="select",
    )

    organization: Mapped["Organization"] = relationship(
        "Organization",
        lazy="select",
    )

    assignee: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[assigned_to],
        lazy="select",
    )

    creator: Mapped["User"] = relationship(
        "User",
        foreign_keys=[created_by],
        lazy="select",
    )

    verifier: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[verified_by],
        lazy="select",
    )

    admin_approver: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[admin_approved_by],
        lazy="select",
    )

    evidence_items: Mapped[List["RemediationEvidence"]] = relationship(
        "RemediationEvidence",
        back_populates="remediation",
        cascade="all, delete-orphan",
        order_by="RemediationEvidence.uploaded_at.desc()",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<FindingRemediation(id={self.id}, finding_id={self.finding_id}, status={self.status!r}, priority={self.priority!r})>"


class RemediationEvidence(Base):
    """
    Evidence file attached to a remediation record proving corrective action.
    """

    __tablename__ = "remediation_evidence"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    remediation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("finding_remediations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    finding_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("report_findings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    stored_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    file_path: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    file_size: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    mime_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    cycle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("remediation_cycles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    cycle_number: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        index=True,
    )

    document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    document_type: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    version: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    # Relationships
    remediation: Mapped["FindingRemediation"] = relationship(
        "FindingRemediation",
        back_populates="evidence_items",
        lazy="select",
    )

    cycle: Mapped[Optional["RemediationCycle"]] = relationship(
        "RemediationCycle",
        foreign_keys=[cycle_id],
        lazy="select",
    )

    document: Mapped[Optional["Document"]] = relationship(
        "Document",
        foreign_keys=[document_id],
        lazy="select",
    )

    uploader: Mapped["User"] = relationship(
        "User",
        foreign_keys=[uploaded_by],
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<RemediationEvidence(id={self.id}, filename={self.original_filename!r}, remediation_id={self.remediation_id})>"


class RemediationCycle(Base):
    """
    Historical remediation cycle representing an iteration of remediation submission,
    reviewer verification/rejection, and evidence snapshot.
    """

    __tablename__ = "remediation_cycles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    remediation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("finding_remediations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    finding_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("report_findings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    cycle_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="SUBMITTED",
        index=True,
    )

    submission_note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    submitted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    result: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    rejection_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    verification_note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    evidence_snapshot: Mapped[dict | None] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=True,
    )

    # Relationships
    remediation: Mapped["FindingRemediation"] = relationship(
        "FindingRemediation",
        lazy="select",
    )

    submitter: Mapped["User"] = relationship(
        "User",
        foreign_keys=[submitted_by],
        lazy="select",
    )

    reviewer: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[reviewed_by],
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<RemediationCycle(id={self.id}, remediation_id={self.remediation_id}, cycle={self.cycle_number}, status={self.status!r})>"
