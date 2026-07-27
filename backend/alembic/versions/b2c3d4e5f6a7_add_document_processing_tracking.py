"""add document processing tracking columns

Adds timestamp + error + Mongo linkage columns to ``documents`` so the
document processor orchestrator can record when processing started/ended
and what went wrong, and link the PostgreSQL document row back to the
legacy processed-document payload stored in MongoDB.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-27 00:45:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'documents',
        sa.Column('processing_started_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'documents',
        sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'documents',
        sa.Column('error_message', sa.String(length=2000), nullable=True),
    )
    op.add_column(
        'documents',
        sa.Column('mongo_document_id', sa.String(length=64), nullable=True),
    )
    op.create_index(
        op.f('ix_documents_mongo_document_id'),
        'documents',
        ['mongo_document_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_documents_mongo_document_id'), table_name='documents')
    op.drop_column('documents', 'mongo_document_id')
    op.drop_column('documents', 'error_message')
    op.drop_column('documents', 'processed_at')
    op.drop_column('documents', 'processing_started_at')
