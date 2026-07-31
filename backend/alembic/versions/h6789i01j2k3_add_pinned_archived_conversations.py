"""Add is_pinned, is_archived to conversation_sessions and metadata_json to conversation_messages

Revision ID: h6789i01j2k3
Revises: g5678h90i1j2
Create Date: 2026-07-31 16:55:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'h6789i01j2k3'
down_revision: Union[str, Sequence[str], None] = 'g5678h90i1j2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('conversation_sessions', sa.Column('is_pinned', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('conversation_sessions', sa.Column('is_archived', sa.Boolean(), server_default='false', nullable=False))
    op.alter_column('conversation_sessions', 'organization_id', existing_type=sa.UUID(), nullable=True)

    op.add_column('conversation_messages', sa.Column('metadata_json', postgresql.JSON(astext_type=sa.Text()).with_variant(sa.JSON(), 'sqlite'), nullable=True))


def downgrade() -> None:
    op.drop_column('conversation_messages', 'metadata_json')
    op.alter_column('conversation_sessions', 'organization_id', existing_type=sa.UUID(), nullable=False)
    op.drop_column('conversation_sessions', 'is_archived')
    op.drop_column('conversation_sessions', 'is_pinned')
