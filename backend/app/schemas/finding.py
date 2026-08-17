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


class FindingUpdateRequest(BaseModel):
    severity: Optional[str] = Field(None, description="Updated severity: CRITICAL, HIGH, MEDIUM, LOW")
    reasoning: Optional[str] = Field(None, description="Updated finding reasoning / analysis")
    recommendation: Optional[str] = Field(None, description="Updated finding recommendation")
    citation: Optional[str] = Field(None, description="Updated citation or reference clause")
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0, description="Updated confidence score (0.0 - 1.0)")


class FindingAssignRequest(BaseModel):
    assignee_id: Optional[uuid.UUID] = Field(None, description="UUID of user in organization to assign (None to unassign)")


class FindingResolveRequest(BaseModel):
    resolution_note: Optional[str] = Field(None, description="Note summarizing remediation resolution")


class FindingReopenRequest(BaseModel):
    reopen_reason: str = Field(..., min_length=1, description="Mandatory reason for reopening finding")


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


from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class FindingActivityActor(BaseModel):
    id: str
    full_name: str
    email: str
    role: Optional[str] = None


class FindingActivityItem(BaseModel):
    id: str
    finding_id: str
    organization_id: Optional[str] = None
    event_type: str
    category: str = "ALL"
    title: str
    description: str
    icon_type: str = "file"
    user_name: str = "System"
    actor: Optional[FindingActivityActor] = None
    created_at: datetime
    metadata: Optional[Dict[str, Any]] = None


class FindingActivityPaginatedResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    has_more: bool
    items: List[FindingActivityItem]


class FindingResolutionHistoryItem(BaseModel):
    id: str
    finding_id: str
    organization_id: Optional[str] = None
    resolution_number: int
    resolved_at: datetime
    resolved_by: Optional[str] = None
    resolved_by_name: Optional[str] = None
    resolution_note: Optional[str] = None
    reopened_at: Optional[datetime] = None
    reopened_by: Optional[str] = None
    reopened_by_name: Optional[str] = None
    reopen_reason: Optional[str] = None
    status: str = "RESOLVED"
    created_at: Optional[datetime] = None


class FindingReassessmentKeepResolvedRequest(BaseModel):
    admin_note: Optional[str] = Field(None, description="Admin justification for confirming previous resolution remains valid")


class FindingReassessmentTriggerRequest(BaseModel):
    trigger: str = Field("DOCUMENT_UPDATE", description="Trigger type: DOCUMENT_UPDATE, POLICY_UPDATE, REGULATION_UPDATE, NEW_ANALYSIS")
    reason: str = Field(..., min_length=1, description="Reason why reassessment is required")
    document_id: Optional[uuid.UUID] = Field(None, description="Associated changed document UUID")
    document_name: Optional[str] = Field(None, description="Name/version of changed document")
    report_id: Optional[uuid.UUID] = Field(None, description="Associated report UUID if triggered by analysis")


class FindingPreviousResolutionSummary(BaseModel):
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolved_by_name: Optional[str] = None
    resolution_note: Optional[str] = None


class FindingCandidateAnalysisSummary(BaseModel):
    status: Optional[str] = None
    severity: Optional[str] = None
    reasoning: Optional[str] = None
    recommendation: Optional[str] = None
    report_id: Optional[str] = None
    created_at: Optional[datetime] = None


class FindingReassessmentDetailResponse(BaseModel):
    finding_id: str
    lifecycle_status: str
    reassessment_trigger: Optional[str] = None
    reassessment_reason: Optional[str] = None
    reassessment_document_id: Optional[str] = None
    reassessment_document_name: Optional[str] = None
    reassessment_report_id: Optional[str] = None
    reassessment_detected_at: Optional[datetime] = None
    previous_resolution: Optional[FindingPreviousResolutionSummary] = None
    candidate_analysis: Optional[FindingCandidateAnalysisSummary] = None


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
    resolved_by: Optional[str] = None
    resolved_by_name: Optional[str] = None
    resolved_at: Optional[datetime] = None
    reopened_by: Optional[str] = None
    reopened_by_name: Optional[str] = None
    reopened_at: Optional[datetime] = None
    reopen_reason: Optional[str] = None
    reassessment_trigger: Optional[str] = None
    reassessment_reason: Optional[str] = None
    reassessment_document_id: Optional[str] = None
    reassessment_document_name: Optional[str] = None
    reassessment_report_id: Optional[str] = None
    reassessment_detected_at: Optional[datetime] = None
    remediation_due_date: Optional[datetime] = None
    is_overdue: bool = False
    comments_count: int = 0
    organization_id: Optional[str] = None
    resolution_history: List[FindingResolutionHistoryItem] = []
    created_at: datetime
    updated_at: datetime


class FindingPaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    total_pages: int
    items: List[FindingItemResponse]


# ==============================================================================
# SPRINT 7.11: Finding Analytics & Compliance Health Schemas
# ==============================================================================

class StatusDistributionItem(BaseModel):
    status: str
    label: str
    count: int


class SeverityDistributionItem(BaseModel):
    severity: str
    label: str
    count: int


class FindingTrendPoint(BaseModel):
    period: str
    label: str
    created_count: int
    open_snapshot: int


class ResolutionTrendPoint(BaseModel):
    period: str
    label: str
    created_count: int
    resolved_count: int


class RemediationPerformanceMetrics(BaseModel):
    average_cycles_per_resolved: float = 0.0
    resolved_first_cycle_count: int = 0
    resolved_multiple_cycles_count: int = 0
    rejected_remediation_count: int = 0
    pending_remediation_count: int = 0
    verified_remediation_count: int = 0
    approved_remediation_count: int = 0


class HighRiskFindingItem(BaseModel):
    id: str
    report_id: str
    clause_id: Optional[str] = None
    severity: str
    status: str
    lifecycle_status: str
    reasoning: Optional[str] = None
    age_days: int
    created_at: datetime
    remediation_due_date: Optional[datetime] = None
    is_reopened: bool = False


class AgingFindingItem(BaseModel):
    id: str
    report_id: str
    clause_id: Optional[str] = None
    severity: str
    lifecycle_status: str
    age_days: int
    created_at: datetime
    is_reopened: bool = False
    reopened_at: Optional[datetime] = None


class ComplianceHealthSummary(BaseModel):
    total_findings: int
    open_findings: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    in_review: int
    in_remediation: int
    reassessment_required: int
    resolved: int
    reopened_count: int
    summary_bullets: List[str] = []


class FindingAnalyticsResponse(BaseModel):
    organization_id: str
    organization_name: str
    date_range_applied: str
    from_date: Optional[datetime] = None
    to_date: Optional[datetime] = None
    health_summary: ComplianceHealthSummary
    status_distribution: List[StatusDistributionItem]
    severity_distribution: List[SeverityDistributionItem]
    open_finding_trend: List[FindingTrendPoint]
    resolution_trend: List[ResolutionTrendPoint]
    remediation_performance: RemediationPerformanceMetrics
    high_risk_findings: List[HighRiskFindingItem]
    aging_findings: List[AgingFindingItem]
    needs_reassessment_count: int
    reopened_findings_count: int


