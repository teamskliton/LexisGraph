"""
Add reassessment tracking fields to report_findings.

Revision ID: w0123x01y2z3
Revises: v9012w01x2y3
Create Date: 2026-08-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "w0123x01y2z3"
down_revision: Union[str, None] = "v9012w01x2y3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "report_findings" in tables:
        rf_cols = [col["name"] for col in inspector.get_columns("report_findings")]

        if "reassessment_trigger" not in rf_cols:
            op.add_column(
                "report_findings",
                sa.Column("reassessment_trigger", sa.String(length=100), nullable=True),
            )

        if "reassessment_reason" not in rf_cols:
            op.add_column(
                "report_findings",
                sa.Column("reassessment_reason", sa.Text(), nullable=True),
            )

        if "reassessment_document_id" not in rf_cols:
            op.add_column(
                "report_findings",
                sa.Column("reassessment_document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
            )
            op.create_index("ix_report_findings_reassessment_document_id", "report_findings", ["reassessment_document_id"])

        if "reassessment_document_name" not in rf_cols:
            op.add_column(
                "report_findings",
                sa.Column("reassessment_document_name", sa.String(length=255), nullable=True),
            )

        if "reassessment_report_id" not in rf_cols:
            op.add_column(
                "report_findings",
                sa.Column("reassessment_report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("compliance_reports.id", ondelete="SET NULL"), nullable=True),
            )
            op.create_index("ix_report_findings_reassessment_report_id", "report_findings", ["reassessment_report_id"])

        if "reassessment_detected_at" not in rf_cols:
            op.add_column(
                "report_findings",
                sa.Column("reassessment_detected_at", sa.DateTime(timezone=True), nullable=True),
            )
            op.create_index("ix_report_findings_reassessment_detected_at", "report_findings", ["reassessment_detected_at"])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "report_findings" in tables:
        rf_cols = [col["name"] for col in inspector.get_columns("report_findings")]

        if "reassessment_detected_at" in rf_cols:
            op.drop_index("ix_report_findings_reassessment_detected_at", table_name="report_findings")
            op.drop_column("report_findings", "reassessment_detected_at")

        if "reassessment_report_id" in rf_cols:
            op.drop_index("ix_report_findings_reassessment_report_id", table_name="report_findings")
            op.drop_column("report_findings", "reassessment_report_id")

        if "reassessment_document_name" in rf_cols:
            op.drop_column("report_findings", "reassessment_document_name")

        if "reassessment_document_id" in rf_cols:
            op.drop_index("ix_report_findings_reassessment_document_id", table_name="report_findings")
            op.drop_column("report_findings", "reassessment_document_id")

        if "reassessment_reason" in rf_cols:
            op.drop_column("report_findings", "reassessment_reason")

        if "reassessment_trigger" in rf_cols:
            op.drop_column("report_findings", "reassessment_trigger")
