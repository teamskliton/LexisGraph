"""
Pydantic schemas for Action Inbox items and Notification Preferences.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class InboxItemResponse(BaseModel):
    id: str
    organization_id: str
    recipient_user_id: str
    entity_type: str
    entity_id: str
    action_type: str
    priority: str
    status: str
    title: str
    description: str
    is_read: bool
    due_at: Optional[datetime] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class InboxCountResponse(BaseModel):
    action_required_count: int
    mentions_count: int
    updates_count: int
    total_pending_count: int


class NotificationPreferenceResponse(BaseModel):
    id: Optional[str] = None
    user_id: str
    organization_id: Optional[str] = None
    finding_assignments_in_app: bool = True
    finding_assignments_email: bool = True
    review_requests_in_app: bool = True
    review_requests_email: bool = True
    mentions_replies_in_app: bool = True
    mentions_replies_email: bool = True
    deadlines_in_app: bool = True
    deadlines_email: bool = True
    analysis_results_in_app: bool = True
    analysis_results_email: bool = False
    workspace_activity_in_app: bool = True
    workspace_activity_email: bool = False


class NotificationPreferenceUpdateRequest(BaseModel):
    finding_assignments_in_app: Optional[bool] = None
    finding_assignments_email: Optional[bool] = None
    review_requests_in_app: Optional[bool] = None
    review_requests_email: Optional[bool] = None
    mentions_replies_in_app: Optional[bool] = None
    mentions_replies_email: Optional[bool] = None
    deadlines_in_app: Optional[bool] = None
    deadlines_email: Optional[bool] = None
    analysis_results_in_app: Optional[bool] = None
    analysis_results_email: Optional[bool] = None
    workspace_activity_in_app: Optional[bool] = None
    workspace_activity_email: Optional[bool] = None
