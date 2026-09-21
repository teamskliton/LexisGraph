"""
Add applicability classification fields to report_findings.

These columns extend the ReportFinding table to store the output of the new
Applicability Classification Layer — whether each regulatory requirement was
determined to be APPLICABLE, NOT_APPLICABLE, or UNCERTAIN to the policy being
audited, along with the classifier's reasoning, confidence score, and the
structured requirement metadata (topic, actor, action, object, obligation type).

All columns are nullable so existing findings remain fully intact.

Revision ID: y1234z01a2b3
Revises: x1234y01z2a3
Create Date: 2026-09-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "y1234z01a2b3"
down_revision: Union[str, None] = "x1234y01z2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Applicability classification columns ─────────────────────────────────
    op.add_column(
        "report_findings",
        sa.Column(
            "applicability_status",
            sa.String(30),
            nullable=True,
            comment="APPLICABLE | NOT_APPLICABLE | UNCERTAIN",
        ),
    )
    op.add_column(
        "report_findings",
        sa.Column(
            "applicability_reason",
            sa.Text(),
            nullable=True,
            comment="Human-readable explanation of the applicability classification.",
        ),
    )
    op.add_column(
        "report_findings",
        sa.Column(
            "applicability_confidence",
            sa.Float(),
            nullable=True,
            comment="Classifier confidence score 0.0–1.0.",
        ),
    )
    # ── Structured requirement metadata columns ───────────────────────────────
    op.add_column(
        "report_findings",
        sa.Column(
            "requirement_topic",
            sa.String(255),
            nullable=True,
            comment="Semantic topic bucket e.g. Data Retention, Consent, Board Administration.",
        ),
    )
    op.add_column(
        "report_findings",
        sa.Column(
            "requirement_actor",
            sa.String(255),
            nullable=True,
            comment="Who must act e.g. Data Fiduciary, Central Government.",
        ),
    )
    op.add_column(
        "report_findings",
        sa.Column(
            "requirement_action",
            sa.String(255),
            nullable=True,
            comment="Verb phrase e.g. Erase, Notify, Appoint.",
        ),
    )
    op.add_column(
        "report_findings",
        sa.Column(
            "requirement_object",
            sa.String(255),
            nullable=True,
            comment="What is acted upon e.g. Personal Data, Board Members.",
        ),
    )
    op.add_column(
        "report_findings",
        sa.Column(
            "obligation_type",
            sa.String(50),
            nullable=True,
            comment="MANDATORY | CONDITIONAL | ADMINISTRATIVE | PROCEDURAL | INFORMATIONAL",
        ),
    )

    # Index on applicability_status for fast dashboard filtering
    op.create_index(
        "ix_report_findings_applicability_status",
        "report_findings",
        ["applicability_status"],
    )


def downgrade() -> None:
    op.drop_index("ix_report_findings_applicability_status", table_name="report_findings")
    op.drop_column("report_findings", "obligation_type")
    op.drop_column("report_findings", "requirement_object")
    op.drop_column("report_findings", "requirement_action")
    op.drop_column("report_findings", "requirement_actor")
    op.drop_column("report_findings", "requirement_topic")
    op.drop_column("report_findings", "applicability_confidence")
    op.drop_column("report_findings", "applicability_reason")
    op.drop_column("report_findings", "applicability_status")
