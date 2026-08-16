"""
Add cycle, document, and verification fields to remediation_evidence and finding_resolution_history.

Revision ID: x1234y01z2a3
Revises: w0123x01y2z3
Create Date: 2026-08-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "x1234y01z2a3"
down_revision: Union[str, None] = "w0123x01y2z3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    # 1. Update remediation_evidence table
    if "remediation_evidence" in tables:
        re_cols = [col["name"] for col in inspector.get_columns("remediation_evidence")]

        if "cycle_id" not in re_cols:
            op.add_column(
                "remediation_evidence",
                sa.Column("cycle_id", postgresql.UUID(as_uuid=True), nullable=True),
            )
            op.create_foreign_key(
                "fk_remediation_evidence_cycle_id",
                "remediation_evidence",
                "remediation_cycles",
                ["cycle_id"],
                ["id"],
                ondelete="SET NULL",
            )
            op.create_index(
                "ix_remediation_evidence_cycle_id",
                "remediation_evidence",
                ["cycle_id"],
            )

        if "cycle_number" not in re_cols:
            op.add_column(
                "remediation_evidence",
                sa.Column("cycle_number", sa.Integer(), nullable=True),
            )
            op.create_index(
                "ix_remediation_evidence_cycle_number",
                "remediation_evidence",
                ["cycle_number"],
            )

        if "document_id" not in re_cols:
            op.add_column(
                "remediation_evidence",
                sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=True),
            )
            op.create_foreign_key(
                "fk_remediation_evidence_document_id",
                "remediation_evidence",
                "documents",
                ["document_id"],
                ["id"],
                ondelete="SET NULL",
            )
            op.create_index(
                "ix_remediation_evidence_document_id",
                "remediation_evidence",
                ["document_id"],
            )

        if "document_type" not in re_cols:
            op.add_column(
                "remediation_evidence",
                sa.Column("document_type", sa.String(length=50), nullable=True),
            )

        if "version" not in re_cols:
            op.add_column(
                "remediation_evidence",
                sa.Column("version", sa.String(length=50), nullable=True),
            )

    # 2. Update finding_resolution_history table
    if "finding_resolution_history" in tables:
        frh_cols = [col["name"] for col in inspector.get_columns("finding_resolution_history")]

        if "approved_cycle_number" not in frh_cols:
            op.add_column(
                "finding_resolution_history",
                sa.Column("approved_cycle_number", sa.Integer(), nullable=True),
            )

        if "verified_by" not in frh_cols:
            op.add_column(
                "finding_resolution_history",
                sa.Column("verified_by", postgresql.UUID(as_uuid=True), nullable=True),
            )
            op.create_foreign_key(
                "fk_finding_resolution_history_verified_by",
                "finding_resolution_history",
                "users",
                ["verified_by"],
                ["id"],
                ondelete="SET NULL",
            )
            op.create_index(
                "ix_finding_resolution_history_verified_by",
                "finding_resolution_history",
                ["verified_by"],
            )

        if "verified_at" not in frh_cols:
            op.add_column(
                "finding_resolution_history",
                sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
            )

        if "verification_note" not in frh_cols:
            op.add_column(
                "finding_resolution_history",
                sa.Column("verification_note", sa.Text(), nullable=True),
            )

        if "evidence_snapshot" not in frh_cols:
            op.add_column(
                "finding_resolution_history",
                sa.Column("evidence_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "finding_resolution_history" in tables:
        frh_cols = [col["name"] for col in inspector.get_columns("finding_resolution_history")]
        if "evidence_snapshot" in frh_cols:
            op.drop_column("finding_resolution_history", "evidence_snapshot")
        if "verification_note" in frh_cols:
            op.drop_column("finding_resolution_history", "verification_note")
        if "verified_at" in frh_cols:
            op.drop_column("finding_resolution_history", "verified_at")
        if "verified_by" in frh_cols:
            op.drop_constraint("fk_finding_resolution_history_verified_by", "finding_resolution_history", type_="foreignkey")
            op.drop_index("ix_finding_resolution_history_verified_by", "finding_resolution_history")
            op.drop_column("finding_resolution_history", "verified_by")
        if "approved_cycle_number" in frh_cols:
            op.drop_column("finding_resolution_history", "approved_cycle_number")

    if "remediation_evidence" in tables:
        re_cols = [col["name"] for col in inspector.get_columns("remediation_evidence")]
        if "version" in re_cols:
            op.drop_column("remediation_evidence", "version")
        if "document_type" in re_cols:
            op.drop_column("remediation_evidence", "document_type")
        if "document_id" in re_cols:
            op.drop_constraint("fk_remediation_evidence_document_id", "remediation_evidence", type_="foreignkey")
            op.drop_index("ix_remediation_evidence_document_id", "remediation_evidence")
            op.drop_column("remediation_evidence", "document_id")
        if "cycle_number" in re_cols:
            op.drop_index("ix_remediation_evidence_cycle_number", "remediation_evidence")
            op.drop_column("remediation_evidence", "cycle_number")
        if "cycle_id" in re_cols:
            op.drop_constraint("fk_remediation_evidence_cycle_id", "remediation_evidence", type_="foreignkey")
            op.drop_index("ix_remediation_evidence_cycle_id", "remediation_evidence")
            op.drop_column("remediation_evidence", "cycle_id")
