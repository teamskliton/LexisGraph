"""add compliance_reports table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-28 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'compliance_reports',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('regulation_document_id', sa.UUID(), nullable=False),
        sa.Column('policy_document_id', sa.UUID(), nullable=False),
        sa.Column('overall_score', sa.Float(), nullable=True),
        sa.Column(
            'status',
            sa.Enum('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', name='compliancereportstatus'),
            nullable=False,
            server_default='PENDING',
        ),


        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['regulation_document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['policy_document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_index(op.f('ix_compliance_reports_organization_id'), 'compliance_reports', ['organization_id'], unique=False)
    op.create_index(op.f('ix_compliance_reports_regulation_document_id'), 'compliance_reports', ['regulation_document_id'], unique=False)
    op.create_index(op.f('ix_compliance_reports_policy_document_id'), 'compliance_reports', ['policy_document_id'], unique=False)
    op.create_index(op.f('ix_compliance_reports_created_by'), 'compliance_reports', ['created_by'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_compliance_reports_created_by'), table_name='compliance_reports')
    op.drop_index(op.f('ix_compliance_reports_policy_document_id'), table_name='compliance_reports')
    op.drop_index(op.f('ix_compliance_reports_regulation_document_id'), table_name='compliance_reports')
    op.drop_index(op.f('ix_compliance_reports_organization_id'), table_name='compliance_reports')
    op.drop_table('compliance_reports')

    bind = op.get_bind()
    compliance_status_enum = postgresql.ENUM(
        'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED',
        name='compliancereportstatus',
    )
    compliance_status_enum.drop(bind, checkfirst=True)
