"""
Pydantic response schemas for Compliance Operations Overview (Sprint 6.5).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

from app.schemas.finding import FindingItemResponse, FindingActivityItem
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


class ComplianceOverviewResponse(BaseModel):
    organization_id: str = Field(..., description="Organization UUID string")
    organization_name: str = Field(..., description="Organization name")
    summary: ComplianceOverviewSummary = Field(..., description="Aggregated operational compliance metrics")
    attention_required: List[FindingItemResponse] = Field(default_factory=list, description="High/Critical findings requiring attention")
    my_work: List[FindingItemResponse] = Field(default_factory=list, description="Findings assigned to the authenticated user")
    recent_activity: List[FindingActivityItem] = Field(default_factory=list, description="Real historical organization lifecycle activities")
    recent_reports: List[ReportItemResponse] = Field(default_factory=list, description="Recent compliance reports")
