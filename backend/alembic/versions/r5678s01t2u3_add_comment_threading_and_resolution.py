"""
Add parent_id, is_resolved, resolved_by, and resolved_at columns to finding_comments table.

Revision ID: r5678s01t2u3
Revises: q4567r01s2t3
Create Date: 2026-08-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "r5678s01t2u3"
down_revision: Union[str, None] = "q4567r01s2t3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "finding_comments" in tables:
        comment_cols = [c["name"] for c in inspector.get_columns("finding_comments")]

        if "parent_id" not in comment_cols:
            op.add_column(
                "finding_comments",
                sa.Column("parent_id", sa.UUID(as_uuid=True), sa.ForeignKey("finding_comments.id", ondelete="CASCADE"), nullable=True, index=True),
            )
        if "is_resolved" not in comment_cols:
            op.add_column(
                "finding_comments",
                sa.Column("is_resolved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            )
        if "resolved_by" not in comment_cols:
            op.add_column(
                "finding_comments",
                sa.Column("resolved_by", sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
            )
        if "resolved_at" not in comment_cols:
            op.add_column(
                "finding_comments",
                sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
            )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "finding_comments" in tables:
        comment_cols = [c["name"] for c in inspector.get_columns("finding_comments")]
        if "resolved_at" in comment_cols:
            op.drop_column("finding_comments", "resolved_at")
        if "resolved_by" in comment_cols:
            op.drop_column("finding_comments", "resolved_by")
        if "is_resolved" in comment_cols:
            op.drop_column("finding_comments", "is_resolved")
        if "parent_id" in comment_cols:
            op.drop_column("finding_comments", "parent_id")
