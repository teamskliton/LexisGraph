"""
Pydantic schemas for Sprint 7.14: Compliance Reports & Management Summary.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class HighRiskReportFindingItem(BaseModel):
    id: str
    title: str
    severity: str
    lifecycle_status: str
    compliance_status: str
    policy_name: str
    policy_clause_id: Optional[str] = None
    regulation_name: str
    regulation_clause_id: Optional[str] = None
    citation: Optional[str] = None
    age_days: int
    remediation_cycle: int = 0
    assigned_to_name: str = "Unassigned"
    created_at: Optional[datetime] = None


class PolicyGapItem(BaseModel):
    policy_document_id: str
    policy_name: str
    total_findings: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    unresolved_count: int
    resolved_count: int


class RegulationGapItem(BaseModel):
    regulation_id: str
    regulation_title: str
    total_findings: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    unresolved_count: int
    resolved_count: int


class ReportStatusDistributionItem(BaseModel):
    status: str
    label: str
    count: int
    percentage: float


class ReportSeverityDistributionItem(BaseModel):
    severity: str
    label: str
    count: int
    percentage: float


class ReportTrendPoint(BaseModel):
    date: str
    created_count: int
    resolved_count: int


class RemediationOperationsSummary(BaseModel):
    pending_remediation_count: int = 0
    submitted_for_review_count: int = 0
    verified_count: int = 0
    approved_count: int = 0
    rejected_count: int = 0
    multiple_cycles_count: int = 0
    total_cycles_completed: int = 0


class ReassessmentOperationsSummary(BaseModel):
    reassessment_required_count: int = 0
    recently_reassessed_count: int = 0
    reopened_after_reassessment_count: int = 0
    kept_resolved_after_reassessment_count: int = 0


class ResolutionOperationsSummary(BaseModel):
    resolved_during_period: int = 0
    reopened_during_period: int = 0
    currently_resolved: int = 0
    currently_unresolved: int = 0


class AuditActivitySummaryItem(BaseModel):
    event_type: str
    label: str
    count: int


class ComplianceReportExecutiveMetrics(BaseModel):
    total_findings: int = 0
    open_findings: int = 0
    critical_findings: int = 0
    high_findings: int = 0
    medium_findings: int = 0
    low_findings: int = 0
    under_remediation: int = 0
    needs_reassessment: int = 0
    resolved_findings: int = 0
    reopened_findings: int = 0
    resolution_rate_percentage: float = 0.0


class ComplianceManagementReportResponse(BaseModel):
    report_title: str = "LexisGraph Compliance & Management Report"
    organization_id: str
    organization_name: str
    reporting_period: str
    generated_at: datetime
    generated_by_id: str
    generated_by_name: str
    generated_by_role: Optional[str] = None
    applied_filters: Dict[str, Any] = Field(default_factory=dict)
    executive_metrics: ComplianceReportExecutiveMetrics
    status_distribution: List[ReportStatusDistributionItem] = Field(default_factory=list)
    severity_distribution: List[ReportSeverityDistributionItem] = Field(default_factory=list)
    high_risk_findings: List[HighRiskReportFindingItem] = Field(default_factory=list)
    policy_gaps: List[PolicyGapItem] = Field(default_factory=list)
    regulation_gaps: List[RegulationGapItem] = Field(default_factory=list)
    remediation_summary: RemediationOperationsSummary
    reassessment_summary: ReassessmentOperationsSummary
    resolution_summary: ResolutionOperationsSummary
    trend_summary: List[ReportTrendPoint] = Field(default_factory=list)
    has_sufficient_history: bool = True
    history_message: Optional[str] = None
    audit_summary: List[AuditActivitySummaryItem] = Field(default_factory=list)
