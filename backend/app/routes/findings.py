"""
Findings API routes for Lifecycle, Collaboration & Compliance Operations.
"""
from __future__ import annotations

import csv
import io
import logging
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, or_, func, case
from sqlalchemy.orm import Session

from app.compliance.models import ComplianceReport, ReportFinding, FindingComment, FindingResolutionHistory
from app.db.models.document import Document
from app.db.models.regulation import Regulation
from app.db.models.remediation import FindingRemediation, RemediationEvidence, RemediationCycle
from app.schemas.compliance_management_report import ComplianceManagementReportResponse
from app.services.compliance_management_report_service import build_compliance_management_report
from app.services.pdf_management_report_service import generate_management_report_pdf
from app.core.dependencies import get_current_user
from app.core.rbac_dependencies import is_org_admin, is_org_analyst_or_admin, get_user_org_role, ROLE_RANK
from app.db.models import User, Organization
from app.db.models.rbac import OrganizationMember, MemberStatus, UserRole
from app.db.models.activity import Activity
from app.db.session import get_db
from app.schemas.remediation import FindingResolutionProofResponse, FindingVerificationSummary, RemediationEvidenceResponse
from app.schemas.finding import (
    FindingActivityActor,
    FindingActivityItem,
    FindingActivityPaginatedResponse,
    FindingAssignRequest,
    FindingAssigneeResponse,
    FindingCommentCreateRequest,
    FindingCommentResolveRequest,
    FindingCommentResponse,
    FindingItemResponse,
    FindingPaginatedResponse,
    FindingRejectRequest,
    FindingReopenRequest,
    FindingResolutionHistoryItem,
    FindingResolveRequest,
    FindingStatusUpdateRequest,
    FindingUpdateRequest,
    FindingSubmitReviewRequest,
    FindingRemediationUpdateRequest,
    FindingReassessmentDetailResponse,
    FindingReassessmentKeepResolvedRequest,
    FindingReassessmentTriggerRequest,
    FindingPreviousResolutionSummary,
    FindingCandidateAnalysisSummary,
    FindingAnalyticsResponse,
    ComplianceHealthSummary,
    StatusDistributionItem,
    SeverityDistributionItem,
    FindingTrendPoint,
    ResolutionTrendPoint,
    RemediationPerformanceMetrics,
    HighRiskFindingItem,
    AgingFindingItem,
)
from app.services import audit_service
from app.services.activity_service import log_activity
from app.services.notification_service import create_notification, notify_finding_stakeholders

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/findings", tags=["findings"])


@router.get(
    "",
    response_model=FindingPaginatedResponse,
    summary="List all organization findings (paginated with search and filters)",
)
@router.get(
    "/",
    response_model=FindingPaginatedResponse,
    include_in_schema=False,
)
def list_findings(
    organization_id: Optional[uuid.UUID] = Query(None, description="Organization UUID (optional; defaults to user accessible organizations)"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(25, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search term across reasoning, recommendation, citation, clause IDs"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by compliance status: COMPLIANT, NON_COMPLIANT, PARTIALLY_COMPLIANT"),
    lifecycle_status: Optional[str] = Query(None, description="Filter by lifecycle status: OPEN, IN_REVIEW, REMEDIATION, POTENTIAL_FALSE_POSITIVE, ADMIN_REVIEW, RESOLVED, REOPENED, REJECTED"),
    severity: Optional[str] = Query(None, description="Filter by severity: CRITICAL, HIGH, MEDIUM, LOW"),
    assigned_to: Optional[str] = Query(None, description="Filter by assignee: 'me', 'unassigned', or user UUID"),
    policy_document_id: Optional[uuid.UUID] = Query(None, description="Filter by policy document UUID"),
    regulation_id: Optional[uuid.UUID] = Query(None, description="Filter by regulation UUID"),
    report_id: Optional[uuid.UUID] = Query(None, description="Filter by report UUID"),
    overdue_only: bool = Query(False, description="Filter overdue findings only"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingPaginatedResponse:
    """
    List all findings for an organization with pagination, full-text search, and multi-faceted filters.
    Requires active membership or ownership in the requested organization.
    """
    if organization_id:
        target_org = db.get(Organization, organization_id)
        if not target_org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization with ID '{organization_id}' not found.",
            )

        # Verify access authorization
        is_creator = target_org.created_by == current_user.id
        is_active_member = db.scalar(
            select(func.count(OrganizationMember.id)).where(
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            )
        ) > 0

        if not is_creator and not is_active_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this organization's findings.",
            )
        target_org_ids = [organization_id]
    else:
        member_org_ids = db.scalars(
            select(OrganizationMember.organization_id).where(
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            )
        ).all()
        created_org_ids = db.scalars(
            select(Organization.id).where(Organization.created_by == current_user.id)
        ).all()
        target_org_ids = list(set(member_org_ids) | set(created_org_ids))

    if not target_org_ids:
        return FindingPaginatedResponse(
            total=0,
            page=page,
            page_size=page_size,
            total_pages=1,
            items=[],
        )

    # Build query joined on ComplianceReport for multi-tenant scoping
    query = (
        select(ReportFinding)
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(
            ComplianceReport.organization_id.in_(target_org_ids),
            or_(ComplianceReport.is_deleted == False, ComplianceReport.is_deleted.is_(None)),
        )
    )

    if policy_document_id:
        query = query.where(ComplianceReport.policy_document_id == policy_document_id)
    if regulation_id:
        query = query.where(ComplianceReport.regulation_id == regulation_id)
    if report_id:
        query = query.where(ComplianceReport.id == report_id)

    # Assignee filtering
    if assigned_to:
        val = assigned_to.strip().lower()
        if val == "me":
            query = query.where(ReportFinding.assigned_to == current_user.id)
        elif val == "unassigned":
            query = query.where(ReportFinding.assigned_to.is_(None))
        else:
            try:
                assignee_uuid = uuid.UUID(assigned_to.strip())
                query = query.where(ReportFinding.assigned_to == assignee_uuid)
            except ValueError:
                pass

    if status_filter and status_filter.upper() != "ALL":
        query = query.where(ReportFinding.status == status_filter.upper())

    if lifecycle_status and lifecycle_status.upper() != "ALL":
        target_status = lifecycle_status.upper()
        if target_status == "REMEDIATION":
            query = query.where(ReportFinding.lifecycle_status.in_(["REMEDIATION", "REMEDIATION_REQUIRED"]))
        elif target_status == "REMEDIATION_REQUIRED":
            query = query.where(ReportFinding.lifecycle_status.in_(["REMEDIATION", "REMEDIATION_REQUIRED"]))
        else:
            query = query.where(ReportFinding.lifecycle_status == target_status)

    if severity and severity.upper() != "ALL":
        query = query.where(ReportFinding.severity == severity.upper())

    if overdue_only:
        now_utc = datetime.now(timezone.utc)
        query = query.where(
            ReportFinding.remediation_due_date.is_not(None),
            ReportFinding.remediation_due_date < now_utc,
            ReportFinding.lifecycle_status != "RESOLVED",
        )

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                ReportFinding.reasoning.ilike(term),
                ReportFinding.recommendation.ilike(term),
                ReportFinding.citation.ilike(term),
                ReportFinding.policy_clause_id.ilike(term),
                ReportFinding.regulation_clause_id.ilike(term),
            )
        )

    # Count total matching findings
    count_query = select(func.count()).select_from(query.subquery())
    total = db.scalar(count_query) or 0

    total_pages = max(1, (total + page_size - 1) // page_size)
    offset = (page - 1) * page_size

    query = query.order_by(ReportFinding.updated_at.desc(), ReportFinding.created_at.desc()).offset(offset).limit(page_size)
    findings = db.scalars(query).all()

    items = [_format_finding_response(db, f) for f in findings]
    return FindingPaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        items=items,
    )


@router.get(
    "/analytics",
    response_model=FindingAnalyticsResponse,
    summary="Get organization-scoped Finding Analytics, Trends & Compliance Health (Sprint 7.11)",
)
def get_finding_analytics(
    organization_id: Optional[uuid.UUID] = Query(None, description="Organization UUID (optional; defaults to user's active organization)"),
    date_range: Optional[str] = Query("all", description="Date range: '7d', '30d', '90d', 'this_year', 'all', 'custom'"),
    from_date: Optional[datetime] = Query(None, description="Custom start date timestamp"),
    to_date: Optional[datetime] = Query(None, description="Custom end date timestamp"),
    policy_document_id: Optional[uuid.UUID] = Query(None, description="Filter by policy document UUID"),
    regulation_id: Optional[uuid.UUID] = Query(None, description="Filter by regulation UUID"),
    severity: Optional[str] = Query(None, description="Filter by severity: CRITICAL, HIGH, MEDIUM, LOW"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status: COMPLIANT, NON_COMPLIANT, etc."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingAnalyticsResponse:
    """
    Returns lightweight, database-aggregated Finding Analytics, Trends, and Compliance Health
    for the authenticated user's organization.
    Enforces strict tenant isolation and deterministic SQL aggregations without data fabrication.
    """
    if organization_id:
        target_org = db.get(Organization, organization_id)
        if not target_org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization with ID '{organization_id}' not found.",
            )

        is_creator = target_org.created_by == current_user.id
        is_active_member = db.scalar(
            select(func.count(OrganizationMember.id)).where(
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            )
        ) > 0

        if not is_creator and not is_active_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this organization's finding analytics.",
            )
        target_org_id = target_org.id
        target_org_name = target_org.name
    else:
        member_org = db.scalar(
            select(Organization)
            .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
            .where(
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            )
        )
        if not member_org:
            member_org = db.scalar(
                select(Organization).where(Organization.created_by == current_user.id)
            )

        if not member_org:
            return FindingAnalyticsResponse(
                organization_id="",
                organization_name="",
                date_range_applied=date_range or "all",
                health_summary=ComplianceHealthSummary(
                    total_findings=0,
                    open_findings=0,
                    critical_count=0,
                    high_count=0,
                    medium_count=0,
                    low_count=0,
                    in_review=0,
                    in_remediation=0,
                    reassessment_required=0,
                    resolved=0,
                    reopened_count=0,
                    summary_bullets=["No compliance Findings yet."],
                ),
                status_distribution=[],
                severity_distribution=[],
                open_finding_trend=[],
                resolution_trend=[],
                remediation_performance=RemediationPerformanceMetrics(),
                high_risk_findings=[],
                aging_findings=[],
                needs_reassessment_count=0,
                reopened_findings_count=0,
            )
        target_org_id = member_org.id
        target_org_name = member_org.name

    # 1. Parse Date Range
    now_utc = datetime.now(timezone.utc)
    start_dt: Optional[datetime] = None
    end_dt: Optional[datetime] = None
    applied_range = (date_range or "all").lower()

    if applied_range == "7d":
        start_dt = now_utc - timedelta(days=7)
    elif applied_range == "30d":
        start_dt = now_utc - timedelta(days=30)
    elif applied_range == "90d":
        start_dt = now_utc - timedelta(days=90)
    elif applied_range == "this_year":
        start_dt = datetime(now_utc.year, 1, 1, tzinfo=timezone.utc)
    elif applied_range == "custom":
        start_dt = from_date
        end_dt = to_date

    # 2. Build Base Where Clause
    base_where = [
        ComplianceReport.organization_id == target_org_id,
        ReportFinding.report_id == ComplianceReport.id,
    ]
    if policy_document_id:
        base_where.append(ComplianceReport.policy_document_id == policy_document_id)
    if regulation_id:
        base_where.append(ComplianceReport.regulation_id == regulation_id)
    if severity:
        base_where.append(ReportFinding.severity == severity.upper())
    if status_filter:
        st_up = status_filter.upper()
        base_where.append(or_(ReportFinding.status == st_up, ReportFinding.lifecycle_status == st_up))
    if start_dt:
        base_where.append(ReportFinding.created_at >= start_dt)
    if end_dt:
        base_where.append(ReportFinding.created_at <= end_dt)

    # 3. Status Distribution & Counts (Database SQL Aggregation)
    status_rows = db.execute(
        select(ReportFinding.lifecycle_status, func.count(ReportFinding.id))
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(*base_where)
        .group_by(ReportFinding.lifecycle_status)
    ).all()
    status_map = {row[0] or "OPEN": row[1] for row in status_rows}

    # 4. Severity Distribution (Database SQL Aggregation)
    sev_rows = db.execute(
        select(ReportFinding.severity, func.count(ReportFinding.id))
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(*base_where)
        .group_by(ReportFinding.severity)
    ).all()
    sev_map = {row[0] or "LOW": row[1] for row in sev_rows}

    total_findings = sum(status_map.values())
    open_findings = status_map.get("OPEN", 0) + status_map.get("REOPENED", 0)
    in_review = status_map.get("IN_REVIEW", 0) + status_map.get("ADMIN_REVIEW", 0)
    in_remediation = status_map.get("REMEDIATION", 0) + status_map.get("REMEDIATION_REQUIRED", 0)
    reassessment_required = status_map.get("REASSESSMENT_REQUIRED", 0)
    resolved = status_map.get("RESOLVED", 0)
    reopened_count = status_map.get("REOPENED", 0)

    critical_count = sev_map.get("CRITICAL", 0)
    high_count = sev_map.get("HIGH", 0)
    medium_count = sev_map.get("MEDIUM", 0)
    low_count = sev_map.get("LOW", 0)

    summary_bullets: List[str] = []
    if total_findings == 0:
        summary_bullets.append("No compliance Findings yet.")
    else:
        summary_bullets.append(f"✓ {resolved} Findings resolved")
        summary_bullets.append(f"⚠ {in_remediation} Findings under remediation")
        if reassessment_required > 0:
            summary_bullets.append(f"⚠ {reassessment_required} Findings require reassessment")
        if critical_count > 0:
            summary_bullets.append(f"🔴 {critical_count} Critical Findings remain open")
        elif high_count > 0:
            summary_bullets.append(f"🟠 {high_count} High Severity Findings")

    health_summary = ComplianceHealthSummary(
        total_findings=total_findings,
        open_findings=open_findings,
        critical_count=critical_count,
        high_count=high_count,
        medium_count=medium_count,
        low_count=low_count,
        in_review=in_review,
        in_remediation=in_remediation,
        reassessment_required=reassessment_required,
        resolved=resolved,
        reopened_count=reopened_count,
        summary_bullets=summary_bullets,
    )

    status_distribution = [
        StatusDistributionItem(status="OPEN", label="Open", count=status_map.get("OPEN", 0)),
        StatusDistributionItem(status="IN_REVIEW", label="Under Review", count=in_review),
        StatusDistributionItem(status="REMEDIATION", label="In Remediation", count=in_remediation),
        StatusDistributionItem(status="REASSESSMENT_REQUIRED", label="Needs Reassessment", count=reassessment_required),
        StatusDistributionItem(status="RESOLVED", label="Resolved", count=resolved),
        StatusDistributionItem(status="REOPENED", label="Reopened", count=reopened_count),
        StatusDistributionItem(status="REJECTED", label="False Positive / Rejected", count=status_map.get("REJECTED", 0) + status_map.get("POTENTIAL_FALSE_POSITIVE", 0)),
    ]

    severity_distribution = [
        SeverityDistributionItem(severity="CRITICAL", label="Critical", count=critical_count),
        SeverityDistributionItem(severity="HIGH", label="High", count=high_count),
        SeverityDistributionItem(severity="MEDIUM", label="Medium", count=medium_count),
        SeverityDistributionItem(severity="LOW", label="Low", count=low_count),
    ]

    # 5. Open Finding & Resolution Trends (Database Timestamps)
    finding_created_dates = db.scalars(
        select(ReportFinding.created_at)
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(*base_where)
        .order_by(ReportFinding.created_at.asc())
    ).all()

    resolution_dates = db.scalars(
        select(FindingResolutionHistory.resolved_at)
        .join(ReportFinding, FindingResolutionHistory.finding_id == ReportFinding.id)
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(
            ComplianceReport.organization_id == target_org_id,
            FindingResolutionHistory.resolved_at.isnot(None),
        )
        .order_by(FindingResolutionHistory.resolved_at.asc())
    ).all()

    created_by_period: Dict[str, int] = defaultdict(int)
    resolved_by_period: Dict[str, int] = defaultdict(int)
    period_labels: Dict[str, str] = {}

    use_daily = applied_range in ("7d", "30d")

    for dt in finding_created_dates:
        if not dt:
            continue
        if use_daily:
            p = dt.strftime("%Y-%m-%d")
            lbl = dt.strftime("%d %b")
        else:
            p = dt.strftime("%Y-%m")
            lbl = dt.strftime("%b %Y")
        created_by_period[p] += 1
        period_labels[p] = lbl

    for dt in resolution_dates:
        if not dt:
            continue
        if use_daily:
            p = dt.strftime("%Y-%m-%d")
            lbl = dt.strftime("%d %b")
        else:
            p = dt.strftime("%Y-%m")
            lbl = dt.strftime("%b %Y")
        resolved_by_period[p] += 1
        period_labels[p] = lbl

    sorted_periods = sorted(period_labels.keys())
    open_finding_trend: List[FindingTrendPoint] = []
    resolution_trend: List[ResolutionTrendPoint] = []

    if sorted_periods:
        cumulative_created = 0
        cumulative_resolved = 0
        for p in sorted_periods:
            c = created_by_period.get(p, 0)
            r = resolved_by_period.get(p, 0)
            cumulative_created += c
            cumulative_resolved += r
            snapshot = max(0, cumulative_created - cumulative_resolved)
            open_finding_trend.append(
                FindingTrendPoint(
                    period=p,
                    label=period_labels[p],
                    created_count=c,
                    open_snapshot=snapshot,
                )
            )
            resolution_trend.append(
                ResolutionTrendPoint(
                    period=p,
                    label=period_labels[p],
                    created_count=c,
                    resolved_count=r,
                )
            )

    # 6. Remediation Performance (Database Records)
    resolutions = db.scalars(
        select(FindingResolutionHistory)
        .join(ReportFinding, FindingResolutionHistory.finding_id == ReportFinding.id)
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(ComplianceReport.organization_id == target_org_id)
    ).all()

    approved_cycles = [r.approved_cycle_number or 1 for r in resolutions if r.approved_cycle_number]
    avg_cycles = round(sum(approved_cycles) / len(approved_cycles), 1) if approved_cycles else (1.0 if resolved > 0 else 0.0)
    first_cycle_count = sum(1 for c in approved_cycles if c == 1)
    multi_cycle_count = sum(1 for c in approved_cycles if c > 1)

    rejected_cycles_count = db.scalar(
        select(func.count(RemediationCycle.id))
        .join(FindingRemediation, RemediationCycle.remediation_id == FindingRemediation.id)
        .join(ReportFinding, FindingRemediation.finding_id == ReportFinding.id)
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(ComplianceReport.organization_id == target_org_id, RemediationCycle.status == "REJECTED")
    ) or 0

    rem_status_rows = db.execute(
        select(FindingRemediation.status, func.count(FindingRemediation.id))
        .join(ReportFinding, FindingRemediation.finding_id == ReportFinding.id)
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(ComplianceReport.organization_id == target_org_id)
        .group_by(FindingRemediation.status)
    ).all()
    rem_status_map = {row[0]: row[1] for row in rem_status_rows}

    remediation_performance = RemediationPerformanceMetrics(
        average_cycles_per_resolved=avg_cycles,
        resolved_first_cycle_count=first_cycle_count,
        resolved_multiple_cycles_count=multi_cycle_count,
        rejected_remediation_count=rejected_cycles_count,
        pending_remediation_count=rem_status_map.get("NOT_STARTED", 0) + rem_status_map.get("IN_PROGRESS", 0),
        verified_remediation_count=rem_status_map.get("VERIFIED", 0) + rem_status_map.get("READY_FOR_REVIEW", 0),
        approved_remediation_count=rem_status_map.get("APPROVED", 0),
    )

    # 7. High-Risk Findings (Top 5 Unresolved by Severity & Age)
    sev_sort = case(
        (ReportFinding.severity == "CRITICAL", 1),
        (ReportFinding.severity == "HIGH", 2),
        (ReportFinding.severity == "MEDIUM", 3),
        else_=4,
    )
    high_risk_rows = db.scalars(
        select(ReportFinding)
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(
            *base_where,
            ReportFinding.lifecycle_status.notin_(["RESOLVED", "REJECTED"]),
        )
        .order_by(sev_sort, ReportFinding.created_at.asc())
        .limit(5)
    ).all()

    high_risk_findings: List[HighRiskFindingItem] = []
    now = datetime.now(timezone.utc)
    for f in high_risk_rows:
        c_at = f.created_at if f.created_at and f.created_at.tzinfo else (f.created_at.replace(tzinfo=timezone.utc) if f.created_at else now)
        age = max(0, (now - c_at).days)
        high_risk_findings.append(
            HighRiskFindingItem(
                id=str(f.id),
                report_id=str(f.report_id),
                clause_id=f.regulation_clause_id or f.policy_clause_id,
                severity=f.severity or "HIGH",
                status=f.status or "NON_COMPLIANT",
                lifecycle_status=f.lifecycle_status or "OPEN",
                reasoning=f.reasoning,
                age_days=age,
                created_at=c_at,
                remediation_due_date=f.remediation_due_date,
                is_reopened=f.lifecycle_status == "REOPENED",
            )
        )

    # 8. Aging Findings (Top 5 Oldest Unresolved)
    aging_rows = db.scalars(
        select(ReportFinding)
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(
            *base_where,
            ReportFinding.lifecycle_status.notin_(["RESOLVED", "REJECTED"]),
        )
        .order_by(ReportFinding.created_at.asc())
        .limit(5)
    ).all()

    aging_findings: List[AgingFindingItem] = []
    for f in aging_rows:
        c_at = f.created_at if f.created_at and f.created_at.tzinfo else (f.created_at.replace(tzinfo=timezone.utc) if f.created_at else now)
        age = max(0, (now - c_at).days)
        aging_findings.append(
            AgingFindingItem(
                id=str(f.id),
                report_id=str(f.report_id),
                clause_id=f.regulation_clause_id or f.policy_clause_id,
                severity=f.severity or "HIGH",
                lifecycle_status=f.lifecycle_status or "OPEN",
                age_days=age,
                created_at=c_at,
                is_reopened=f.lifecycle_status == "REOPENED",
                reopened_at=f.reopened_at,
            )
        )

    return FindingAnalyticsResponse(
        organization_id=str(target_org_id),
        organization_name=target_org_name,
        date_range_applied=applied_range,
        from_date=start_dt,
        to_date=end_dt,
        health_summary=health_summary,
        status_distribution=status_distribution,
        severity_distribution=severity_distribution,
        open_finding_trend=open_finding_trend,
        resolution_trend=resolution_trend,
        remediation_performance=remediation_performance,
        high_risk_findings=high_risk_findings,
        aging_findings=aging_findings,
        needs_reassessment_count=reassessment_required,
        reopened_findings_count=reopened_count,
    )


@router.get(
    "/my-work",
    response_model=List[FindingItemResponse],
    summary="Get findings assigned to the authenticated user",
)
def get_my_work_findings(
    organization_id: Optional[uuid.UUID] = Query(None, description="Optional Organization UUID filter"),
    lifecycle_status: Optional[str] = Query(None, description="Optional lifecycle status filter"),
    severity: Optional[str] = Query(None, description="Optional severity filter"),
    overdue_only: bool = Query(False, description="Filter overdue findings only"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[FindingItemResponse]:
    """
    Retrieves real findings assigned to the authenticated user within their active organization.
    """
    if organization_id:
        target_org = db.get(Organization, organization_id)
        if not target_org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization with ID '{organization_id}' not found.",
            )
        is_creator = target_org.created_by == current_user.id
        is_active_member = db.scalar(
            select(func.count(OrganizationMember.id)).where(
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            )
        ) > 0
        if not is_creator and not is_active_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this organization's findings.",
            )
        target_org_ids = [organization_id]
    else:
        member_org_ids = db.scalars(
            select(OrganizationMember.organization_id).where(
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            )
        ).all()
        created_org_ids = db.scalars(
            select(Organization.id).where(Organization.created_by == current_user.id)
        ).all()
        target_org_ids = list(set(member_org_ids) | set(created_org_ids))

    if not target_org_ids:
        return []

    query = (
        select(ReportFinding)
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(
            ComplianceReport.organization_id.in_(target_org_ids),
            ReportFinding.assigned_to == current_user.id,
            or_(ComplianceReport.is_deleted == False, ComplianceReport.is_deleted.is_(None)),
        )
    )

    if lifecycle_status and lifecycle_status.upper() != "ALL":
        target_status = lifecycle_status.upper()
        if target_status in ("REMEDIATION", "REMEDIATION_REQUIRED"):
            query = query.where(ReportFinding.lifecycle_status.in_(["REMEDIATION", "REMEDIATION_REQUIRED"]))
        else:
            query = query.where(ReportFinding.lifecycle_status == target_status)

    if severity and severity.upper() != "ALL":
        query = query.where(ReportFinding.severity == severity.upper())

    if overdue_only:
        now_utc = datetime.now(timezone.utc)
        query = query.where(
            ReportFinding.remediation_due_date.is_not(None),
            ReportFinding.remediation_due_date < now_utc,
            ReportFinding.lifecycle_status != "RESOLVED",
        )

    query = query.order_by(ReportFinding.updated_at.desc(), ReportFinding.created_at.desc())
    findings = db.scalars(query).all()
    return [_format_finding_response(db, f) for f in findings]


# ── Sprint 7.12: Finding Export & Compliance Audit Reports ──────────────────

FINDING_EXPORT_CSV_COLUMNS = [
    "Finding ID",
    "Title",
    "Description",
    "Severity",
    "Compliance Status",
    "Lifecycle Status",
    "Organization",
    "Policy Document",
    "Policy ID",
    "Policy Clause",
    "Regulation",
    "Regulation ID",
    "Regulation Clause",
    "Citation",
    "Assignee",
    "Current Remediation Cycle",
    "Remediation Status",
    "Remediation Priority",
    "Remediation Due Date",
    "Remediation Cycle Summary",
    "Verification Status",
    "Verified By",
    "Verified At",
    "Verification Note",
    "Evidence",
    "Resolved",
    "Resolved By",
    "Resolved At",
    "Resolution Note",
    "Reopened",
    "Reopened By",
    "Reopened At",
    "Reopen Reason",
    "Reassessment Required",
    "Reassessment Trigger",
    "Reassessment Reason",
    "Reassessment Detected At",
    "Activity Summary",
    "Created At",
    "Updated At",
]


def _sanitize_csv_cell(val: Any) -> str:
    """Sanitize CSV cell content against formula injection vulnerabilities (Sprint 7.12)."""
    if val is None:
        return ""
    if isinstance(val, bool):
        return "true" if val else "false"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, datetime):
        return val.isoformat()
    s = str(val).strip()
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + s
    return s


def generate_findings_csv_rows(db: Session, findings: list[ReportFinding], target_org: Optional[Organization] = None):
    """Generator streaming CSV rows for findings with formula injection protection."""
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")

    # Header row
    writer.writerow(FINDING_EXPORT_CSV_COLUMNS)
    yield output.getvalue()
    output.seek(0)
    output.truncate(0)

    for finding in findings:
        report = db.get(ComplianceReport, finding.report_id)
        org = target_org or (db.get(Organization, report.organization_id) if report else None)

        # Policy document details
        policy_doc_name = ""
        policy_doc_id = ""
        if report and report.policy_document:
            policy_doc_name = report.policy_document.original_filename or report.policy_document.title or ""
            policy_doc_id = str(report.policy_document_id) if report.policy_document_id else ""
        elif report and report.policy_document_id:
            policy_doc_id = str(report.policy_document_id)
            doc = db.get(Document, report.policy_document_id)
            if doc:
                policy_doc_name = doc.original_filename or doc.title or ""

        # Regulation details
        reg_name = ""
        reg_id = ""
        if report and report.regulation:
            reg_name = getattr(report.regulation, "title", None) or getattr(report.regulation, "act_name", None) or getattr(report.regulation, "name", None) or ""
            reg_id = str(report.regulation_id) if report.regulation_id else ""
        elif report and report.regulation_id:
            reg_id = str(report.regulation_id)
            reg = db.get(Regulation, report.regulation_id)
            if reg:
                reg_name = getattr(reg, "title", None) or getattr(reg, "act_name", None) or getattr(reg, "name", None) or ""

        # Assignee
        assignee_name = ""
        if finding.assigned_to:
            assignee_user = getattr(finding, "assignee", None) or db.get(User, finding.assigned_to)
            if assignee_user:
                assignee_name = assignee_user.full_name or assignee_user.username or assignee_user.email or ""

        # Remediation
        remediation = (
            db.query(FindingRemediation)
            .filter(FindingRemediation.finding_id == finding.id)
            .first()
        )
        current_cycle = ""
        remediation_status = ""
        remediation_priority = ""
        remediation_due = ""
        cycle_summary = ""
        verification_status = ""
        verified_by_name = ""
        verified_at_str = ""
        verification_note = ""
        evidence_str = ""

        if remediation:
            remediation_status = remediation.status or ""
            remediation_priority = remediation.priority or ""
            if remediation.due_date:
                remediation_due = remediation.due_date.isoformat()
            elif finding.remediation_due_date:
                remediation_due = finding.remediation_due_date.isoformat()

            # Query remediation cycles
            cycles = (
                db.query(RemediationCycle)
                .filter(RemediationCycle.remediation_id == remediation.id)
                .order_by(RemediationCycle.cycle_number.asc())
                .all()
            )
            if cycles:
                current_cycle = str(cycles[-1].cycle_number)
                cycle_summary = "; ".join([f"Cycle {c.cycle_number}: {c.status}" for c in cycles])

            # Verification info
            if remediation.status in ("VERIFIED", "APPROVED") or remediation.verified_at:
                verification_status = "VERIFIED"
            elif remediation.status == "REJECTED":
                verification_status = "REJECTED"
            elif remediation.status == "SUBMITTED":
                verification_status = "SUBMITTED"
            elif remediation.status:
                verification_status = remediation.status

            if remediation.verified_by:
                v_user = getattr(remediation, "verifier", None) or db.get(User, remediation.verified_by)
                if v_user:
                    verified_by_name = v_user.full_name or v_user.username or ""
            if remediation.verified_at:
                verified_at_str = remediation.verified_at.isoformat()
            if remediation.verification_note:
                verification_note = remediation.verification_note

            # Evidence items
            evidence_items = (
                db.query(RemediationEvidence)
                .filter(RemediationEvidence.remediation_id == remediation.id)
                .all()
            )
            if evidence_items:
                evidence_str = "; ".join([e.original_filename for e in evidence_items if e.original_filename])

        elif finding.remediation_due_date:
            remediation_due = finding.remediation_due_date.isoformat()

        # Resolution info
        resolved_flag = "false"
        resolved_by_name = ""
        resolved_at_str = ""
        resolution_note = ""

        if finding.resolved_at or (finding.lifecycle_status or "").upper() == "RESOLVED":
            resolved_flag = "true"
            if finding.resolved_by:
                res_user = getattr(finding, "resolver", None) or db.get(User, finding.resolved_by)
                if res_user:
                    resolved_by_name = res_user.full_name or res_user.username or ""
            if finding.resolved_at:
                resolved_at_str = finding.resolved_at.isoformat()
            if finding.resolution_note:
                resolution_note = finding.resolution_note

        # Reopening info
        reopened_flag = "false"
        reopened_by_name = ""
        reopened_at_str = ""
        reopen_reason = ""

        if finding.reopened_at or finding.reopened_by or (finding.lifecycle_status or "").upper() == "REOPENED":
            reopened_flag = "true"
            if finding.reopened_by:
                reop_user = getattr(finding, "reopener", None) or db.get(User, finding.reopened_by)
                if reop_user:
                    reopened_by_name = reop_user.full_name or reop_user.username or ""
            if finding.reopened_at:
                reopened_at_str = finding.reopened_at.isoformat()
            if finding.reopen_reason:
                reopen_reason = finding.reopen_reason

        # Reassessment info
        reassessment_req = "false"
        reassessment_trigger = ""
        reassessment_reason = ""
        reassessment_detected_at = ""

        if finding.reassessment_trigger or (finding.lifecycle_status or "").upper() == "REASSESSMENT_REQUIRED":
            reassessment_req = "true"
            reassessment_trigger = finding.reassessment_trigger or ""
            reassessment_reason = finding.reassessment_reason or ""
            if finding.reassessment_detected_at:
                reassessment_detected_at = finding.reassessment_detected_at.isoformat()

        # Activity summary
        events = ["Created"]
        if finding.assigned_to:
            events.append("Assigned")
        if remediation and remediation.status:
            events.append(f"Remediation ({remediation.status})")
        if verification_status and verification_status != "NOT_STARTED":
            events.append(f"Verification ({verification_status})")
        if resolved_flag == "true":
            events.append("Resolved")
        if reopened_flag == "true":
            events.append("Reopened")
        if reassessment_req == "true":
            events.append("Reassessment Required")
        activity_summary = " → ".join(events)

        title = f"Finding #{str(finding.id)[:8]} - Clause {finding.regulation_clause_id or finding.policy_clause_id or 'General'}"

        row = [
            _sanitize_csv_cell(str(finding.id)),
            _sanitize_csv_cell(title),
            _sanitize_csv_cell(finding.reasoning or ""),
            _sanitize_csv_cell(finding.severity or "MEDIUM"),
            _sanitize_csv_cell(finding.status or "NON_COMPLIANT"),
            _sanitize_csv_cell(finding.lifecycle_status or "OPEN"),
            _sanitize_csv_cell(org.name if org else ""),
            _sanitize_csv_cell(policy_doc_name),
            _sanitize_csv_cell(policy_doc_id),
            _sanitize_csv_cell(finding.policy_clause_id or ""),
            _sanitize_csv_cell(reg_name),
            _sanitize_csv_cell(reg_id),
            _sanitize_csv_cell(finding.regulation_clause_id or ""),
            _sanitize_csv_cell(finding.citation or ""),
            _sanitize_csv_cell(assignee_name),
            _sanitize_csv_cell(current_cycle),
            _sanitize_csv_cell(remediation_status),
            _sanitize_csv_cell(remediation_priority),
            _sanitize_csv_cell(remediation_due),
            _sanitize_csv_cell(cycle_summary),
            _sanitize_csv_cell(verification_status),
            _sanitize_csv_cell(verified_by_name),
            _sanitize_csv_cell(verified_at_str),
            _sanitize_csv_cell(verification_note),
            _sanitize_csv_cell(evidence_str),
            _sanitize_csv_cell(resolved_flag),
            _sanitize_csv_cell(resolved_by_name),
            _sanitize_csv_cell(resolved_at_str),
            _sanitize_csv_cell(resolution_note),
            _sanitize_csv_cell(reopened_flag),
            _sanitize_csv_cell(reopened_by_name),
            _sanitize_csv_cell(reopened_at_str),
            _sanitize_csv_cell(reopen_reason),
            _sanitize_csv_cell(reassessment_req),
            _sanitize_csv_cell(reassessment_trigger),
            _sanitize_csv_cell(reassessment_reason),
            _sanitize_csv_cell(reassessment_detected_at),
            _sanitize_csv_cell(activity_summary),
            _sanitize_csv_cell(finding.created_at.isoformat() if finding.created_at else ""),
            _sanitize_csv_cell((finding.updated_at or finding.created_at).isoformat() if (finding.updated_at or finding.created_at) else ""),
        ]
        writer.writerow(row)
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)


@router.get(
    "/export",
    summary="Export organization findings to CSV (Sprint 7.12)",
    response_class=StreamingResponse,
)
def export_findings(
    organization_id: Optional[uuid.UUID] = Query(None, description="Organization UUID (optional; defaults to user accessible organizations)"),
    search: Optional[str] = Query(None, description="Search term across reasoning, recommendation, citation, clause IDs"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by compliance status: COMPLIANT, NON_COMPLIANT, PARTIALLY_COMPLIANT"),
    lifecycle_status: Optional[str] = Query(None, description="Filter by lifecycle status: OPEN, IN_REVIEW, REMEDIATION, POTENTIAL_FALSE_POSITIVE, ADMIN_REVIEW, RESOLVED, REASSESSMENT_REQUIRED, REOPENED, REJECTED"),
    severity: Optional[str] = Query(None, description="Filter by severity: CRITICAL, HIGH, MEDIUM, LOW"),
    assigned_to: Optional[str] = Query(None, description="Filter by assignee: 'me', 'unassigned', or user UUID"),
    policy_document_id: Optional[uuid.UUID] = Query(None, description="Filter by policy document UUID"),
    regulation_id: Optional[uuid.UUID] = Query(None, description="Filter by regulation UUID"),
    report_id: Optional[uuid.UUID] = Query(None, description="Filter by report UUID"),
    overdue_only: bool = Query(False, description="Filter overdue findings only"),
    from_date: Optional[datetime] = Query(None, description="Filter findings created on or after this timestamp"),
    to_date: Optional[datetime] = Query(None, description="Filter findings created on or before this timestamp"),
    format: str = Query("csv", description="Export format (csv)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Export organization findings to a structured, formula-sanitized CSV file (Sprint 7.12).
    Enforces strict role permissions (Reviewer or higher) and organization isolation.
    """
    if format.lower() != "csv":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported export format. Supported formats: csv",
        )

    target_org = None
    if organization_id:
        target_org = db.get(Organization, organization_id)
        if not target_org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization with ID '{organization_id}' not found.",
            )

        # Verify access authorization
        is_creator = target_org.created_by == current_user.id
        is_active_member = db.scalar(
            select(func.count(OrganizationMember.id)).where(
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            )
        ) > 0

        if not is_creator and not is_active_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this organization's findings.",
            )

        # Role-based access control: Viewer / Employee cannot export
        user_role = get_user_org_role(db, current_user.id, organization_id)
        if ROLE_RANK.get(user_role, 0) < ROLE_RANK[UserRole.REVIEWER]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to export findings. Requires Reviewer role or higher.",
            )
        target_org_ids = [organization_id]
    else:
        # Default to user's accessible active organizations where user has export role
        member_orgs = db.execute(
            select(OrganizationMember.organization_id, OrganizationMember.role).where(
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            )
        ).all()
        created_org_ids = db.scalars(
            select(Organization.id).where(Organization.created_by == current_user.id)
        ).all()

        allowed_org_ids = set(created_org_ids)
        for org_id, role in member_orgs:
            if ROLE_RANK.get(role, 0) >= ROLE_RANK[UserRole.REVIEWER]:
                allowed_org_ids.add(org_id)

        if not allowed_org_ids:
            has_any_org = bool(member_orgs) or bool(created_org_ids)
            if has_any_org:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to export findings. Requires Reviewer role or higher.",
                )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to any organizations.",
            )
        target_org_ids = list(allowed_org_ids)
        if len(target_org_ids) == 1:
            target_org = db.get(Organization, target_org_ids[0])

    # Build query joined on ComplianceReport for multi-tenant scoping
    query = (
        select(ReportFinding)
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .where(
            ComplianceReport.organization_id.in_(target_org_ids),
            or_(ComplianceReport.is_deleted == False, ComplianceReport.is_deleted.is_(None)),
        )
    )

    if policy_document_id:
        query = query.where(ComplianceReport.policy_document_id == policy_document_id)
    if regulation_id:
        query = query.where(ComplianceReport.regulation_id == regulation_id)
    if report_id:
        query = query.where(ComplianceReport.id == report_id)

    # Assignee filtering
    if assigned_to:
        val = assigned_to.strip().lower()
        if val == "me":
            query = query.where(ReportFinding.assigned_to == current_user.id)
        elif val == "unassigned":
            query = query.where(ReportFinding.assigned_to.is_(None))
        else:
            try:
                assignee_uuid = uuid.UUID(assigned_to.strip())
                query = query.where(ReportFinding.assigned_to == assignee_uuid)
            except ValueError:
                pass

    if status_filter and status_filter.upper() != "ALL":
        query = query.where(ReportFinding.status == status_filter.upper())

    if lifecycle_status and lifecycle_status.upper() != "ALL":
        target_status = lifecycle_status.upper()
        if target_status in ("REMEDIATION", "REMEDIATION_REQUIRED"):
            query = query.where(ReportFinding.lifecycle_status.in_(["REMEDIATION", "REMEDIATION_REQUIRED"]))
        else:
            query = query.where(ReportFinding.lifecycle_status == target_status)

    if severity and severity.upper() != "ALL":
        query = query.where(ReportFinding.severity == severity.upper())

    if overdue_only:
        now_utc = datetime.now(timezone.utc)
        query = query.where(
            ReportFinding.remediation_due_date.is_not(None),
            ReportFinding.remediation_due_date < now_utc,
            ReportFinding.lifecycle_status != "RESOLVED",
        )

    if from_date:
        query = query.where(ReportFinding.created_at >= from_date)
    if to_date:
        query = query.where(ReportFinding.created_at <= to_date)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                ReportFinding.reasoning.ilike(term),
                ReportFinding.recommendation.ilike(term),
                ReportFinding.citation.ilike(term),
                ReportFinding.policy_clause_id.ilike(term),
                ReportFinding.regulation_clause_id.ilike(term),
            )
        )

    severity_order = case(
        (ReportFinding.severity == "CRITICAL", 1),
        (ReportFinding.severity == "HIGH", 2),
        (ReportFinding.severity == "MEDIUM", 3),
        (ReportFinding.severity == "LOW", 4),
        else_=5,
    )
    query = query.order_by(severity_order.asc(), ReportFinding.created_at.desc())
    findings = db.scalars(query).all()
    count = len(findings)

    # Format filename
    parts = ["lexisgraph-findings"]
    if severity and severity.upper() != "ALL":
        parts.append(severity.lower())
    if lifecycle_status and lifecycle_status.upper() != "ALL":
        parts.append(lifecycle_status.lower().replace("_", "-"))
    elif status_filter and status_filter.upper() != "ALL":
        parts.append(status_filter.lower().replace("_", "-"))
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    parts.append(date_str)
    filename = f'{"-".join(parts)}.csv'

    active_filters = {
        k: v for k, v in {
            "status": status_filter if status_filter and status_filter.upper() != "ALL" else None,
            "lifecycle_status": lifecycle_status if lifecycle_status and lifecycle_status.upper() != "ALL" else None,
            "severity": severity if severity and severity.upper() != "ALL" else None,
            "assigned_to": assigned_to if assigned_to and assigned_to.upper() != "ALL" else None,
            "policy_document_id": str(policy_document_id) if policy_document_id else None,
            "regulation_id": str(regulation_id) if regulation_id else None,
            "report_id": str(report_id) if report_id else None,
            "overdue_only": overdue_only if overdue_only else None,
            "search": search if search and search.strip() else None,
            "from_date": from_date.isoformat() if from_date else None,
            "to_date": to_date.isoformat() if to_date else None,
        }.items() if v is not None
    }

    log_org_id = target_org.id if target_org else (target_org_ids[0] if target_org_ids else None)
    log_org_name = target_org.name if target_org else "Authorized Organizations"

    log_activity(
        db,
        user_id=current_user.id,
        event_type="FINDINGS_EXPORTED",
        title="Findings Exported",
        description=f"Exported {count} findings for {log_org_name}.",
        icon_type="download",
        extra_data={
            "organization_id": str(log_org_id) if log_org_id else None,
            "count": count,
            "filters": active_filters,
            "filename": filename,
        },
    )

    if log_org_id:
        audit_service.log_audit_event(
            db,
            user_id=current_user.id,
            action="FINDINGS_EXPORTED",
            organization_id=log_org_id,
            entity="ReportFinding",
            entity_id=None,
        )

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": "text/csv; charset=utf-8",
        "X-Exported-Count": str(count),
        "Access-Control-Expose-Headers": "Content-Disposition, X-Exported-Count",
    }

    return StreamingResponse(
        generate_findings_csv_rows(db, findings, target_org),
        media_type="text/csv",
        headers=headers,
    )


# ── Sprint 7.14: Compliance Reports & Management Summary ──────────────────

def _resolve_and_authorize_report_org(
    db: Session,
    current_user: User,
    organization_id: Optional[uuid.UUID],
) -> tuple[Organization, str]:
    """Resolves target organization and enforces multi-tenant RBAC permissions."""
    if organization_id:
        target_org = db.get(Organization, organization_id)
        if not target_org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization with ID '{organization_id}' not found.",
            )
        is_creator = target_org.created_by == current_user.id
        is_active_member = db.scalar(
            select(func.count(OrganizationMember.id)).where(
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            )
        ) > 0

        if not is_creator and not is_active_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this organization's compliance reports.",
            )
    else:
        target_org = db.scalar(
            select(Organization)
            .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
            .where(
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            )
        )
        if not target_org:
            target_org = db.scalar(
                select(Organization).where(Organization.created_by == current_user.id)
            )
        if not target_org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No accessible active organization found.",
            )

    user_role = get_user_org_role(db, current_user.id, target_org.id)
    if ROLE_RANK.get(user_role, 0) < ROLE_RANK[UserRole.REVIEWER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to generate compliance reports. Requires Reviewer role or higher.",
        )

    role_label = user_role.value if hasattr(user_role, "value") else str(user_role)
    return target_org, role_label


@router.get(
    "/reports/compliance/summary",
    response_model=ComplianceManagementReportResponse,
    summary="Get management-level Compliance Report JSON summary (Sprint 7.14)",
)
def get_compliance_management_report_summary(
    organization_id: Optional[uuid.UUID] = Query(None, description="Organization UUID (optional; defaults to active org)"),
    date_range: Optional[str] = Query("all", description="Date range: '7d', '30d', '90d', 'this_year', 'all', 'custom'"),
    from_date: Optional[datetime] = Query(None, description="Custom start date timestamp"),
    to_date: Optional[datetime] = Query(None, description="Custom end date timestamp"),
    severity: Optional[str] = Query(None, description="Filter by severity: CRITICAL, HIGH, MEDIUM, LOW"),
    lifecycle_status: Optional[str] = Query(None, description="Filter by lifecycle status"),
    policy_document_id: Optional[uuid.UUID] = Query(None, description="Filter by policy document UUID"),
    regulation_id: Optional[uuid.UUID] = Query(None, description="Filter by regulation UUID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComplianceManagementReportResponse:
    """
    Returns structured JSON data for the executive Management Compliance Report (Sprint 7.14).
    Enforces server-side organization isolation and RBAC role gating.
    """
    target_org, role_label = _resolve_and_authorize_report_org(db, current_user, organization_id)

    report_response = build_compliance_management_report(
        db=db,
        organization=target_org,
        current_user=current_user,
        user_role_label=role_label,
        date_range=date_range,
        from_date=from_date,
        to_date=to_date,
        severity=severity,
        lifecycle_status=lifecycle_status,
        policy_document_id=policy_document_id,
        regulation_id=regulation_id,
    )
    return report_response


@router.get(
    "/reports/compliance/pdf",
    summary="Generate and download management-level Compliance Report PDF (Sprint 7.14)",
)
def get_compliance_management_report_pdf(
    organization_id: Optional[uuid.UUID] = Query(None, description="Organization UUID (optional; defaults to active org)"),
    date_range: Optional[str] = Query("all", description="Date range: '7d', '30d', '90d', 'this_year', 'all', 'custom'"),
    from_date: Optional[datetime] = Query(None, description="Custom start date timestamp"),
    to_date: Optional[datetime] = Query(None, description="Custom end date timestamp"),
    severity: Optional[str] = Query(None, description="Filter by severity: CRITICAL, HIGH, MEDIUM, LOW"),
    lifecycle_status: Optional[str] = Query(None, description="Filter by lifecycle status"),
    policy_document_id: Optional[uuid.UUID] = Query(None, description="Filter by policy document UUID"),
    regulation_id: Optional[uuid.UUID] = Query(None, description="Filter by regulation UUID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """
    Generates and streams a professional, multi-page A4 PDF compliance report (Sprint 7.14).
    Logs COMPLIANCE_REPORT_GENERATED in the immutable activity and audit trail.
    """
    target_org, role_label = _resolve_and_authorize_report_org(db, current_user, organization_id)

    report_response = build_compliance_management_report(
        db=db,
        organization=target_org,
        current_user=current_user,
        user_role_label=role_label,
        date_range=date_range,
        from_date=from_date,
        to_date=to_date,
        severity=severity,
        lifecycle_status=lifecycle_status,
        policy_document_id=policy_document_id,
        regulation_id=regulation_id,
    )

    pdf_bytes = generate_management_report_pdf(report_response)

    # Log report generation audit event
    log_activity(
        db,
        user_id=current_user.id,
        event_type="COMPLIANCE_REPORT_GENERATED",
        title="Compliance Report Generated",
        description=f"Generated compliance report for {target_org.name} ({report_response.reporting_period}).",
        icon_type="report",
        extra_data={
            "organization_id": str(target_org.id),
            "reporting_period": report_response.reporting_period,
            "total_findings": report_response.executive_metrics.total_findings,
            "applied_filters": report_response.applied_filters,
            "format": "pdf",
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="COMPLIANCE_REPORT_GENERATED",
        organization_id=target_org.id,
        entity="ComplianceReport",
        entity_id=None,
    )

    org_slug = re.sub(r"[^a-zA-Z0-9_-]", "_", target_org.name.lower())
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"compliance_report_{org_slug}_{timestamp}.pdf"

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": "application/pdf",
        "Access-Control-Expose-Headers": "Content-Disposition",
    }

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers=headers,
    )



def get_finding_and_verify_access(
    db: Session,
    finding_id: uuid.UUID,
    user: Optional[User],
    require_mutation: bool = False,
) -> tuple[ReportFinding, ComplianceReport, OrganizationMember | None]:
    """
    Retrieve finding by ID and verify user organization authorization.
    If require_mutation is True, ensures user is NOT a read-only VIEWER.
    """
    finding = db.get(ReportFinding, finding_id)
    if not finding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Finding with ID '{finding_id}' not found.",
        )

    report = db.get(ComplianceReport, finding.report_id)
    if not report or report.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated compliance report not found.",
        )

    if not user:
        return finding, report, None

    # Check org membership
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == report.organization_id,
        OrganizationMember.user_id == user.id,
        OrganizationMember.status == MemberStatus.ACTIVE,
    ).first()

    org = db.get(Organization, report.organization_id)
    is_owner = org and org.created_by == user.id

    if not member and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this organization's findings.",
        )

    if require_mutation:
        # Check role permission
        role_str = str(member.role.value if member and hasattr(member.role, "value") else (member.role if member else "ADMIN")).upper()
        if not is_owner and role_str in ("VIEWER", "EMPLOYEE"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Viewers have read-only access to finding lifecycle operations.",
            )

    return finding, report, member


def _format_finding_response(db: Session, finding: ReportFinding) -> FindingItemResponse:
    assignee_resp = None
    if finding.assigned_to:
        assignee_user = db.get(User, finding.assigned_to)
        if assignee_user:
            assignee_resp = FindingAssigneeResponse(
                id=str(assignee_user.id),
                full_name=assignee_user.full_name,
                email=assignee_user.email,
            )

    comments_cnt = db.query(FindingComment).filter(FindingComment.finding_id == finding.id).count()

    resolved_by_name = None
    if finding.resolved_by:
        resolver_user = getattr(finding, "resolver", None) or db.get(User, finding.resolved_by)
        if resolver_user:
            resolved_by_name = resolver_user.full_name

    reopened_by_name = None
    if finding.reopened_by:
        reopener_user = getattr(finding, "reopener", None) or db.get(User, finding.reopened_by)
        if reopener_user:
            reopened_by_name = reopener_user.full_name

    # Query multi-period resolution history
    db_resolutions = (
        db.query(FindingResolutionHistory)
        .filter(FindingResolutionHistory.finding_id == finding.id)
        .order_by(FindingResolutionHistory.resolution_number.asc())
        .all()
    )

    resolution_history_items: List[FindingResolutionHistoryItem] = []
    if db_resolutions:
        for r in db_resolutions:
            r_resolver_name = None
            if r.resolved_by:
                res_u = getattr(r, "resolver", None) or db.get(User, r.resolved_by)
                if res_u:
                    r_resolver_name = res_u.full_name

            r_reopener_name = None
            if r.reopened_by:
                reop_u = getattr(r, "reopener", None) or db.get(User, r.reopened_by)
                if reop_u:
                    r_reopener_name = reop_u.full_name

            resolution_history_items.append(
                FindingResolutionHistoryItem(
                    id=str(r.id),
                    finding_id=str(r.finding_id),
                    organization_id=str(r.organization_id) if r.organization_id else None,
                    resolution_number=r.resolution_number,
                    resolved_at=r.resolved_at,
                    resolved_by=str(r.resolved_by) if r.resolved_by else None,
                    resolved_by_name=r_resolver_name,
                    resolution_note=r.resolution_note,
                    reopened_at=r.reopened_at,
                    reopened_by=str(r.reopened_by) if r.reopened_by else None,
                    reopened_by_name=r_reopener_name,
                    reopen_reason=r.reopen_reason,
                    status=r.status,
                    created_at=r.created_at,
                )
            )
    elif finding.resolved_at:
        # Backward compatibility for findings resolved prior to Sprint 7.8
        resolution_history_items.append(
            FindingResolutionHistoryItem(
                id=str(finding.id),
                finding_id=str(finding.id),
                organization_id=None,
                resolution_number=1,
                resolved_at=finding.resolved_at,
                resolved_by=str(finding.resolved_by) if finding.resolved_by else None,
                resolved_by_name=resolved_by_name,
                resolution_note=finding.resolution_note,
                reopened_at=finding.reopened_at,
                reopened_by=str(finding.reopened_by) if finding.reopened_by else None,
                reopened_by_name=reopened_by_name,
                reopen_reason=finding.reopen_reason,
                status="REOPENED" if (finding.reopened_at or (finding.lifecycle_status or "").upper() == "REOPENED") else "RESOLVED",
                created_at=finding.resolved_at,
            )
        )

    now_utc = datetime.now(timezone.utc)
    due_dt = (
        finding.remediation_due_date.replace(tzinfo=timezone.utc)
        if (finding.remediation_due_date and finding.remediation_due_date.tzinfo is None)
        else finding.remediation_due_date
    )
    is_overdue = bool(
        due_dt
        and due_dt < now_utc
        and (finding.lifecycle_status or "OPEN").upper() != "RESOLVED"
    )

    report = db.get(ComplianceReport, finding.report_id)
    org_id_str = str(report.organization_id) if report else None

    return FindingItemResponse(
        id=str(finding.id),
        report_id=str(finding.report_id),
        policy_clause_id=finding.policy_clause_id,
        regulation_clause_id=finding.regulation_clause_id,
        status=finding.status,
        lifecycle_status=finding.lifecycle_status or "OPEN",
        confidence=finding.confidence,
        severity=finding.severity,
        reasoning=finding.reasoning,
        recommendation=finding.recommendation,
        citation=finding.citation,
        matched_policy_text=None,
        graph_path=finding.graph_path,
        assigned_to=str(finding.assigned_to) if finding.assigned_to else None,
        assignee=assignee_resp,
        resolution_note=finding.resolution_note,
        resolved_by=str(finding.resolved_by) if finding.resolved_by else None,
        resolved_by_name=resolved_by_name,
        resolved_at=finding.resolved_at,
        reopened_by=str(finding.reopened_by) if finding.reopened_by else None,
        reopened_by_name=reopened_by_name,
        reopened_at=finding.reopened_at,
        reopen_reason=finding.reopen_reason,
        reassessment_trigger=finding.reassessment_trigger,
        reassessment_reason=finding.reassessment_reason,
        reassessment_document_id=str(finding.reassessment_document_id) if finding.reassessment_document_id else None,
        reassessment_document_name=finding.reassessment_document_name,
        reassessment_report_id=str(finding.reassessment_report_id) if finding.reassessment_report_id else None,
        reassessment_detected_at=finding.reassessment_detected_at,
        remediation_due_date=finding.remediation_due_date,
        is_overdue=is_overdue,
        comments_count=comments_cnt,
        organization_id=org_id_str,
        resolution_history=resolution_history_items,
        created_at=finding.created_at,
        updated_at=finding.updated_at or finding.created_at,
    )


def _format_comment_response(
    db: Session,
    comment: FindingComment,
    all_comments_by_parent: Optional[dict[uuid.UUID, list[FindingComment]]] = None,
    org_id: Optional[uuid.UUID] = None,
) -> FindingCommentResponse:
    resolved_by_name = None
    if comment.resolved_by:
        resolver = comment.resolver or db.get(User, comment.resolved_by)
        if resolver:
            resolved_by_name = resolver.full_name

    user_role_str = None
    if org_id and comment.user_id:
        user_role_str = get_user_org_role(db, comment.user_id, org_id)

    replies_resp: List[FindingCommentResponse] = []
    if all_comments_by_parent is not None and comment.id in all_comments_by_parent:
        replies_resp = [
            _format_comment_response(db, r, all_comments_by_parent, org_id)
            for r in all_comments_by_parent[comment.id]
        ]
    elif comment.replies:
        replies_resp = [
            _format_comment_response(db, r, None, org_id)
            for r in comment.replies
        ]

    return FindingCommentResponse(
        id=str(comment.id),
        finding_id=str(comment.finding_id),
        user_id=str(comment.user_id),
        user_name=comment.user.full_name if comment.user else "Team Member",
        user_email=comment.user.email if comment.user else "",
        user_role=user_role_str,
        content=comment.content,
        parent_id=str(comment.parent_id) if comment.parent_id else None,
        is_resolved=comment.is_resolved or False,
        resolved_by=str(comment.resolved_by) if comment.resolved_by else None,
        resolved_by_name=resolved_by_name,
        resolved_at=comment.resolved_at,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        replies=replies_resp,
    )


@router.get(
    "/{finding_id}",
    response_model=FindingItemResponse,
    summary="Get single finding by ID",
)
def get_finding(
    finding_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
) -> FindingItemResponse:
    """Retrieve detailed finding by ID with authorization check."""
    finding, _, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=False)
    return _format_finding_response(db, finding)


@router.patch(
    "/{finding_id}",
    response_model=FindingItemResponse,
    summary="Update finding details (severity, reasoning, recommendation, citation, confidence)",
)
def update_finding(
    finding_id: uuid.UUID,
    data: FindingUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingItemResponse:
    """Update finding details with field-level delta audit logging. Requires Analyst or Admin role."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    if not is_org_analyst_or_admin(db, current_user.id, report.organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Compliance Analysts and Administrators are permitted to edit finding details.",
        )

    changes: Dict[str, Dict[str, Any]] = {}
    now_utc = datetime.now(timezone.utc)

    if data.severity is not None:
        sev = data.severity.strip().upper()
        if sev not in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid severity '{data.severity}'. Allowed: CRITICAL, HIGH, MEDIUM, LOW",
            )
        if (finding.severity or "").upper() != sev:
            changes["severity"] = {"old": finding.severity, "new": sev}
            finding.severity = sev

    if data.reasoning is not None and data.reasoning != finding.reasoning:
        changes["reasoning"] = {"old": finding.reasoning, "new": data.reasoning}
        finding.reasoning = data.reasoning

    if data.recommendation is not None and data.recommendation != finding.recommendation:
        changes["recommendation"] = {"old": finding.recommendation, "new": data.recommendation}
        finding.recommendation = data.recommendation

    if data.citation is not None and data.citation != finding.citation:
        changes["citation"] = {"old": finding.citation, "new": data.citation}
        finding.citation = data.citation

    if data.confidence is not None and data.confidence != finding.confidence:
        changes["confidence"] = {"old": finding.confidence, "new": data.confidence}
        finding.confidence = data.confidence

    if changes:
        finding.updated_at = now_utc
        db.commit()
        db.refresh(finding)

        change_summaries = []
        for field, delta in changes.items():
            change_summaries.append(f"{field.capitalize()}: {delta['old']} → {delta['new']}")
        desc = "; ".join(change_summaries)

        log_activity(
            db,
            user_id=current_user.id,
            event_type="FINDING_UPDATED",
            title=f"Updated Finding #{str(finding.id)[:8]}",
            description=desc,
            icon_type="file",
            extra_data={
                "finding_id": str(finding.id),
                "report_id": str(report.id),
                "organization_id": str(report.organization_id),
                "changes": changes,
            },
        )

        audit_service.log_audit_event(
            db,
            user_id=current_user.id,
            action="FINDING_UPDATED",
            organization_id=report.organization_id,
            entity="ReportFinding",
            entity_id=str(finding.id),
        )
        db.commit()

    return _format_finding_response(db, finding)


ALLOWED_TRANSITIONS = {
    "OPEN": {"IN_REVIEW"},
    "IN_REVIEW": {"REMEDIATION", "REMEDIATION_REQUIRED", "POTENTIAL_FALSE_POSITIVE", "ADMIN_REVIEW", "OPEN"},
    "REMEDIATION": {"ADMIN_REVIEW", "IN_REVIEW", "RESOLVED", "REMEDIATION_REQUIRED"},
    "REMEDIATION_REQUIRED": {"ADMIN_REVIEW", "IN_REVIEW", "RESOLVED", "REMEDIATION"},
    "POTENTIAL_FALSE_POSITIVE": {"ADMIN_REVIEW", "IN_REVIEW", "REJECTED"},
    "ADMIN_REVIEW": {"RESOLVED", "REJECTED", "IN_REVIEW", "REMEDIATION", "POTENTIAL_FALSE_POSITIVE"},
    "RESOLVED": {"OPEN", "REOPENED", "IN_REVIEW", "REASSESSMENT_REQUIRED"},
    "REASSESSMENT_REQUIRED": {"RESOLVED", "REOPENED"},
    "REOPENED": {"IN_REVIEW", "OPEN", "REMEDIATION"},
    "REJECTED": {"IN_REVIEW", "OPEN", "REOPENED"},
}


@router.patch(
    "/{finding_id}/status",
    response_model=FindingItemResponse,
    summary="Update finding lifecycle status",
)
def update_finding_status(
    finding_id: uuid.UUID,
    data: FindingStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingItemResponse:
    """Update lifecycle status of a finding."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    user_role = get_user_org_role(db, current_user.id, report.organization_id)

    # Reviewer can only update status for findings assigned to them (or unassigned/claimed)
    if ROLE_RANK.get(user_role, 0) == ROLE_RANK[UserRole.REVIEWER]:
        if finding.assigned_to is not None and finding.assigned_to != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Reviewers can only update status for findings assigned to them.",
            )

    raw_status = data.lifecycle_status or data.status
    if not raw_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status field is required.",
        )

    new_status = raw_status.upper()
    valid_statuses = {
        "OPEN",
        "IN_REVIEW",
        "REMEDIATION",
        "REMEDIATION_REQUIRED",
        "POTENTIAL_FALSE_POSITIVE",
        "ADMIN_REVIEW",
        "RESOLVED",
        "REOPENED",
        "REJECTED",
    }

    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{raw_status}'. Allowed: OPEN, IN_REVIEW, REMEDIATION, POTENTIAL_FALSE_POSITIVE, ADMIN_REVIEW, RESOLVED, REOPENED, REJECTED",
        )

    # Enforce that RESOLVED, REOPENED, and REJECTED statuses can ONLY be set by Admin
    now_utc = datetime.now(timezone.utc)
    if new_status == "RESOLVED":
        _verify_finding_resolution_eligibility(db, finding, current_user, report.organization_id)
        finding.resolved_by = current_user.id
        finding.resolved_at = now_utc
        if not finding.resolution_note:
            finding.resolution_note = "Resolved by Administrator"

        last_res = (
            db.query(FindingResolutionHistory)
            .filter(FindingResolutionHistory.finding_id == finding.id)
            .order_by(FindingResolutionHistory.resolution_number.desc())
            .first()
        )
        next_res_num = (last_res.resolution_number + 1) if last_res else 1
        res_history = FindingResolutionHistory(
            id=uuid.uuid4(),
            finding_id=finding.id,
            organization_id=report.organization_id,
            resolution_number=next_res_num,
            resolved_at=now_utc,
            resolved_by=current_user.id,
            resolution_note=finding.resolution_note,
            status="RESOLVED",
        )
        db.add(res_history)
    elif new_status in ("REOPENED", "REJECTED"):
        if not is_org_admin(db, current_user.id, report.organization_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Only Organization Admins are permitted to set finding status to '{new_status}'. Reviewers can submit findings for Admin review.",
            )

        if new_status == "REOPENED":
            old_lifecycle = (finding.lifecycle_status or "OPEN").upper()
            if old_lifecycle != "RESOLVED":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Only resolved findings can be reopened. Current status: {old_lifecycle}",
                )
            finding.reopened_by = current_user.id
            finding.reopened_at = now_utc
            if not finding.reopen_reason:
                finding.reopen_reason = "Reopened by Administrator"

            latest_res = (
                db.query(FindingResolutionHistory)
                .filter(FindingResolutionHistory.finding_id == finding.id)
                .order_by(FindingResolutionHistory.resolution_number.desc())
                .first()
            )
            if latest_res:
                latest_res.reopened_at = now_utc
                latest_res.reopened_by = current_user.id
                latest_res.reopen_reason = finding.reopen_reason
                latest_res.status = "REOPENED"
                latest_res.updated_at = now_utc
            else:
                res_record = FindingResolutionHistory(
                    id=uuid.uuid4(),
                    finding_id=finding.id,
                    organization_id=report.organization_id,
                    resolution_number=1,
                    resolved_at=finding.resolved_at or now_utc,
                    resolved_by=finding.resolved_by or current_user.id,
                    resolution_note=finding.resolution_note,
                    reopened_at=now_utc,
                    reopened_by=current_user.id,
                    reopen_reason=finding.reopen_reason,
                    status="REOPENED",
                )
                db.add(res_record)

            rem = (
                db.query(FindingRemediation)
                .filter(FindingRemediation.finding_id == finding.id)
                .first()
            )
            if rem:
                rem.status = "IN_PROGRESS"
                rem.admin_approved_by = None
                rem.admin_approved_at = None
                rem.admin_note = f"Finding reopened: {finding.reopen_reason}"
                rem.updated_at = now_utc

    old_status = (finding.lifecycle_status or "OPEN").upper()

    if new_status != old_status:
        allowed = ALLOWED_TRANSITIONS.get(old_status, set())
        if new_status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid lifecycle transition from '{old_status}' to '{new_status}'. Allowed: {', '.join(allowed) or 'None'}",
            )

    finding.lifecycle_status = new_status
    finding.updated_at = now_utc
    db.commit()
    db.refresh(finding)

    # Activity & Audit logging
    event_type = "FINDING_STATUS_CHANGED"
    notif_title = "Finding Status Changed"
    notif_msg = f"{current_user.full_name} moved Finding #{str(finding.id)[:8]} from {old_status} to {new_status}."

    if new_status in ("REMEDIATION", "REMEDIATION_REQUIRED"):
        notif_title = "Finding Moved to Remediation"
        notif_msg = f"{current_user.full_name} moved Finding #{str(finding.id)[:8]} to REMEDIATION."
    elif new_status == "ADMIN_REVIEW":
        event_type = "FINDING_SUBMITTED_FOR_REVIEW"
        notif_title = "Finding Submitted for Admin Review"
        notif_msg = f"{current_user.full_name} submitted Finding #{str(finding.id)[:8]} for Administrator review."
    elif new_status == "POTENTIAL_FALSE_POSITIVE":
        event_type = "FINDING_FALSE_POSITIVE_FLAGGED"
        notif_title = "Finding Marked as Potential False Positive"
        notif_msg = f"{current_user.full_name} flagged Finding #{str(finding.id)[:8]} as a potential false positive."
    elif new_status == "REJECTED":
        event_type = "FINDING_REJECTED"
        notif_title = "Finding Rejected (False Positive)"
        notif_msg = f"Finding #{str(finding.id)[:8]} was rejected as a false positive by {current_user.full_name}."
    elif new_status == "RESOLVED":
        event_type = "FINDING_RESOLVED"
        notif_title = "Finding Resolved"
        notif_msg = f"Finding #{str(finding.id)[:8]} was marked RESOLVED by {current_user.full_name}."
    elif new_status == "REOPENED":
        event_type = "FINDING_REOPENED"
        notif_title = "Finding Reopened"
        notif_msg = f"Finding #{str(finding.id)[:8]} was reopened by {current_user.full_name}."

    log_activity(
        db,
        user_id=current_user.id,
        event_type=event_type,
        title=f"Changed Finding #{str(finding.id)[:8]} Status",
        description=f"Updated status from {old_status} to {new_status}",
        icon_type="report",
        extra_data={
            "finding_id": str(finding.id),
            "report_id": str(report.id),
            "old_status": old_status,
            "new_status": new_status,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action=event_type,
        organization_id=report.organization_id,
        entity="ReportFinding",
        entity_id=str(finding.id),
    )

    notify_finding_stakeholders(
        db=db,
        organization_id=report.organization_id,
        finding_id=finding.id,
        report_id=report.id,
        assignee_id=finding.assigned_to,
        actor_id=current_user.id,
        event_type=event_type,
        title=notif_title,
        message=notif_msg,
    )
    db.commit()

    return _format_finding_response(db, finding)


@router.post(
    "/{finding_id}/submit-for-review",
    response_model=FindingItemResponse,
    summary="Submit finding for Admin review",
)
def submit_finding_for_review(
    finding_id: uuid.UUID,
    data: Optional[FindingSubmitReviewRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingItemResponse:
    """Submit finding for Administrator review & final resolution decision."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    user_role = get_user_org_role(db, current_user.id, report.organization_id)

    # Reviewer can only submit findings assigned to them (or unassigned/claimed)
    if ROLE_RANK.get(user_role, 0) == ROLE_RANK[UserRole.REVIEWER]:
        if finding.assigned_to is not None and finding.assigned_to != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Reviewers can only submit findings assigned to them for Admin review.",
            )

    old_status = (finding.lifecycle_status or "OPEN").upper()
    finding.lifecycle_status = "ADMIN_REVIEW"
    finding.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(finding)

    note_text = f": {data.submission_note}" if (data and data.submission_note) else ""

    log_activity(
        db,
        user_id=current_user.id,
        event_type="FINDING_SUBMITTED_FOR_REVIEW",
        title=f"Submitted Finding #{str(finding.id)[:8]} for Admin Review",
        description=f"{current_user.full_name} submitted Finding #{str(finding.id)[:8]} for Administrator review{note_text}.",
        icon_type="report",
        extra_data={
            "finding_id": str(finding.id),
            "report_id": str(report.id),
            "old_status": old_status,
            "new_status": "ADMIN_REVIEW",
            "submission_note": data.submission_note if data else None,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="FINDING_SUBMITTED_FOR_REVIEW",
        organization_id=report.organization_id,
        entity="ReportFinding",
        entity_id=str(finding.id),
    )

    # Notify all organization admins
    recipients: set[uuid.UUID] = set()
    org = db.get(Organization, report.organization_id)
    if org and org.created_by and org.created_by != current_user.id:
        recipients.add(org.created_by)

    try:
        admin_members = db.query(OrganizationMember.user_id).filter(
            OrganizationMember.organization_id == report.organization_id,
            OrganizationMember.status == MemberStatus.ACTIVE,
            OrganizationMember.role.in_([UserRole.ADMIN, UserRole.ORGANIZATION_ADMIN, UserRole.SUPER_ADMIN]),
        ).all()
        for (admin_uid,) in admin_members:
            if admin_uid != current_user.id:
                recipients.add(admin_uid)
    except Exception as exc:
        logger.warning("Failed querying admin members: %s", exc)

    for r_id in recipients:
        create_notification(
            db=db,
            recipient_id=r_id,
            organization_id=report.organization_id,
            type="FINDING_SUBMITTED_FOR_REVIEW",
            title="Finding Submitted for Admin Review",
            message=f"{current_user.full_name} submitted Finding #{str(finding.id)[:8]} for review{note_text}.",
            finding_id=finding.id,
            report_id=report.id,
            actor_id=current_user.id,
        )

    db.commit()
    return _format_finding_response(db, finding)


@router.post(
    "/{finding_id}/reject-false-positive",
    response_model=FindingItemResponse,
    summary="Reject finding as false positive (Admin only)",
)
def reject_false_positive(
    finding_id: uuid.UUID,
    data: FindingRejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingItemResponse:
    """Reject finding as a confirmed false positive. Requires Organization Admin role."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    if not is_org_admin(db, current_user.id, report.organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Organization Admins are permitted to reject false-positive findings.",
        )

    finding.lifecycle_status = "REJECTED"
    reason_str = data.rejection_reason or "Confirmed false positive by Administrator"
    finding.resolution_note = f"False Positive: {reason_str}"
    finding.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(finding)

    log_activity(
        db,
        user_id=current_user.id,
        event_type="FINDING_REJECTED",
        title=f"Rejected Finding #{str(finding.id)[:8]} (False Positive)",
        description=f"Marked REJECTED (False Positive): {reason_str}",
        icon_type="alert",
        extra_data={
            "finding_id": str(finding.id),
            "report_id": str(report.id),
            "rejection_reason": data.rejection_reason,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="FINDING_REJECTED",
        organization_id=report.organization_id,
        entity="ReportFinding",
        entity_id=str(finding.id),
    )

    notify_finding_stakeholders(
        db=db,
        organization_id=report.organization_id,
        finding_id=finding.id,
        report_id=report.id,
        assignee_id=finding.assigned_to,
        actor_id=current_user.id,
        event_type="FINDING_REJECTED",
        title="Finding Rejected (False Positive)",
        message=f"Finding #{str(finding.id)[:8]} was rejected as a false positive by {current_user.full_name}: {reason_str}.",
    )
    db.commit()

    return _format_finding_response(db, finding)


@router.patch(
    "/{finding_id}/remediation",
    response_model=FindingItemResponse,
    summary="Update finding remediation due date",
)
def update_remediation_due_date(
    finding_id: uuid.UUID,
    data: FindingRemediationUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingItemResponse:
    """Set, update, or clear (due_date: None) finding remediation due date."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    if not is_org_analyst_or_admin(db, current_user.id, report.organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admins and Compliance Analysts can update remediation due dates.",
        )

    finding.remediation_due_date = data.due_date
    finding.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(finding)

    due_str = data.due_date.strftime("%Y-%m-%d") if data.due_date else "Cleared"

    log_activity(
        db,
        user_id=current_user.id,
        event_type="FINDING_DUE_DATE_CHANGED",
        title=f"Updated Finding #{str(finding.id)[:8]} Due Date",
        description=f"Remediation due date set to {due_str}",
        icon_type="calendar",
        extra_data={
            "finding_id": str(finding.id),
            "report_id": str(report.id),
            "due_date": data.due_date.isoformat() if data.due_date else None,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="FINDING_DUE_DATE_CHANGED",
        organization_id=report.organization_id,
        entity="ReportFinding",
        entity_id=str(finding.id),
    )

    notify_finding_stakeholders(
        db=db,
        organization_id=report.organization_id,
        finding_id=finding.id,
        report_id=report.id,
        assignee_id=finding.assigned_to,
        actor_id=current_user.id,
        event_type="FINDING_DUE_DATE_CHANGED",
        title="Remediation Due Date Updated",
        message=f"Due date for Finding #{str(finding.id)[:8]} updated to {due_str} by {current_user.full_name}.",
    )
    db.commit()

    return _format_finding_response(db, finding)


@router.post(
    "/{finding_id}/assign",
    response_model=FindingItemResponse,
    summary="Assign finding to organization member",
)
def assign_finding(
    finding_id: uuid.UUID,
    data: FindingAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingItemResponse:
    """Assign finding to an active organization member or clear assignment."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    user_role = get_user_org_role(db, current_user.id, report.organization_id)

    # If user is Reviewer: can ONLY assign to themselves, and cannot reassign if already assigned to another member
    if ROLE_RANK.get(user_role, 0) == ROLE_RANK[UserRole.REVIEWER]:
        if not data.assignee_id or data.assignee_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Reviewers can only assign findings to themselves.",
            )
        if finding.assigned_to is not None and finding.assigned_to != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Reviewers cannot reassign findings that are already assigned to other users.",
            )

    old_assignee_id = finding.assigned_to
    old_assignee_name = "Unassigned"
    if old_assignee_id:
        old_u = db.get(User, old_assignee_id)
        if old_u:
            old_assignee_name = old_u.full_name

    if data.assignee_id:
        # Validate assignee belongs to SAME organization
        member_org_ids = db.scalars(
            select(OrganizationMember.organization_id).where(
                OrganizationMember.user_id == data.assignee_id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            )
        ).all()

        org = db.get(Organization, report.organization_id)
        is_org_owner = org and org.created_by == data.assignee_id

        if report.organization_id not in member_org_ids and not is_org_owner:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignee is not an active member of this organization.",
            )

        assignee_user = db.get(User, data.assignee_id)
        if not assignee_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target user for assignment does not exist.",
            )

        finding.assigned_to = data.assignee_id
        assignee_name = assignee_user.full_name
    else:
        finding.assigned_to = None
        assignee_name = "Unassigned"

    finding.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(finding)

    desc_assignment = (
        f"Assigned to {assignee_name}"
        if old_assignee_name == "Unassigned" and assignee_name != "Unassigned"
        else f"Assignment changed: {old_assignee_name} → {assignee_name}"
    )

    log_activity(
        db,
        user_id=current_user.id,
        event_type="FINDING_ASSIGNED",
        title=f"Assigned Finding #{str(finding.id)[:8]}",
        description=desc_assignment,
        icon_type="user",
        extra_data={
            "finding_id": str(finding.id),
            "report_id": str(report.id),
            "organization_id": str(report.organization_id),
            "old_assignee_id": str(old_assignee_id) if old_assignee_id else None,
            "old_assignee_name": old_assignee_name,
            "new_assignee_id": str(data.assignee_id) if data.assignee_id else None,
            "new_assignee_name": assignee_name,
            "assignee_id": str(data.assignee_id) if data.assignee_id else None,
            "assignee_name": assignee_name,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="FINDING_ASSIGNED",
        organization_id=report.organization_id,
        entity="ReportFinding",
        entity_id=str(finding.id),
    )

    notify_finding_stakeholders(
        db=db,
        organization_id=report.organization_id,
        finding_id=finding.id,
        report_id=report.id,
        assignee_id=data.assignee_id,
        actor_id=current_user.id,
        event_type="FINDING_ASSIGNED",
        title="Finding Assigned",
        message=f"Finding #{str(finding.id)[:8]} was assigned to {assignee_name} by {current_user.full_name}.",
    )
    db.commit()

    return _format_finding_response(db, finding)


def _verify_finding_resolution_eligibility(
    db: Session,
    finding: ReportFinding,
    current_user: User,
    org_id: uuid.UUID,
) -> None:
    """
    Verify strict eligibility pre-conditions for resolving a compliance finding (Sprint 7.7):
    1. Organization Administrator role required.
    2. Finding must not already be RESOLVED (409 Conflict).
    3. If associated remediation exists, it MUST be in APPROVED status.
    """
    if not is_org_admin(db, current_user.id, org_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Organization Admins are permitted to resolve findings. Reviewers can submit reviews and move findings to remediation.",
        )

    current_lifecycle = (finding.lifecycle_status or "OPEN").upper()
    if current_lifecycle == "RESOLVED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Finding is already resolved.",
        )

    # Verify remediation status if remediation plan exists
    rem = db.query(FindingRemediation).filter(FindingRemediation.finding_id == finding.id).first()
    if rem:
        rem_status = (rem.status or "NOT_STARTED").upper()
        if rem_status != "APPROVED":
            if rem_status in ("IN_PROGRESS", "NOT_STARTED"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Finding cannot be resolved while remediation is in progress. Remediation must be approved before resolution.",
                )
            elif rem_status == "READY_FOR_REVIEW":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Finding cannot be resolved while remediation is pending review. Complete verification and approval first.",
                )
            elif rem_status == "VERIFIED":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Remediation has been verified by the reviewer, but requires Admin approval before this finding can be resolved.",
                )
            elif rem_status == "REJECTED":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Finding cannot be resolved because remediation was rejected. Further remediation work is required.",
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Remediation must be approved before this finding can be resolved. Current remediation status: {rem.status}",
                )


@router.post(
    "/{finding_id}/resolve",
    response_model=FindingItemResponse,
    summary="Mark finding as RESOLVED",
)
def resolve_finding(
    finding_id: uuid.UUID,
    data: Optional[FindingResolveRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingItemResponse:
    """Mark finding as RESOLVED with resolution note. Requires Organization Admin role and completed remediation."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    # Row-level lock for atomic concurrency protection
    locked_finding = db.query(ReportFinding).filter(
        ReportFinding.id == finding.id
    ).with_for_update().first()
    if not locked_finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")

    _verify_finding_resolution_eligibility(db, locked_finding, current_user, report.organization_id)

    now_utc = datetime.now(timezone.utc)
    note_text = data.resolution_note if data else None

    locked_finding.lifecycle_status = "RESOLVED"
    locked_finding.resolution_note = note_text
    locked_finding.resolved_by = current_user.id
    locked_finding.resolved_at = now_utc
    locked_finding.updated_at = now_utc

    # Append to FindingResolutionHistory with approved cycle & evidence snapshot
    last_res = (
        db.query(FindingResolutionHistory)
        .filter(FindingResolutionHistory.finding_id == locked_finding.id)
        .order_by(FindingResolutionHistory.resolution_number.desc())
        .first()
    )
    next_res_num = (last_res.resolution_number + 1) if last_res else 1

    rem = (
        db.query(FindingRemediation)
        .filter(FindingRemediation.finding_id == locked_finding.id)
        .first()
    )
    approved_cycle_num = None
    verified_by_id = None
    verified_at_time = None
    verification_note_text = None
    ev_snapshot = []

    if rem:
        latest_cycle = (
            db.query(RemediationCycle)
            .filter(RemediationCycle.remediation_id == rem.id)
            .order_by(RemediationCycle.cycle_number.desc())
            .first()
        )
        approved_cycle_num = latest_cycle.cycle_number if latest_cycle else 1
        verified_by_id = rem.verified_by
        verified_at_time = rem.verified_at
        verification_note_text = rem.verification_note

        ev_items = (
            db.query(RemediationEvidence)
            .filter(RemediationEvidence.remediation_id == rem.id)
            .all()
        )
        for ev in ev_items:
            ev_snapshot.append({
                "id": str(ev.id),
                "original_filename": ev.original_filename,
                "file_size": ev.file_size,
                "mime_type": ev.mime_type,
                "description": ev.description,
                "cycle_number": ev.cycle_number,
                "document_id": str(ev.document_id) if ev.document_id else None,
                "document_type": ev.document_type,
                "version": ev.version,
                "uploaded_at": ev.uploaded_at.isoformat() if ev.uploaded_at else None,
            })

    res_history = FindingResolutionHistory(
        id=uuid.uuid4(),
        finding_id=locked_finding.id,
        organization_id=report.organization_id,
        resolution_number=next_res_num,
        resolved_at=now_utc,
        resolved_by=current_user.id,
        resolution_note=note_text,
        approved_cycle_number=approved_cycle_num,
        verified_by=verified_by_id,
        verified_at=verified_at_time,
        verification_note=verification_note_text,
        evidence_snapshot=ev_snapshot if ev_snapshot else None,
        status="RESOLVED",
    )
    db.add(res_history)
    db.commit()
    db.refresh(locked_finding)

    desc_note = f": {note_text}" if note_text else ""
    log_activity(
        db,
        user_id=current_user.id,
        event_type="FINDING_RESOLVED",
        title=f"Resolved Finding #{str(locked_finding.id)[:8]}",
        description=f"Marked RESOLVED by {current_user.full_name}{desc_note}",
        icon_type="check",
        extra_data={
            "finding_id": str(locked_finding.id),
            "report_id": str(report.id),
            "organization_id": str(report.organization_id),
            "old_status": "REMEDIATION",
            "new_status": "RESOLVED",
            "resolution_number": next_res_num,
            "resolution_note": note_text,
            "resolved_by": str(current_user.id),
            "resolved_at": now_utc.isoformat(),
            "approved_cycle_number": approved_cycle_num,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="FINDING_RESOLVED",
        organization_id=report.organization_id,
        entity="ReportFinding",
        entity_id=str(locked_finding.id),
    )

    notify_finding_stakeholders(
        db=db,
        organization_id=report.organization_id,
        finding_id=locked_finding.id,
        report_id=report.id,
        assignee_id=locked_finding.assigned_to,
        actor_id=current_user.id,
        event_type="FINDING_RESOLVED",
        title="Finding Resolved",
        message=f"Finding #{str(locked_finding.id)[:8]} was resolved by Admin {current_user.full_name}{desc_note}.",
    )
    db.commit()

    return _format_finding_response(db, locked_finding)


@router.get(
    "/{finding_id}/resolution-proof",
    response_model=FindingResolutionProofResponse,
    summary="Get comprehensive resolution proof, verification summary, and evidence (Sprint 7.10)",
)
def get_finding_resolution_proof(
    finding_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingResolutionProofResponse:
    """Retrieve full audit proof including resolution metadata, verifier details, supporting evidence, and cycle history."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=False)

    resolver_name = None
    if finding.resolved_by:
        r_user = db.get(User, finding.resolved_by)
        if r_user:
            resolver_name = r_user.full_name

    rem = db.query(FindingRemediation).filter(
        FindingRemediation.finding_id == finding.id
    ).first()

    verification_summary = None
    approved_cycle_number = None

    if rem:
        latest_cycle = db.query(RemediationCycle).filter(
            RemediationCycle.remediation_id == rem.id
        ).order_by(RemediationCycle.cycle_number.desc()).first()
        approved_cycle_number = latest_cycle.cycle_number if latest_cycle else 1

        verifier_name = None
        if rem.verified_by:
            v_user = db.get(User, rem.verified_by)
            if v_user:
                verifier_name = v_user.full_name

        verification_summary = FindingVerificationSummary(
            verification_status="VERIFIED" if rem.status in ("VERIFIED", "APPROVED") else rem.status,
            verified_by=str(rem.verified_by) if rem.verified_by else None,
            verified_by_name=verifier_name,
            verified_at=rem.verified_at,
            verification_note=rem.verification_note,
            cycle_number=approved_cycle_number,
        )

    # Fetch all evidence for this finding
    all_evidence = db.query(RemediationEvidence).filter(
        RemediationEvidence.finding_id == finding.id,
        RemediationEvidence.organization_id == report.organization_id,
    ).order_by(RemediationEvidence.uploaded_at.desc()).all()

    from app.routes.remediations import _format_evidence_response

    supporting_ev: List[RemediationEvidenceResponse] = []
    historical_ev: List[RemediationEvidenceResponse] = []

    for ev in all_evidence:
        formatted = _format_evidence_response(db, ev)
        # If finding is currently resolved or in review for a specific cycle:
        if approved_cycle_number is not None and ev.cycle_number == approved_cycle_number:
            supporting_ev.append(formatted)
        elif approved_cycle_number is not None and ev.cycle_number and ev.cycle_number < approved_cycle_number:
            historical_ev.append(formatted)
        else:
            supporting_ev.append(formatted)

    # Fetch resolution history
    res_histories = db.query(FindingResolutionHistory).filter(
        FindingResolutionHistory.finding_id == finding.id
    ).order_by(FindingResolutionHistory.resolution_number.desc()).all()

    hist_list = []
    for rh in res_histories:
        rh_resolver_name = None
        if rh.resolved_by:
            ru = db.get(User, rh.resolved_by)
            if ru:
                rh_resolver_name = ru.full_name

        rh_reopener_name = None
        if rh.reopened_by:
            ro = db.get(User, rh.reopened_by)
            if ro:
                rh_reopener_name = ro.full_name

        rh_verifier_name = None
        if rh.verified_by:
            vu = db.get(User, rh.verified_by)
            if vu:
                rh_verifier_name = vu.full_name

        hist_list.append({
            "id": str(rh.id),
            "resolution_number": rh.resolution_number,
            "status": rh.status,
            "resolved_at": rh.resolved_at.isoformat() if rh.resolved_at else None,
            "resolved_by": str(rh.resolved_by) if rh.resolved_by else None,
            "resolved_by_name": rh_resolver_name,
            "resolution_note": rh.resolution_note,
            "approved_cycle_number": rh.approved_cycle_number,
            "verified_by": str(rh.verified_by) if rh.verified_by else None,
            "verified_by_name": rh_verifier_name,
            "verified_at": rh.verified_at.isoformat() if rh.verified_at else None,
            "verification_note": rh.verification_note,
            "evidence_snapshot": rh.evidence_snapshot,
            "reopened_at": rh.reopened_at.isoformat() if rh.reopened_at else None,
            "reopened_by": str(rh.reopened_by) if rh.reopened_by else None,
            "reopened_by_name": rh_reopener_name,
            "reopen_reason": rh.reopen_reason,
        })

    reassessment_dict = None
    if finding.lifecycle_status == "REASSESSMENT_REQUIRED" or finding.reassessment_trigger:
        reassessment_dict = {
            "reassessment_trigger": finding.reassessment_trigger,
            "reassessment_reason": finding.reassessment_reason,
            "reassessment_document_id": str(finding.reassessment_document_id) if finding.reassessment_document_id else None,
            "reassessment_document_name": finding.reassessment_document_name,
            "reassessment_report_id": str(finding.reassessment_report_id) if finding.reassessment_report_id else None,
            "reassessment_detected_at": finding.reassessment_detected_at.isoformat() if finding.reassessment_detected_at else None,
        }

    return FindingResolutionProofResponse(
        finding_id=str(finding.id),
        finding_clause_id=finding.regulation_clause_id,
        severity=finding.severity,
        lifecycle_status=finding.lifecycle_status or "OPEN",
        resolved_by=str(finding.resolved_by) if finding.resolved_by else None,
        resolved_by_name=resolver_name,
        resolved_at=finding.resolved_at,
        resolution_note=finding.resolution_note,
        approved_cycle_number=approved_cycle_number,
        verification=verification_summary,
        supporting_evidence=supporting_ev,
        historical_evidence=historical_ev,
        historical_resolutions=hist_list,
        reassessment_info=reassessment_dict,
        has_supporting_evidence=len(supporting_ev) > 0,
    )


@router.post(
    "/{finding_id}/reopen",
    response_model=FindingItemResponse,
    summary="Reopen a resolved finding",
)
def reopen_finding(
    finding_id: uuid.UUID,
    data: FindingReopenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingItemResponse:
    """Reopen a previously resolved finding with mandatory reason. Requires Organization Admin role."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    if not is_org_admin(db, current_user.id, report.organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Organization Admins are permitted to reopen findings.",
        )

    # Row-level lock for atomic concurrency protection
    locked_finding = db.query(ReportFinding).filter(
        ReportFinding.id == finding.id
    ).with_for_update().first()
    if not locked_finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")

    current_status = (locked_finding.lifecycle_status or "OPEN").upper()
    if current_status not in ("RESOLVED", "REASSESSMENT_REQUIRED"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only resolved findings can be reopened (or findings pending reassessment). Current status: {current_status}",
        )

    reason = (data.reopen_reason or "").strip()
    if not reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reason for reopening finding is mandatory.",
        )

    now_utc = datetime.now(timezone.utc)
    locked_finding.lifecycle_status = "REOPENED"
    locked_finding.reopened_by = current_user.id
    locked_finding.reopened_at = now_utc
    locked_finding.reopen_reason = reason
    locked_finding.reassessment_trigger = None
    locked_finding.reassessment_reason = None
    locked_finding.reassessment_document_id = None
    locked_finding.reassessment_document_name = None
    locked_finding.reassessment_report_id = None
    locked_finding.reassessment_detected_at = None
    locked_finding.updated_at = now_utc

    # Update latest active FindingResolutionHistory entry or create Resolution #1 if none existed
    latest_res = (
        db.query(FindingResolutionHistory)
        .filter(FindingResolutionHistory.finding_id == locked_finding.id)
        .order_by(FindingResolutionHistory.resolution_number.desc())
        .first()
    )
    if latest_res:
        latest_res.reopened_at = now_utc
        latest_res.reopened_by = current_user.id
        latest_res.reopen_reason = reason
        latest_res.status = "REOPENED"
        latest_res.updated_at = now_utc
    else:
        # Create Resolution #1 record with previous resolution data and this reopen event
        res_record = FindingResolutionHistory(
            id=uuid.uuid4(),
            finding_id=locked_finding.id,
            organization_id=report.organization_id,
            resolution_number=1,
            resolved_at=locked_finding.resolved_at or now_utc,
            resolved_by=locked_finding.resolved_by or current_user.id,
            resolution_note=locked_finding.resolution_note,
            reopened_at=now_utc,
            reopened_by=current_user.id,
            reopen_reason=reason,
            status="REOPENED",
        )
        db.add(res_record)

    # Reopen associated remediation workflow if it exists (allows starting new cycle while keeping history)
    rem = (
        db.query(FindingRemediation)
        .filter(FindingRemediation.finding_id == locked_finding.id)
        .with_for_update()
        .first()
    )
    if rem:
        rem.status = "IN_PROGRESS"
        rem.admin_approved_by = None
        rem.admin_approved_at = None
        rem.admin_note = f"Finding reopened: {reason}"
        rem.updated_at = now_utc

    db.commit()
    db.refresh(locked_finding)

    log_activity(
        db,
        user_id=current_user.id,
        event_type="FINDING_REOPENED",
        title=f"Reopened Finding #{str(locked_finding.id)[:8]}",
        description=f"Reopened finding: {reason}",
        icon_type="alert",
        extra_data={
            "finding_id": str(locked_finding.id),
            "report_id": str(report.id),
            "organization_id": str(report.organization_id),
            "old_status": "RESOLVED",
            "new_status": "REOPENED",
            "reopen_reason": reason,
            "reopened_by": str(current_user.id),
            "reopened_at": now_utc.isoformat(),
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="FINDING_REOPENED",
        organization_id=report.organization_id,
        entity="ReportFinding",
        entity_id=str(locked_finding.id),
    )

    notify_finding_stakeholders(
        db=db,
        organization_id=report.organization_id,
        finding_id=locked_finding.id,
        report_id=report.id,
        assignee_id=locked_finding.assigned_to,
        actor_id=current_user.id,
        event_type="FINDING_REOPENED",
        title="Finding Reopened",
        message=f"Finding #{str(locked_finding.id)[:8]} was reopened by Admin {current_user.full_name}: {reason}.",
    )
    db.commit()

    return _format_finding_response(db, locked_finding)


@router.get(
    "/{finding_id}/resolutions",
    response_model=List[FindingResolutionHistoryItem],
    summary="List resolution history periods for a finding",
)
def get_finding_resolutions(
    finding_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
) -> List[FindingResolutionHistoryItem]:
    """Retrieve full multi-period resolution and reopen history for a finding."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=False)
    resp = _format_finding_response(db, finding)
    return resp.resolution_history


# =========================================================================
# SPRINT 7.9: Reassessment & Finding Change Detection Endpoints
# =========================================================================

@router.get(
    "/{finding_id}/reassessment",
    response_model=FindingReassessmentDetailResponse,
    summary="Get reassessment context and change delta for a finding",
)
def get_finding_reassessment(
    finding_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
) -> FindingReassessmentDetailResponse:
    """Retrieve structured reassessment context including previous resolution, changed source, and candidate analysis."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=False)

    prev_res = None
    if finding.resolved_at:
        res_name = None
        if finding.resolved_by:
            res_u = getattr(finding, "resolver", None) or db.get(User, finding.resolved_by)
            if res_u:
                res_name = res_u.full_name
        prev_res = FindingPreviousResolutionSummary(
            resolved_at=finding.resolved_at,
            resolved_by=str(finding.resolved_by) if finding.resolved_by else None,
            resolved_by_name=res_name,
            resolution_note=finding.resolution_note,
        )

    candidate_summary = None
    if finding.reassessment_report_id:
        trigger_rep = db.get(ComplianceReport, finding.reassessment_report_id)
        if trigger_rep:
            trigger_finding = (
                db.query(ReportFinding)
                .filter(
                    ReportFinding.report_id == trigger_rep.id,
                    ReportFinding.regulation_clause_id == finding.regulation_clause_id,
                )
                .first()
            )
            candidate_summary = FindingCandidateAnalysisSummary(
                status=trigger_finding.status if trigger_finding else "NON_COMPLIANT",
                severity=trigger_finding.severity if trigger_finding else finding.severity,
                reasoning=trigger_finding.reasoning if trigger_finding else finding.reasoning,
                recommendation=trigger_finding.recommendation if trigger_finding else finding.recommendation,
                report_id=str(trigger_rep.id),
                created_at=trigger_rep.created_at,
            )

    return FindingReassessmentDetailResponse(
        finding_id=str(finding.id),
        lifecycle_status=finding.lifecycle_status or "OPEN",
        reassessment_trigger=finding.reassessment_trigger,
        reassessment_reason=finding.reassessment_reason,
        reassessment_document_id=str(finding.reassessment_document_id) if finding.reassessment_document_id else None,
        reassessment_document_name=finding.reassessment_document_name,
        reassessment_report_id=str(finding.reassessment_report_id) if finding.reassessment_report_id else None,
        reassessment_detected_at=finding.reassessment_detected_at,
        previous_resolution=prev_res,
        candidate_analysis=candidate_summary,
    )


@router.post(
    "/{finding_id}/reassessment/keep-resolved",
    response_model=FindingItemResponse,
    summary="Admin decision to confirm previous resolution remains valid (Keep Resolved)",
)
def keep_finding_resolved(
    finding_id: uuid.UUID,
    payload: Optional[FindingReassessmentKeepResolvedRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingItemResponse:
    """Admin reviews the reassessment and confirms that previous resolution remains valid."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    if not is_org_admin(db, current_user.id, report.organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Organization Admins are permitted to make reassessment decisions.",
        )

    locked_finding = (
        db.query(ReportFinding)
        .filter(ReportFinding.id == finding_id)
        .with_for_update()
        .first()
    )
    if not locked_finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")

    current_status = (locked_finding.lifecycle_status or "OPEN").upper()
    if current_status != "REASSESSMENT_REQUIRED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only findings in REASSESSMENT_REQUIRED status can be reviewed and kept resolved (current: {current_status}).",
        )

    now_utc = datetime.now(timezone.utc)
    admin_note = payload.admin_note.strip() if (payload and payload.admin_note) else None

    # Transition back to RESOLVED and clear pending reassessment flags
    locked_finding.lifecycle_status = "RESOLVED"
    locked_finding.reassessment_trigger = None
    locked_finding.reassessment_reason = None
    locked_finding.reassessment_document_id = None
    locked_finding.reassessment_document_name = None
    locked_finding.reassessment_report_id = None
    locked_finding.reassessment_detected_at = None
    locked_finding.updated_at = now_utc

    db.commit()
    db.refresh(locked_finding)

    desc = f"Admin {current_user.full_name} reviewed reassessment and confirmed previous resolution remains valid."
    if admin_note:
        desc += f" Note: {admin_note}"

    log_activity(
        db,
        user_id=current_user.id,
        event_type="FINDING_REASSESSMENT_COMPLETED",
        title=f"Reassessment Completed — Kept Resolved (#{str(locked_finding.id)[:8]})",
        description=desc,
        icon_type="check",
        extra_data={
            "finding_id": str(locked_finding.id),
            "report_id": str(report.id),
            "organization_id": str(report.organization_id),
            "decision": "KEEP_RESOLVED",
            "admin_note": admin_note,
            "reviewed_by": str(current_user.id),
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="FINDING_REASSESSMENT_KEPT_RESOLVED",
        organization_id=report.organization_id,
        entity="ReportFinding",
        entity_id=str(locked_finding.id),
    )
    db.commit()

    return _format_finding_response(db, locked_finding)


@router.post(
    "/{finding_id}/reassessment/reopen",
    response_model=FindingItemResponse,
    summary="Admin decision to reopen finding from reassessment",
)
def reopen_finding_from_reassessment(
    finding_id: uuid.UUID,
    payload: FindingReopenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingItemResponse:
    """Admin decision: Reopen finding from reassessment review (reusing Sprint 7.8 reopening workflow)."""
    return reopen_finding(finding_id, payload, db, current_user)


@router.post(
    "/{finding_id}/reassessment/trigger",
    response_model=FindingItemResponse,
    summary="Trigger reassessment for a resolved finding upon document/policy change",
)
def trigger_finding_reassessment(
    finding_id: uuid.UUID,
    payload: FindingReassessmentTriggerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingItemResponse:
    """Mark a resolved finding as REASSESSMENT_REQUIRED due to document/policy/regulation changes."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    locked_finding = (
        db.query(ReportFinding)
        .filter(ReportFinding.id == finding_id)
        .with_for_update()
        .first()
    )
    if not locked_finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")

    current_status = (locked_finding.lifecycle_status or "OPEN").upper()
    if current_status != "RESOLVED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only RESOLVED findings can be marked for reassessment (current: {current_status}).",
        )

    now_utc = datetime.now(timezone.utc)
    locked_finding.lifecycle_status = "REASSESSMENT_REQUIRED"
    locked_finding.reassessment_trigger = payload.trigger
    locked_finding.reassessment_reason = payload.reason
    locked_finding.reassessment_document_id = payload.document_id
    locked_finding.reassessment_document_name = payload.document_name
    locked_finding.reassessment_report_id = payload.report_id
    locked_finding.reassessment_detected_at = now_utc
    locked_finding.updated_at = now_utc

    db.commit()
    db.refresh(locked_finding)

    # Activity log
    log_activity(
        db,
        user_id=current_user.id,
        event_type="FINDING_REASSESSMENT_REQUIRED",
        title=f"Reassessment Required for Finding #{str(locked_finding.id)[:8]}",
        description=f"Reassessment triggered ({payload.trigger}): {payload.reason}",
        icon_type="alert",
        extra_data={
            "finding_id": str(locked_finding.id),
            "report_id": str(report.id),
            "trigger": payload.trigger,
            "document_name": payload.document_name,
        },
    )

    # Notification to Org Admins
    org_admins = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == report.organization_id,
            OrganizationMember.role == UserRole.ADMIN,
            OrganizationMember.status == MemberStatus.ACTIVE,
        )
        .all()
    )
    recipient_user_ids = {m.user_id for m in org_admins}
    if locked_finding.assigned_to:
        recipient_user_ids.add(locked_finding.assigned_to)

    from app.db.models.notification import Notification
    for rec_id in recipient_user_ids:
        db.add(
            Notification(
                user_id=rec_id,
                organization_id=report.organization_id,
                type="FINDING_REASSESSMENT_REQUIRED",
                title="Finding Reassessment Required",
                message=f"Finding #{str(locked_finding.id)[:8]} requires reassessment: {payload.reason}",
                finding_id=locked_finding.id,
                report_id=report.id,
            )
        )
    db.commit()

    return _format_finding_response(db, locked_finding)



@router.get(
    "/{finding_id}/comments",
    response_model=List[FindingCommentResponse],
    summary="List comments for a finding",
)
def list_comments(
    finding_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
) -> List[FindingCommentResponse]:
    """Retrieve comment history for a finding with threaded replies and discussion resolution state."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=False)
    org_id = report.organization_id if report else None

    comments = db.query(FindingComment).filter(
        FindingComment.finding_id == finding.id
    ).order_by(FindingComment.created_at.asc()).all()

    # Index replies by parent_id for efficient nesting
    by_parent: dict[uuid.UUID, list[FindingComment]] = {}
    top_level: list[FindingComment] = []

    for c in comments:
        if c.parent_id:
            by_parent.setdefault(c.parent_id, []).append(c)
        else:
            top_level.append(c)

    return [
        _format_comment_response(db, c, by_parent, org_id)
        for c in top_level
    ]


@router.post(
    "/{finding_id}/comments",
    response_model=FindingCommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add comment or reply to finding",
)
def add_comment(
    finding_id: uuid.UUID,
    data: FindingCommentCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingCommentResponse:
    """Post a comment or threaded reply on a finding with @mention support."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    content_stripped = (data.content or "").strip()
    if not content_stripped:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Comment content cannot be empty or whitespace-only.",
        )

    # If parent_id provided, verify parent exists and belongs to this finding
    parent_comment = None
    if data.parent_id:
        parent_comment = db.get(FindingComment, data.parent_id)
        if not parent_comment or parent_comment.finding_id != finding.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent comment not found for this finding.",
            )

    comment = FindingComment(
        id=uuid.uuid4(),
        finding_id=finding.id,
        user_id=current_user.id,
        content=content_stripped,
        parent_id=data.parent_id,
        is_resolved=False,
    )
    db.add(comment)

    finding.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(comment)

    # 1. Log activity & audit
    log_activity(
        db,
        user_id=current_user.id,
        event_type="FINDING_COMMENTED",
        title=f"Commented on Finding #{str(finding.id)[:8]}",
        description=data.content[:100],
        icon_type="chat",
        extra_data={
            "finding_id": str(finding.id),
            "report_id": str(report.id),
            "comment_id": str(comment.id),
            "parent_id": str(data.parent_id) if data.parent_id else None,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="FINDING_COMMENTED",
        organization_id=report.organization_id,
        entity="FindingComment",
        entity_id=str(comment.id),
    )

    # 2. Extract and notify @mentions
    mentioned_uids: set[uuid.UUID] = set()
    if data.mentioned_user_ids:
        for uid in data.mentioned_user_ids:
            mentioned_uids.add(uid)

    mention_matches = re.findall(r"@([a-zA-Z0-9_\.\-]+)", content_stripped)
    if mention_matches:
        try:
            org_members = db.query(OrganizationMember).filter(
                OrganizationMember.organization_id == report.organization_id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            ).all()
            for mem in org_members:
                u = mem.user or db.get(User, mem.user_id)
                if u:
                    uname = (u.username or "").lower()
                    fname = (u.full_name or "").lower().replace(" ", "")
                    email_pref = u.email.split("@")[0].lower() if u.email else ""
                    for m_match in mention_matches:
                        m_clean = m_match.lower()
                        if m_clean in (uname, fname, email_pref) or (uname and uname.startswith(m_clean)):
                            mentioned_uids.add(u.id)
        except Exception as exc:
            logger.warning("Failed parsing mention matches: %s", exc)

    for m_uid in mentioned_uids:
        if m_uid != current_user.id:
            create_notification(
                db=db,
                recipient_id=m_uid,
                organization_id=report.organization_id,
                type="FINDING_MENTIONED",
                title="You were mentioned in a comment",
                message=f"{current_user.full_name} mentioned you in Finding #{str(finding.id)[:8]}: {content_stripped[:100]}",
                finding_id=finding.id,
                report_id=report.id,
                comment_id=comment.id,
                actor_id=current_user.id,
            )

    # 3. Notify parent comment author if reply
    if parent_comment and parent_comment.user_id != current_user.id and parent_comment.user_id not in mentioned_uids:
        create_notification(
            db=db,
            recipient_id=parent_comment.user_id,
            organization_id=report.organization_id,
            type="FINDING_COMMENT_REPLIED",
            title="Reply to your comment",
            message=f"{current_user.full_name} replied to your comment on Finding #{str(finding.id)[:8]}: {content_stripped[:100]}",
            finding_id=finding.id,
            report_id=report.id,
            comment_id=comment.id,
            actor_id=current_user.id,
        )

    # 4. Notify finding stakeholders
    notify_finding_stakeholders(
        db=db,
        organization_id=report.organization_id,
        finding_id=finding.id,
        report_id=report.id,
        assignee_id=finding.assigned_to,
        actor_id=current_user.id,
        event_type="FINDING_COMMENTED",
        title="New Review Comment",
        message=f"{current_user.full_name} commented on Finding #{str(finding.id)[:8]}.",
    )
    db.commit()

    return _format_comment_response(db, comment, None, report.organization_id)


@router.patch(
    "/{finding_id}/comments/{comment_id}/resolve",
    response_model=FindingCommentResponse,
    summary="Resolve or unresolve a comment discussion",
)
def resolve_comment(
    finding_id: uuid.UUID,
    comment_id: uuid.UUID,
    data: Optional[FindingCommentResolveRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingCommentResponse:
    """Toggle resolution of a comment discussion thread (does not resolve the finding)."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    # Check caller role: ONLY ADMIN and REVIEWER are permitted to resolve or reopen comment discussions.
    user_role = get_user_org_role(db, current_user.id, report.organization_id)
    user_role_str = (user_role.value if hasattr(user_role, "value") else str(user_role or "")).upper()
    if user_role_str not in ("ADMIN", "ORGANIZATION_ADMIN", "SUPER_ADMIN", "REVIEWER"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Reviewers and Administrators are permitted to resolve or reopen comment discussions.",
        )

    comment = db.query(FindingComment).filter(
        FindingComment.id == comment_id,
        FindingComment.finding_id == finding.id,
    ).first()

    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found.",
        )

    target_resolved = True if data is None else data.is_resolved
    comment.is_resolved = target_resolved
    if target_resolved:
        comment.resolved_by = current_user.id
        comment.resolved_at = datetime.now(timezone.utc)
    else:
        comment.resolved_by = None
        comment.resolved_at = None

    db.commit()
    db.refresh(comment)

    action_label = "Resolved" if target_resolved else "Reopened"
    log_activity(
        db,
        user_id=current_user.id,
        event_type="FINDING_COMMENT_RESOLVED",
        title=f"{action_label} Discussion on Finding #{str(finding.id)[:8]}",
        description=f"{current_user.full_name} {action_label.lower()} comment discussion: {comment.content[:80]}",
        icon_type="check",
        extra_data={
            "finding_id": str(finding.id),
            "report_id": str(report.id),
            "comment_id": str(comment.id),
            "is_resolved": target_resolved,
        },
    )

    if target_resolved and comment.user_id != current_user.id:
        create_notification(
            db=db,
            recipient_id=comment.user_id,
            organization_id=report.organization_id,
            type="FINDING_COMMENT_RESOLVED",
            title="Comment Discussion Resolved",
            message=f"{current_user.full_name} marked your comment discussion on Finding #{str(finding.id)[:8]} as resolved.",
            finding_id=finding.id,
            report_id=report.id,
            comment_id=comment.id,
            actor_id=current_user.id,
        )
        db.commit()

    return _format_comment_response(db, comment, None, report.organization_id)


@router.delete(
    "/{finding_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a finding comment",
)
def delete_comment(
    finding_id: uuid.UUID,
    comment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a comment (must be author or admin)."""
    finding, report, member = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    comment = db.query(FindingComment).filter(
        FindingComment.id == comment_id,
        FindingComment.finding_id == finding.id,
    ).first()

    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found.",
        )

    org = db.get(Organization, report.organization_id)
    is_org_owner = org and org.created_by == current_user.id
    is_author = comment.user_id == current_user.id
    role_str = str(member.role.value if member and hasattr(member.role, "value") else (member.role if member else "VIEWER")).upper()
    is_admin = is_org_owner or role_str in ("ADMIN", "SUPER_ADMIN", "ORGANIZATION_ADMIN")

    if not is_author and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments unless you are an administrator.",
        )

    db.delete(comment)
    db.commit()
    return None


def _categorize_event(event_type: str) -> str:
    """Categorize an activity event into FINDING, DISCUSSION, REMEDIATION, or STATUS."""
    et = (event_type or "").upper()
    if et in (
        "FINDING_COMMENTED",
        "FINDING_COMMENT_RESOLVED",
        "FINDING_COMMENT_REPLIED",
        "FINDING_MENTIONED",
    ):
        return "DISCUSSION"
    if et.startswith("REMEDIATION_") or "CYCLE" in et or "EVIDENCE" in et:
        return "REMEDIATION"
    if et in (
        "FINDING_STATUS_CHANGED",
        "FINDING_SUBMITTED_FOR_REVIEW",
        "FINDING_RESOLVED",
        "FINDING_REOPENED",
        "FINDING_REJECTED",
        "FINDING_FALSE_POSITIVE_FLAGGED",
        "FINDING_REASSESSMENT_REQUIRED",
        "FINDING_REASSESSMENT_COMPLETED",
        "FINDING_REASSESSMENT_KEPT_RESOLVED",
    ):
        return "STATUS"
    return "FINDING"


@router.get(
    "/{finding_id}/activity",
    response_model=FindingActivityPaginatedResponse,
    summary="Get finding lifecycle activity and audit timeline (Sprint 7.13)",
)
def get_finding_activity(
    finding_id: uuid.UUID,
    category: Optional[str] = Query(None, description="Category filter: ALL, FINDING, DISCUSSION, REMEDIATION, STATUS"),
    event_type: Optional[str] = Query(None, description="Filter by specific audit event type (e.g. FINDING_RESOLVED, REMEDIATION_CYCLE_SUBMITTED)"),
    user_id: Optional[uuid.UUID] = Query(None, description="Filter by specific actor user UUID"),
    role: Optional[str] = Query(None, description="Filter by actor organization role (e.g. ADMIN, REVIEWER)"),
    date_from: Optional[datetime] = Query(None, description="Filter activities occurred on or after this UTC timestamp"),
    date_to: Optional[datetime] = Query(None, description="Filter activities occurred on or before this UTC timestamp"),
    search: Optional[str] = Query(None, description="Case-insensitive text search matching title, description, or notes"),
    page: int = Query(1, ge=1, description="Page number starting from 1"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
) -> FindingActivityPaginatedResponse:
    """Retrieve chronological, unified Activity & Audit Trail events for a finding with rich filtering and before/after states."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=False)

    finding_str = str(finding.id)
    org_id_str = str(report.organization_id)

    # Query all activities that have extra_data matching finding_id
    all_activities = db.query(Activity).filter(Activity.extra_data.isnot(None)).order_by(Activity.created_at.desc()).all()
    matched_activities = [
        act for act in all_activities
        if act.extra_data and str(act.extra_data.get("finding_id", "")) == finding_str
    ]

    # Resolve actor organization roles in a single batch query (No N+1 queries)
    user_ids: set[uuid.UUID] = set()
    for act in matched_activities:
        if act.user_id:
            user_ids.add(act.user_id)
    if report.created_by:
        user_ids.add(report.created_by)
    if finding.assigned_to:
        user_ids.add(uuid.UUID(str(finding.assigned_to)) if isinstance(finding.assigned_to, str) else finding.assigned_to)

    role_map: dict[str, str] = {}
    user_map: dict[uuid.UUID, User] = {}
    if user_ids:
        users = db.query(User).filter(User.id.in_(list(user_ids))).all()
        for u in users:
            user_map[u.id] = u

        members = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == report.organization_id,
            OrganizationMember.user_id.in_(list(user_ids)),
        ).all()
        for m in members:
            r_val = m.role.value if hasattr(m.role, "value") else str(m.role)
            role_map[str(m.user_id)] = r_val

    items: List[FindingActivityItem] = []
    has_created_event = False

    for act in matched_activities:
        if act.event_type == "FINDING_CREATED":
            has_created_event = True

        actor_user = user_map.get(act.user_id) if act.user_id else None
        actor_role = role_map.get(str(act.user_id)) if act.user_id else None

        if act.user_id and actor_user:
            actor = FindingActivityActor(
                id=str(actor_user.id),
                full_name=actor_user.full_name or actor_user.username or "User",
                email=actor_user.email or "",
                role=actor_role,
            )
            display_user_name = actor_user.full_name or actor_user.username or "User"
        else:
            actor = FindingActivityActor(
                id="system",
                full_name="System",
                email="system@lexisgraph.internal",
                role=None,
            )
            display_user_name = "System"

        cat = _categorize_event(act.event_type)
        items.append(
            FindingActivityItem(
                id=str(act.id),
                finding_id=finding_str,
                organization_id=org_id_str,
                event_type=act.event_type,
                category=cat,
                title=act.title,
                description=act.description,
                icon_type=act.icon_type or "file",
                user_name=display_user_name,
                actor=actor,
                created_at=act.created_at,
                metadata=act.extra_data,
            )
        )

    # If no explicit FINDING_CREATED was logged, synthesize the initial creation event at finding.created_at
    if not has_created_event:
        creator_user = user_map.get(report.created_by) if report.created_by else None
        creator_role = role_map.get(str(report.created_by)) if report.created_by else None
        creator_actor = FindingActivityActor(
            id=str(creator_user.id) if creator_user else "system",
            full_name=creator_user.full_name if creator_user else "System",
            email=creator_user.email if creator_user else "system@lexisgraph.internal",
            role=creator_role,
        )
        created_time = finding.created_at or report.created_at or datetime.now(timezone.utc)
        items.append(
            FindingActivityItem(
                id=f"created-{finding_str}",
                finding_id=finding_str,
                organization_id=org_id_str,
                event_type="FINDING_CREATED",
                category="FINDING",
                title=f"Finding #{finding_str[:8]} Created",
                description="Finding identified during compliance evaluation.",
                icon_type="alert",
                user_name=creator_user.full_name if creator_user else "System",
                actor=creator_actor,
                created_at=created_time,
                metadata={
                    "finding_id": finding_str,
                    "status": finding.status,
                    "lifecycle_status": "OPEN",
                    "severity": finding.severity,
                },
            )
        )

    # Sort all items newest first
    items.sort(key=lambda x: x.created_at, reverse=True)

    # 1. Apply category filter
    if category and category.strip().upper() != "ALL":
        cat_filter = category.strip().upper()
        if cat_filter == "STATUS":
            status_events = {
                "FINDING_STATUS_CHANGED",
                "FINDING_SUBMITTED_FOR_REVIEW",
                "FINDING_RESOLVED",
                "FINDING_REOPENED",
                "FINDING_REJECTED",
                "FINDING_FALSE_POSITIVE_FLAGGED",
                "REMEDIATION_APPROVED",
                "REMEDIATION_CYCLE_VERIFIED",
                "REMEDIATION_VERIFIED",
                "REMEDIATION_CYCLE_REJECTED",
                "REMEDIATION_REJECTED",
                "REMEDIATION_RETURNED",
                "REMEDIATION_CYCLE_SUBMITTED",
                "REMEDIATION_SUBMITTED",
                "FINDING_REASSESSMENT_REQUIRED",
                "FINDING_REASSESSMENT_COMPLETED",
                "FINDING_REASSESSMENT_KEPT_RESOLVED",
            }
            items = [it for it in items if it.category == "STATUS" or it.event_type in status_events]
        elif cat_filter == "FINDING":
            items = [it for it in items if it.category == "FINDING" or (it.event_type.startswith("FINDING_") and it.category != "DISCUSSION")]
        elif cat_filter == "DISCUSSION":
            items = [it for it in items if it.category == "DISCUSSION"]
        elif cat_filter == "REMEDIATION":
            items = [it for it in items if it.category == "REMEDIATION"]

    # 2. Apply specific event_type filter
    if event_type and event_type.strip():
        et_filter = event_type.strip().upper()
        items = [it for it in items if (it.event_type or "").upper() == et_filter]

    # 3. Apply user_id / actor_id filter
    if user_id:
        u_str = str(user_id)
        items = [it for it in items if it.actor and it.actor.id == u_str]

    # 4. Apply role filter
    if role and role.strip():
        r_filter = role.strip().upper()
        items = [it for it in items if it.actor and it.actor.role and it.actor.role.upper() == r_filter]

    # 5. Apply date range filters
    if date_from:
        d_from = date_from if date_from.tzinfo else date_from.replace(tzinfo=timezone.utc)
        items = [it for it in items if (it.created_at if it.created_at.tzinfo else it.created_at.replace(tzinfo=timezone.utc)) >= d_from]

    if date_to:
        d_to = date_to if date_to.tzinfo else date_to.replace(tzinfo=timezone.utc)
        items = [it for it in items if (it.created_at if it.created_at.tzinfo else it.created_at.replace(tzinfo=timezone.utc)) <= d_to]

    # 6. Apply search filter
    if search and search.strip():
        s_term = search.strip().lower()
        filtered: List[FindingActivityItem] = []
        for it in items:
            title_match = s_term in (it.title or "").lower()
            desc_match = s_term in (it.description or "").lower()
            actor_match = s_term in (it.user_name or "").lower() or (it.actor and s_term in (it.actor.full_name or "").lower())
            role_match = bool(it.actor and it.actor.role and s_term in it.actor.role.lower())
            meta_match = False
            if it.metadata:
                for k, v in it.metadata.items():
                    if isinstance(v, str) and s_term in v.lower():
                        meta_match = True
                        break
                    elif isinstance(v, dict):
                        for sub_k, sub_v in v.items():
                            if isinstance(sub_v, str) and s_term in sub_v.lower():
                                meta_match = True
                                break
            if title_match or desc_match or actor_match or role_match or meta_match:
                filtered.append(it)
        items = filtered

    total = len(items)
    total_pages = max(1, (total + limit - 1) // limit)
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_items = items[start_idx:end_idx]
    has_more = end_idx < total

    return FindingActivityPaginatedResponse(
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
        has_more=has_more,
        items=paginated_items,
    )
