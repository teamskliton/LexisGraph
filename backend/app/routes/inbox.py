"""
Action Inbox & Notification Preferences API routes.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.models import User, Organization
from app.db.models.inbox import InboxItem
from app.db.models.preference import NotificationPreference
from app.db.models.rbac import OrganizationMember, MemberStatus
from app.db.session import get_db
from app.schemas.inbox import (
    InboxItemResponse,
    InboxCountResponse,
    NotificationPreferenceResponse,
    NotificationPreferenceUpdateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/inbox", tags=["inbox"])


def _verify_org_access(db: Session, user: User, organization_id: uuid.UUID):
    org = db.get(Organization, organization_id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organization with ID '{organization_id}' not found.",
        )
    is_owner = org.created_by == user.id
    is_member = db.scalar(
        select(func.count(OrganizationMember.id)).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user.id,
            OrganizationMember.status == MemberStatus.ACTIVE,
        )
    ) > 0

    if not is_owner and not is_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this organization.",
        )


def _resolve_target_org(
    organization_id: Optional[uuid.UUID],
    x_workspace_id: Optional[str],
    x_organization_id: Optional[str],
) -> Optional[uuid.UUID]:
    target = organization_id
    if not target and (x_workspace_id or x_organization_id):
        raw_header = x_workspace_id or x_organization_id
        try:
            target = uuid.UUID(str(raw_header).strip())
        except (ValueError, TypeError):
            pass
    return target


@router.get(
    "",
    response_model=List[InboxItemResponse],
    summary="List Action Inbox tasks for current user",
)
def list_inbox_items(
    tab: str = Query("needs_action", description="Filter tab: needs_action, mentions, updates, done"),
    organization_id: Optional[uuid.UUID] = Query(None, description="Optional organization UUID filter"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-Id"),
    x_organization_id: Optional[str] = Header(None, alias="X-Organization-Id"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[InboxItemResponse]:
    """Retrieve actionable tasks requiring current user's attention in the workspace."""
    target_org_id = _resolve_target_org(organization_id, x_workspace_id, x_organization_id)

    query = select(InboxItem).where(InboxItem.recipient_user_id == current_user.id)

    if target_org_id:
        _verify_org_access(db, current_user, target_org_id)
        query = query.where(InboxItem.organization_id == target_org_id)

    tab_clean = (tab or "needs_action").lower().strip()
    if tab_clean == "needs_action":
        query = query.where(
            InboxItem.status == "PENDING",
            InboxItem.action_type != "MENTION_RESPONSE",
        )
    elif tab_clean == "mentions":
        query = query.where(
            InboxItem.action_type == "MENTION_RESPONSE",
            InboxItem.status == "PENDING",
        )
    elif tab_clean == "updates":
        query = query.where(
            InboxItem.action_type.in_(["STATUS_UPDATE", "REVIEW_APPROVED", "REVIEW_REJECTED", "SYSTEM_UPDATE"]),
            InboxItem.status == "PENDING",
        )
    elif tab_clean == "done":
        query = query.where(InboxItem.status.in_(["COMPLETED", "DISMISSED"]))

    query = query.order_by(InboxItem.created_at.desc()).offset(offset).limit(limit)
    items = db.execute(query).scalars().all()

    return [
        InboxItemResponse(
            id=str(i.id),
            organization_id=str(i.organization_id),
            recipient_user_id=str(i.recipient_user_id),
            entity_type=i.entity_type,
            entity_id=str(i.entity_id),
            action_type=i.action_type,
            priority=i.priority,
            status=i.status,
            title=i.title,
            description=i.description,
            is_read=i.is_read,
            due_at=i.due_at,
            created_at=i.created_at,
            completed_at=i.completed_at,
        )
        for i in items
    ]


@router.get(
    "/counts",
    response_model=InboxCountResponse,
    summary="Get Action Inbox counts by category",
)
def get_inbox_counts(
    organization_id: Optional[uuid.UUID] = Query(None),
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-Id"),
    x_organization_id: Optional[str] = Header(None, alias="X-Organization-Id"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InboxCountResponse:
    """Return counts of tasks needing action, mentions, updates, and total pending."""
    target_org_id = _resolve_target_org(organization_id, x_workspace_id, x_organization_id)

    base = select(InboxItem).where(
        InboxItem.recipient_user_id == current_user.id,
        InboxItem.status == "PENDING",
    )
    if target_org_id:
        _verify_org_access(db, current_user, target_org_id)
        base = base.where(InboxItem.organization_id == target_org_id)

    pending_items = db.execute(base).scalars().all()

    action_count = 0
    mentions_count = 0
    updates_count = 0

    for item in pending_items:
        if item.action_type == "MENTION_RESPONSE":
            mentions_count += 1
        elif item.action_type in ("STATUS_UPDATE", "REVIEW_APPROVED", "REVIEW_REJECTED", "SYSTEM_UPDATE"):
            updates_count += 1
        else:
            action_count += 1

    return InboxCountResponse(
        action_required_count=action_count,
        mentions_count=mentions_count,
        updates_count=updates_count,
        total_pending_count=len(pending_items),
    )


@router.patch(
    "/{item_id}/complete",
    response_model=InboxItemResponse,
    summary="Mark an action item as completed",
)
def complete_inbox_item(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InboxItemResponse:
    item = db.get(InboxItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inbox item not found.")
    if item.recipient_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this inbox item.")

    item.status = "COMPLETED"
    item.completed_at = datetime.now(timezone.utc)
    item.is_read = True
    db.commit()
    db.refresh(item)

    return InboxItemResponse(
        id=str(item.id),
        organization_id=str(item.organization_id),
        recipient_user_id=str(item.recipient_user_id),
        entity_type=item.entity_type,
        entity_id=str(item.entity_id),
        action_type=item.action_type,
        priority=item.priority,
        status=item.status,
        title=item.title,
        description=item.description,
        is_read=item.is_read,
        due_at=item.due_at,
        created_at=item.created_at,
        completed_at=item.completed_at,
    )


@router.patch(
    "/{item_id}/dismiss",
    response_model=InboxItemResponse,
    summary="Dismiss an action item",
)
def dismiss_inbox_item(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InboxItemResponse:
    item = db.get(InboxItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inbox item not found.")
    if item.recipient_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this inbox item.")

    item.status = "DISMISSED"
    item.completed_at = datetime.now(timezone.utc)
    item.is_read = True
    db.commit()
    db.refresh(item)

    return InboxItemResponse(
        id=str(item.id),
        organization_id=str(item.organization_id),
        recipient_user_id=str(item.recipient_user_id),
        entity_type=item.entity_type,
        entity_id=str(item.entity_id),
        action_type=item.action_type,
        priority=item.priority,
        status=item.status,
        title=item.title,
        description=item.description,
        is_read=item.is_read,
        due_at=item.due_at,
        created_at=item.created_at,
        completed_at=item.completed_at,
    )


@router.patch(
    "/{item_id}/read",
    response_model=InboxItemResponse,
    summary="Mark an action item as read without completing it",
)
def mark_inbox_item_read(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InboxItemResponse:
    item = db.get(InboxItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inbox item not found.")
    if item.recipient_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this inbox item.")

    item.is_read = True
    db.commit()
    db.refresh(item)

    return InboxItemResponse(
        id=str(item.id),
        organization_id=str(item.organization_id),
        recipient_user_id=str(item.recipient_user_id),
        entity_type=item.entity_type,
        entity_id=str(item.entity_id),
        action_type=item.action_type,
        priority=item.priority,
        status=item.status,
        title=item.title,
        description=item.description,
        is_read=item.is_read,
        due_at=item.due_at,
        created_at=item.created_at,
        completed_at=item.completed_at,
    )


# ── Preferences Endpoints ──────────────────────────────────────────────────

@router.get(
    "/preferences",
    response_model=NotificationPreferenceResponse,
    summary="Get user's notification preferences",
)
def get_preferences(
    organization_id: Optional[uuid.UUID] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationPreferenceResponse:
    query = select(NotificationPreference).where(
        NotificationPreference.user_id == current_user.id
    )
    if organization_id:
        query = query.where(
            or_(
                NotificationPreference.organization_id == organization_id,
                NotificationPreference.organization_id.is_(None),
            )
        )
    pref = db.execute(query).scalars().first()
    if not pref:
        return NotificationPreferenceResponse(
            user_id=str(current_user.id),
            organization_id=str(organization_id) if organization_id else None,
        )

    return NotificationPreferenceResponse(
        id=str(pref.id),
        user_id=str(pref.user_id),
        organization_id=str(pref.organization_id) if pref.organization_id else None,
        finding_assignments_in_app=pref.finding_assignments_in_app,
        finding_assignments_email=pref.finding_assignments_email,
        review_requests_in_app=pref.review_requests_in_app,
        review_requests_email=pref.review_requests_email,
        mentions_replies_in_app=pref.mentions_replies_in_app,
        mentions_replies_email=pref.mentions_replies_email,
        deadlines_in_app=pref.deadlines_in_app,
        deadlines_email=pref.deadlines_email,
        analysis_results_in_app=pref.analysis_results_in_app,
        analysis_results_email=pref.analysis_results_email,
        workspace_activity_in_app=pref.workspace_activity_in_app,
        workspace_activity_email=pref.workspace_activity_email,
    )


@router.put(
    "/preferences",
    response_model=NotificationPreferenceResponse,
    summary="Update user's notification preferences",
)
def update_preferences(
    data: NotificationPreferenceUpdateRequest,
    organization_id: Optional[uuid.UUID] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationPreferenceResponse:
    query = select(NotificationPreference).where(
        NotificationPreference.user_id == current_user.id
    )
    if organization_id:
        query = query.where(NotificationPreference.organization_id == organization_id)
    else:
        query = query.where(NotificationPreference.organization_id.is_(None))

    pref = db.execute(query).scalars().first()
    if not pref:
        pref = NotificationPreference(
            id=uuid.uuid4(),
            user_id=current_user.id,
            organization_id=organization_id,
        )
        db.add(pref)

    for field, val in data.model_dump(exclude_unset=True).items():
        if val is not None and hasattr(pref, field):
            setattr(pref, field, val)

    pref.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(pref)

    return NotificationPreferenceResponse(
        id=str(pref.id),
        user_id=str(pref.user_id),
        organization_id=str(pref.organization_id) if pref.organization_id else None,
        finding_assignments_in_app=pref.finding_assignments_in_app,
        finding_assignments_email=pref.finding_assignments_email,
        review_requests_in_app=pref.review_requests_in_app,
        review_requests_email=pref.review_requests_email,
        mentions_replies_in_app=pref.mentions_replies_in_app,
        mentions_replies_email=pref.mentions_replies_email,
        deadlines_in_app=pref.deadlines_in_app,
        deadlines_email=pref.deadlines_email,
        analysis_results_in_app=pref.analysis_results_in_app,
        analysis_results_email=pref.analysis_results_email,
        workspace_activity_in_app=pref.workspace_activity_in_app,
        workspace_activity_email=pref.workspace_activity_email,
    )
