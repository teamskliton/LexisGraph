"""
Pydantic schemas for Finding Lifecycle & Collaboration Operations.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class FindingStatusUpdateRequest(BaseModel):
    lifecycle_status: Optional[str] = Field(None, description="Target lifecycle status: OPEN, IN_REVIEW, REMEDIATION, RESOLVED, REOPENED")
    status: Optional[str] = Field(None, description="Alias for lifecycle_status")


class FindingAssignRequest(BaseModel):
    assignee_id: Optional[uuid.UUID] = Field(None, description="UUID of user in organization to assign (None to unassign)")


class FindingResolveRequest(BaseModel):
    resolution_note: Optional[str] = Field(None, description="Note summarizing remediation resolution")


class FindingReopenRequest(BaseModel):
    reopen_reason: Optional[str] = Field(None, description="Reason for reopening finding")


class FindingRemediationUpdateRequest(BaseModel):
    due_date: Optional[datetime] = Field(None, description="ISO format due date timestamp or null to clear")


class FindingCommentCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000, description="Comment text content")


class FindingAssigneeResponse(BaseModel):
    id: str
    full_name: str
    email: str


class FindingCommentResponse(BaseModel):
    id: str
    finding_id: str
    user_id: str
    user_name: str
    user_email: str
    content: str
    created_at: datetime
    updated_at: datetime


class FindingActivityItem(BaseModel):
    id: str
    finding_id: str
    user_name: str
    event_type: str
    title: str
    description: str
    created_at: datetime


class FindingItemResponse(BaseModel):
    id: str
    report_id: str
    policy_clause_id: Optional[str] = None
    regulation_clause_id: Optional[str] = None
    status: Optional[str] = "NON_COMPLIANT"
    lifecycle_status: str = "OPEN"
    confidence: Optional[float] = None
    severity: Optional[str] = "HIGH"
    reasoning: Optional[str] = None
    recommendation: Optional[str] = None
    citation: Optional[str] = None
    matched_policy_text: Optional[str] = None
    graph_path: Optional[dict | list] = None
    assigned_to: Optional[str] = None
    assignee: Optional[FindingAssigneeResponse] = None
    resolution_note: Optional[str] = None
    reopen_reason: Optional[str] = None
    remediation_due_date: Optional[datetime] = None
    is_overdue: bool = False
    comments_count: int = 0
    created_at: datetime
    updated_at: datetime
