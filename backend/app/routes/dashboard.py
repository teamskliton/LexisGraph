"""
Dashboard statistics and analytics API router.
Aggregates live PostgreSQL statistics for KPI cards, charts, and activity stream.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.compliance.models import ComplianceReport, ComplianceReportStatus
from app.core.dependencies import get_current_user
from app.db.models.document import Document, DocumentType
from app.db.models.regulation import Regulation
from app.db.models.organization import Organization
from app.db.models.user import User
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class KpiStats(BaseModel):
    total_organizations: int = Field(0, description="Total number of user registered organizations")
    total_regulations: int = Field(0, description="Total global regulation documents uploaded")
    total_policies: int = Field(0, description="Total user policy documents uploaded")
    total_compliance_reports: int = Field(0, description="Total user compliance reports generated")
    average_compliance_score: float = Field(0.0, description="Average compliance score of user reports (0-100)")


class ActivityItem(BaseModel):
    id: str
    type: str  # ORGANIZATION_CREATED, DOCUMENT_UPLOADED, REPORT_GENERATED, REPORT_DOWNLOADED
    title: str
    description: str
    timestamp: str
    icon_type: str  # building, file, report, download


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


class DashboardStatsResponse(BaseModel):
    kpis: KpiStats
    recent_activity: List[ActivityItem]
    score_distribution: ScoreDistribution
    risk_breakdown: RiskBreakdown
    reports_over_time: List[ReportsOverTimeItem]
    org_scores: List[OrgScoreAnalyticsItem]
    recent_reports: List[RecentReportItem]


from app.core.workspace_context import WorkspaceContext, get_active_workspace_context
from app.db.models.regulation import OrganizationRegulation


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
    current_user = ws.user

    # Total user accessible workspaces count for metadata
    from app.db.models.rbac import OrganizationMember, MemberStatus

    total_orgs = db.scalar(
        select(func.count(OrganizationMember.id)).where(
            OrganizationMember.user_id == current_user.id,
            OrganizationMember.status == MemberStatus.ACTIVE,
        )
    ) or 1

    # Total regulations linked to this workspace
    linked_reg_count = db.scalar(
        select(func.count(OrganizationRegulation.id)).where(
            OrganizationRegulation.organization_id == target_org_id,
            OrganizationRegulation.enabled == True,
        )
    ) or 0
    global_reg_count = db.scalar(select(func.count(Regulation.id))) or 0
    total_regs = linked_reg_count if linked_reg_count > 0 else global_reg_count

    # Total policies strictly belonging to this workspace
    total_pols = db.scalar(
        select(func.count(Document.id)).where(
            Document.document_type == DocumentType.POLICY,
            Document.organization_id == target_org_id,
        )
    ) or 0

    # All reports strictly belonging to this workspace
    all_reports = db.scalars(
        select(ComplianceReport).where(
            ComplianceReport.organization_id == target_org_id,
            ComplianceReport.is_deleted == False,
        )
    ).all()

    total_reports = len(all_reports)

    # Calculate average compliance score across workspace reports
    scores = [r.overall_score for r in all_reports if r.overall_score is not None]
    if scores:
        normalized_scores = [s * 100 if (s <= 1.0 and s > 0) else s for s in scores]
        avg_score = round(sum(normalized_scores) / len(normalized_scores), 1)
    else:
        avg_score = 0.0

    kpis = KpiStats(
        total_organizations=total_orgs,
        total_regulations=total_regs,
        total_policies=total_pols,
        total_compliance_reports=total_reports,
        average_compliance_score=avg_score,
    )

    # Score Distribution & Risk Breakdown (scoped to this workspace)
    excellent_c = 0
    good_c = 0
    needs_review_c = 0
    high_risk_c = 0

    low_r = 0
    medium_r = 0
    high_r = 0
    critical_r = 0

    for rep in all_reports:
        sc = rep.overall_score
        if sc is not None:
            val = sc * 100 if (sc <= 1.0 and sc > 0) else sc
            if val >= 90:
                excellent_c += 1
            elif val >= 80:
                good_c += 1
            elif val >= 60:
                needs_review_c += 1
            else:
                high_risk_c += 1

            if val >= 85:
                low_r += 1
            elif val >= 70:
                medium_r += 1
            elif val >= 50:
                high_r += 1
            else:
                critical_r += 1

    score_dist = ScoreDistribution(
        excellent=excellent_c,
        good=good_c,
        needs_review=needs_review_c,
        high_risk=high_risk_c,
    )

    risk_bd = RiskBreakdown(
        low=low_r,
        medium=medium_r,
        high=high_r,
        critical=critical_r,
    )

    # Reports Over Time for this workspace
    over_time_map: Dict[str, int] = {}
    for rep in all_reports:
        dt = rep.created_at
        label = dt.strftime("%b %Y") if dt else "Unknown"
        over_time_map[label] = over_time_map.get(label, 0) + 1

    reports_over_time = [
        ReportsOverTimeItem(label=lbl, count=cnt)
        for lbl, cnt in list(over_time_map.items())[-6:]
    ]

    # Workspace score analytics item
    org_scores = [
        OrgScoreAnalyticsItem(
            id=str(ws.organization.id),
            name=ws.organization.name,
            avg_score=avg_score,
            report_count=total_reports,
        )
    ]

    # Recent reports strictly belonging to this workspace
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
        score_val = None
        if r.overall_score is not None:
            score_val = round(
                r.overall_score * 100 if (r.overall_score <= 1.0 and r.overall_score > 0) else r.overall_score,
                1,
            )

        status_str = r.status.value if hasattr(r.status, "value") else str(r.status)
        recent_reports.append(
            RecentReportItem(
                id=str(r.id),
                name=f"Compliance Check ({str(r.id)[:6]})",
                organization_name=ws.organization.name,
                compliance_score=score_val,
                created_at=r.created_at.isoformat() if r.created_at else datetime.utcnow().isoformat(),
                status=status_str,
            )
        )

    # Recent Activity Feed strictly scoped to this workspace
    from app.services.activity_service import get_organization_activities
    db_activities = get_organization_activities(db, target_org_id, limit=20)
    recent_activity = [
        ActivityItem(
            id=str(act.id),
            type=act.event_type,
            title=act.title,
            description=act.description,
            timestamp=act.created_at.isoformat() if act.created_at else datetime.utcnow().isoformat(),
            icon_type=act.icon_type,
        )
        for act in db_activities
    ]

    return DashboardStatsResponse(
        kpis=kpis,
        recent_activity=recent_activity,
        score_distribution=score_dist,
        risk_breakdown=risk_bd,
        reports_over_time=reports_over_time,
        org_scores=org_scores,
        recent_reports=recent_reports,
    )
