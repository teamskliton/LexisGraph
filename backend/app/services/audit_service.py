"""
Audit logging service. Records security events, user management changes, and compliance operations.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session
from app.db.models.rbac import AuditLog

logger = logging.getLogger(__name__)


def log_audit_event(
    db: Session,
    user_id: uuid.UUID,
    action: str,
    organization_id: Optional[uuid.UUID] = None,
    entity: Optional[str] = None,
    entity_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> AuditLog:
    """Create and persist an audit log entry."""
    entry = AuditLog(
        id=uuid.uuid4(),
        organization_id=organization_id,
        user_id=user_id,
        action=action,
        entity=entity,
        entity_id=str(entity_id) if entity_id else None,
        ip_address=ip_address,
        user_agent=user_agent,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    logger.info("AUDIT LOG: action=%r user_id=%s org_id=%s entity=%s", action, user_id, organization_id, entity)
    return entry
