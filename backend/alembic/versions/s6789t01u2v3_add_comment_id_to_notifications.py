"""
Add comment_id column to notifications table for discussion deep links.

Revision ID: s6789t01u2v3
Revises: r5678s01t2u3
Create Date: 2026-08-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "s6789t01u2v3"
down_revision: Union[str, None] = "r5678s01t2u3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "notifications" in tables:
        cols = [c["name"] for c in inspector.get_columns("notifications")]
        if "comment_id" not in cols:
            op.add_column(
                "notifications",
                sa.Column("comment_id", sa.UUID(as_uuid=True), sa.ForeignKey("finding_comments.id", ondelete="CASCADE"), nullable=True, index=True),
            )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "notifications" in tables:
        cols = [c["name"] for c in inspector.get_columns("notifications")]
        if "comment_id" in cols:
            op.drop_column("notifications", "comment_id")
