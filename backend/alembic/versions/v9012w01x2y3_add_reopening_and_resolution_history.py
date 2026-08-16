"""
Add reopened_by, reopened_at to report_findings, and create finding_resolution_history table.

Revision ID: v9012w01x2y3
Revises: u8901v01w2x3
Create Date: 2026-08-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "v9012w01x2y3"
down_revision: Union[str, None] = "u8901v01w2x3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    # 1. Update report_findings table
    if "report_findings" in tables:
        rf_cols = [col["name"] for col in inspector.get_columns("report_findings")]

        if "reopened_by" not in rf_cols:
            op.add_column(
                "report_findings",
                sa.Column("reopened_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            )
            op.create_index("ix_report_findings_reopened_by", "report_findings", ["reopened_by"])

        if "reopened_at" not in rf_cols:
            op.add_column(
                "report_findings",
                sa.Column("reopened_at", sa.DateTime(timezone=True), nullable=True),
            )
            op.create_index("ix_report_findings_reopened_at", "report_findings", ["reopened_at"])

    # 2. Create finding_resolution_history table
    if "finding_resolution_history" not in tables:
        op.create_table(
            "finding_resolution_history",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("finding_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("report_findings.id", ondelete="CASCADE"), nullable=False),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("resolution_number", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("resolved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("resolution_note", sa.Text(), nullable=True),
            sa.Column("reopened_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("reopened_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("reopen_reason", sa.Text(), nullable=True),
            sa.Column("status", sa.String(length=50), nullable=False, server_default="RESOLVED"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_finding_resolution_history_finding_id", "finding_resolution_history", ["finding_id"])
        op.create_index("ix_finding_resolution_history_organization_id", "finding_resolution_history", ["organization_id"])
        op.create_index("ix_finding_resolution_history_status", "finding_resolution_history", ["status"])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "finding_resolution_history" in tables:
        op.drop_index("ix_finding_resolution_history_status", table_name="finding_resolution_history")
        op.drop_index("ix_finding_resolution_history_organization_id", table_name="finding_resolution_history")
        op.drop_index("ix_finding_resolution_history_finding_id", table_name="finding_resolution_history")
        op.drop_table("finding_resolution_history")

    if "report_findings" in tables:
        rf_cols = [col["name"] for col in inspector.get_columns("report_findings")]

        if "reopened_at" in rf_cols:
            op.drop_index("ix_report_findings_reopened_at", table_name="report_findings")
            op.drop_column("report_findings", "reopened_at")

        if "reopened_by" in rf_cols:
            op.drop_index("ix_report_findings_reopened_by", table_name="report_findings")
            op.drop_column("report_findings", "reopened_by")
