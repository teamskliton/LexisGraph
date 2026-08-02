"""
Add report_findings table and detailed reporting fields to compliance_reports table.

Revision ID: m0123n01o2p3
Revises: k9012l01m2n3
Create Date: 2026-08-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "m0123n01o2p3"
down_revision: Union[str, None] = "k9012l01m2n3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    report_cols = [c["name"] for c in inspector.get_columns("compliance_reports")]

    if "non_compliant_count" not in report_cols:
        op.add_column("compliance_reports", sa.Column("non_compliant_count", sa.Integer(), nullable=True, server_default="0"))
    if "not_applicable_count" not in report_cols:
        op.add_column("compliance_reports", sa.Column("not_applicable_count", sa.Integer(), nullable=True, server_default="0"))
    if "llm_model" not in report_cols:
        op.add_column("compliance_reports", sa.Column("llm_model", sa.String(100), nullable=True, server_default="gemini-1.5-pro"))
    if "retrieval_method" not in report_cols:
        op.add_column("compliance_reports", sa.Column("retrieval_method", sa.String(100), nullable=True, server_default="HYBRID_GRAPHRAG"))
    if "graph_version" not in report_cols:
        op.add_column("compliance_reports", sa.Column("graph_version", sa.String(50), nullable=True, server_default="v1.0"))
    if "embedding_version" not in report_cols:
        op.add_column("compliance_reports", sa.Column("embedding_version", sa.String(50), nullable=True, server_default="v1.0"))
    if "job_id" not in report_cols:
        op.add_column("compliance_reports", sa.Column("job_id", sa.UUID(as_uuid=True), sa.ForeignKey("compliance_jobs.id", ondelete="SET NULL"), nullable=True))

    tables = inspector.get_table_names()
    if "report_findings" not in tables:
        op.create_table(
            "report_findings",
            sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
            sa.Column("report_id", sa.UUID(as_uuid=True), sa.ForeignKey("compliance_reports.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("policy_clause_id", sa.String(255), nullable=True),
            sa.Column("regulation_clause_id", sa.String(255), nullable=True),
            sa.Column("status", sa.String(50), nullable=False, server_default="NON_COMPLIANT", index=True),
            sa.Column("confidence", sa.Float(), nullable=False, server_default="0.85"),
            sa.Column("severity", sa.String(50), nullable=False, server_default="MEDIUM", index=True),
            sa.Column("reasoning", sa.Text(), nullable=True),
            sa.Column("recommendation", sa.Text(), nullable=True),
            sa.Column("citation", sa.String(500), nullable=True),
            sa.Column("graph_path", postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )


def downgrade() -> None:
    op.drop_table("report_findings")
    op.drop_column("compliance_reports", "job_id")
    op.drop_column("compliance_reports", "embedding_version")
    op.drop_column("compliance_reports", "graph_version")
    op.drop_column("compliance_reports", "retrieval_method")
    op.drop_column("compliance_reports", "llm_model")
    op.drop_column("compliance_reports", "not_applicable_count")
    op.drop_column("compliance_reports", "non_compliant_count")
