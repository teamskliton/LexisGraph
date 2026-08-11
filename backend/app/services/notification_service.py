"""
Service helper for creating and managing in-app notifications.
"""
from __future__ import annotations

import logging
import uuid
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
    actor_id: Optional[uuid.UUID] = None,
) -> Optional[Notification]:
    """
    Creates an in-app notification entity safely in PostgreSQL.

    Guarantees:
    - Self-notifications are excluded (recipient_id != actor_id).
    - Errors during notification creation are logged without raising, preventing transaction rollback.
    """
    if actor_id and recipient_id == actor_id:
        return None

    try:
        notification = Notification(
            id=uuid.uuid4(),
            user_id=recipient_id,
            organization_id=organization_id,
            type=type.upper(),
            title=title,
            message=message,
            finding_id=finding_id,
            report_id=report_id,
            is_read=False,
        )
        db.add(notification)
        return notification
    except Exception as e:
        logger.error(f"Failed to create notification for user {recipient_id}: {e}", exc_info=True)
        return None
