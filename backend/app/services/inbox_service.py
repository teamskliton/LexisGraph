"""
Service helper for managing Action Inbox items and work attention queues.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import select, and_

from app.db.models.inbox import InboxItem

logger = logging.getLogger(__name__)


def create_or_update_inbox_item(
    db: Session,
    *,
    organization_id: uuid.UUID,
    recipient_id: uuid.UUID,
    entity_type: str = "FINDING",
    entity_id: uuid.UUID,
    action_type: str,
    priority: str = "MEDIUM",
    title: str,
    description: str,
    due_at: Optional[datetime] = None,
) -> Optional[InboxItem]:
    """
    Creates or updates an actionable task in the user's Action Inbox.
    Guarantees idempotency: updates existing PENDING item for same entity and action.
    """
    try:
        existing = db.execute(
            select(InboxItem).where(
                InboxItem.organization_id == organization_id,
                InboxItem.recipient_user_id == recipient_id,
                InboxItem.entity_id == entity_id,
                InboxItem.action_type == action_type,
                InboxItem.status == "PENDING",
            )
        ).scalar_one_or_none()

        if existing:
            existing.title = title
            existing.description = description
            existing.priority = priority.upper()
            if due_at is not None:
                existing.due_at = due_at
            existing.is_read = False
            return existing

        item = InboxItem(
            id=uuid.uuid4(),
            organization_id=organization_id,
            recipient_user_id=recipient_id,
            entity_type=entity_type.upper(),
            entity_id=entity_id,
            action_type=action_type.upper(),
            priority=priority.upper(),
            status="PENDING",
            title=title,
            description=description,
            is_read=False,
            due_at=due_at,
            created_at=datetime.now(timezone.utc),
        )
        db.add(item)
        return item
    except Exception as exc:
        logger.error("Failed to create inbox item: %s", exc, exc_info=True)
        return None


def reassign_inbox_task(
    db: Session,
    *,
    organization_id: uuid.UUID,
    entity_id: uuid.UUID,
    old_assignee_id: Optional[uuid.UUID],
    new_assignee_id: uuid.UUID,
    action_type: str = "REMEDIATION_REQUIRED",
    priority: str = "MEDIUM",
    title: str,
    description: str,
    due_at: Optional[datetime] = None,
) -> Optional[InboxItem]:
    """
    Transfers active inbox task ownership when a finding is reassigned.
    Removes/completes pending tasks for old assignee and creates task for new assignee.
    """
    try:
        # Dismiss or complete old pending task for previous assignee
        if old_assignee_id and old_assignee_id != new_assignee_id:
            old_tasks = db.execute(
                select(InboxItem).where(
                    InboxItem.organization_id == organization_id,
                    InboxItem.recipient_user_id == old_assignee_id,
                    InboxItem.entity_id == entity_id,
                    InboxItem.status == "PENDING",
                )
            ).scalars().all()
            for t in old_tasks:
                t.status = "DISMISSED"
                t.completed_at = datetime.now(timezone.utc)

        # Create or update new task for new assignee
        return create_or_update_inbox_item(
            db,
            organization_id=organization_id,
            recipient_id=new_assignee_id,
            entity_type="FINDING",
            entity_id=entity_id,
            action_type=action_type,
            priority=priority,
            title=title,
            description=description,
            due_at=due_at,
        )
    except Exception as exc:
        logger.error("Failed reassigning inbox task: %s", exc, exc_info=True)
        return None


def resolve_inbox_items_for_entity(
    db: Session,
    *,
    organization_id: uuid.UUID,
    entity_id: uuid.UUID,
    action_types: Optional[list[str]] = None,
) -> int:
    """
    Marks all pending inbox items for this entity as COMPLETED when work is finished.
    """
    try:
        query = select(InboxItem).where(
            InboxItem.organization_id == organization_id,
            InboxItem.entity_id == entity_id,
            InboxItem.status == "PENDING",
        )
        if action_types:
            query = query.where(InboxItem.action_type.in_([at.upper() for at in action_types]))

        items = db.execute(query).scalars().all()
        now = datetime.now(timezone.utc)
        for item in items:
            item.status = "COMPLETED"
            item.completed_at = now
        return len(items)
    except Exception as exc:
        logger.error("Failed resolving inbox items for entity %s: %s", entity_id, exc, exc_info=True)
        return 0
