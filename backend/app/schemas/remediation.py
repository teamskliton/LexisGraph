"""
Pydantic schemas for Finding Remediation & Evidence Management (Sprint 7.4).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class RemediationUserItem(BaseModel):
    id: str
    full_name: str
    email: str


class RemediationEvidenceResponse(BaseModel):
    id: str
    remediation_id: str
    finding_id: str
    organization_id: str
    original_filename: str
    file_size: int
    mime_type: str
    description: Optional[str] = None
    uploaded_by: str
    uploaded_at: datetime
    uploader: Optional[RemediationUserItem] = None


class RemediationCreateRequest(BaseModel):
    title: Optional[str] = Field(None, max_length=255, description="Remediation plan title")
    description: Optional[str] = Field(None, description="Detailed corrective action plan")
    assigned_to: Optional[uuid.UUID] = Field(None, description="Assigned team member UUID")
    due_date: Optional[datetime] = Field(None, description="Remediation deadline timestamp")
    priority: Optional[str] = Field("HIGH", description="Priority: LOW, MEDIUM, HIGH, CRITICAL")


class RemediationUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, max_length=255, description="Remediation plan title")
    description: Optional[str] = Field(None, description="Detailed corrective action plan")
    assigned_to: Optional[uuid.UUID] = Field(None, description="Assigned team member UUID")
    due_date: Optional[datetime] = Field(None, description="Remediation deadline timestamp")
    priority: Optional[str] = Field(None, description="Priority: LOW, MEDIUM, HIGH, CRITICAL")
    status: Optional[str] = Field(None, description="Target remediation status")


class RemediationVerifyRequest(BaseModel):
    verification_note: Optional[str] = Field(None, description="Reviewer verification note")


class RemediationRejectRequest(BaseModel):
    rejection_reason: Optional[str] = Field(None, description="Reviewer rejection reason returning to In Progress")


class RemediationApproveRequest(BaseModel):
    admin_note: Optional[str] = Field(None, description="Administrator approval note")


class RemediationReturnRequest(BaseModel):
    return_reason: Optional[str] = Field(None, description="Administrator return reason")


class RemediationResponse(BaseModel):
    id: str
    finding_id: str
    organization_id: str
    title: str
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    assignee: Optional[RemediationUserItem] = None
    due_date: Optional[datetime] = None
    is_overdue: bool = False
    priority: str = "HIGH"
    status: str = "NOT_STARTED"
    created_by: str
    creator: Optional[RemediationUserItem] = None
    created_at: datetime
    updated_at: datetime
    verified_by: Optional[str] = None
    verifier: Optional[RemediationUserItem] = None
    verified_at: Optional[datetime] = None
    verification_note: Optional[str] = None
    admin_approved_by: Optional[str] = None
    admin_approver: Optional[RemediationUserItem] = None
    admin_approved_at: Optional[datetime] = None
    admin_note: Optional[str] = None
    evidence: List[RemediationEvidenceResponse] = Field(default_factory=list)
