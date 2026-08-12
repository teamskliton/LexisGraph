"""
Pydantic response schemas for Compliance Operations Overview, Workload Intelligence & Compliance Calendar (Sprint 6.12).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

from app.schemas.finding import FindingItemResponse, FindingActivityItem, FindingAssigneeResponse
from app.schemas.report import ReportItemResponse


class ComplianceOverviewSummary(BaseModel):
    compliance_score: Optional[float] = Field(None, description="Authoritative compliance score (0-100)")
    compliance_status: str = Field("IDLE", description="Overall status: HIGH_RISK, MEDIUM_RISK, LOW_RISK, IDLE")
    total_findings: int = Field(0, description="Total findings count")
    open_findings: int = Field(0, description="Open + Reopened findings count")
    in_review: int = Field(0, description="In Review findings count")
    remediation: int = Field(0, description="In Remediation findings count")
    resolved: int = Field(0, description="Resolved findings count")
    critical_count: int = Field(0, description="Critical findings count")
    high_count: int = Field(0, description="High findings count")
    overdue_count: int = Field(0, description="Overdue findings count")
    unassigned_count: int = Field(0, description="Unassigned unresolved findings count")


class TeamWorkloadItem(BaseModel):
    user_id: str = Field(..., description="User UUID string")
    full_name: str = Field(..., description="User full name")
    email: str = Field(..., description="User email address")
    role: str = Field("MEMBER", description="Organization role")
    open_count: int = Field(0, description="Open findings count")
    in_review_count: int = Field(0, description="In Review findings count")
    remediation_count: int = Field(0, description="In Remediation findings count")
    resolved_count: int = Field(0, description="Resolved findings count")
    total_assigned: int = Field(0, description="Total assigned findings count")


class ReportExposureItem(BaseModel):
    report_id: str = Field(..., description="Report UUID string")
    regulation_title: Optional[str] = Field(None, description="Title of regulation document")
    policy_filename: Optional[str] = Field(None, description="Original policy filename")
    open_count: int = Field(0, description="Unresolved findings count in report")
    high_critical_count: int = Field(0, description="High or Critical findings count in report")
    total_findings: int = Field(0, description="Total findings in report")


class OverdueFindingItem(FindingItemResponse):
    days_overdue: int = Field(0, description="Days elapsed past remediation due date")


class ComplianceOverviewResponse(BaseModel):
    organization_id: str = Field(..., description="Organization UUID string")
    organization_name: str = Field(..., description="Organization name")
    summary: ComplianceOverviewSummary = Field(..., description="Aggregated operational compliance metrics")
    attention_required: List[FindingItemResponse] = Field(default_factory=list, description="High/Critical findings requiring attention")
    priority_attention: List[FindingItemResponse] = Field(default_factory=list, description="Priority Attention Queue (Critical > High > Overdue > Due Soon)")
    team_workload: List[TeamWorkloadItem] = Field(default_factory=list, description="Workload distribution by team member")
    unassigned_findings: List[FindingItemResponse] = Field(default_factory=list, description="Findings requiring an assigned owner")
    overdue_findings: List[OverdueFindingItem] = Field(default_factory=list, description="Findings past remediation due date")
    report_exposure: List[ReportExposureItem] = Field(default_factory=list, description="Unresolved finding exposure grouped by report")
    my_work: List[FindingItemResponse] = Field(default_factory=list, description="Findings assigned to the authenticated user")
    recent_activity: List[FindingActivityItem] = Field(default_factory=list, description="Real historical organization lifecycle activities")
    recent_reports: List[ReportItemResponse] = Field(default_factory=list, description="Recent compliance reports")


class DeadlineSummary(BaseModel):
    overdue_count: int = Field(0, description="Overdue remediation deadlines count")
    this_week_count: int = Field(0, description="Remediation deadlines due in next 7 days")
    next_30_days_count: int = Field(0, description="Remediation deadlines due in next 30 days")


class ComplianceDeadlineItem(BaseModel):
    finding_id: str = Field(..., description="Finding UUID string")
    report_id: str = Field(..., description="Report UUID string")
    regulation_title: Optional[str] = Field(None, description="Regulation title")
    policy_filename: Optional[str] = Field(None, description="Policy filename")
    policy_clause_id: Optional[str] = Field(None, description="Policy clause identifier")
    regulation_clause_id: Optional[str] = Field(None, description="Regulation clause identifier")
    status: str = Field(..., description="Finding compliance status")
    lifecycle_status: str = Field(..., description="Finding lifecycle status")
    severity: str = Field(..., description="Finding severity level")
    reasoning: Optional[str] = Field(None, description="Reasoning / explanation")
    citation: Optional[str] = Field(None, description="Citation / text excerpt")
    remediation_due_date: datetime = Field(..., description="Remediation deadline timestamp")
    is_overdue: bool = Field(False, description="Overdue indicator")
    days_overdue: int = Field(0, description="Days overdue if deadline is in the past")
    assigned_to: Optional[str] = Field(None, description="Assignee user UUID")
    assignee: Optional[FindingAssigneeResponse] = Field(None, description="Assignee user details")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class ComplianceCalendarResponse(BaseModel):
    organization_id: str = Field(..., description="Organization UUID string")
    organization_name: str = Field(..., description="Organization name")
    summary: DeadlineSummary = Field(..., description="Compliance deadline summary metrics")
    deadlines: List[ComplianceDeadlineItem] = Field(default_factory=list, description="Remediation deadline items")
