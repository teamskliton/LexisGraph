"""
Pydantic schemas for In-App Notifications & Compliance Alerts.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    organization_id: str
    type: str
    title: str
    message: str
    is_read: bool
    finding_id: Optional[str] = None
    report_id: Optional[str] = None
    comment_id: Optional[str] = None
    created_at: datetime


class UnreadCountResponse(BaseModel):
    unread_count: int
