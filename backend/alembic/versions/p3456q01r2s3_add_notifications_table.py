"""
Add notifications table for in-app compliance alerts.

Revision ID: p3456q01r2s3
Revises: o2345p01q2r3
Create Date: 2026-08-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "p3456q01r2s3"
down_revision: Union[str, None] = "o2345p01q2r3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "notifications" not in tables:
        op.create_table(
            "notifications",
            sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("organization_id", sa.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("type", sa.String(50), nullable=False, index=True),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("message", sa.String(500), nullable=False),
            sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false", index=True),
            sa.Column("finding_id", sa.UUID(as_uuid=True), sa.ForeignKey("report_findings.id", ondelete="CASCADE"), nullable=True, index=True),
            sa.Column("report_id", sa.UUID(as_uuid=True), sa.ForeignKey("compliance_reports.id", ondelete="CASCADE"), nullable=True, index=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"), index=True),
        )


def downgrade() -> None:
    op.drop_table("notifications")
