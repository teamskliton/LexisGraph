"""
Compliance domain API routes, including gap detection and Compliance Operations Overview (Sprint 6.5).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_, func
from sqlalchemy.orm import Session

from app.compliance.models import ComplianceReport, ComplianceReportStatus, ReportFinding
from app.core.dependencies import get_current_user
from app.db.models import User, Organization, Document, Regulation
from app.db.models.rbac import OrganizationMember, MemberStatus
from app.db.models.activity import Activity
from app.db.session import get_db
from app.routes.findings import _format_finding_response
from app.schemas.compliance_overview import (
    ComplianceOverviewResponse,
    ComplianceOverviewSummary,
    TeamWorkloadItem,
    ReportExposureItem,
    OverdueFindingItem,
    ComplianceCalendarResponse,
    ComplianceDeadlineItem,
    DeadlineSummary,
)
from app.schemas.finding import FindingActivityItem, FindingItemResponse, FindingAssigneeResponse
from app.schemas.report import ReportItemResponse
from app.services.compliance import detect_compliance_gaps

logger = logging.getLogger(__name__)

router = APIRouter(tags=["compliance"])


@router.get("/compliance-check", summary="Run compliance gap check (legacy)")
def compliance_check() -> dict:
    try:
        return {"results": detect_compliance_gaps()}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Compliance check failed")
        raise HTTPException(status_code=500, detail="Compliance check failed") from exc


@router.get(
    "/compliance/overview",
    response_model=ComplianceOverviewResponse,
    summary="Get organization-scoped Compliance Operations Overview",
)
@router.get(
    "/overview",
    response_model=ComplianceOverviewResponse,
    summary="Get organization-scoped Compliance Operations Overview",
)
def get_compliance_overview(
    organization_id: Optional[uuid.UUID] = Query(None, description="Optional Organization UUID to filter overview metrics"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComplianceOverviewResponse:
    """
    Retrieves organization-scoped operational compliance metrics, attention required findings,
    user-assigned work, recent activity, and latest reports directly from PostgreSQL records.
    """
    target_org: Optional[Organization] = None

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
                detail="You do not have access to this organization's compliance operations.",
            )
    else:
        # Resolve user's primary/first active organization
        created_org = db.scalars(
            select(Organization).where(Organization.created_by == current_user.id).limit(1)
        ).first()

        if created_org:
            target_org = created_org
        else:
            member_org_id = db.scalars(
                select(OrganizationMember.organization_id).where(
                    OrganizationMember.user_id == current_user.id,
                    OrganizationMember.status == MemberStatus.ACTIVE,
                ).limit(1)
            ).first()

            if member_org_id:
                target_org = db.get(Organization, member_org_id)

    # Empty State fallback if user has no organization
    if not target_org:
        return ComplianceOverviewResponse(
            organization_id=str(uuid.uuid4()),
            organization_name="No Active Organization",
            summary=ComplianceOverviewSummary(
                compliance_score=None,
                compliance_status="IDLE",
                total_findings=0,
                open_findings=0,
                in_review=0,
                remediation=0,
                resolved=0,
                critical_count=0,
                high_count=0,
            ),
            attention_required=[],
            my_work=[],
            recent_activity=[],
            recent_reports=[],
        )

    resolved_org_id = target_org.id

    # 1. Fetch organization reports
    org_reports = db.scalars(
        select(ComplianceReport)
        .where(
            ComplianceReport.organization_id == resolved_org_id,
            or_(ComplianceReport.is_deleted == False, ComplianceReport.is_deleted.is_(None)),
        )
        .order_by(ComplianceReport.created_at.desc())
    ).all()

    report_ids = [r.id for r in org_reports]

    # Calculate authoritative compliance score from latest completed report or average
    completed_reports = [r for r in org_reports if r.status == ComplianceReportStatus.COMPLETED and r.overall_score is not None]
    overall_score: Optional[float] = None

    if completed_reports:
        latest_score = completed_reports[0].overall_score
        if latest_score is not None:
            overall_score = round(latest_score * 100 if (latest_score <= 1.0 and latest_score > 0) else latest_score, 1)

    compliance_status = "IDLE"
    if overall_score is not None:
        if overall_score >= 85:
            compliance_status = "LOW_RISK"
        elif overall_score >= 70:
            compliance_status = "MEDIUM_RISK"
        else:
            compliance_status = "HIGH_RISK"

    # 2. Fetch Findings for organization reports
    findings: List[ReportFinding] = []
    if report_ids:
        findings = db.scalars(
            select(ReportFinding).where(ReportFinding.report_id.in_(report_ids))
        ).all()

    total_cnt = len(findings)
    open_cnt = 0
    in_review_cnt = 0
    remediation_cnt = 0
    resolved_cnt = 0
    critical_cnt = 0
    high_cnt = 0
    overdue_cnt = 0
    now_utc = datetime.now(timezone.utc)

    for f in findings:
        st = (f.lifecycle_status or "OPEN").upper()
        sev = (f.severity or "").upper()

        if st in ("OPEN", "REOPENED"):
            open_cnt += 1
        elif st == "IN_REVIEW":
            in_review_cnt += 1
        elif st == "REMEDIATION":
            remediation_cnt += 1
        elif st == "RESOLVED":
            resolved_cnt += 1

        due_dt = (
            f.remediation_due_date.replace(tzinfo=timezone.utc)
            if (f.remediation_due_date and f.remediation_due_date.tzinfo is None)
            else f.remediation_due_date
        )

        if due_dt and due_dt < now_utc and st != "RESOLVED":
            overdue_cnt += 1

        if sev == "CRITICAL":
            critical_cnt += 1
        elif sev == "HIGH":
            high_cnt += 1
        elif f.status == "NON_COMPLIANT":
            critical_cnt += 1

    # Calculate operational metrics
    unassigned_findings_raw = [
        f for f in findings
        if f.assigned_to is None and (f.lifecycle_status or "OPEN").upper() != "RESOLVED"
    ]
    unassigned_cnt = len(unassigned_findings_raw)

    summary = ComplianceOverviewSummary(
        compliance_score=overall_score,
        compliance_status=compliance_status,
        total_findings=total_cnt,
        open_findings=open_cnt,
        in_review=in_review_cnt,
        remediation=remediation_cnt,
        resolved=resolved_cnt,
        critical_count=critical_cnt,
        high_count=high_cnt,
        overdue_count=overdue_cnt,
        unassigned_count=unassigned_cnt,
    )

    # 3. Priority Attention Queue (Critical > High > Overdue > Due soon > Other unresolved)
    unresolved_findings = [
        f for f in findings if (f.lifecycle_status or "OPEN").upper() != "RESOLVED"
    ]

    sev_rank = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}

    def _priority_key(f: ReportFinding):
        st = (f.lifecycle_status or "OPEN").upper()
        sev = (f.severity or "").upper()
        s_score = sev_rank.get(sev, 1 if f.status == "NON_COMPLIANT" else 0)

        due_dt = (
            f.remediation_due_date.replace(tzinfo=timezone.utc)
            if (f.remediation_due_date and f.remediation_due_date.tzinfo is None)
            else f.remediation_due_date
        )
        is_overdue = 1 if (due_dt and due_dt < now_utc and st != "RESOLVED") else 0
        has_due = 1 if due_dt else 0
        due_ts = -due_dt.timestamp() if due_dt else -9999999999
        created_ts = f.created_at.timestamp() if f.created_at else 0

        return (s_score, is_overdue, has_due, due_ts, created_ts)

    unresolved_findings.sort(key=_priority_key, reverse=True)
    priority_attention_resp: List[FindingItemResponse] = [
        _format_finding_response(db, f) for f in unresolved_findings[:10]
    ]

    # Legacy attention_required for backward compatibility
    attention_findings = [
        f for f in findings
        if (f.severity in ("CRITICAL", "HIGH") or f.status == "NON_COMPLIANT")
        and (f.lifecycle_status or "OPEN").upper() in ("OPEN", "IN_REVIEW", "REMEDIATION", "REOPENED")
    ]
    attention_findings.sort(key=lambda x: (sev_rank.get((x.severity or "").upper(), 1), x.created_at), reverse=True)
    attention_resp: List[FindingItemResponse] = [
        _format_finding_response(db, f) for f in attention_findings[:5]
    ]

    # 4. My Work: Findings assigned to current_user
    my_work_findings = [
        f for f in findings
        if f.assigned_to == current_user.id and (f.lifecycle_status or "OPEN").upper() != "RESOLVED"
    ]
    my_work_findings.sort(key=lambda x: x.updated_at or x.created_at, reverse=True)
    my_work_resp: List[FindingItemResponse] = [
        _format_finding_response(db, f) for f in my_work_findings[:5]
    ]

    # 5. Team Workload Summary
    active_members = db.scalars(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == resolved_org_id,
            OrganizationMember.status == MemberStatus.ACTIVE,
        )
    ).all()
    member_uids = [m.user_id for m in active_members]
    if target_org.created_by not in member_uids:
        member_uids.append(target_org.created_by)

    org_users = db.scalars(select(User).where(User.id.in_(member_uids))).all() if member_uids else []
    user_map = {u.id: u for u in org_users}
    role_map = {m.user_id: str(m.role.value if hasattr(m.role, "value") else m.role) for m in active_members}

    team_workload_resp: List[TeamWorkloadItem] = []
    for uid in member_uids:
        user_obj = user_map.get(uid)
        if not user_obj:
            continue

        u_findings = [f for f in findings if f.assigned_to == uid]
        u_open = sum(1 for f in u_findings if (f.lifecycle_status or "OPEN").upper() in ("OPEN", "REOPENED"))
        u_review = sum(1 for f in u_findings if (f.lifecycle_status or "OPEN").upper() == "IN_REVIEW")
        u_remediation = sum(1 for f in u_findings if (f.lifecycle_status or "OPEN").upper() == "REMEDIATION")
        u_resolved = sum(1 for f in u_findings if (f.lifecycle_status or "OPEN").upper() == "RESOLVED")

        team_workload_resp.append(
            TeamWorkloadItem(
                user_id=str(user_obj.id),
                full_name=user_obj.full_name,
                email=user_obj.email,
                role=role_map.get(user_obj.id, "MEMBER"),
                open_count=u_open,
                in_review_count=u_review,
                remediation_count=u_remediation,
                resolved_count=u_resolved,
                total_assigned=len(u_findings),
            )
        )

    # 6. Unassigned Findings
    unassigned_resp: List[FindingItemResponse] = [
        _format_finding_response(db, f) for f in unassigned_findings_raw[:10]
    ]

    # 7. Overdue Work
    overdue_findings_raw = []
    for f in findings:
        st = (f.lifecycle_status or "OPEN").upper()
        if st == "RESOLVED":
            continue
        due_dt = (
            f.remediation_due_date.replace(tzinfo=timezone.utc)
            if (f.remediation_due_date and f.remediation_due_date.tzinfo is None)
            else f.remediation_due_date
        )
        if due_dt and due_dt < now_utc:
            days_ov = int((now_utc - due_dt).total_seconds() // 86400)
            formatted_f = _format_finding_response(db, f)
            overdue_findings_raw.append(
                OverdueFindingItem(
                    **formatted_f.model_dump(),
                    days_overdue=max(1, days_ov),
                )
            )

    overdue_findings_raw.sort(key=lambda x: x.days_overdue, reverse=True)

    # 8. Report Exposure Summary
    report_exposure_resp: List[ReportExposureItem] = []
    reg_ids = [r.regulation_id for r in org_reports if r.regulation_id]
    pol_ids = [r.policy_document_id for r in org_reports if r.policy_document_id]

    regs = db.scalars(select(Regulation).where(Regulation.id.in_(reg_ids))).all() if reg_ids else []
    pols = db.scalars(select(Document).where(Document.id.in_(pol_ids))).all() if pol_ids else []

    reg_map = {rg.id: rg.title for rg in regs}
    pol_map = {pl.id: pl.original_filename for pl in pols}

    for r in org_reports:
        r_findings = [f for f in findings if f.report_id == r.id]
        r_open = sum(1 for f in r_findings if (f.lifecycle_status or "OPEN").upper() != "RESOLVED")
        r_hc = sum(
            1 for f in r_findings
            if (f.lifecycle_status or "OPEN").upper() != "RESOLVED"
            and ((f.severity or "").upper() in ("CRITICAL", "HIGH") or f.status == "NON_COMPLIANT")
        )

        report_exposure_resp.append(
            ReportExposureItem(
                report_id=str(r.id),
                regulation_title=reg_map.get(r.regulation_id, "Statutory Standard"),
                policy_filename=pol_map.get(r.policy_document_id, "Policy Document"),
                open_count=r_open,
                high_critical_count=r_hc,
                total_findings=len(r_findings),
            )
        )

    # 9. Recent Reports
    recent_reports_resp: List[ReportItemResponse] = []
    for r in org_reports[:5]:
        r_findings = [f for f in findings if f.report_id == r.id]
        op = sum(1 for f in r_findings if (f.lifecycle_status or "OPEN").upper() in ("OPEN", "REOPENED"))
        ir = sum(1 for f in r_findings if (f.lifecycle_status or "OPEN").upper() == "IN_REVIEW")
        rem = sum(1 for f in r_findings if (f.lifecycle_status or "OPEN").upper() == "REMEDIATION")
        res = sum(1 for f in r_findings if (f.lifecycle_status or "OPEN").upper() == "RESOLVED")

        score_val = round(r.overall_score * 100 if (r.overall_score <= 1.0 and r.overall_score > 0) else r.overall_score, 1) if r.overall_score is not None else None

        recent_reports_resp.append(
            ReportItemResponse(
                id=r.id,
                organization_id=r.organization_id,
                regulation_id=r.regulation_id,
                regulation_document_id=r.regulation_document_id,
                policy_document_id=r.policy_document_id,
                overall_score=score_val,
                risk_level=r.risk_level,
                total_matches=r.total_matches,
                total_partial_matches=r.total_partial_matches,
                total_missing=r.total_missing,
                report_status=r.status,
                created_at=r.created_at,
                processing_time_seconds=r.processing_time_seconds,
                processing_time_ms=r.processing_time_ms,
                is_deleted=r.is_deleted,
                open_count=op,
                in_review_count=ir,
                remediation_count=rem,
                resolved_count=res,
            )
        )

    # 10. Recent Activity
    member_user_ids = db.scalars(
        select(OrganizationMember.user_id).where(OrganizationMember.organization_id == resolved_org_id)
    ).all()
    if target_org.created_by not in member_user_ids:
        member_user_ids.append(target_org.created_by)

    activities = db.scalars(
        select(Activity)
        .where(Activity.user_id.in_(member_user_ids))
        .order_by(Activity.created_at.desc())
        .limit(20)
    ).all()

    filtered_activities = []
    for act in activities:
        act_org = str(act.extra_data.get("organization_id", "")) if act.extra_data else ""
        if not act_org or act_org == str(resolved_org_id):
            filtered_activities.append(act)

    activity_user_ids = list({act.user_id for act in filtered_activities[:10]})
    activity_users = db.scalars(select(User).where(User.id.in_(activity_user_ids))).all() if activity_user_ids else []
    user_name_map = {u.id: u.full_name for u in activity_users}

    recent_activity_resp: List[FindingActivityItem] = []
    for act in filtered_activities[:10]:
        finding_id_str = str(act.extra_data.get("finding_id", "")) if act.extra_data else ""
        recent_activity_resp.append(
            FindingActivityItem(
                id=str(act.id),
                finding_id=finding_id_str,
                user_name=user_name_map.get(act.user_id, "System User"),
                event_type=act.event_type,
                title=act.title,
                description=act.description,
                created_at=act.created_at,
            )
        )

    return ComplianceOverviewResponse(
        organization_id=str(target_org.id),
        organization_name=target_org.name,
        summary=summary,
        attention_required=attention_resp,
        priority_attention=priority_attention_resp,
        team_workload=team_workload_resp,
        unassigned_findings=unassigned_resp,
        overdue_findings=overdue_findings_raw,
        report_exposure=report_exposure_resp,
        my_work=my_work_resp,
        recent_activity=recent_activity_resp,
        recent_reports=recent_reports_resp,
    )


@router.get(
    "/calendar",
    response_model=ComplianceCalendarResponse,
    summary="Get compliance remediation deadlines calendar for active organization",
)
def get_compliance_calendar(
    organization_id: Optional[uuid.UUID] = Query(None, description="Optional Organization UUID filter"),
    start_date: Optional[datetime] = Query(None, description="Optional start timestamp filter"),
    end_date: Optional[datetime] = Query(None, description="Optional end timestamp filter"),
    assigned_to_me: bool = Query(False, description="Filter deadlines assigned to authenticated user"),
    overdue_only: bool = Query(False, description="Filter overdue deadlines only"),
    severity: Optional[str] = Query(None, description="Filter by severity level"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComplianceCalendarResponse:
    """
    Returns organization-scoped compliance remediation deadlines for calendar & timeline views.
    Only findings with a valid remediation_due_date and non-RESOLVED status are surfaced.
    """
    target_org: Optional[Organization] = None

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
                detail="You do not have access to this organization's compliance calendar.",
            )
    else:
        created_org = db.scalars(
            select(Organization).where(Organization.created_by == current_user.id).limit(1)
        ).first()

        if created_org:
            target_org = created_org
        else:
            member_org_id = db.scalars(
                select(OrganizationMember.organization_id).where(
                    OrganizationMember.user_id == current_user.id,
                    OrganizationMember.status == MemberStatus.ACTIVE,
                ).limit(1)
            ).first()

            if member_org_id:
                target_org = db.get(Organization, member_org_id)

    if not target_org:
        return ComplianceCalendarResponse(
            organization_id=str(uuid.uuid4()),
            organization_name="No Organization",
            summary=DeadlineSummary(overdue_count=0, this_week_count=0, next_30_days_count=0),
            deadlines=[],
        )

    resolved_org_id = target_org.id

    # Fetch organization reports
    org_reports = db.scalars(
        select(ComplianceReport).where(
            ComplianceReport.organization_id == resolved_org_id,
            ComplianceReport.is_deleted == False,
        )
    ).all()
    report_ids = [r.id for r in org_reports]

    if not report_ids:
        return ComplianceCalendarResponse(
            organization_id=str(target_org.id),
            organization_name=target_org.name,
            summary=DeadlineSummary(overdue_count=0, this_week_count=0, next_30_days_count=0),
            deadlines=[],
        )

    # Fetch findings with remediation_due_date set and NOT resolved
    query = (
        select(ReportFinding)
        .where(
            ReportFinding.report_id.in_(report_ids),
            ReportFinding.remediation_due_date.isnot(None),
            ReportFinding.lifecycle_status != "RESOLVED",
        )
    )

    if assigned_to_me:
        query = query.where(ReportFinding.assigned_to == current_user.id)

    if severity:
        query = query.where(func.upper(ReportFinding.severity) == severity.upper())

    all_due_findings = db.scalars(query).all()

    now_utc = datetime.now(timezone.utc)
    week_end_utc = now_utc + timedelta(days=7)
    thirty_days_end_utc = now_utc + timedelta(days=30)

    # Compute organization summary metrics over all active due findings
    overdue_cnt = 0
    this_week_cnt = 0
    next_30_days_cnt = 0

    for f in all_due_findings:
        due_dt = (
            f.remediation_due_date.replace(tzinfo=timezone.utc)
            if f.remediation_due_date and f.remediation_due_date.tzinfo is None
            else f.remediation_due_date
        )

        if due_dt < now_utc:
            overdue_cnt += 1
        elif now_utc <= due_dt <= week_end_utc:
            this_week_cnt += 1

        if now_utc <= due_dt <= thirty_days_end_utc:
            next_30_days_cnt += 1

    summary = DeadlineSummary(
        overdue_count=overdue_cnt,
        this_week_count=this_week_cnt,
        next_30_days_count=next_30_days_cnt,
    )

    # Apply date range and overdue_only filters for response items
    filtered_findings = []
    for f in all_due_findings:
        due_dt = (
            f.remediation_due_date.replace(tzinfo=timezone.utc)
            if f.remediation_due_date and f.remediation_due_date.tzinfo is None
            else f.remediation_due_date
        )

        if overdue_only and due_dt >= now_utc:
            continue

        if start_date:
            s_dt = start_date.replace(tzinfo=timezone.utc) if start_date.tzinfo is None else start_date
            if due_dt < s_dt:
                continue

        if end_date:
            e_dt = end_date.replace(tzinfo=timezone.utc) if end_date.tzinfo is None else end_date
            if due_dt > e_dt:
                continue

        filtered_findings.append(f)

    # Pre-fetch lookup mappings (regulations, policies, assignees)
    reg_ids = [r.regulation_id for r in org_reports if r.regulation_id]
    pol_ids = [r.policy_document_id for r in org_reports if r.policy_document_id]
    assignee_ids = list({f.assigned_to for f in filtered_findings if f.assigned_to})

    regs = db.scalars(select(Regulation).where(Regulation.id.in_(reg_ids))).all() if reg_ids else []
    pols = db.scalars(select(Document).where(Document.id.in_(pol_ids))).all() if pol_ids else []
    assignees = db.scalars(select(User).where(User.id.in_(assignee_ids))).all() if assignee_ids else []

    reg_map = {rg.id: rg.title for rg in regs}
    pol_map = {pl.id: pl.original_filename for pl in pols}
    assignee_map = {u.id: u for u in assignees}
    report_map = {r.id: r for r in org_reports}

    deadlines_resp: List[ComplianceDeadlineItem] = []
    for f in filtered_findings:
        due_dt = (
            f.remediation_due_date.replace(tzinfo=timezone.utc)
            if f.remediation_due_date and f.remediation_due_date.tzinfo is None
            else f.remediation_due_date
        )
        is_ov = due_dt < now_utc
        days_ov = int((now_utc - due_dt).total_seconds() // 86400) if is_ov else 0

        r_obj = report_map.get(f.report_id)
        reg_title = reg_map.get(r_obj.regulation_id, "Statutory Standard") if r_obj else None
        pol_name = pol_map.get(r_obj.policy_document_id, "Policy Document") if r_obj else None

        assignee_dto = None
        if f.assigned_to and f.assigned_to in assignee_map:
            u_obj = assignee_map[f.assigned_to]
            assignee_dto = FindingAssigneeResponse(
                id=str(u_obj.id),
                full_name=u_obj.full_name,
                email=u_obj.email,
            )

        deadlines_resp.append(
            ComplianceDeadlineItem(
                finding_id=str(f.id),
                report_id=str(f.report_id),
                regulation_title=reg_title,
                policy_filename=pol_name,
                policy_clause_id=f.policy_clause_id,
                regulation_clause_id=f.regulation_clause_id,
                status=f.status or "NON_COMPLIANT",
                lifecycle_status=f.lifecycle_status or "OPEN",
                severity=f.severity or "HIGH",
                reasoning=f.reasoning,
                citation=f.citation,
                remediation_due_date=due_dt,
                is_overdue=is_ov,
                days_overdue=max(0, days_ov),
                assigned_to=str(f.assigned_to) if f.assigned_to else None,
                assignee=assignee_dto,
                created_at=f.created_at,
                updated_at=f.updated_at or f.created_at,
            )
        )

    deadlines_resp.sort(key=lambda x: x.remediation_due_date)

    return ComplianceCalendarResponse(
        organization_id=str(target_org.id),
        organization_name=target_org.name,
        summary=summary,
        deadlines=deadlines_resp,
    )
