"""
Add finding lifecycle columns and finding_comments table.

Revision ID: o2345p01q2r3
Revises: n1234o01p2q3
Create Date: 2026-08-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "o2345p01q2r3"
down_revision: Union[str, None] = "n1234o01p2q3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    finding_cols = [c["name"] for c in inspector.get_columns("report_findings")]

    if "lifecycle_status" not in finding_cols:
        op.add_column("report_findings", sa.Column("lifecycle_status", sa.String(50), nullable=False, server_default="OPEN", index=True))
    if "assigned_to" not in finding_cols:
        op.add_column("report_findings", sa.Column("assigned_to", sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True))
    if "resolution_note" not in finding_cols:
        op.add_column("report_findings", sa.Column("resolution_note", sa.Text(), nullable=True))
    if "reopen_reason" not in finding_cols:
        op.add_column("report_findings", sa.Column("reopen_reason", sa.Text(), nullable=True))
    if "updated_at" not in finding_cols:
        op.add_column("report_findings", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))

    tables = inspector.get_table_names()
    if "finding_comments" not in tables:
        op.create_table(
            "finding_comments",
            sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
            sa.Column("finding_id", sa.UUID(as_uuid=True), sa.ForeignKey("report_findings.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("user_id", sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )


def downgrade() -> None:
    op.drop_table("finding_comments")
    op.drop_column("report_findings", "updated_at")
    op.drop_column("report_findings", "reopen_reason")
    op.drop_column("report_findings", "resolution_note")
    op.drop_column("report_findings", "assigned_to")
    op.drop_column("report_findings", "lifecycle_status")
