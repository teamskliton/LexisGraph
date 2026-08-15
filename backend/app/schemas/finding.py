"""
Pydantic schemas for Finding Lifecycle & Collaboration Operations.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class FindingStatusUpdateRequest(BaseModel):
    lifecycle_status: Optional[str] = Field(None, description="Target lifecycle status: OPEN, IN_REVIEW, REMEDIATION, POTENTIAL_FALSE_POSITIVE, ADMIN_REVIEW, RESOLVED, REOPENED, REJECTED")
    status: Optional[str] = Field(None, description="Alias for lifecycle_status")


class FindingAssignRequest(BaseModel):
    assignee_id: Optional[uuid.UUID] = Field(None, description="UUID of user in organization to assign (None to unassign)")


class FindingResolveRequest(BaseModel):
    resolution_note: Optional[str] = Field(None, description="Note summarizing remediation resolution")


class FindingReopenRequest(BaseModel):
    reopen_reason: Optional[str] = Field(None, description="Reason for reopening finding")


class FindingRejectRequest(BaseModel):
    rejection_reason: Optional[str] = Field(None, description="Reason for rejecting false-positive finding")


class FindingSubmitReviewRequest(BaseModel):
    submission_note: Optional[str] = Field(None, description="Note summarizing remediation or false positive for Admin review")


class FindingRemediationUpdateRequest(BaseModel):
    due_date: Optional[datetime] = Field(None, description="ISO format due date timestamp or null to clear")


class FindingCommentCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000, description="Comment text content")
    parent_id: Optional[uuid.UUID] = Field(None, description="UUID of parent comment for threaded replies")
    mentioned_user_ids: Optional[List[uuid.UUID]] = Field(None, description="List of user UUIDs mentioned in comment")


class FindingCommentResolveRequest(BaseModel):
    is_resolved: bool = Field(True, description="Whether comment thread/discussion is resolved")


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
    user_role: Optional[str] = None
    content: str
    parent_id: Optional[str] = None
    is_resolved: bool = False
    resolved_by: Optional[str] = None
    resolved_by_name: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    replies: List[FindingCommentResponse] = []


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
    organization_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class FindingPaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    total_pages: int
    items: List[FindingItemResponse]
