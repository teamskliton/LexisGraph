"""
Compliance domain database models.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, JSON, Enum as SQLEnum
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

    # Alias regulation_document_id to regulation_id for requirement compatibility
    regulation_document_id = synonym("regulation_id")

    # Risk level: LOW, MEDIUM, HIGH, CRITICAL
    risk_level: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        index=True,
    )

    # Executive Summary narrative text
    executive_summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Compliant, Partial, and Missing clause counts matching requirement field names
    total_matches: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=0,
    )

    total_partial_matches: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=0,
    )

    total_missing: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=0,
    )

    non_compliant_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=0,
    )

    not_applicable_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=0,
    )

    llm_model: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default="gemini-1.5-pro",
    )

    retrieval_method: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default="HYBRID_GRAPHRAG",
    )

    graph_version: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        default="v1.0",
    )

    embedding_version: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        default="v1.0",
    )

    job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("compliance_jobs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Execution timing in milliseconds
    processing_time_ms: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Complete structured report output stored as JSONB
    report_json: Mapped[dict | list | None] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=True,
    )

    # Soft delete flag
    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True,
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


class ComplianceJobStatus(str, enum.Enum):
    """Compliance background job processing status."""

    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class ComplianceJob(Base):
    """
    Compliance background job entity tracking async compliance audit execution.
    Persists progress (0-100), current_step, and job status in PostgreSQL.
    """

    __tablename__ = "compliance_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    report_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("compliance_reports.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    regulation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    regulation_document_id = synonym("regulation_id")

    policy_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status: Mapped[ComplianceJobStatus] = mapped_column(
        SQLEnum(ComplianceJobStatus, native_enum=False, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=ComplianceJobStatus.QUEUED,
        index=True,
    )

    progress: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    current_step: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="QUEUED",
    )

    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    processing_time_ms: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
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

    # Relationships
    report: Mapped["ComplianceReport"] = relationship(
        "ComplianceReport",
        foreign_keys=[report_id],
        lazy="select",
    )

    organization: Mapped["Organization"] = relationship(
        "Organization",
        foreign_keys=[organization_id],
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
            f"<ComplianceJob(id={self.id}, status={self.status.value!r}, "
            f"progress={self.progress}%, step={self.current_step!r})>"
        )


class ReportFinding(Base):
    """
    Detailed clause-level finding entity representing compliance evaluation
    matches between policy clauses and regulation clauses.
    """

    __tablename__ = "report_findings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("compliance_reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    policy_clause_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    regulation_clause_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="NON_COMPLIANT",
        index=True,
    )

    confidence: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.85,
    )

    severity: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="MEDIUM",
        index=True,
    )

    reasoning: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    recommendation: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    citation: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    graph_path: Mapped[dict | list | None] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=True,
    )

    lifecycle_status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="OPEN",
        index=True,
    )

    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    resolution_note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    reopen_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    remediation_due_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
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

    report: Mapped["ComplianceReport"] = relationship(
        "ComplianceReport",
        backref="findings_list",
        lazy="select",
    )

    assignee: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[assigned_to],
        lazy="select",
    )

    comments: Mapped[list["FindingComment"]] = relationship(
        "FindingComment",
        back_populates="finding",
        cascade="all, delete-orphan",
        order_by="FindingComment.created_at.asc()",
    )

    def __repr__(self) -> str:
        return f"<ReportFinding(id={self.id}, report_id={self.report_id}, status={self.status!r}, lifecycle={self.lifecycle_status!r})>"


class FindingComment(Base):
    """
    Comment entity attached to a compliance finding.
    """

    __tablename__ = "finding_comments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    finding_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("report_findings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("finding_comments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    is_resolved: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
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

    finding: Mapped["ReportFinding"] = relationship(
        "ReportFinding",
        back_populates="comments",
        lazy="select",
    )

    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
        lazy="select",
    )

    resolver: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[resolved_by],
        lazy="select",
    )

    parent: Mapped[Optional["FindingComment"]] = relationship(
        "FindingComment",
        remote_side=[id],
        back_populates="replies",
        foreign_keys=[parent_id],
        lazy="select",
    )

    replies: Mapped[list["FindingComment"]] = relationship(
        "FindingComment",
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="FindingComment.created_at.asc()",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<FindingComment(id={self.id}, finding_id={self.finding_id}, user_id={self.user_id}, resolved={self.is_resolved})>"

