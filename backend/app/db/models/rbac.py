"""
RBAC, Multi-Tenancy, Invitations, and Audit Logs models.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, Boolean, Enum as SQLEnum, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class UserRole(str, enum.Enum):
    """Role-Based Access Control hierarchy."""

    ADMIN = "ADMIN"
    LEGAL_ANALYST = "LEGAL_ANALYST"
    REVIEWER = "REVIEWER"
    VIEWER = "VIEWER"

    # Legacy & Alias Compatibility
    SUPER_ADMIN = "SUPER_ADMIN"
    ORGANIZATION_ADMIN = "ORGANIZATION_ADMIN"
    MANAGER = "MANAGER"
    EMPLOYEE = "EMPLOYEE"



class MemberStatus(str, enum.Enum):
    """Organization membership state."""

    ACTIVE = "ACTIVE"
    PENDING = "PENDING"
    INACTIVE = "INACTIVE"


class OrganizationMember(Base):
    """
    Junction entity mapping Users to Organizations with assigned RBAC Roles.
    Supports users belonging to multiple organizations.
    """

    __tablename__ = "organization_members"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_org_user_membership"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, native_enum=False, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=UserRole.EMPLOYEE,
        index=True,
    )

    status: Mapped[MemberStatus] = mapped_column(
        SQLEnum(MemberStatus, native_enum=False, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=MemberStatus.ACTIVE,
        index=True,
    )

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    last_active: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    organization: Mapped["Organization"] = relationship("Organization", lazy="select")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], lazy="select")
    inviter: Mapped["User"] = relationship("User", foreign_keys=[invited_by], lazy="select")

    def __repr__(self) -> str:
        return f"<OrganizationMember(org={self.organization_id}, user={self.user_id}, role={self.role.value!r})>"


class OrganizationInvitation(Base):
    """
    Organization email invitation token entity.
    Allows admins to invite users by email with a auto-expiring secure token.
    """

    __tablename__ = "organization_invitations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    email: Mapped[str | None] = mapped_column(
        String(320),
        nullable=True,
        index=True,
    )

    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, native_enum=False, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=UserRole.EMPLOYEE,
    )

    token: Mapped[str] = mapped_column(
        String(128),
        unique=True,
        nullable=False,
        index=True,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    invited_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    organization: Mapped["Organization"] = relationship("Organization", lazy="select")
    inviter: Mapped["User"] = relationship("User", lazy="select")

    def __repr__(self) -> str:
        return f"<OrganizationInvitation(org={self.organization_id}, email={self.email!r}, token={self.token[:8]}...)>"


class AuditLog(Base):
    """
    Security and action audit log entity.
    Captures sensitive organizational operations, user management changes, and compliance events.
    """

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    action: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    entity: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    entity_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    ip_address: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    user_agent: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    organization: Mapped["Organization"] = relationship("Organization", lazy="select")
    user: Mapped["User"] = relationship("User", lazy="select")

    def __repr__(self) -> str:
        return f"<AuditLog(action={self.action!r}, user={self.user_id}, org={self.organization_id})>"
