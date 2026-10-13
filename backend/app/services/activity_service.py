"""
Activity logging and retrieval service.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.activity import Activity

logger = logging.getLogger(__name__)


def log_activity(
    db: Session,
    *,
    user_id: uuid.UUID,
    event_type: str,
    title: str,
    description: str,
    icon_type: str = "file",
    organization_id: Optional[uuid.UUID] = None,
    extra_data: Optional[Dict[str, Any]] = None,
) -> Optional[Activity]:
    """
    Persists a new user activity event into PostgreSQL with workspace scoping.

    Errors during activity logging are caught and logged so primary business
    operations are never blocked.
    """
    try:
        resolved_org_id = organization_id
        if not resolved_org_id and extra_data:
            raw_org = extra_data.get("organization_id") or extra_data.get("org_id")
            if raw_org:
                try:
                    resolved_org_id = uuid.UUID(str(raw_org))
                except (ValueError, TypeError):
                    pass

        activity = Activity(
            user_id=user_id,
            organization_id=resolved_org_id,
            event_type=event_type,
            title=title,
            description=description,
            icon_type=icon_type,
            extra_data=extra_data,
        )
        db.add(activity)
        db.commit()
        db.refresh(activity)
        logger.info(
            "Logged activity: event=%s user_id=%s org_id=%s id=%s",
            event_type,
            user_id,
            resolved_org_id,
            activity.id,
        )
        return activity
    except Exception:  # noqa: BLE001
        logger.exception(
            "Failed to log activity: event=%s user_id=%s",
            event_type,
            user_id,
        )
        db.rollback()
        return None


def get_user_activities(
    db: Session,
    user_id: uuid.UUID,
    limit: int = 20,
) -> List[Activity]:
    """
    Fetches activities for the specified user, ordered newest first (created_at DESC).
    Max `limit` records returned (default 20).
    """
    stmt = (
        select(Activity)
        .where(Activity.user_id == user_id)
        .order_by(Activity.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


def get_organization_activities(
    db: Session,
    organization_id: uuid.UUID,
    limit: int = 20,
) -> List[Activity]:
    """
    Fetches activities for a specific workspace organization, ordered newest first (created_at DESC).
    Max `limit` records returned (default 20).
    """
    stmt = (
        select(Activity)
        .where(Activity.organization_id == organization_id)
        .order_by(Activity.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())
