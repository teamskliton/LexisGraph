from __future__ import annotations

import logging
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.schemas import (
    OrganizationCreate,
    OrganizationResponse,
    OrganizationUpdate,
)
from app.core.dependencies import get_current_user
from app.db.models import Organization, User
from app.db.session import get_db
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
    User can only access their own organizations.
    """
    org = db.query(Organization).filter(
        Organization.id == organization_id,
        Organization.created_by == current_user.id
    ).first()
    
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found or you don't have access to it."
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
    Only the owner can update their organization.
    """
    org = db.query(Organization).filter(
        Organization.id == organization_id,
        Organization.created_by == current_user.id
    ).first()
    
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found or you don't have access to it."
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
    Only the owner can delete their organization.
    """
    org = db.query(Organization).filter(
        Organization.id == organization_id,
        Organization.created_by == current_user.id
    ).first()
    
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found or you don't have access to it."
        )
        
    logger.info("Organization deleted: id=%s by user=%s", organization_id, current_user.id)
    return None


# ---------------------------------------------------------------------------
# RBAC Member & Invitation Routes
# ---------------------------------------------------------------------------
from pydantic import BaseModel, EmailStr, Field
from app.db.models.rbac import OrganizationMember, OrganizationInvitation, AuditLog, UserRole, MemberStatus
from app.services import audit_service


class InviteUserRequest(BaseModel):
    email: EmailStr = Field(..., description="Email address to invite")
    role: UserRole = Field(UserRole.EMPLOYEE, description="Assigned role")


class AcceptInviteRequest(BaseModel):
    token: str = Field(..., description="Invitation token string")


class UpdateMemberRoleRequest(BaseModel):
    role: UserRole = Field(..., description="New role to assign")


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

    # Also include owner as ORGANIZATION_ADMIN if not in members table
    org = db.get(Organization, organization_id)
    result = []
    seen_users = set()

    for m in members:
        seen_users.add(m.user_id)
        result.append({
            "id": str(m.id),
            "user_id": str(m.user_id),
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
            result.insert(0, {
                "id": str(uuid.uuid4()),
                "user_id": str(owner.id),
                "full_name": owner.full_name,
                "email": owner.email,
                "role": UserRole.ORGANIZATION_ADMIN.value,
                "status": MemberStatus.ACTIVE.value,
                "joined_at": org.created_at,
                "last_active": owner.updated_at,
            })

    return result


@router.post(
    "/{organization_id}/invitations",
    summary="Invite user to organization by email",
)
def invite_user(
    organization_id: uuid.UUID,
    data: InviteUserRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate secure invitation token for inviting a user by email."""
    import secrets
    from datetime import datetime, timedelta, timezone

    org = db.get(Organization, organization_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    invitation = OrganizationInvitation(
        id=uuid.uuid4(),
        organization_id=organization_id,
        email=data.email,
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

    return {
        "message": f"Invitation sent to {data.email}",
        "token": token,
        "expires_at": expires_at,
        "invite_link": f"/dashboard/invitations?token={token}",
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invitation token.")

    exp = inv.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation token has expired.")

    # Check if membership exists
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == inv.organization_id,
        OrganizationMember.user_id == current_user.id,
    ).first()

    if not member:
        member = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=inv.organization_id,
            user_id=current_user.id,
            role=inv.role,
            status=MemberStatus.ACTIVE,
            invited_by=inv.invited_by,
        )
        db.add(member)
    else:
        member.status = MemberStatus.ACTIVE
        member.role = inv.role

    db.delete(inv)
    db.commit()

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="INVITATION_ACCEPTED",
        organization_id=inv.organization_id,
        entity="OrganizationMember",
        entity_id=str(member.id),
    )

    return {"message": "Invitation accepted successfully", "organization_id": str(inv.organization_id)}


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
    """Update assigned role for an organization member."""
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
    """Remove user from organization membership."""
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
