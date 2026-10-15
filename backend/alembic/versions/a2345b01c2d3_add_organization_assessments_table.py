"""
Add organization_assessments table for Policy Formation stage 2.

Revision ID: a2345b01c2d3
Revises: z1234a01b2c3
Create Date: 2026-10-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "a2345b01c2d3"
down_revision: Union[str, None] = "z1234a01b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organization_assessments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(255), nullable=False, server_default="Organization Policy Assessment"),
        sa.Column("scope_type", sa.String(50), nullable=False, server_default="ORGANIZATION"),
        sa.Column("status", sa.String(30), nullable=False, server_default="DRAFT"),
        sa.Column("current_step", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("answers", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_index(
        op.f("ix_organization_assessments_organization_id"),
        "organization_assessments",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_organization_assessments_created_by"),
        "organization_assessments",
        ["created_by"],
        unique=False,
    )
    op.create_index(
        op.f("ix_organization_assessments_status"),
        "organization_assessments",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_organization_assessments_scope_type"),
        "organization_assessments",
        ["scope_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_organization_assessments_scope_type"), table_name="organization_assessments")
    op.drop_index(op.f("ix_organization_assessments_status"), table_name="organization_assessments")
    op.drop_index(op.f("ix_organization_assessments_created_by"), table_name="organization_assessments")
    op.drop_index(op.f("ix_organization_assessments_organization_id"), table_name="organization_assessments")
    op.drop_table("organization_assessments")
