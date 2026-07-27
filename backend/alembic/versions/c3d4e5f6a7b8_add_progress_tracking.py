"""add progress tracking columns to documents

Adds ``progress`` (integer 0-100) and ``current_step`` (varchar 150)
columns to the ``documents`` table so the processing status endpoint can
report fine-grained pipeline progress persisted to PostgreSQL.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-27 17:20:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # progress: 0-100 percentage; NOT NULL, default 0 so existing rows get 0.
    op.add_column(
        'documents',
        sa.Column(
            'progress',
            sa.Integer(),
            nullable=False,
            server_default='0',
        ),
    )
    # current_step: human-readable label for the active pipeline stage.
    # Nullable — null until processing begins.
    op.add_column(
        'documents',
        sa.Column('current_step', sa.String(length=150), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('documents', 'current_step')
    op.drop_column('documents', 'progress')
