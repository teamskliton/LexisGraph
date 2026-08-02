"""Add compliance_jobs table for asynchronous background job execution

Revision ID: j8901k01l2m3
Revises: i7890j01k2l3
Create Date: 2026-08-01 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'j8901k01l2m3'
down_revision: Union[str, Sequence[str], None] = 'i7890j01k2l3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        conn.execute(sa.text("""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'compliancejobstatus') THEN
                    CREATE TYPE compliancejobstatus AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
                END IF;
            END$$;
        """))

    inspector = sa.inspect(conn)
    if "compliance_jobs" not in inspector.get_table_names():
        op.create_table(
            'compliance_jobs',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('report_id', sa.UUID(), nullable=True),
            sa.Column('organization_id', sa.UUID(), nullable=False),
            sa.Column('regulation_id', sa.UUID(), nullable=False),
            sa.Column('policy_document_id', sa.UUID(), nullable=False),
            sa.Column('status', sa.String(length=50), nullable=False, server_default='QUEUED'),
            sa.Column('progress', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('current_step', sa.String(length=255), nullable=False, server_default='QUEUED'),
            sa.Column('created_by', sa.UUID(), nullable=False),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('processing_time_ms', sa.Float(), nullable=True),
            sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
            sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['policy_document_id'], ['documents.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['report_id'], ['compliance_reports.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id')
        )
    op.create_index(op.f('ix_compliance_jobs_created_at'), 'compliance_jobs', ['created_at'], unique=False)
    op.create_index(op.f('ix_compliance_jobs_created_by'), 'compliance_jobs', ['created_by'], unique=False)
    op.create_index(op.f('ix_compliance_jobs_organization_id'), 'compliance_jobs', ['organization_id'], unique=False)
    op.create_index(op.f('ix_compliance_jobs_policy_document_id'), 'compliance_jobs', ['policy_document_id'], unique=False)
    op.create_index(op.f('ix_compliance_jobs_regulation_id'), 'compliance_jobs', ['regulation_id'], unique=False)
    op.create_index(op.f('ix_compliance_jobs_report_id'), 'compliance_jobs', ['report_id'], unique=False)
    op.create_index(op.f('ix_compliance_jobs_status'), 'compliance_jobs', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_compliance_jobs_status'), table_name='compliance_jobs')
    op.drop_index(op.f('ix_compliance_jobs_report_id'), table_name='compliance_jobs')
    op.drop_index(op.f('ix_compliance_jobs_regulation_id'), table_name='compliance_jobs')
    op.drop_index(op.f('ix_compliance_jobs_policy_document_id'), table_name='compliance_jobs')
    op.drop_index(op.f('ix_compliance_jobs_organization_id'), table_name='compliance_jobs')
    op.drop_index(op.f('ix_compliance_jobs_created_by'), table_name='compliance_jobs')
    op.drop_index(op.f('ix_compliance_jobs_created_at'), table_name='compliance_jobs')
    op.drop_table('compliance_jobs')
    sa.Enum(name='compliancejobstatus').drop(op.get_bind(), checkfirst=True)
