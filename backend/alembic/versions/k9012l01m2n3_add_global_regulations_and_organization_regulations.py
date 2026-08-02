"""
Add OrganizationRegulations junction table, act_year, issuing_authority fields to regulations table.

Revision ID: k9012l01m2n3
Revises: j8901k01l2m3
Create Date: 2026-08-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "k9012l01m2n3"
down_revision: Union[str, None] = "j8901k01l2m3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add act_year and issuing_authority columns to regulations table if not exists
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    reg_columns = [col["name"] for col in inspector.get_columns("regulations")]

    if "act_year" not in reg_columns:
        op.add_column("regulations", sa.Column("act_year", sa.Integer(), nullable=True))
    if "issuing_authority" not in reg_columns:
        op.add_column("regulations", sa.Column("issuing_authority", sa.String(length=255), nullable=True))

    # 2. Create organization_regulations junction table if not exists
    tables = inspector.get_table_names()
    if "organization_regulations" not in tables:
        op.create_table(
            "organization_regulations",
            sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
            sa.Column("organization_id", sa.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("regulation_id", sa.UUID(as_uuid=True), sa.ForeignKey("regulations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.UniqueConstraint("organization_id", "regulation_id", name="uq_org_regulation_link"),
        )


def downgrade() -> None:
    op.drop_table("organization_regulations")
    op.drop_column("regulations", "issuing_authority")
    op.drop_column("regulations", "act_year")
