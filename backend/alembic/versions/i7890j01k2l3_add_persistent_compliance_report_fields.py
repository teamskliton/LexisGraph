"""Add persistent compliance report fields (risk_level, executive_summary, total_matches, total_partial_matches, total_missing, processing_time_ms, report_json, is_deleted)

Revision ID: i7890j01k2l3
Revises: h6789i01j2k3
Create Date: 2026-07-31 23:59:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'i7890j01k2l3'
down_revision: Union[str, Sequence[str], None] = 'h6789i01j2k3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('compliance_reports', sa.Column('risk_level', sa.String(length=50), nullable=True))
    op.create_index(op.f('ix_compliance_reports_risk_level'), 'compliance_reports', ['risk_level'], unique=False)
    op.add_column('compliance_reports', sa.Column('executive_summary', sa.Text(), nullable=True))
    op.add_column('compliance_reports', sa.Column('total_matches', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('compliance_reports', sa.Column('total_partial_matches', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('compliance_reports', sa.Column('total_missing', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('compliance_reports', sa.Column('processing_time_ms', sa.Float(), nullable=True))
    op.add_column('compliance_reports', sa.Column('report_json', postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), 'sqlite'), nullable=True))
    op.add_column('compliance_reports', sa.Column('is_deleted', sa.Boolean(), server_default='false', nullable=False))
    op.create_index(op.f('ix_compliance_reports_is_deleted'), 'compliance_reports', ['is_deleted'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_compliance_reports_is_deleted'), table_name='compliance_reports')
    op.drop_column('compliance_reports', 'is_deleted')
    op.drop_column('compliance_reports', 'report_json')
    op.drop_column('compliance_reports', 'processing_time_ms')
    op.drop_column('compliance_reports', 'total_missing')
    op.drop_column('compliance_reports', 'total_partial_matches')
    op.drop_column('compliance_reports', 'total_matches')
    op.drop_column('compliance_reports', 'executive_summary')
    op.drop_index(op.f('ix_compliance_reports_risk_level'), table_name='compliance_reports')
    op.drop_column('compliance_reports', 'risk_level')
