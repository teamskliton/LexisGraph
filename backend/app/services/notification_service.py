"""
Service helper for creating and managing in-app notifications.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy.orm import Session
from app.db.models.notification import Notification

logger = logging.getLogger(__name__)


def create_notification(
    db: Session,
    recipient_id: uuid.UUID,
    organization_id: uuid.UUID,
    type: str,
    title: str,
    message: str,
    finding_id: Optional[uuid.UUID] = None,
    report_id: Optional[uuid.UUID] = None,
    comment_id: Optional[uuid.UUID] = None,
    actor_id: Optional[uuid.UUID] = None,
) -> Optional[Notification]:
    """
    Creates an in-app notification entity safely in PostgreSQL.

    Guarantees:
    - Self-notifications are excluded (recipient_id != actor_id).
    - Prevents rapid duplicate creation (idempotency guard within 3s).
    - Errors during notification creation are logged without raising, preventing transaction rollback.
    """
    if actor_id and recipient_id == actor_id:
        return None

    try:
        # Prevent rapid duplicate creation (e.g. double clicks, retry bursts)
        recent_cutoff = datetime.now(timezone.utc) - timedelta(seconds=3)
        existing = db.query(Notification).filter(
            Notification.user_id == recipient_id,
            Notification.organization_id == organization_id,
            Notification.type == type.upper(),
            Notification.finding_id == finding_id,
            Notification.created_at >= recent_cutoff,
        )
        if comment_id is not None:
            existing = existing.filter(Notification.comment_id == comment_id)

        if existing.first():
            logger.info("Duplicate notification suppressed for user %s, type %s", recipient_id, type)
            return None

        notification = Notification(
            id=uuid.uuid4(),
            user_id=recipient_id,
            organization_id=organization_id,
            type=type.upper(),
            title=title,
            message=message,
            finding_id=finding_id,
            report_id=report_id,
            comment_id=comment_id,
            created_at=datetime.now(timezone.utc),
            is_read=False,
        )
        db.add(notification)
        return notification
    except Exception as e:
        logger.error(f"Failed to create notification for user {recipient_id}: {e}", exc_info=True)
        return None


def notify_finding_stakeholders(
    db: Session,
    *,
    organization_id: uuid.UUID,
    finding_id: uuid.UUID,
    report_id: Optional[uuid.UUID],
    assignee_id: Optional[uuid.UUID],
    actor_id: uuid.UUID,
    event_type: str,
    title: str,
    message: str,
) -> list[Notification]:
    """
    Notifies relevant stakeholders (Assignee and Org Admins/Owner) about a finding event.
    Excludes the actor themselves.
    """
    from app.db.models.organization import Organization
    from app.db.models.rbac import OrganizationMember, MemberStatus, UserRole

    recipients: set[uuid.UUID] = set()

    # 1. Finding Assignee
    if assignee_id and assignee_id != actor_id:
        recipients.add(assignee_id)

    # 2. Org Owner/Creator
    org = db.get(Organization, organization_id)
    if org and org.created_by and org.created_by != actor_id:
        recipients.add(org.created_by)

    # 3. Org Admin Members
    try:
        admin_members = db.query(OrganizationMember.user_id).filter(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.status == MemberStatus.ACTIVE,
            OrganizationMember.role.in_([UserRole.ADMIN, UserRole.ORGANIZATION_ADMIN, UserRole.SUPER_ADMIN]),
        ).all()
        for (admin_uid,) in admin_members:
            if admin_uid != actor_id:
                recipients.add(admin_uid)
    except Exception as exc:
        logger.warning("Failed querying admin members for notification: %s", exc)

    created_notifications: list[Notification] = []
    for recipient_id in recipients:
        notif = create_notification(
            db=db,
            recipient_id=recipient_id,
            organization_id=organization_id,
            type=event_type,
            title=title,
            message=message,
            finding_id=finding_id,
            report_id=report_id,
            actor_id=actor_id,
        )
        if notif:
            created_notifications.append(notif)

    return created_notifications
