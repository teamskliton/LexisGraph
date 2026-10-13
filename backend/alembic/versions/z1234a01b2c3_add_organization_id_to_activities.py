"""
Add organization_id column to activities and backfill workspace memberships.

Revision ID: z1234a01b2c3
Revises: y1234z01a2b3
Create Date: 2026-10-13
"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "z1234a01b2c3"
down_revision: Union[str, None] = "y1234z01a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add organization_id column to activities table
    op.add_column(
        "activities",
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        op.f("ix_activities_organization_id"),
        "activities",
        ["organization_id"],
        unique=False,
    )

    # 2. Backfill organization_id in activities from extra_data if available
    try:
        op.execute(
            """
            UPDATE activities
            SET organization_id = CASE
                WHEN extra_data->>'organization_id' ~ '^[0-9a-fA-F-]{36}$'
                    THEN (extra_data->>'organization_id')::uuid
                WHEN extra_data->>'org_id' ~ '^[0-9a-fA-F-]{36}$'
                    THEN (extra_data->>'org_id')::uuid
                ELSE NULL
            END
            WHERE organization_id IS NULL AND extra_data IS NOT NULL;
            """
        )
    except Exception:
        pass

    # 3. Ensure all Organization creators have an explicit active ADMIN row in organization_members
    try:
        op.execute(
            """
            INSERT INTO organization_members (id, organization_id, user_id, role, status, joined_at)
            SELECT
                gen_random_uuid(),
                o.id,
                o.created_by,
                'ADMIN',
                'ACTIVE',
                NOW()
            FROM organizations o
            WHERE o.created_by IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM organization_members om
                  WHERE om.organization_id = o.id AND om.user_id = o.created_by
              );
            """
        )
    except Exception:
        pass


def downgrade() -> None:
    op.drop_index(op.f("ix_activities_organization_id"), table_name="activities")
    op.drop_column("activities", "organization_id")
