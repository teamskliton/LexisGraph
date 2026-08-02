"""
Add organization_members, organization_invitations, and audit_logs tables for RBAC and multi-tenancy.

Revision ID: n1234o01p2q3
Revises: m0123n01o2p3
Create Date: 2026-08-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "n1234o01p2q3"
down_revision: Union[str, None] = "m0123n01o2p3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "organization_members" not in tables:
        op.create_table(
            "organization_members",
            sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
            sa.Column("organization_id", sa.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("user_id", sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("role", sa.String(50), nullable=False, server_default="EMPLOYEE", index=True),
            sa.Column("status", sa.String(50), nullable=False, server_default="ACTIVE", index=True),
            sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("last_active", sa.DateTime(timezone=True), nullable=True),
            sa.Column("invited_by", sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.UniqueConstraint("organization_id", "user_id", name="uq_org_user_membership"),
        )

    if "organization_invitations" not in tables:
        op.create_table(
            "organization_invitations",
            sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
            sa.Column("organization_id", sa.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("email", sa.String(320), nullable=False, index=True),
            sa.Column("role", sa.String(50), nullable=False, server_default="EMPLOYEE"),
            sa.Column("token", sa.String(128), nullable=False, unique=True, index=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("invited_by", sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )

    if "audit_logs" not in tables:
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
            sa.Column("organization_id", sa.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("user_id", sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("action", sa.String(100), nullable=False, index=True),
            sa.Column("entity", sa.String(100), nullable=True),
            sa.Column("entity_id", sa.String(255), nullable=True),
            sa.Column("ip_address", sa.String(100), nullable=True),
            sa.Column("user_agent", sa.String(255), nullable=True),
            sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"), index=True),
        )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("organization_invitations")
    op.drop_table("organization_members")
