"""
RBAC & Multi-Tenancy Security Authorization Dependencies.
"""
from __future__ import annotations

import logging
import uuid
from typing import Callable, List, Optional

from fastapi import Depends, HTTPException, Query, status
from sqlalchemy import select, and_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.models import User, Organization
from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus
from app.db.session import get_db

logger = logging.getLogger(__name__)

ROLE_RANK = {
    UserRole.EMPLOYEE: 1,
    UserRole.MANAGER: 2,
    UserRole.ORGANIZATION_ADMIN: 3,
    UserRole.SUPER_ADMIN: 4,
}


def get_user_org_role(
    db: Session,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> UserRole:
    """Retrieve user's active role within an organization."""
    user = db.get(User, user_id)
    if user and user.is_superuser:
        return UserRole.SUPER_ADMIN

    org = db.get(Organization, organization_id)
    if org and org.created_by == user_id:
        return UserRole.ORGANIZATION_ADMIN

    member = db.execute(
        select(OrganizationMember).where(
            and_(
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.user_id == user_id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            )
        )
    ).scalar_one_or_none()

    if member:
        return member.role if isinstance(member.role, UserRole) else UserRole(member.role)

    # Fallback default role for org creator / existing user
    return UserRole.EMPLOYEE


def require_min_role(min_role: UserRole):
    """
    Dependency factory enforcing minimum required RBAC role.
    """
    def dependency(
        organization_id: uuid.UUID = Query(..., description="Target Organization ID context"),
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ) -> UserRole:
        user_role = get_user_org_role(db, current_user.id, organization_id)
        if ROLE_RANK.get(user_role, 1) < ROLE_RANK.get(min_role, 1):
            logger.warning(
                "Access denied for user %s (role %s, required %s) on org %s",
                current_user.id, user_role, min_role, organization_id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires minimum role of {min_role.value}.",
            )
        return user_role

    return dependency
