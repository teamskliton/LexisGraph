"""
Organization Assessment model for Policy Formation.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class OrganizationAssessment(Base):
    """
    Organization Policy Formation Assessment session.

    Stores structured circumspect data (profile, jurisdictions, business activities,
    scope, and existing governance commitments) collected during the Stage 2 wizard.
    Strictly tenant-isolated by organization_id.
    """

    __tablename__ = "organization_assessments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="Organization Policy Assessment",
    )

    scope_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="ORGANIZATION",  # ORGANIZATION, BRANCH, DEPARTMENT, OTHER
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="DRAFT",  # DRAFT, COMPLETED, ABANDONED
        index=True,
    )

    current_step: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )

    answers: Mapped[Dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=dict,
    )

    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )

    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    organization = relationship("Organization", backref="policy_assessments")
    creator = relationship("User", backref="created_policy_assessments")
    analyses = relationship(
        "PolicyNeedsAnalysis",
        back_populates="assessment",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class PolicyNeedsAnalysis(Base):
    """
    Persisted Regulatory Discovery & Policy Needs Analysis.

    Links to a completed OrganizationAssessment and contains:
    - Evidence-backed regulatory discoveries.
    - Proposed policy needs with drivers, priority, owner role, and review frequency.
    - Existing policy coverage & gap analysis.
    - Human review decisions, notes, and priority overrides.
    Strictly tenant-isolated by organization_id.
    """

    __tablename__ = "policy_needs_analyses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organization_assessments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="COMPLETED",  # PENDING, RUNNING, COMPLETED, FAILED, NEEDS_REVIEW
        index=True,
    )

    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )

    summary: Mapped[Dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=dict,
    )

    regulatory_discoveries: Mapped[List[Dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
    )

    policy_needs: Mapped[List[Dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
    )

    coverage_findings: Mapped[List[Dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
    )

    user_decisions: Mapped[Dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=dict,
    )

    history: Mapped[List[Dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
    )

    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    assessment = relationship("OrganizationAssessment", back_populates="analyses")
    organization = relationship("Organization", backref="policy_analyses")
    creator = relationship("User", backref="created_policy_analyses")


class PolicyDraft(Base):
    """
    Persisted Stage 4 Policy Draft.

    Maintains editable, structured policy drafts generated from accepted
    Stage 3 policy needs. Completely isolated from the production Policies repository.
    Includes section-level content, metadata, grounded citations, warnings,
    and archival version history.
    """

    __tablename__ = "policy_drafts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    assessment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organization_assessments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    analysis_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("policy_needs_analyses.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    analysis_version: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        default=1,
    )

    need_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="DRAFTING",  # DRAFTING, DRAFT_SAVED, NEEDS_VERIFICATION, READY_FOR_REVIEW
        index=True,
    )

    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )

    # Document metadata (owner_role, scope, review_cadence, effective_date=null, etc.)
    metadata_properties: Mapped[Dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=dict,
    )

    # Structured sections: list of {section_id, section_number, heading, content, rationale, source_clauses, is_customized, last_regenerated_at}
    sections: Mapped[List[Dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
    )

    # Grounded statutory and workspace evidence references
    source_references: Mapped[List[Dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
    )

    # Unresolved questions, assumptions, and human verification notes
    unresolved_questions: Mapped[List[str]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
    )

    # Generation telemetry (provider, model, prompt_version, timestamp, sections_generated)
    generation_metadata: Mapped[Dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=dict,
    )

    # Prior version snapshots for diffing and rollback
    history: Mapped[List[Dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
    )

    # Stage 5 Approval & Publishing Lifecycle Fields
    assigned_reviewer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    approved_version: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )

    content_hash: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
    )

    review_comments: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    rejection_reason: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    published_policy_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    published_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    effective_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Immutable approval history trail
    approval_history: Mapped[List[Dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    organization = relationship("Organization", backref="policy_drafts")
    assessment = relationship("OrganizationAssessment", backref="policy_drafts")
    analysis = relationship("PolicyNeedsAnalysis", backref="policy_drafts")
    creator = relationship("User", foreign_keys=[created_by], backref="created_policy_drafts")
    assigned_reviewer = relationship("User", foreign_keys=[assigned_reviewer_id], backref="assigned_policy_reviews")
    approver = relationship("User", foreign_keys=[approved_by], backref="approved_policy_drafts")
    published_policy = relationship("Document", foreign_keys=[published_policy_id], backref="source_policy_draft")


class PolicyApprovalAudit(Base):
    """
    Immutable audit trail for policy approval, revision, and publishing events.
    Captures exact draft version, actor, action, comments, and cryptographic content hash.
    """

    __tablename__ = "policy_approval_audits"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    draft_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("policy_drafts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    policy_document_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    draft_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    actor_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    action: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    previous_status: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )

    new_status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    comments: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    content_hash: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
    )

    metadata_snapshot: Mapped[Dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=dict,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    organization = relationship("Organization", lazy="select")
    draft = relationship("PolicyDraft", lazy="select")
    actor = relationship("User", lazy="select")

