"""
Dashboard statistics and analytics API router.
Aggregates live PostgreSQL statistics for organization-scoped executive dashboard.
Strictly isolates data to the active workspace.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.compliance.models import (
    ComplianceJob,
    ComplianceJobStatus,
    ComplianceReport,
    ComplianceReportStatus,
    ReportFinding,
)
from app.core.dependencies import get_current_user
from app.core.workspace_context import WorkspaceContext, get_active_workspace_context
from app.db.models.document import Document, DocumentType
from app.db.models.organization import Organization
from app.db.models.regulation import OrganizationRegulation, Regulation
from app.db.models.user import User
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class KpiStats(BaseModel):
    total_organizations: int = Field(1, description="Total active organizations (workspace scoped)")
    total_regulations: int = Field(0, description="Total regulations linked to this organization")
    total_policies: int = Field(0, description="Total policy documents belonging to this organization")
    total_compliance_reports: int = Field(0, description="Total compliance reports generated for this organization")
    average_compliance_score: float = Field(0.0, description="Average compliance score of organization reports (0-100)")


class ComplianceKpiStats(BaseModel):
    compliance_score: Optional[float] = Field(None, description="Current organization compliance score (0-100)")
    score_trend_delta: Optional[float] = Field(None, description="Score delta compared to previous analysis")
    critical_findings: int = Field(0, description="Unresolved critical compliance findings count")
    needs_review: int = Field(0, description="Findings or clauses requiring human verification count")
    compliant_clauses: int = Field(0, description="Verified compliant clauses count")
    pending_analyses: int = Field(0, description="Queued or running compliance analysis jobs count")
    total_regulations: int = Field(0, description="Indexed regulations count")
    total_policies: int = Field(0, description="Indexed internal policies count")
    total_compliance_reports: int = Field(0, description="Total compliance reports count")
    average_compliance_score: float = Field(0.0, description="Average compliance score")


class ActivityItem(BaseModel):
    id: str
    type: str  # ORGANIZATION_CREATED, DOCUMENT_UPLOADED, REPORT_GENERATED, REPORT_DOWNLOADED
    title: str
    description: str
    timestamp: str
    icon_type: str  # building, file, report, download
    organization_id: Optional[str] = None


class ScoreDistribution(BaseModel):
    excellent: int = Field(0, description="Score 90-100%")
    good: int = Field(0, description="Score 80-89%")
    needs_review: int = Field(0, description="Score 60-79%")
    high_risk: int = Field(0, description="Score < 60%")


class RiskBreakdown(BaseModel):
    low: int = Field(0, description="Low Risk (>= 85%)")
    medium: int = Field(0, description="Medium Risk (70-84%)")
    high: int = Field(0, description="High Risk (50-69%)")
    critical: int = Field(0, description="Critical Risk (< 50%)")


class ReportsOverTimeItem(BaseModel):
    label: str
    count: int


class OrgScoreAnalyticsItem(BaseModel):
    id: str
    name: str
    avg_score: float
    report_count: int


class RecentReportItem(BaseModel):
    id: str
    name: str
    organization_name: str
    compliance_score: Optional[float] = None
    created_at: str
    status: str
    risk_level: Optional[str] = None


class ComplianceTrendPoint(BaseModel):
    report_id: str
    date: str
    timestamp: str
    score: float
    report_name: Optional[str] = None


class SeverityBreakdown(BaseModel):
    critical: int = Field(0, description="Critical findings count")
    high: int = Field(0, description="High severity findings count")
    medium: int = Field(0, description="Medium severity findings count")
    low: int = Field(0, description="Low severity findings count")
    total: int = Field(0, description="Total findings count")


class GraphOverviewStats(BaseModel):
    indexed_regulations: int = Field(0, description="Indexed regulations mapped to this organization")
    indexed_policies: int = Field(0, description="Internal policies indexed for this organization")
    connected_entities: int = Field(0, description="Connected entities / relationships in graph")
    unmapped_policies: int = Field(0, description="Unmapped or pending policy documents")
    mapping_status: str = Field("Active", description="Mapping status: Active or Pending")


class PriorityActionItem(BaseModel):
    id: str
    title: str
    description: str
    severity: str  # Critical, High, Medium, Low
    relevant_policy: Optional[str] = None
    relevant_regulation: Optional[str] = None
    policy_id: Optional[str] = None
    report_id: Optional[str] = None
    regulation_id: Optional[str] = None
    action_label: str  # "Open Policy", "Review Finding", "View Regulation"
    action_type: str  # "policy", "finding", "regulation"
    confidence: Optional[float] = None
    confidence_label: Optional[str] = None  # "Extraction Confidence"


class DashboardStatsResponse(BaseModel):
    organization_id: str
    organization_name: str
    risk_status: str
    last_analysis_date: Optional[str] = None
    kpis: KpiStats
    compliance_kpis: ComplianceKpiStats
    compliance_trend: List[ComplianceTrendPoint]
    findings_severity: SeverityBreakdown
    graph_overview: GraphOverviewStats
    priority_actions: List[PriorityActionItem]
    recent_reports: List[RecentReportItem]
    recent_activity: List[ActivityItem]
    recent_activities: Optional[List[ActivityItem]] = None
    score_distribution: ScoreDistribution
    risk_breakdown: RiskBreakdown
    reports_over_time: List[ReportsOverTimeItem]
    org_scores: List[OrgScoreAnalyticsItem]


@router.get(
    "/stats",
    response_model=DashboardStatsResponse,
    summary="Get workspace-scoped live dashboard statistics",
)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> DashboardStatsResponse:
    """
    Computes real-time live dashboard metrics scoped STRICTLY to the active workspace.
    Derives all KPIs, activity, score distribution, risk breakdown, and reports
    exclusively from the authorized workspace context.
    """
    target_org_id = ws.organization_id
    target_org_name = ws.organization.name

    # 1. Total regulations linked to this workspace
    linked_reg_count = db.scalar(
        select(func.count(OrganizationRegulation.id)).where(
            OrganizationRegulation.organization_id == target_org_id,
            OrganizationRegulation.enabled == True,
        )
    ) or 0
    global_reg_count = db.scalar(select(func.count(Regulation.id))) or 0
    total_regs = linked_reg_count if linked_reg_count > 0 else global_reg_count

    # 2. Total policies strictly belonging to this workspace
    total_pols = db.scalar(
        select(func.count(Document.id)).where(
            Document.document_type == DocumentType.POLICY,
            Document.organization_id == target_org_id,
        )
    ) or 0

    # 3. All reports strictly belonging to this workspace
    all_reports = db.scalars(
        select(ComplianceReport)
        .where(
            ComplianceReport.organization_id == target_org_id,
            ComplianceReport.is_deleted == False,
        )
        .order_by(ComplianceReport.created_at.desc())
    ).all()

    total_reports = len(all_reports)

    # 4. Completed reports for compliance trend and latest score
    completed_reports = [
        r for r in all_reports
        if r.status == ComplianceReportStatus.COMPLETED and r.overall_score is not None
    ]

    # Calculate average compliance score across completed workspace reports
    scores = [r.overall_score for r in completed_reports if r.overall_score is not None]
    if scores:
        normalized_scores = [s * 100 if (s <= 1.0 and s > 0) else s for s in scores]
        avg_score = round(sum(normalized_scores) / len(normalized_scores), 1)
    else:
        avg_score = 0.0

    # Current organization score is latest completed report score, fallback to avg_score
    current_score: Optional[float] = None
    if completed_reports and completed_reports[0].overall_score is not None:
        raw_latest = completed_reports[0].overall_score
        current_score = round(raw_latest * 100 if (raw_latest <= 1.0 and raw_latest > 0) else raw_latest, 1)
    elif avg_score > 0:
        current_score = avg_score

    # Score trend delta compared with previous analysis
    score_trend_delta: Optional[float] = None
    if len(completed_reports) >= 2 and completed_reports[0].overall_score is not None and completed_reports[1].overall_score is not None:
        latest_val = completed_reports[0].overall_score * 100 if completed_reports[0].overall_score <= 1.0 else completed_reports[0].overall_score
        prev_val = completed_reports[1].overall_score * 100 if completed_reports[1].overall_score <= 1.0 else completed_reports[1].overall_score
        score_trend_delta = round(latest_val - prev_val, 1)

    # Last analysis date
    last_analysis_date: Optional[str] = None
    if completed_reports and completed_reports[0].created_at:
        last_analysis_date = completed_reports[0].created_at.strftime("%b %d, %Y")
    elif all_reports and all_reports[0].created_at:
        last_analysis_date = all_reports[0].created_at.strftime("%b %d, %Y")

    # Organization risk status
    if current_score is not None:
        if current_score >= 85:
            risk_status = "Low Risk"
        elif current_score >= 70:
            risk_status = "Medium Risk"
        else:
            risk_status = "High Risk"
    else:
        risk_status = "Not Analyzed"

    # 5. Unresolved critical findings count
    critical_findings = db.scalar(
        select(func.count(ReportFinding.id))
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(
            ComplianceReport.organization_id == target_org_id,
            ComplianceReport.is_deleted == False,
            func.upper(ReportFinding.severity) == "CRITICAL",
            func.upper(ReportFinding.lifecycle_status).not_in(["RESOLVED", "REJECTED"]),
        )
    ) or 0

    # 6. Needs review count (human verification required)
    needs_review = db.scalar(
        select(func.count(ReportFinding.id))
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(
            ComplianceReport.organization_id == target_org_id,
            ComplianceReport.is_deleted == False,
            or_(
                func.upper(ReportFinding.lifecycle_status).in_(["IN_REVIEW", "ADMIN_REVIEW", "POTENTIAL_FALSE_POSITIVE"]),
                func.upper(ReportFinding.status) == "PARTIALLY_COMPLIANT",
            ),
            func.upper(ReportFinding.lifecycle_status).not_in(["RESOLVED", "REJECTED"]),
        )
    ) or 0

    # 7. Compliant clauses verified
    report_compliant = db.scalar(
        select(func.coalesce(func.sum(ComplianceReport.compliant_clauses), 0))
        .where(
            ComplianceReport.organization_id == target_org_id,
            ComplianceReport.is_deleted == False,
            ComplianceReport.status == ComplianceReportStatus.COMPLETED,
        )
    ) or 0
    finding_compliant = db.scalar(
        select(func.count(ReportFinding.id))
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(
            ComplianceReport.organization_id == target_org_id,
            ComplianceReport.is_deleted == False,
            func.upper(ReportFinding.status) == "COMPLIANT",
        )
    ) or 0
    compliant_clauses = max(report_compliant, finding_compliant)

    # 8. Pending analyses (queued or running compliance jobs)
    pending_analyses = db.scalar(
        select(func.count(ComplianceJob.id)).where(
            ComplianceJob.organization_id == target_org_id,
            ComplianceJob.status.in_([ComplianceJobStatus.QUEUED, ComplianceJobStatus.RUNNING]),
        )
    ) or 0

    # Build KPI objects
    kpis = KpiStats(
        total_organizations=1,
        total_regulations=total_regs,
        total_policies=total_pols,
        total_compliance_reports=total_reports,
        average_compliance_score=avg_score,
    )

    compliance_kpis = ComplianceKpiStats(
        compliance_score=current_score,
        score_trend_delta=score_trend_delta,
        critical_findings=critical_findings,
        needs_review=needs_review,
        compliant_clauses=compliant_clauses,
        pending_analyses=pending_analyses,
        total_regulations=total_regs,
        total_policies=total_pols,
        total_compliance_reports=total_reports,
        average_compliance_score=avg_score,
    )

    # 9. Compliance Trend: historical completed analyses for this organization only (chronological order)
    historical_for_trend = sorted(completed_reports[:10], key=lambda r: r.created_at or datetime.min)
    compliance_trend: List[ComplianceTrendPoint] = []
    for rep in historical_for_trend:
        if rep.overall_score is not None:
            norm_val = round(rep.overall_score * 100 if (rep.overall_score <= 1.0 and rep.overall_score > 0) else rep.overall_score, 1)
            pol_title = None
            try:
                if rep.policy_document:
                    pol_title = getattr(rep.policy_document, "original_filename", None)
            except Exception:
                pass
            compliance_trend.append(
                ComplianceTrendPoint(
                    report_id=str(rep.id),
                    date=rep.created_at.strftime("%b %d, %Y") if rep.created_at else "Unknown",
                    timestamp=rep.created_at.isoformat() if rep.created_at else "",
                    score=norm_val,
                    report_name=pol_title,
                )
            )

    # 10. Real Findings by Severity for this organization (unresolved active findings)
    sev_rows = db.execute(
        select(
            func.upper(ReportFinding.severity),
            func.count(ReportFinding.id),
        )
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(
            ComplianceReport.organization_id == target_org_id,
            ComplianceReport.is_deleted == False,
            func.upper(ReportFinding.lifecycle_status).not_in(["RESOLVED", "REJECTED"]),
        )
        .group_by(func.upper(ReportFinding.severity))
    ).all()
    sev_map = {sev: cnt for sev, cnt in sev_rows}
    c_f = sev_map.get("CRITICAL", 0)
    h_f = sev_map.get("HIGH", 0)
    m_f = sev_map.get("MEDIUM", 0)
    l_f = sev_map.get("LOW", 0)
    findings_severity = SeverityBreakdown(
        critical=c_f,
        high=h_f,
        medium=m_f,
        low=l_f,
        total=c_f + h_f + m_f + l_f,
    )

    # 11. Knowledge Graph Overview for this organization
    analyzed_policy_subquery = select(ComplianceReport.policy_document_id).where(
        ComplianceReport.organization_id == target_org_id,
        ComplianceReport.is_deleted == False,
    )
    unmapped_policies = db.scalar(
        select(func.count(Document.id)).where(
            Document.organization_id == target_org_id,
            Document.document_type == DocumentType.POLICY,
            Document.id.not_in(analyzed_policy_subquery),
        )
    ) or 0
    connected_entities = total_regs + total_pols + total_reports
    graph_overview = GraphOverviewStats(
        indexed_regulations=total_regs,
        indexed_policies=total_pols,
        connected_entities=connected_entities,
        unmapped_policies=unmapped_policies,
        mapping_status="Active" if (total_regs > 0 or total_pols > 0) else "Pending",
    )

    # 12. Priority Actions for AI Executive Brief (actual top unresolved findings for this organization)
    priority_finding_objs = db.scalars(
        select(ReportFinding)
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(
            ComplianceReport.organization_id == target_org_id,
            ComplianceReport.is_deleted == False,
            func.upper(ReportFinding.lifecycle_status).not_in(["RESOLVED", "REJECTED"]),
        )
        .order_by(
            case(
                (func.upper(ReportFinding.severity) == "CRITICAL", 1),
                (func.upper(ReportFinding.severity) == "HIGH", 2),
                (func.upper(ReportFinding.severity) == "MEDIUM", 3),
                else_=4,
            ),
            ReportFinding.confidence.desc(),
            ReportFinding.id.desc(),
        )
        .limit(3)
    ).all()

    priority_actions: List[PriorityActionItem] = []
    for f in priority_finding_objs:
        rep = db.get(ComplianceReport, f.report_id)
        pol_name = None
        reg_name = None
        try:
            if rep and rep.policy_document:
                pol_name = getattr(rep.policy_document, "original_filename", None)
        except Exception:
            pass

        try:
            if rep and rep.regulation:
                reg_name = getattr(rep.regulation, "title", None) or getattr(rep.regulation, "act_name", None)
        except Exception:
            pass

        title = f.citation or (f.reasoning[:65] + "..." if f.reasoning else f"Finding in {pol_name or 'Policy'}")
        description = f.recommendation or f.reasoning or "Regulatory gap detected requiring verification."
        
        action_label = "Review Finding"
        action_type = "finding"
        if pol_name:
            action_label = "Open Policy"
            action_type = "policy"
        elif reg_name:
            action_label = "View Regulation"
            action_type = "regulation"

        conf_pct = round(f.confidence * 100 if (f.confidence <= 1.0 and f.confidence > 0) else f.confidence) if f.confidence else None

        priority_actions.append(
            PriorityActionItem(
                id=str(f.id),
                title=title,
                description=description,
                severity=f.severity.capitalize(),
                relevant_policy=pol_name,
                relevant_regulation=reg_name,
                policy_id=str(rep.policy_document_id) if rep else None,
                report_id=str(f.report_id),
                regulation_id=str(rep.regulation_id) if rep else None,
                action_label=action_label,
                action_type=action_type,
                confidence=conf_pct,
                confidence_label="Extraction Confidence" if conf_pct else None,
            )
        )

    # 13. Recent reports strictly belonging to this workspace with descriptive titles and risk levels
    recent_report_objs = db.scalars(
        select(ComplianceReport)
        .where(
            ComplianceReport.organization_id == target_org_id,
            ComplianceReport.is_deleted == False,
        )
        .order_by(ComplianceReport.created_at.desc())
        .limit(5)
    ).all()

    recent_reports: List[RecentReportItem] = []
    for r in recent_report_objs:
        pol_name = None
        reg_name = None
        try:
            if r.policy_document:
                pol_name = getattr(r.policy_document, "original_filename", None)
        except Exception:
            pass

        try:
            if r.regulation:
                reg_name = getattr(r.regulation, "title", None) or getattr(r.regulation, "act_name", None)
        except Exception:
            pass
        if pol_name and reg_name:
            name_str = f"{pol_name} • {reg_name}"
        elif pol_name:
            name_str = pol_name
        elif reg_name:
            name_str = f"Compliance Check: {reg_name}"
        else:
            name_str = f"Compliance Report ({str(r.id)[:6]})"

        score_val = None
        if r.overall_score is not None:
            score_val = round(
                r.overall_score * 100 if (r.overall_score <= 1.0 and r.overall_score > 0) else r.overall_score,
                1,
            )

        risk_level_str = None
        if score_val is not None:
            if score_val >= 85:
                risk_level_str = "Low Risk"
            elif score_val >= 70:
                risk_level_str = "Medium Risk"
            elif score_val >= 50:
                risk_level_str = "High Risk"
            else:
                risk_level_str = "Critical Risk"

        status_str = r.status.value if hasattr(r.status, "value") else str(r.status)
        recent_reports.append(
            RecentReportItem(
                id=str(r.id),
                name=name_str,
                organization_name=target_org_name,
                compliance_score=score_val,
                created_at=r.created_at.isoformat() if r.created_at else datetime.now(timezone.utc).isoformat(),
                status=status_str,
                risk_level=risk_level_str,
            )
        )

    # 14. Recent Activity Feed strictly scoped to this workspace (limit 5)
    from app.services.activity_service import get_organization_activities
    db_activities = get_organization_activities(db, target_org_id, limit=5)
    recent_activity = [
        ActivityItem(
            id=str(act.id),
            type=act.event_type,
            title=act.title,
            description=act.description,
            timestamp=act.created_at.isoformat() if act.created_at else datetime.now(timezone.utc).isoformat(),
            icon_type=act.icon_type,
            organization_id=str(target_org_id),
        )
        for act in db_activities
    ]

    # Legacy fields calculation
    excellent_c = sum(1 for r in completed_reports if (r.overall_score * 100 if r.overall_score <= 1.0 else r.overall_score) >= 90)
    good_c = sum(1 for r in completed_reports if 80 <= (r.overall_score * 100 if r.overall_score <= 1.0 else r.overall_score) < 90)
    needs_review_c = sum(1 for r in completed_reports if 60 <= (r.overall_score * 100 if r.overall_score <= 1.0 else r.overall_score) < 80)
    high_risk_c = sum(1 for r in completed_reports if (r.overall_score * 100 if r.overall_score <= 1.0 else r.overall_score) < 60)

    score_dist = ScoreDistribution(
        excellent=excellent_c,
        good=good_c,
        needs_review=needs_review_c,
        high_risk=high_risk_c,
    )

    risk_bd = RiskBreakdown(
        low=sum(1 for r in completed_reports if (r.overall_score * 100 if r.overall_score <= 1.0 else r.overall_score) >= 85),
        medium=sum(1 for r in completed_reports if 70 <= (r.overall_score * 100 if r.overall_score <= 1.0 else r.overall_score) < 85),
        high=sum(1 for r in completed_reports if 50 <= (r.overall_score * 100 if r.overall_score <= 1.0 else r.overall_score) < 70),
        critical=sum(1 for r in completed_reports if (r.overall_score * 100 if r.overall_score <= 1.0 else r.overall_score) < 50),
    )

    over_time_map: Dict[str, int] = {}
    for rep in all_reports:
        dt = rep.created_at
        label = dt.strftime("%b %Y") if dt else "Unknown"
        over_time_map[label] = over_time_map.get(label, 0) + 1

    reports_over_time = [
        ReportsOverTimeItem(label=lbl, count=cnt)
        for lbl, cnt in list(over_time_map.items())[-6:]
    ]

    org_scores = [
        OrgScoreAnalyticsItem(
            id=str(ws.organization.id),
            name=ws.organization.name,
            avg_score=avg_score,
            report_count=total_reports,
        )
    ]

    return DashboardStatsResponse(
        organization_id=str(target_org_id),
        organization_name=target_org_name,
        risk_status=risk_status,
        last_analysis_date=last_analysis_date,
        kpis=kpis,
        compliance_kpis=compliance_kpis,
        compliance_trend=compliance_trend,
        findings_severity=findings_severity,
        graph_overview=graph_overview,
        priority_actions=priority_actions,
        recent_reports=recent_reports,
        recent_activity=recent_activity,
        recent_activities=recent_activity,
        score_distribution=score_dist,
        risk_breakdown=risk_bd,
        reports_over_time=reports_over_time,
        org_scores=org_scores,
    )
