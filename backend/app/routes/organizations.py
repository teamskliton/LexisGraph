from __future__ import annotations

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.schemas import (
    OrganizationCreate,
    OrganizationResponse,
    OrganizationUpdate,
)
from app.core.dependencies import get_current_user
from app.core.rbac_dependencies import get_user_org_role, ROLE_RANK
from app.db.models import Organization, User
from app.db.models.rbac import (
    AuditLog,
    MemberStatus,
    OrganizationInvitation,
    OrganizationMember,
    UserRole,
)
from app.db.session import get_db
from app.services import audit_service
from app.services.activity_service import log_activity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get(
    "",
    response_model=List[OrganizationResponse],
    summary="List user's organizations",
)
@router.get(
    "/",
    response_model=List[OrganizationResponse],
    summary="List user's organizations (alias)",
    include_in_schema=False,
)
def get_organizations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[Organization]:
    """
    Get all organizations owned by or linked to the authenticated user via membership.
    """
    from app.db.models.rbac import OrganizationMember, MemberStatus
    from sqlalchemy import or_, select

    # Get org IDs where user is an active member
    member_org_ids = db.scalars(
        select(OrganizationMember.organization_id).where(
            OrganizationMember.user_id == current_user.id,
            OrganizationMember.status == MemberStatus.ACTIVE,
        )
    ).all()

    orgs = db.query(Organization).filter(
        or_(
            Organization.created_by == current_user.id,
            Organization.id.in_(member_org_ids) if member_org_ids else False,
        )
    ).all()
    return orgs


@router.post(
    "/",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new organization",
)
def create_organization(
    data: OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Organization:
    """
    Create a new organization owned by the authenticated user.
    """
    org = Organization(
        name=data.name,
        description=data.description,
        industry=data.industry,
        website=data.website,
        logo_url=data.logo_url,
        created_by=current_user.id,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    
    logger.info("Organization created: id=%s by user=%s", org.id, current_user.id)
    
    log_activity(
        db,
        user_id=current_user.id,
        event_type="ORGANIZATION_CREATED",
        title="Created Organization",
        description=f"Added '{org.name}' to workspace",
        icon_type="building",
        extra_data={"organization_id": str(org.id)},
    )

    return org


@router.get(
    "/{organization_id}",
    response_model=OrganizationResponse,
    summary="Get an organization by ID",
)
def get_organization(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Organization:
    """
    Get a specific organization by its ID.
    User can access owned or member organizations.
    """
    from app.routes.reports import verify_user_organization_access
    if not verify_user_organization_access(db, current_user.id, organization_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found or you don't have access to it."
        )
    org = db.get(Organization, organization_id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found."
        )
    return org


@router.put(
    "/{organization_id}",
    response_model=OrganizationResponse,
    summary="Update an organization",
)
def update_organization(
    organization_id: uuid.UUID,
    data: OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Organization:
    """
    Update an existing organization.
    Only the owner or admin can update their organization.
    """
    from app.core.rbac_dependencies import is_org_admin
    from app.routes.reports import verify_user_organization_access

    org = db.get(Organization, organization_id)
    if not org or not verify_user_organization_access(db, current_user.id, organization_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found or you don't have access to it.",
        )

    if not is_org_admin(db, current_user.id, organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization admins can modify organization settings.",
        )

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(org, field, value)

    db.commit()
    db.refresh(org)

    logger.info("Organization updated: id=%s by user=%s", org.id, current_user.id)
    return org


@router.delete(
    "/{organization_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an organization",
)
def delete_organization(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete an organization.
    Only the owner or admin can delete their organization.
    """
    from app.core.rbac_dependencies import is_org_admin
    from app.routes.reports import verify_user_organization_access

    org = db.get(Organization, organization_id)
    if not org or not verify_user_organization_access(db, current_user.id, organization_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found or you don't have access to it.",
        )

    if not is_org_admin(db, current_user.id, organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization admins can delete an organization.",
        )

    db.delete(org)
    db.commit()
    logger.info("Organization deleted: id=%s by user=%s", organization_id, current_user.id)
    return None


# ---------------------------------------------------------------------------
# RBAC Member & Invitation Routes
# ---------------------------------------------------------------------------
from pydantic import BaseModel, EmailStr, Field
from app.db.models.rbac import OrganizationMember, OrganizationInvitation, AuditLog, UserRole, MemberStatus
from app.services import audit_service


class InviteUserRequest(BaseModel):
    email: Optional[EmailStr] = Field(None, description="Email address to invite (optional for shareable link)")
    role: UserRole = Field(UserRole.VIEWER, description="Assigned role")


class AcceptInviteRequest(BaseModel):
    token: str = Field(..., description="Invitation token string")


class UpdateMemberRoleRequest(BaseModel):
    role: UserRole = Field(..., description="New role to assign")


@router.get(
    "/invitations/token/{token}",
    summary="Get invitation details by token (Public endpoint)",
)
def get_invitation_by_token(
    token: str,
    db: Session = Depends(get_db),
):
    """Public endpoint to inspect an invitation token before accepting."""
    from datetime import datetime, timezone

    inv = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.token == token
    ).first()

    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid invitation token. This link may have already been used or does not exist.",
        )

    exp = inv.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    if exp < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation link has expired. Please ask the admin to send a new one.",
        )

    org = db.get(Organization, inv.organization_id)
    inviter = db.get(User, inv.invited_by)

    # Determine whether this invitation is email-bound or a shareable link
    is_email_bound = inv.email is not None and inv.email.strip() != ""

    return {
        "token": token,
        "organization_id": str(inv.organization_id),
        "organization_name": org.name if org else "Organization Workspace",
        "role": inv.role.value if hasattr(inv.role, "value") else str(inv.role),
        "email": inv.email,
        "is_email_bound": is_email_bound,
        "inviter_name": inviter.full_name if inviter else "Team Administrator",
        "expires_at": inv.expires_at,
        "is_valid": True,
    }


@router.get(
    "/{organization_id}/members",
    summary="List organization members",
)
def list_organization_members(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all active and pending members of an organization."""
    members = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == organization_id
    ).all()

    # Also include owner as ADMIN if not in members table
    org = db.get(Organization, organization_id)
    result = []
    seen_users = set()

    for m in members:
        seen_users.add(m.user_id)
        uname = m.user.username if m.user and m.user.username else (m.user.email.split("@")[0] if m.user and m.user.email else "user")
        result.append({
            "id": str(m.id),
            "user_id": str(m.user_id),
            "username": uname,
            "full_name": m.user.full_name if m.user else "User",
            "email": m.user.email if m.user else "",
            "role": m.role.value if hasattr(m.role, "value") else str(m.role),
            "status": m.status.value if hasattr(m.status, "value") else str(m.status),
            "joined_at": m.joined_at,
            "last_active": m.last_active or m.joined_at,
        })

    if org and org.created_by not in seen_users:
        owner = db.get(User, org.created_by)
        if owner:
            owner_uname = owner.username if owner.username else (owner.email.split("@")[0] if owner.email else "owner")
            result.insert(0, {
                "id": str(uuid.uuid4()),
                "user_id": str(owner.id),
                "username": owner_uname,
                "full_name": owner.full_name,
                "email": owner.email,
                "role": UserRole.ADMIN.value,
                "status": MemberStatus.ACTIVE.value,
                "joined_at": org.created_at,
                "last_active": owner.updated_at,
            })

    return result


@router.get(
    "/{organization_id}/invitations",
    summary="List pending organization invitations",
)
def list_organization_invitations(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all pending invitation tokens for an organization. Requires ADMIN role."""
    from datetime import datetime, timezone

    # ── Authorization: ADMIN only ──────────────────────────────────────────
    caller_role = get_user_org_role(db, current_user.id, organization_id)
    if ROLE_RANK.get(caller_role, 0) < ROLE_RANK[UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization admins can view invitation lists.",
        )

    invitations = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.organization_id == organization_id,
        OrganizationInvitation.expires_at > datetime.now(timezone.utc),
    ).all()

    return [
        {
            "id": str(inv.id),
            "organization_id": str(inv.organization_id),
            "email": inv.email,
            "role": inv.role.value if hasattr(inv.role, "value") else str(inv.role),
            "token": inv.token,
            "created_at": inv.created_at,
            "expires_at": inv.expires_at,
            "invited_by": str(inv.invited_by),
        }
        for inv in invitations
    ]


@router.delete(
    "/{organization_id}/invitations/{invitation_id}",
    summary="Cancel a pending organization invitation",
)
def cancel_organization_invitation(
    organization_id: uuid.UUID,
    invitation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancel and delete a pending invitation token. Requires ADMIN role."""
    # ── Authorization: ADMIN only ──────────────────────────────────────────
    caller_role = get_user_org_role(db, current_user.id, organization_id)
    if ROLE_RANK.get(caller_role, 0) < ROLE_RANK[UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization admins can cancel invitations.",
        )

    inv = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.id == invitation_id,
        OrganizationInvitation.organization_id == organization_id,
    ).first()

    if inv:
        db.delete(inv)
        db.commit()

    return {"message": "Invitation cancelled successfully"}



@router.post(
    "/{organization_id}/invitations",
    summary="Invite user to organization by email or shareable link",
)
def invite_user(
    organization_id: uuid.UUID,
    data: InviteUserRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate secure invitation token for inviting a user by email or via shareable link."""
    import secrets
    from datetime import datetime, timedelta, timezone

    # ── Authorization: ADMIN only ──────────────────────────────────────────
    caller_role = get_user_org_role(db, current_user.id, organization_id)
    if ROLE_RANK.get(caller_role, 0) < ROLE_RANK[UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization admins can create invitation links.",
        )

    org = db.get(Organization, organization_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")

    # ── Prevent privilege escalation via invitation ──────────────────────────
    # ADMIN cannot be assigned through an invitation link.
    # Admins are only created through normal signup + setup-role.
    INVITABLE_ROLES = {
        UserRole.COMPLIANCE_ANALYST,
        UserRole.LEGAL_ANALYST,
        UserRole.REVIEWER,
        UserRole.VIEWER,
        UserRole.EMPLOYEE,
        UserRole.MANAGER,
    }
    if data.role not in INVITABLE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Role '{data.role.value if hasattr(data.role, 'value') else data.role}' "
                "cannot be assigned via invitation. "
                "Admin accounts are created through the normal signup flow."
            ),
        )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    email_to_store = data.email.strip() if (data.email and str(data.email).strip()) else None

    invitation = OrganizationInvitation(
        id=uuid.uuid4(),
        organization_id=organization_id,
        email=email_to_store,
        role=data.role,
        token=token,
        expires_at=expires_at,
        invited_by=current_user.id,
    )
    db.add(invitation)
    db.commit()

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="USER_INVITED",
        organization_id=organization_id,
        entity="OrganizationInvitation",
        entity_id=str(invitation.id),
    )

    msg = f"Invitation created for {data.email}" if data.email else "Shareable invitation link generated"

    return {
        "message": msg,
        "token": token,
        "expires_at": expires_at,
        "invite_link": f"/invite/{token}",
    }


@router.post(
    "/invitations/accept",
    summary="Accept organization invitation token",
)
def accept_invitation(
    data: AcceptInviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Accept an invitation token and join organization with assigned role."""
    from datetime import datetime, timezone

    inv = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.token == data.token
    ).first()

    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid invitation token. This link may have already been used or does not exist.",
        )

    exp = inv.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    if exp < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation link has expired. Please ask the admin to send a new one.",
        )

    # ── Email-match enforcement ─────────────────────────────────────────────
    # If the invitation is email-bound, only the exact invited email can accept.
    is_email_bound = inv.email is not None and inv.email.strip() != ""
    if is_email_bound:
        if current_user.email.lower().strip() != inv.email.lower().strip():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"This invitation was sent to {inv.email}. "
                    "Please sign in with the invited email address to accept it."
                ),
            )

    org = db.get(Organization, inv.organization_id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The organization for this invitation no longer exists.",
        )

    # Capture values from invitation BEFORE any delete/commit
    # to avoid referencing a detached/deleted SQLAlchemy object in the audit log.
    invitation_org_id = inv.organization_id
    invitation_role = inv.role
    invitation_invited_by = inv.invited_by
    org_name = org.name

    # ── Idempotent membership creation ─────────────────────────────────────
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == invitation_org_id,
        OrganizationMember.user_id == current_user.id,
    ).first()

    effective_role = invitation_role
    if not member:
        member = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=invitation_org_id,
            user_id=current_user.id,
            role=invitation_role,
            status=MemberStatus.ACTIVE,
            invited_by=invitation_invited_by,
        )
        db.add(member)
    else:
        # Already a member — preserve existing ADMIN role if user is admin, otherwise update to invited role
        member.status = MemberStatus.ACTIVE
        ADMIN_ROLES = {UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ORGANIZATION_ADMIN}
        if member.role in ADMIN_ROLES:
            effective_role = member.role
        else:
            member.role = invitation_role
            effective_role = invitation_role

    # Capture member id before commit (needed for audit log)
    member_id_for_audit = member.id

    # Consume the invitation (delete it so it cannot be reused)
    db.delete(inv)

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("accept_invitation: DB commit failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to accept invitation. Please try again.",
        ) from exc

    # Audit log uses the captured local variables — NOT the deleted inv object
    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="INVITATION_ACCEPTED",
        organization_id=invitation_org_id,
        entity="OrganizationMember",
        entity_id=str(member_id_for_audit),
    )

    logger.info(
        "Invitation accepted: user=%s org=%s role=%s",
        current_user.id,
        invitation_org_id,
        invitation_role,
    )

    return {
        "message": "Invitation accepted successfully",
        "organization_id": str(invitation_org_id),
        "organization_name": org_name,
        "role": effective_role.value if hasattr(effective_role, "value") else str(effective_role),
    }


@router.put(
    "/{organization_id}/members/{user_id}/role",
    summary="Update organization member role",
)
def update_member_role(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    data: UpdateMemberRoleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update assigned role for an organization member. Requires ADMIN role."""
    # ── Authorization: ADMIN only ──────────────────────────────────────────
    caller_role = get_user_org_role(db, current_user.id, organization_id)
    if ROLE_RANK.get(caller_role, 0) < ROLE_RANK[UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization admins can change member roles.",
        )

    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == user_id,
    ).first()

    if not member:
        # Create member record if not exists
        member = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=organization_id,
            user_id=user_id,
            role=data.role,
            status=MemberStatus.ACTIVE,
            invited_by=current_user.id,
        )
        db.add(member)
    else:
        member.role = data.role

    db.commit()

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="ROLE_CHANGED",
        organization_id=organization_id,
        entity="User",
        entity_id=str(user_id),
    )

    return {"message": f"Updated role to {data.role.value}"}


@router.delete(
    "/{organization_id}/members/{user_id}",
    summary="Remove user from organization",
)
def remove_member(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove user from organization membership. Requires ADMIN role."""
    # ── Authorization: ADMIN only ──────────────────────────────────────────
    caller_role = get_user_org_role(db, current_user.id, organization_id)
    if ROLE_RANK.get(caller_role, 0) < ROLE_RANK[UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization admins can remove members.",
        )

    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == user_id,
    ).first()

    if member:
        db.delete(member)
        db.commit()

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="USER_REMOVED",
        organization_id=organization_id,
        entity="User",
        entity_id=str(user_id),
    )

    return {"message": "User removed from organization"}


@router.get(
    "/{organization_id}/audit-logs",
    summary="Get organization audit logs stream",
)
def get_organization_audit_logs(
    organization_id: uuid.UUID,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream recent security and operational audit logs for an organization."""
    logs = db.query(AuditLog).filter(
        AuditLog.organization_id == organization_id
    ).order_by(AuditLog.timestamp.desc()).limit(limit).all()

    return [
        {
            "id": str(l.id),
            "user_id": str(l.user_id),
            "user_name": l.user.full_name if l.user else "System",
            "action": l.action,
            "entity": l.entity,
            "entity_id": l.entity_id,
            "timestamp": l.timestamp,
        }
        for l in logs
    ]
