"""
Make assessment_id and analysis_id nullable in policy_drafts table.

Enables direct individual policy creation without requiring a full
Organization Assessment or Policy Needs Analysis.

Revision ID: aa123b01c2d3
Revises: e6789f01a2b3
Create Date: 2026-10-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "aa123b01c2d3"
down_revision: Union[str, None] = "e6789f01a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make assessment_id, analysis_id, and analysis_version nullable for direct drafts
    op.alter_column(
        "policy_drafts",
        "assessment_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    op.alter_column(
        "policy_drafts",
        "analysis_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    op.alter_column(
        "policy_drafts",
        "analysis_version",
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    # Safely clean up any standalone drafts that have null assessment/analysis before enforcing NOT NULL
    op.execute(
        "DELETE FROM policy_drafts WHERE assessment_id IS NULL OR analysis_id IS NULL"
    )
    op.alter_column(
        "policy_drafts",
        "analysis_version",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.alter_column(
        "policy_drafts",
        "analysis_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
    op.alter_column(
        "policy_drafts",
        "assessment_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
