"""
Add finding_remediations and remediation_evidence tables.

Revision ID: t7890u01v2w3
Revises: s6789t01u2v3
Create Date: 2026-08-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "t7890u01v2w3"
down_revision: Union[str, None] = "s6789t01u2v3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "finding_remediations" not in tables:
        op.create_table(
            "finding_remediations",
            sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
            sa.Column("finding_id", sa.UUID(as_uuid=True), sa.ForeignKey("report_findings.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
            sa.Column("organization_id", sa.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("title", sa.String(255), nullable=False, server_default="Remediation Plan"),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("assigned_to", sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("due_date", sa.DateTime(timezone=True), nullable=True, index=True),
            sa.Column("priority", sa.String(50), nullable=False, server_default="HIGH", index=True),
            sa.Column("status", sa.String(50), nullable=False, server_default="NOT_STARTED", index=True),
            sa.Column("created_by", sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), index=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("verified_by", sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("verification_note", sa.Text(), nullable=True),
            sa.Column("admin_approved_by", sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("admin_approved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("admin_note", sa.Text(), nullable=True),
        )

    if "remediation_evidence" not in tables:
        op.create_table(
            "remediation_evidence",
            sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
            sa.Column("remediation_id", sa.UUID(as_uuid=True), sa.ForeignKey("finding_remediations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("finding_id", sa.UUID(as_uuid=True), sa.ForeignKey("report_findings.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("organization_id", sa.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("original_filename", sa.String(255), nullable=False),
            sa.Column("stored_filename", sa.String(255), nullable=False),
            sa.Column("file_path", sa.String(500), nullable=False),
            sa.Column("file_size", sa.Integer(), nullable=False),
            sa.Column("mime_type", sa.String(100), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("uploaded_by", sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), index=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "remediation_evidence" in tables:
        op.drop_table("remediation_evidence")

    if "finding_remediations" in tables:
        op.drop_table("finding_remediations")
