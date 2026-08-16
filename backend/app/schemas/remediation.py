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
    cycle_id: Optional[str] = None
    cycle_number: Optional[int] = None
    document_id: Optional[str] = None
    document_type: Optional[str] = None
    version: Optional[str] = None
    uploaded_by: str
    uploaded_at: datetime
    uploader: Optional[RemediationUserItem] = None


class LinkDocumentEvidenceRequest(BaseModel):
    document_id: uuid.UUID = Field(..., description="UUID of existing document from organization library")
    description: Optional[str] = Field(None, description="Optional description of the evidence link")
    cycle_number: Optional[int] = Field(None, description="Optional remediation cycle number to associate")


class FindingVerificationSummary(BaseModel):
    verification_status: str
    verified_by: Optional[str] = None
    verified_by_name: Optional[str] = None
    verified_at: Optional[datetime] = None
    verification_note: Optional[str] = None
    cycle_number: Optional[int] = None


class FindingResolutionProofResponse(BaseModel):
    finding_id: str
    finding_clause_id: Optional[str] = None
    severity: Optional[str] = None
    lifecycle_status: str
    resolved_by: Optional[str] = None
    resolved_by_name: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolution_note: Optional[str] = None
    approved_cycle_number: Optional[int] = None
    verification: Optional[FindingVerificationSummary] = None
    supporting_evidence: List[RemediationEvidenceResponse] = []
    historical_evidence: List[RemediationEvidenceResponse] = []
    historical_resolutions: List[dict] = []
    reassessment_info: Optional[dict] = None
    has_supporting_evidence: bool = True


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


class RemediationSubmitRequest(BaseModel):
    submission_note: Optional[str] = Field(None, description="Remediation cycle submission note")


class RemediationVerifyRequest(BaseModel):
    verification_note: Optional[str] = Field(None, description="Reviewer verification note")


class RemediationRejectRequest(BaseModel):
    rejection_reason: Optional[str] = Field(None, description="Reviewer rejection reason returning to In Progress")


class RemediationApproveRequest(BaseModel):
    admin_note: Optional[str] = Field(None, description="Administrator approval note")


class RemediationReturnRequest(BaseModel):
    return_reason: Optional[str] = Field(None, description="Administrator return reason")


class RemediationCycleResponse(BaseModel):
    id: str
    remediation_id: str
    finding_id: str
    organization_id: str
    cycle_number: int
    status: str
    submission_note: Optional[str] = None
    submitted_by: str
    submitted_at: datetime
    submitter: Optional[RemediationUserItem] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    reviewer: Optional[RemediationUserItem] = None
    result: Optional[str] = None
    rejection_reason: Optional[str] = None
    verification_note: Optional[str] = None
    evidence_snapshot: Optional[dict] = None


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
    current_cycle_number: Optional[int] = 1
    cycles_count: Optional[int] = 0
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
