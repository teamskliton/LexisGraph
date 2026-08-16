"""
Add resolved_by and resolved_at to report_findings table.

Revision ID: u8901v01w2x3
Revises: t7890u01v2w3
Create Date: 2026-08-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "u8901v01w2x3"
down_revision: Union[str, None] = "t7890u01v2w3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col["name"] for col in inspector.get_columns("report_findings")]

    if "resolved_by" not in columns:
        op.add_column(
            "report_findings",
            sa.Column("resolved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        )
        op.create_index("ix_report_findings_resolved_by", "report_findings", ["resolved_by"])

    if "resolved_at" not in columns:
        op.add_column(
            "report_findings",
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_report_findings_resolved_at", "report_findings", ["resolved_at"])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col["name"] for col in inspector.get_columns("report_findings")]

    if "resolved_at" in columns:
        op.drop_index("ix_report_findings_resolved_at", table_name="report_findings")
        op.drop_column("report_findings", "resolved_at")

    if "resolved_by" in columns:
        op.drop_index("ix_report_findings_resolved_by", table_name="report_findings")
        op.drop_column("report_findings", "resolved_by")
