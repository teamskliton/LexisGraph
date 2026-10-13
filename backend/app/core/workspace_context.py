"""
Centralized Workspace Context & Authorization Dependency.

Enforces strict tenant isolation across all workspace-scoped operations:
1. Resolves requested workspace ID from headers (`X-Workspace-Id`, `X-Organization-Id`),
   query parameters, or route parameters.
2. Validates server-side that the authenticated user holds an active membership
   (`OrganizationMember.status == ACTIVE`).
3. Encapsulates principal, workspace entity, membership record, and RBAC role.
4. Prevents cross-workspace data leakage and unauthorized privilege escalation.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.rbac_dependencies import ROLE_RANK, get_user_org_role
from app.db.models import Organization, User
from app.db.models.rbac import MemberStatus, OrganizationMember, UserRole
from app.db.session import get_db

logger = logging.getLogger(__name__)


@dataclass
class WorkspaceContext:
    """Authoritative workspace security context for the current request."""

    user: User
    organization: Organization
    organization_id: uuid.UUID
    member: Optional[OrganizationMember]
    role: UserRole

    def require_role(self, min_role: UserRole) -> None:
        """Enforce minimum role rank within this workspace."""
        if ROLE_RANK.get(self.role, 0) < ROLE_RANK.get(min_role, 0):
            logger.warning(
                "User %s (role %s) attempted action requiring %s in workspace %s",
                self.user.id,
                self.role,
                min_role,
                self.organization_id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires minimum role of {min_role.value}.",
            )

    def is_admin(self) -> bool:
        return ROLE_RANK.get(self.role, 0) >= ROLE_RANK[UserRole.ADMIN]

    def is_analyst_or_admin(self) -> bool:
        return ROLE_RANK.get(self.role, 0) >= ROLE_RANK[UserRole.COMPLIANCE_ANALYST]

    def is_reviewer_or_above(self) -> bool:
        return ROLE_RANK.get(self.role, 0) >= ROLE_RANK[UserRole.REVIEWER]


def resolve_raw_workspace_id(
    request: Request,
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-Id"),
    x_organization_id: Optional[str] = Header(None, alias="X-Organization-Id"),
    organization_id: Optional[uuid.UUID] = Query(None, description="Workspace / Organization UUID"),
) -> Optional[uuid.UUID]:
    """Extract raw workspace UUID candidate from headers, query, or path params."""
    # 1. Query parameter
    if organization_id:
        return organization_id

    # 2. Custom headers
    header_val = x_workspace_id or x_organization_id
    if header_val:
        try:
            return uuid.UUID(str(header_val).strip())
        except (ValueError, TypeError):
            pass

    # 3. Path parameter from request route
    path_params = request.path_params if hasattr(request, "path_params") else {}
    if "organization_id" in path_params:
        try:
            return uuid.UUID(str(path_params["organization_id"]).strip())
        except (ValueError, TypeError):
            pass

    return None


def verify_user_workspace_membership(
    db: Session,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> tuple[Organization, Optional[OrganizationMember], UserRole]:
    """
    Validates user has active membership in the organization.
    Raises HTTPException(404 or 403) on failure.
    """
    org = db.get(Organization, organization_id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found.",
        )

    # Check active membership
    member = db.execute(
        select(OrganizationMember).where(
            and_(
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.user_id == user_id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            )
        )
    ).scalar_one_or_none()

    # Check if creator without explicit member record
    if not member:
        # Check if user has an explicit INACTIVE membership
        inactive_member = db.execute(
            select(OrganizationMember).where(
                and_(
                    OrganizationMember.organization_id == organization_id,
                    OrganizationMember.user_id == user_id,
                    OrganizationMember.status == MemberStatus.INACTIVE,
                )
            )
        ).scalar_one_or_none()

        if inactive_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your membership in this workspace has been revoked or deactivated.",
            )

        if org.created_by == user_id:
            # Auto-repair membership record for creator
            member = OrganizationMember(
                organization_id=org.id,
                user_id=user_id,
                role=UserRole.ADMIN,
                status=MemberStatus.ACTIVE,
            )
            db.add(member)
            try:
                db.commit()
                db.refresh(member)
            except Exception:
                db.rollback()
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have active authorization to access this workspace.",
            )

    try:
        role = member.role if isinstance(member.role, UserRole) else UserRole(getattr(member, "role", "MEMBER"))
    except Exception:
        role = UserRole.MEMBER
    return org, member, role


def get_active_workspace_context(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-Id"),
    x_organization_id: Optional[str] = Header(None, alias="X-Organization-Id"),
    organization_id: Optional[uuid.UUID] = Query(None, description="Workspace / Organization UUID"),
) -> WorkspaceContext:
    """
    Mandatory Workspace Context Dependency.
    Extracts workspace ID and verifies user is an active member.
    """
    target_org_id = resolve_raw_workspace_id(
        request=request,
        x_workspace_id=x_workspace_id,
        x_organization_id=x_organization_id,
        organization_id=organization_id,
    )

    if not target_org_id:
        # If no workspace ID provided, resolve user's primary/active membership
        active_member = db.execute(
            select(OrganizationMember)
            .where(
                and_(
                    OrganizationMember.user_id == current_user.id,
                    OrganizationMember.status == MemberStatus.ACTIVE,
                )
            )
            .order_by(OrganizationMember.joined_at.desc())
        ).scalars().first()

        if active_member:
            target_org_id = active_member.organization_id
        else:
            # Fallback to created organization
            created_org = db.scalar(
                select(Organization).where(Organization.created_by == current_user.id)
            )
            if created_org:
                target_org_id = created_org.id

    if not target_org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace context specified and user does not belong to any workspace.",
        )

    org, member, role = verify_user_workspace_membership(
        db=db,
        user_id=current_user.id,
        organization_id=target_org_id,
    )

    return WorkspaceContext(
        user=current_user,
        organization=org,
        organization_id=target_org_id,
        member=member,
        role=role,
    )
