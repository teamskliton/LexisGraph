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
from app.db.models.document import Document, DocumentType
from app.db.models.organization import Organization
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class KpiStats(BaseModel):
    total_organizations: int = Field(0, description="Total number of registered organizations")
    total_regulations: int = Field(0, description="Total regulation documents uploaded")
    total_policies: int = Field(0, description="Total policy documents uploaded")
    total_compliance_reports: int = Field(0, description="Total compliance reports generated")
    average_compliance_score: float = Field(0.0, description="Average compliance score (0-100)")


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


class TopOrganizationItem(BaseModel):
    id: str
    name: str
    avg_score: float
    report_count: int


class DashboardStatsResponse(BaseModel):
    kpis: KpiStats
    recent_activity: List[ActivityItem]
    score_distribution: ScoreDistribution
    risk_breakdown: RiskBreakdown
    reports_over_time: List[ReportsOverTimeItem]
    top_organizations: List[TopOrganizationItem]


@router.get(
    "/stats",
    response_model=DashboardStatsResponse,
    summary="Get aggregated live dashboard statistics",
)
def get_dashboard_stats(db: Session = Depends(get_db)) -> DashboardStatsResponse:
    """
    Computes real-time live dashboard metrics directly from PostgreSQL database records.
    Calculates KPI totals, activity streams, score distributions, and organization rankings.
    """
    # 1. KPI Counts
    total_orgs = db.scalar(select(func.count(Organization.id))) or 0
    total_regs = db.scalar(
        select(func.count(Document.id)).where(Document.document_type == DocumentType.REGULATION)
    ) or 0
    total_pols = db.scalar(
        select(func.count(Document.id)).where(Document.document_type == DocumentType.POLICY)
    ) or 0
    total_reports = db.scalar(select(func.count(ComplianceReport.id))) or 0

    # Calculate average compliance score across evaluated reports
    scores_query = select(ComplianceReport.overall_score).where(ComplianceReport.overall_score.isnot(None))
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

    # 2. Score Distribution
    excellent_c = 0
    good_c = 0
    needs_review_c = 0
    high_risk_c = 0

    # 3. Risk Breakdown
    low_r = 0
    medium_r = 0
    high_r = 0
    critical_r = 0

    all_reports = db.scalars(select(ComplianceReport)).all()
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

    # 4. Reports Over Time (Monthly grouping)
    over_time_map: Dict[str, int] = {}
    for rep in all_reports:
        dt = rep.created_at
        label = dt.strftime("%b %Y") if dt else "Unknown"
        over_time_map[label] = over_time_map.get(label, 0) + 1

    reports_over_time = [
        ReportsOverTimeItem(label=lbl, count=cnt)
        for lbl, cnt in list(over_time_map.items())[-6:]
    ]

    # 5. Top Organizations by Compliance
    orgs = db.scalars(select(Organization)).all()
    top_orgs_list: List[TopOrganizationItem] = []

    for org in orgs:
        org_reports = [r for r in all_reports if r.organization_id == org.id and r.overall_score is not None]
        if org_reports:
            org_scores = [r.overall_score * 100 if (r.overall_score <= 1.0 and r.overall_score > 0) else r.overall_score for r in org_reports]
            org_avg = round(sum(org_scores) / len(org_scores), 1)
        else:
            org_avg = 0.0

        top_orgs_list.append(
            TopOrganizationItem(
                id=str(org.id),
                name=org.name,
                avg_score=org_avg,
                report_count=len(org_reports),
            )
        )

    # Sort top orgs by avg_score descending
    top_orgs_list.sort(key=lambda x: x.avg_score, reverse=True)
    top_organizations = top_orgs_list[:5]

    # 6. Recent Activity Feed
    activities: List[Dict[str, Any]] = []

    # Recent orgs
    recent_orgs = db.scalars(select(Organization).order_by(Organization.created_at.desc()).limit(5)).all()
    for o in recent_orgs:
        activities.append({
            "id": f"org-{o.id}",
            "type": "ORGANIZATION_CREATED",
            "title": f"Created Organization",
            "description": f"Added '{o.name}' to workspace",
            "timestamp": o.created_at.isoformat() if o.created_at else datetime.utcnow().isoformat(),
            "icon_type": "building",
        })

    # Recent docs
    recent_docs = db.scalars(select(Document).order_by(Document.created_at.desc()).limit(5)).all()
    for d in recent_docs:
        doc_type_label = "Regulation" if d.document_type == DocumentType.REGULATION else "Policy"
        activities.append({
            "id": f"doc-{d.id}",
            "type": "DOCUMENT_UPLOADED",
            "title": f"Uploaded {doc_type_label}",
            "description": f"Uploaded file '{d.original_filename}'",
            "timestamp": d.created_at.isoformat() if d.created_at else datetime.utcnow().isoformat(),
            "icon_type": "file",
        })

    # Recent reports
    recent_reps = db.scalars(select(ComplianceReport).order_by(ComplianceReport.created_at.desc()).limit(5)).all()
    org_name_map = {str(o.id): o.name for o in orgs}
    for r in recent_reps:
        org_name = org_name_map.get(str(r.organization_id), "Organization")
        activities.append({
            "id": f"rep-{r.id}",
            "type": "REPORT_GENERATED",
            "title": "Generated Compliance Report",
            "description": f"Completed compliance check for {org_name}",
            "timestamp": r.created_at.isoformat() if r.created_at else datetime.utcnow().isoformat(),
            "icon_type": "report",
        })

    # Sort all activity events by timestamp descending
    activities.sort(key=lambda x: x["timestamp"], reverse=True)
    recent_activity = [ActivityItem(**act) for act in activities[:10]]

    return DashboardStatsResponse(
        kpis=kpis,
        recent_activity=recent_activity,
        score_distribution=score_dist,
        risk_breakdown=risk_bd,
        reports_over_time=reports_over_time,
        top_organizations=top_organizations,
    )
