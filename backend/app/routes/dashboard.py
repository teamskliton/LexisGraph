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


@router.get(
    "/stats",
    response_model=DashboardStatsResponse,
    summary="Get aggregated live dashboard statistics",
)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardStatsResponse:
    """
    Computes real-time live user-specific dashboard metrics directly from PostgreSQL database records.
    Calculates KPI totals, activity streams, score distributions, risk level breakdown, reports over time, org averages, and recent reports for current user.
    """
    # 1. KPI Counts
    total_orgs = db.scalar(
        select(func.count(Organization.id)).where(Organization.created_by == current_user.id)
    ) or 0
    total_regs = db.scalar(select(func.count(Regulation.id))) or 0
    total_pols = db.scalar(
        select(func.count(Document.id)).where(
            Document.document_type == DocumentType.POLICY,
            Document.uploaded_by == current_user.id,
        )
    ) or 0
    total_reports = db.scalar(
        select(func.count(ComplianceReport.id)).where(
            ComplianceReport.created_by == current_user.id,
            ComplianceReport.is_deleted == False,
        )
    ) or 0

    # Calculate average compliance score across user's evaluated reports
    scores_query = select(ComplianceReport.overall_score).where(
        ComplianceReport.created_by == current_user.id,
        ComplianceReport.overall_score.isnot(None),
        ComplianceReport.is_deleted == False,
    )
    scores = db.scalars(scores_query).all()
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

    # 2. Score Distribution & Risk Breakdown (user-specific)
    excellent_c = 0
    good_c = 0
    needs_review_c = 0
    high_risk_c = 0

    low_r = 0
    medium_r = 0
    high_r = 0
    critical_r = 0

    all_reports = db.scalars(
        select(ComplianceReport).where(
            ComplianceReport.created_by == current_user.id,
            ComplianceReport.is_deleted == False,
        )
    ).all()

    for rep in all_reports:
        sc = rep.overall_score
        if sc is not None:
            val = sc * 100 if (sc <= 1.0 and sc > 0) else sc
            # Distribution
            if val >= 90:
                excellent_c += 1
            elif val >= 80:
                good_c += 1
            elif val >= 60:
                needs_review_c += 1
            else:
                high_risk_c += 1

            # Risk Breakdown
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

    # 3. Reports Over Time (Monthly grouping, user-specific)
    over_time_map: Dict[str, int] = {}
    for rep in all_reports:
        dt = rep.created_at
        label = dt.strftime("%b %Y") if dt else "Unknown"
        over_time_map[label] = over_time_map.get(label, 0) + 1

    reports_over_time = [
        ReportsOverTimeItem(label=lbl, count=cnt)
        for lbl, cnt in list(over_time_map.items())[-6:]
    ]

    # 4. Average Score Per Organization (user-owned organizations)
    user_orgs = db.scalars(
        select(Organization).where(Organization.created_by == current_user.id)
    ).all()
    org_name_map = {str(o.id): o.name for o in user_orgs}

    org_scores_list: List[OrgScoreAnalyticsItem] = []
    for org in user_orgs:
        org_reports = [r for r in all_reports if r.organization_id == org.id and r.overall_score is not None]
        if org_reports:
            org_scores_vals = [r.overall_score * 100 if (r.overall_score <= 1.0 and r.overall_score > 0) else r.overall_score for r in org_reports]
            org_avg = round(sum(org_scores_vals) / len(org_scores_vals), 1)
        else:
            org_avg = 0.0

        org_scores_list.append(
            OrgScoreAnalyticsItem(
                id=str(org.id),
                name=org.name,
                avg_score=org_avg,
                report_count=len(org_reports),
            )
        )

    org_scores_list.sort(key=lambda x: x.avg_score, reverse=True)
    org_scores = org_scores_list[:5]

    recent_report_objs = db.scalars(
        select(ComplianceReport)
        .where(
            ComplianceReport.created_by == current_user.id,
            ComplianceReport.is_deleted == False,
        )
        .order_by(ComplianceReport.created_at.desc())
        .limit(5)
    ).all()

    recent_reports: List[RecentReportItem] = []
    for r in recent_report_objs:
        org_name = org_name_map.get(str(r.organization_id), "Organization")
        score_val = None
        if r.overall_score is not None:
            score_val = round(r.overall_score * 100 if (r.overall_score <= 1.0 and r.overall_score > 0) else r.overall_score, 1)

        status_str = r.status.value if hasattr(r.status, "value") else str(r.status)
        recent_reports.append(
            RecentReportItem(
                id=str(r.id),
                name=f"Compliance Check ({str(r.id)[:6]})",
                organization_name=org_name,
                compliance_score=score_val,
                created_at=r.created_at.isoformat() if r.created_at else datetime.utcnow().isoformat(),
                status=status_str,
            )
        )

    # 6. Recent Activity Feed (real-time activities from Activity table for current_user, limit 20)
    from app.services.activity_service import get_user_activities
    db_activities = get_user_activities(db, current_user.id, limit=20)
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
