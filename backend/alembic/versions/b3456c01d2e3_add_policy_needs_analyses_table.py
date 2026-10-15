"""
Add policy_needs_analyses table for Policy Formation stage 3.

Revision ID: b3456c01d2e3
Revises: a2345b01c2d3
Create Date: 2026-10-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "b3456c01d2e3"
down_revision: Union[str, None] = "a2345b01c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "policy_needs_analyses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "assessment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organization_assessments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(30), nullable=False, server_default="COMPLETED"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("summary", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("regulatory_discoveries", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("policy_needs", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("coverage_findings", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("user_decisions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_index(
        op.f("ix_policy_needs_analyses_organization_id"),
        "policy_needs_analyses",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_policy_needs_analyses_assessment_id"),
        "policy_needs_analyses",
        ["assessment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_policy_needs_analyses_created_by"),
        "policy_needs_analyses",
        ["created_by"],
        unique=False,
    )
    op.create_index(
        op.f("ix_policy_needs_analyses_status"),
        "policy_needs_analyses",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_policy_needs_analyses_status"), table_name="policy_needs_analyses")
    op.drop_index(op.f("ix_policy_needs_analyses_created_by"), table_name="policy_needs_analyses")
    op.drop_index(op.f("ix_policy_needs_analyses_assessment_id"), table_name="policy_needs_analyses")
    op.drop_index(op.f("ix_policy_needs_analyses_organization_id"), table_name="policy_needs_analyses")
    op.drop_table("policy_needs_analyses")
