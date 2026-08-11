"""
Add remediation_due_date column to report_findings table.

Revision ID: q4567r01s2t3
Revises: p3456q01r2s3
Create Date: 2026-08-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "q4567r01s2t3"
down_revision: Union[str, None] = "p3456q01r2s3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    finding_cols = [c["name"] for c in inspector.get_columns("report_findings")]

    if "remediation_due_date" not in finding_cols:
        op.add_column(
            "report_findings",
            sa.Column("remediation_due_date", sa.DateTime(timezone=True), nullable=True, index=True),
        )


def downgrade() -> None:
    op.drop_column("report_findings", "remediation_due_date")
