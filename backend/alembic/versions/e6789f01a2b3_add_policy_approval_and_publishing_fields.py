"""
Add policy approval, audit, and publishing fields for Stage 5.

Revision ID: e6789f01a2b3
Revises: d5678e01f2a3
Create Date: 2026-10-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "e6789f01a2b3"
down_revision: Union[str, None] = "d5678e01f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add approval and publishing fields to policy_drafts
    op.add_column(
        "policy_drafts",
        sa.Column(
            "assigned_reviewer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_policy_drafts_assigned_reviewer_id",
        "policy_drafts",
        ["assigned_reviewer_id"],
    )

    op.add_column(
        "policy_drafts",
        sa.Column(
            "approved_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_policy_drafts_approved_by",
        "policy_drafts",
        ["approved_by"],
    )

    op.add_column("policy_drafts", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("policy_drafts", sa.Column("approved_version", sa.Integer(), nullable=True))
    op.add_column("policy_drafts", sa.Column("content_hash", sa.String(length=64), nullable=True))
    op.add_column("policy_drafts", sa.Column("review_comments", sa.Text(), nullable=True))
    op.add_column("policy_drafts", sa.Column("rejection_reason", sa.Text(), nullable=True))

    op.add_column(
        "policy_drafts",
        sa.Column(
            "published_policy_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_policy_drafts_published_policy_id",
        "policy_drafts",
        ["published_policy_id"],
    )

    op.add_column("policy_drafts", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("policy_drafts", sa.Column("effective_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "policy_drafts",
        sa.Column(
            "approval_history",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

    # 2. Create policy_approval_audits table
    op.create_table(
        "policy_approval_audits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "draft_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("policy_drafts.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "policy_document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("draft_version", sa.Integer(), nullable=False),
        sa.Column(
            "actor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("actor_name", sa.String(length=255), nullable=False),
        sa.Column("action", sa.String(length=100), nullable=False, index=True),
        sa.Column("previous_status", sa.String(length=50), nullable=True),
        sa.Column("new_status", sa.String(length=50), nullable=False),
        sa.Column("comments", sa.Text(), nullable=True),
        sa.Column("content_hash", sa.String(length=64), nullable=True),
        sa.Column(
            "metadata_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            index=True,
        ),
    )

    # 3. Add optional policy lifecycle columns to documents table
    op.add_column("documents", sa.Column("policy_identifier", sa.String(length=100), nullable=True))
    op.create_index("ix_documents_policy_identifier", "documents", ["policy_identifier"])
    op.add_column("documents", sa.Column("effective_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("documents", sa.Column("review_cadence", sa.String(length=50), nullable=True))
    op.add_column("documents", sa.Column("next_review_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "documents",
        sa.Column(
            "source_draft_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("policy_drafts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_documents_source_draft_id", "documents", ["source_draft_id"])
    op.add_column(
        "documents",
        sa.Column("lifecycle_status", sa.String(length=50), nullable=True, server_default="ACTIVE"),
    )


def downgrade() -> None:
    # 3. Drop columns from documents
    op.drop_index("ix_documents_source_draft_id", table_name="documents")
    op.drop_index("ix_documents_policy_identifier", table_name="documents")
    op.drop_column("documents", "lifecycle_status")
    op.drop_column("documents", "source_draft_id")
    op.drop_column("documents", "next_review_date")
    op.drop_column("documents", "review_cadence")
    op.drop_column("documents", "effective_date")
    op.drop_column("documents", "policy_identifier")

    # 2. Drop policy_approval_audits table
    op.drop_table("policy_approval_audits")

    # 1. Drop columns from policy_drafts
    op.drop_index("ix_policy_drafts_published_policy_id", table_name="policy_drafts")
    op.drop_index("ix_policy_drafts_approved_by", table_name="policy_drafts")
    op.drop_index("ix_policy_drafts_assigned_reviewer_id", table_name="policy_drafts")
    op.drop_column("policy_drafts", "approval_history")
    op.drop_column("policy_drafts", "effective_date")
    op.drop_column("policy_drafts", "published_at")
    op.drop_column("policy_drafts", "published_policy_id")
    op.drop_column("policy_drafts", "rejection_reason")
    op.drop_column("policy_drafts", "review_comments")
    op.drop_column("policy_drafts", "content_hash")
    op.drop_column("policy_drafts", "approved_version")
    op.drop_column("policy_drafts", "approved_at")
    op.drop_column("policy_drafts", "approved_by")
    op.drop_column("policy_drafts", "assigned_reviewer_id")
