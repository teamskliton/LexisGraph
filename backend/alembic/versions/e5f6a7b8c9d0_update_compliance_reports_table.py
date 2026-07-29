"""update compliance_reports table fields

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-28 22:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('compliance_reports', sa.Column('total_clauses', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('compliance_reports', sa.Column('compliant_clauses', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('compliance_reports', sa.Column('partial_clauses', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('compliance_reports', sa.Column('non_compliant_clauses', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('compliance_reports', sa.Column('recommendations', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('compliance_reports', sa.Column('processing_time_seconds', sa.Float(), nullable=True))
    op.add_column('compliance_reports', sa.Column('version', sa.Integer(), nullable=False, server_default='1'))

    op.create_index(op.f('ix_compliance_reports_status'), 'compliance_reports', ['status'], unique=False)
    op.create_index(op.f('ix_compliance_reports_created_at'), 'compliance_reports', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_compliance_reports_created_at'), table_name='compliance_reports')
    op.drop_index(op.f('ix_compliance_reports_status'), table_name='compliance_reports')

    op.drop_column('compliance_reports', 'version')
    op.drop_column('compliance_reports', 'processing_time_seconds')
    op.drop_column('compliance_reports', 'recommendations')
    op.drop_column('compliance_reports', 'non_compliant_clauses')
    op.drop_column('compliance_reports', 'partial_clauses')
    op.drop_column('compliance_reports', 'compliant_clauses')
    op.drop_column('compliance_reports', 'total_clauses')
