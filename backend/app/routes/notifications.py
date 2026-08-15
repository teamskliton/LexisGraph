"""
In-App Notifications & Compliance Alerts API routes.
"""
from __future__ import annotations

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.models import User, Organization
from app.db.models.notification import Notification
from app.db.models.rbac import OrganizationMember, MemberStatus
from app.db.session import get_db
from app.schemas.notification import NotificationResponse, UnreadCountResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])


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


@router.get(
    "",
    response_model=List[NotificationResponse],
    summary="List notifications for authenticated user",
)
def list_notifications(
    organization_id: Optional[uuid.UUID] = Query(None, description="Optional organization UUID filter"),
    unread_only: bool = Query(False, description="Filter unread notifications only"),
    limit: int = Query(30, ge=1, le=100, description="Page limit"),
    offset: int = Query(0, ge=0, description="Page offset"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[NotificationResponse]:
    """Retrieve notifications for the authenticated user."""
    query = select(Notification).where(Notification.user_id == current_user.id)

    if organization_id:
        _verify_org_access(db, current_user, organization_id)
        query = query.where(Notification.organization_id == organization_id)

    if unread_only:
        query = query.where(Notification.is_read == False)

    query = query.order_by(Notification.created_at.desc()).offset(offset).limit(limit)

    notifications = db.scalars(query).all()

    # Safe backfill for legacy notifications without finding_id
    from app.compliance.models import ReportFinding, ComplianceReport
    from sqlalchemy import cast, String
    import re

    for n in notifications:
        if not n.finding_id and n.type and n.type.startswith("FINDING_"):
            match = re.search(r"#([0-9a-fA-F\-]{8,36})", n.message or n.title)
            if match:
                prefix = match.group(1).lower()
                matching_finding = db.scalars(
                    select(ReportFinding.id)
                    .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
                    .where(
                        ComplianceReport.organization_id == n.organization_id,
                        cast(ReportFinding.id, String).ilike(f"{prefix}%"),
                    )
                    .limit(1)
                ).first()
                if matching_finding:
                    n.finding_id = matching_finding
                    try:
                        db.commit()
                    except Exception:
                        db.rollback()

    return [
        NotificationResponse(
            id=str(n.id),
            user_id=str(n.user_id),
            organization_id=str(n.organization_id),
            type=n.type,
            title=n.title,
            message=n.message,
            is_read=n.is_read,
            finding_id=str(n.finding_id) if n.finding_id else None,
            report_id=str(n.report_id) if n.report_id else None,
            comment_id=str(n.comment_id) if n.comment_id else None,
            created_at=n.created_at,
        )
        for n in notifications
    ]


@router.get(
    "/unread-count",
    response_model=UnreadCountResponse,
    summary="Get unread notification count",
)
def get_unread_count(
    organization_id: Optional[uuid.UUID] = Query(None, description="Optional organization UUID filter"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UnreadCountResponse:
    """Return count of unread notifications for authenticated user."""
    query = select(func.count(Notification.id)).where(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    )

    if organization_id:
        _verify_org_access(db, current_user, organization_id)
        query = query.where(Notification.organization_id == organization_id)

    count = db.scalar(query) or 0
    return UnreadCountResponse(unread_count=count)


@router.patch(
    "/{notification_id}/read",
    response_model=NotificationResponse,
    summary="Mark single notification as read",
)
def mark_notification_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationResponse:
    """Mark a notification as read."""
    notification = db.get(Notification, notification_id)
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )

    if notification.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage your own notifications.",
        )

    notification.is_read = True
    db.commit()
    db.refresh(notification)

    return NotificationResponse(
        id=str(notification.id),
        user_id=str(notification.user_id),
        organization_id=str(notification.organization_id),
        type=notification.type,
        title=notification.title,
        message=notification.message,
        is_read=notification.is_read,
        finding_id=str(notification.finding_id) if notification.finding_id else None,
        report_id=str(notification.report_id) if notification.report_id else None,
        comment_id=str(notification.comment_id) if notification.comment_id else None,
        created_at=notification.created_at,
    )


@router.patch(
    "/read-all",
    summary="Mark all unread notifications as read (PATCH)",
)
@router.post(
    "/read-all",
    summary="Mark all unread notifications as read (POST)",
)
@router.post(
    "/mark-all-read",
    summary="Mark all unread notifications as read (Alias)",
)
def mark_all_read(
    organization_id: Optional[uuid.UUID] = Query(None, description="Optional organization UUID filter"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark all unread notifications as read for current user."""
    query = select(Notification).where(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    )

    if organization_id:
        _verify_org_access(db, current_user, organization_id)
        query = query.where(Notification.organization_id == organization_id)

    unread_items = db.scalars(query).all()
    for item in unread_items:
        item.is_read = True

    db.commit()
    return {"message": f"Marked {len(unread_items)} notifications as read."}
