"""
Service for deterministic data aggregation of Compliance Management Reports (Sprint 7.14).
Aggregates findings, policies, regulations, remediation cycles, resolution history, reassessment records, and audit events.
Never uses LLMs or generates synthetic numerical data.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from collections import defaultdict

from sqlalchemy import func, select, or_, and_, desc
from sqlalchemy.orm import Session

from app.compliance.models import ComplianceReport, ReportFinding, FindingResolutionHistory
from app.db.models.document import Document
from app.db.models.regulation import Regulation
from app.db.models.remediation import FindingRemediation, RemediationCycle, RemediationEvidence
from app.db.models.activity import Activity
from app.db.models.user import User
from app.db.models.organization import Organization
from app.db.models.rbac import OrganizationMember, MemberStatus
from app.schemas.compliance_management_report import (
    ComplianceManagementReportResponse,
    ComplianceReportExecutiveMetrics,
    ReportStatusDistributionItem,
    ReportSeverityDistributionItem,
    HighRiskReportFindingItem,
    PolicyGapItem,
    RegulationGapItem,
    RemediationOperationsSummary,
    ReassessmentOperationsSummary,
    ResolutionOperationsSummary,
    ReportTrendPoint,
    AuditActivitySummaryItem,
)

SEVERITY_WEIGHT = {
    "CRITICAL": 4,
    "HIGH": 3,
    "MEDIUM": 2,
    "LOW": 1,
}


def _is_dt_ge(dt1: Optional[datetime], dt2: Optional[datetime]) -> bool:
    """Safe >= comparison handling mixed offset-naive and offset-aware datetimes."""
    if dt1 is None:
        return False
    if dt2 is None:
        return True
    t1 = dt1.astimezone(timezone.utc).replace(tzinfo=None) if dt1.tzinfo else dt1
    t2 = dt2.astimezone(timezone.utc).replace(tzinfo=None) if dt2.tzinfo else dt2
    return t1 >= t2


def _is_dt_le(dt1: Optional[datetime], dt2: Optional[datetime]) -> bool:
    """Safe <= comparison handling mixed offset-naive and offset-aware datetimes."""
    if dt1 is None:
        return False
    if dt2 is None:
        return True
    t1 = dt1.astimezone(timezone.utc).replace(tzinfo=None) if dt1.tzinfo else dt1
    t2 = dt2.astimezone(timezone.utc).replace(tzinfo=None) if dt2.tzinfo else dt2
    return t1 <= t2


def build_compliance_management_report(
    db: Session,
    organization: Organization,
    current_user: User,
    user_role_label: Optional[str] = None,
    date_range: Optional[str] = "all",
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    severity: Optional[str] = None,
    lifecycle_status: Optional[str] = None,
    policy_document_id: Optional[uuid.UUID] = None,
    regulation_id: Optional[uuid.UUID] = None,
) -> ComplianceManagementReportResponse:
    """
    Computes deterministic management compliance metrics and structures the report data.
    """
    now_utc = datetime.now(timezone.utc)
    org_id = organization.id

    # 1. Parse Reporting Period
    start_dt: Optional[datetime] = None
    end_dt: Optional[datetime] = None
    applied_range_label = "All Time"

    dr_clean = (date_range or "all").lower().strip()
    if dr_clean == "7d":
        start_dt = now_utc - timedelta(days=7)
        applied_range_label = "Last 7 Days"
    elif dr_clean == "30d":
        start_dt = now_utc - timedelta(days=30)
        applied_range_label = "Last 30 Days"
    elif dr_clean == "90d":
        start_dt = now_utc - timedelta(days=90)
        applied_range_label = "Last 90 Days"
    elif dr_clean == "this_year":
        start_dt = datetime(now_utc.year, 1, 1, tzinfo=timezone.utc)
        applied_range_label = f"Year to Date ({now_utc.year})"
    elif dr_clean == "custom" and (from_date or to_date):
        start_dt = from_date
        end_dt = to_date
        s_str = from_date.strftime("%d %b %Y") if from_date else "Beginning"
        e_str = to_date.strftime("%d %b %Y") if to_date else "Present"
        applied_range_label = f"{s_str} - {e_str}"
    else:
        applied_range_label = "All Time"

    # 2. Base Query for Findings within Organization & Filters
    query = (
        db.query(ReportFinding, ComplianceReport)
        .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
        .filter(
            ComplianceReport.organization_id == org_id,
            or_(ComplianceReport.is_deleted == False, ComplianceReport.is_deleted.is_(None)),
        )
    )

    # Apply date filters to finding created_at
    if start_dt:
        query = query.filter(ReportFinding.created_at >= start_dt)
    if end_dt:
        query = query.filter(ReportFinding.created_at <= end_dt)

    if severity and severity.upper() != "ALL":
        query = query.filter(ReportFinding.severity == severity.upper())

    if lifecycle_status and lifecycle_status.upper() != "ALL":
        st_val = lifecycle_status.upper()
        if st_val in ("REMEDIATION", "REMEDIATION_REQUIRED"):
            query = query.filter(ReportFinding.lifecycle_status.in_(["REMEDIATION", "REMEDIATION_REQUIRED"]))
        else:
            query = query.filter(ReportFinding.lifecycle_status == st_val)

    if policy_document_id:
        query = query.filter(ComplianceReport.policy_document_id == policy_document_id)

    if regulation_id:
        query = query.filter(ComplianceReport.regulation_id == regulation_id)

    results = query.all()
    findings_list = [f for f, _ in results]
    reports_map = {r.id: r for _, r in results}

    # Preload related Document and Regulation maps
    policy_ids = {r.policy_document_id for r in reports_map.values() if r.policy_document_id}
    reg_ids = {r.regulation_id for r in reports_map.values() if r.regulation_id}

    policy_map: Dict[uuid.UUID, Document] = {}
    if policy_ids:
        docs = db.query(Document).filter(Document.id.in_(list(policy_ids))).all()
        for d in docs:
            policy_map[d.id] = d

    regulation_map: Dict[uuid.UUID, Regulation] = {}
    if reg_ids:
        regs = db.query(Regulation).filter(Regulation.id.in_(list(reg_ids))).all()
        for r in regs:
            regulation_map[r.id] = r

    # Preload User Assignees
    assignee_ids = {f.assigned_to for f in findings_list if f.assigned_to}
    user_map: Dict[uuid.UUID, User] = {}
    if assignee_ids:
        users = db.query(User).filter(User.id.in_(list(assignee_ids))).all()
        for u in users:
            user_map[u.id] = u

    # Preload Remediations
    finding_ids = [f.id for f in findings_list]
    remediations_map: Dict[uuid.UUID, FindingRemediation] = {}
    remediation_cycles_count: Dict[uuid.UUID, int] = defaultdict(int)

    if finding_ids:
        rems = db.query(FindingRemediation).filter(FindingRemediation.finding_id.in_(finding_ids)).all()
        rem_ids = [r.id for r in rems]
        for r in rems:
            remediations_map[r.finding_id] = r

        if rem_ids:
            cycle_counts = (
                db.query(RemediationCycle.remediation_id, func.count(RemediationCycle.id))
                .filter(RemediationCycle.remediation_id.in_(rem_ids))
                .group_by(RemediationCycle.remediation_id)
                .all()
            )
            for r_id, count in cycle_counts:
                remediation_cycles_count[r_id] = count

    # 3. Compute Executive Metrics
    total_count = len(findings_list)
    open_count = 0
    critical_count = 0
    high_count = 0
    medium_count = 0
    low_count = 0
    under_remediation_count = 0
    needs_reassessment_count = 0
    resolved_count = 0
    reopened_count = 0

    status_counts: Dict[str, int] = defaultdict(int)
    severity_counts: Dict[str, int] = defaultdict(int)

    for f in findings_list:
        sev = (f.severity or "MEDIUM").upper()
        st = (f.lifecycle_status or "OPEN").upper()

        if sev == "CRITICAL":
            critical_count += 1
        elif sev == "HIGH":
            high_count += 1
        elif sev == "MEDIUM":
            medium_count += 1
        elif sev == "LOW":
            low_count += 1

        severity_counts[sev] += 1
        status_counts[st] += 1

        if st == "RESOLVED":
            resolved_count += 1

        if st in ("REMEDIATION", "REMEDIATION_REQUIRED"):
            under_remediation_count += 1
        elif st == "REASSESSMENT_REQUIRED":
            needs_reassessment_count += 1
        elif st == "REOPENED":
            reopened_count += 1

    # In alignment with Sprint 7.11 analytics, open_findings counts OPEN + REOPENED
    open_count = status_counts.get("OPEN", 0) + status_counts.get("REOPENED", 0)
    unresolved_count = total_count - resolved_count

    res_rate = round((resolved_count / total_count * 100), 1) if total_count > 0 else 0.0

    exec_metrics = ComplianceReportExecutiveMetrics(
        total_findings=total_count,
        open_findings=open_count,
        critical_findings=critical_count,
        high_findings=high_count,
        medium_findings=medium_count,
        low_findings=low_count,
        under_remediation=under_remediation_count,
        needs_reassessment=needs_reassessment_count,
        resolved_findings=resolved_count,
        reopened_findings=reopened_count,
        resolution_rate_percentage=res_rate,
    )

    # 4. Compute Status & Severity Distributions
    status_label_map = {
        "OPEN": "Open",
        "IN_REVIEW": "Under Review",
        "REMEDIATION": "Remediation",
        "REMEDIATION_REQUIRED": "Remediation",
        "POTENTIAL_FALSE_POSITIVE": "Potential False Positive",
        "ADMIN_REVIEW": "Admin Review",
        "REASSESSMENT_REQUIRED": "Needs Reassessment",
        "REOPENED": "Reopened",
        "RESOLVED": "Resolved",
        "REJECTED": "Rejected (False Positive)",
    }
    grouped_status_counts: Dict[str, int] = defaultdict(int)
    for st, c in status_counts.items():
        canonical = "REMEDIATION" if st in ("REMEDIATION", "REMEDIATION_REQUIRED") else st
        grouped_status_counts[canonical] += c

    status_dist: List[ReportStatusDistributionItem] = []
    for st in ["OPEN", "IN_REVIEW", "REMEDIATION", "REASSESSMENT_REQUIRED", "REOPENED", "RESOLVED", "REJECTED"]:
        c = grouped_status_counts.get(st, 0)
        pct = round((c / total_count * 100), 1) if total_count > 0 else 0.0
        status_dist.append(
            ReportStatusDistributionItem(
                status=st,
                label=status_label_map.get(st, st.capitalize()),
                count=c,
                percentage=pct,
            )
        )

    severity_dist: List[ReportSeverityDistributionItem] = []
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
        c = severity_counts.get(sev, 0)
        pct = round((c / total_count * 100), 1) if total_count > 0 else 0.0
        severity_dist.append(
            ReportSeverityDistributionItem(
                severity=sev,
                label=sev.capitalize(),
                count=c,
                percentage=pct,
            )
        )

    # 5. High-Risk Unresolved Findings
    unresolved_findings = [f for f in findings_list if (f.lifecycle_status or "OPEN").upper() not in ("RESOLVED", "REJECTED")]
    # Sort by Severity Weight desc, then age desc
    def _finding_sort_key(f: ReportFinding):
        sev_w = SEVERITY_WEIGHT.get((f.severity or "").upper(), 0)
        age = (now_utc - (f.created_at if f.created_at.tzinfo else f.created_at.replace(tzinfo=timezone.utc))).total_seconds() if f.created_at else 0
        return (sev_w, age)

    unresolved_findings.sort(key=_finding_sort_key, reverse=True)

    high_risk_items: List[HighRiskReportFindingItem] = []
    for f in unresolved_findings[:20]:
        rep = reports_map.get(f.report_id)
        doc = policy_map.get(rep.policy_document_id) if rep and rep.policy_document_id else None
        reg = regulation_map.get(rep.regulation_id) if rep and rep.regulation_id else None
        rem = remediations_map.get(f.id)
        cycle_count = remediation_cycles_count.get(rem.id, 0) if rem else 0
        assignee_u = user_map.get(f.assigned_to) if f.assigned_to else None

        f_created = f.created_at if f.created_at.tzinfo else f.created_at.replace(tzinfo=timezone.utc) if f.created_at else now_utc
        age_days = max(0, (now_utc - f_created).days)

        title_text = f.policy_clause_id or (f.reasoning[:60] + "..." if f.reasoning and len(f.reasoning) > 60 else (f.reasoning or f"Finding #{str(f.id)[:8]}"))

        high_risk_items.append(
            HighRiskReportFindingItem(
                id=str(f.id),
                title=title_text,
                severity=(f.severity or "MEDIUM").upper(),
                lifecycle_status=(f.lifecycle_status or "OPEN").upper(),
                compliance_status=(f.status or "NON_COMPLIANT").upper(),
                policy_name=doc.original_filename if doc else "Internal Security Policy",
                policy_clause_id=f.policy_clause_id,
                regulation_name=reg.title if reg else "Compliance Regulation",
                regulation_clause_id=f.regulation_clause_id,
                citation=f.citation,
                age_days=age_days,
                remediation_cycle=cycle_count,
                assigned_to_name=assignee_u.full_name if assignee_u else "Unassigned",
                created_at=f.created_at,
            )
        )

    # 6. Policy Gap Summary
    policy_gap_dict: Dict[uuid.UUID, Dict[str, Any]] = defaultdict(lambda: {
        "total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0, "unresolved": 0, "resolved": 0, "doc_name": ""
    })
    for f in findings_list:
        rep = reports_map.get(f.report_id)
        p_id = rep.policy_document_id if rep else None
        if not p_id:
            continue
        entry = policy_gap_dict[p_id]
        doc = policy_map.get(p_id)
        entry["doc_name"] = doc.original_filename if doc else f"Policy {str(p_id)[:8]}"
        entry["total"] += 1
        sev = (f.severity or "").upper()
        if sev == "CRITICAL":
            entry["critical"] += 1
        elif sev == "HIGH":
            entry["high"] += 1
        elif sev == "MEDIUM":
            entry["medium"] += 1
        elif sev == "LOW":
            entry["low"] += 1

        if (f.lifecycle_status or "").upper() == "RESOLVED":
            entry["resolved"] += 1
        else:
            entry["unresolved"] += 1

    policy_gaps: List[PolicyGapItem] = []
    for p_id, stats in sorted(policy_gap_dict.items(), key=lambda x: x[1]["total"], reverse=True)[:10]:
        policy_gaps.append(
            PolicyGapItem(
                policy_document_id=str(p_id),
                policy_name=stats["doc_name"],
                total_findings=stats["total"],
                critical_count=stats["critical"],
                high_count=stats["high"],
                medium_count=stats["medium"],
                low_count=stats["low"],
                unresolved_count=stats["unresolved"],
                resolved_count=stats["resolved"],
            )
        )

    # 7. Regulation Gap Summary
    reg_gap_dict: Dict[uuid.UUID, Dict[str, Any]] = defaultdict(lambda: {
        "total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0, "unresolved": 0, "resolved": 0, "reg_title": ""
    })
    for f in findings_list:
        rep = reports_map.get(f.report_id)
        r_id = rep.regulation_id if rep else None
        if not r_id:
            continue
        entry = reg_gap_dict[r_id]
        reg = regulation_map.get(r_id)
        entry["reg_title"] = reg.title if reg else f"Regulation {str(r_id)[:8]}"
        entry["total"] += 1
        sev = (f.severity or "").upper()
        if sev == "CRITICAL":
            entry["critical"] += 1
        elif sev == "HIGH":
            entry["high"] += 1
        elif sev == "MEDIUM":
            entry["medium"] += 1
        elif sev == "LOW":
            entry["low"] += 1

        if (f.lifecycle_status or "").upper() == "RESOLVED":
            entry["resolved"] += 1
        else:
            entry["unresolved"] += 1

    regulation_gaps: List[RegulationGapItem] = []
    for r_id, stats in sorted(reg_gap_dict.items(), key=lambda x: x[1]["total"], reverse=True)[:10]:
        regulation_gaps.append(
            RegulationGapItem(
                regulation_id=str(r_id),
                regulation_title=stats["reg_title"],
                total_findings=stats["total"],
                critical_count=stats["critical"],
                high_count=stats["high"],
                medium_count=stats["medium"],
                low_count=stats["low"],
                unresolved_count=stats["unresolved"],
                resolved_count=stats["resolved"],
            )
        )

    # 8. Remediation Operations Summary
    pending_rem = 0
    submitted_rem = 0
    verified_rem = 0
    approved_rem = 0
    rejected_rem = 0
    multiple_cycles_rem = 0
    total_cycles = 0

    for f in findings_list:
        rem = remediations_map.get(f.id)
        if rem:
            rem_st = (rem.status or "NOT_STARTED").upper()
            if rem_st in ("NOT_STARTED", "IN_PROGRESS"):
                pending_rem += 1
            elif rem_st == "READY_FOR_REVIEW":
                submitted_rem += 1
            elif rem_st == "VERIFIED":
                verified_rem += 1
            elif rem_st == "APPROVED":
                approved_rem += 1
            elif rem_st == "REJECTED":
                rejected_rem += 1

            c_count = remediation_cycles_count.get(rem.id, 0)
            total_cycles += c_count
            if c_count > 1:
                multiple_cycles_rem += 1

    remediation_summary = RemediationOperationsSummary(
        pending_remediation_count=pending_rem,
        submitted_for_review_count=submitted_rem,
        verified_count=verified_rem,
        approved_count=approved_rem,
        rejected_count=rejected_rem,
        multiple_cycles_count=multiple_cycles_rem,
        total_cycles_completed=total_cycles,
    )

    # 9. Reassessment Operations Summary
    reassessment_required_count = 0
    recently_reassessed_count = 0
    reopened_after_reassessment_count = 0
    kept_resolved_after_reassessment_count = 0

    for f in findings_list:
        if f.lifecycle_status == "REASSESSMENT_REQUIRED":
            reassessment_required_count += 1
        if f.reassessment_detected_at:
            if not start_dt or _is_dt_ge(f.reassessment_detected_at, start_dt):
                recently_reassessed_count += 1

    # Check Resolution History for Reassessment decisions in period
    res_hist_query = db.query(FindingResolutionHistory).filter(
        FindingResolutionHistory.organization_id == org_id
    )
    if start_dt:
        res_hist_query = res_hist_query.filter(
            or_(
                FindingResolutionHistory.resolved_at >= start_dt,
                FindingResolutionHistory.reopened_at >= start_dt,
            )
        )
    if end_dt:
        res_hist_query = res_hist_query.filter(
            or_(
                FindingResolutionHistory.resolved_at <= end_dt,
                FindingResolutionHistory.reopened_at <= end_dt,
            )
        )

    res_history_records = res_hist_query.all()
    resolved_during_period = sum(1 for r in res_history_records if r.resolved_at and (not start_dt or _is_dt_ge(r.resolved_at, start_dt)) and (not end_dt or _is_dt_le(r.resolved_at, end_dt)))
    reopened_during_period = sum(1 for r in res_history_records if r.reopened_at and (not start_dt or _is_dt_ge(r.reopened_at, start_dt)) and (not end_dt or _is_dt_le(r.reopened_at, end_dt)))

    reassessment_summary = ReassessmentOperationsSummary(
        reassessment_required_count=reassessment_required_count,
        recently_reassessed_count=recently_reassessed_count,
        reopened_after_reassessment_count=reopened_count,
        kept_resolved_after_reassessment_count=max(0, resolved_count - reopened_count),
    )

    resolution_summary = ResolutionOperationsSummary(
        resolved_during_period=resolved_during_period,
        reopened_during_period=reopened_during_period,
        currently_resolved=resolved_count,
        currently_unresolved=unresolved_count,
    )

    # 10. Trend Summary (Created vs Resolved over time)
    trend_dict: Dict[str, Dict[str, int]] = defaultdict(lambda: {"created": 0, "resolved": 0})
    for f in findings_list:
        if f.created_at:
            d_str = f.created_at.strftime("%Y-%m-%d")
            trend_dict[d_str]["created"] += 1

    for rh in res_history_records:
        if rh.resolved_at:
            d_str = rh.resolved_at.strftime("%Y-%m-%d")
            trend_dict[d_str]["resolved"] += 1

    trend_summary: List[ReportTrendPoint] = []
    for d_str in sorted(trend_dict.keys()):
        trend_summary.append(
            ReportTrendPoint(
                date=d_str,
                created_count=trend_dict[d_str]["created"],
                resolved_count=trend_dict[d_str]["resolved"],
            )
        )

    has_sufficient_history = len(trend_summary) >= 2 or total_count > 0
    history_msg = None if has_sufficient_history else "Insufficient historical data."

    # 11. Audit Summary (Sprint 7.13 Activities in Period)
    act_query = db.query(Activity).filter(Activity.extra_data.isnot(None))
    if start_dt:
        act_query = act_query.filter(Activity.created_at >= start_dt)
    if end_dt:
        act_query = act_query.filter(Activity.created_at <= end_dt)

    org_id_str = str(org_id)
    all_period_acts = act_query.all()
    org_acts = [
        a for a in all_period_acts
        if a.extra_data and (
            str(a.extra_data.get("organization_id", "")) == org_id_str or
            (a.extra_data.get("finding_id") and a.extra_data.get("finding_id") in [str(fid) for fid in finding_ids])
        )
    ]

    event_counts: Dict[str, int] = defaultdict(int)
    for a in org_acts:
        event_counts[a.event_type] += 1

    audit_summary: List[AuditActivitySummaryItem] = []
    audit_label_map = {
        "FINDING_CREATED": "Findings Created",
        "FINDING_UPDATED": "Finding Details Updated",
        "FINDING_ASSIGNED": "Findings Assigned",
        "FINDING_STATUS_CHANGED": "Status Transitions",
        "REMEDIATION_STARTED": "Remediations Started",
        "REMEDIATION_CYCLE_SUBMITTED": "Remediation Cycles Submitted",
        "REMEDIATION_CYCLE_VERIFIED": "Remediations Verified",
        "REMEDIATION_CYCLE_APPROVED": "Remediations Approved",
        "REMEDIATION_CYCLE_REJECTED": "Remediations Rejected",
        "REMEDIATION_EVIDENCE_UPLOADED": "Evidence Files Uploaded",
        "REMEDIATION_EVIDENCE_DELETED": "Evidence Files Deleted",
        "FINDING_RESOLVED": "Findings Resolved",
        "FINDING_REOPENED": "Findings Reopened",
        "FINDING_REASSESSMENT_REQUIRED": "Reassessments Triggered",
        "FINDING_REASSESSMENT_KEPT_RESOLVED": "Reassessments Kept Resolved",
        "FINDING_COMMENTED": "Discussion Comments Added",
        "FINDINGS_EXPORTED": "Findings Exported",
        "COMPLIANCE_REPORT_GENERATED": "Compliance Reports Generated",
    }
    for ev_type, label in audit_label_map.items():
        cnt = event_counts.get(ev_type, 0)
        if cnt > 0:
            audit_summary.append(AuditActivitySummaryItem(event_type=ev_type, label=label, count=cnt))

    applied_filters = {
        "date_range": applied_range_label,
        "severity": severity if severity and severity.upper() != "ALL" else "All Severities",
        "lifecycle_status": lifecycle_status if lifecycle_status and lifecycle_status.upper() != "ALL" else "All Statuses",
        "policy_document_id": str(policy_document_id) if policy_document_id else None,
        "regulation_id": str(regulation_id) if regulation_id else None,
    }

    return ComplianceManagementReportResponse(
        report_title=f"{organization.name} — Compliance & Management Report",
        organization_id=str(org_id),
        organization_name=organization.name,
        reporting_period=applied_range_label,
        generated_at=now_utc,
        generated_by_id=str(current_user.id),
        generated_by_name=current_user.full_name,
        generated_by_role=user_role_label or "Administrator",
        applied_filters=applied_filters,
        executive_metrics=exec_metrics,
        status_distribution=status_dist,
        severity_distribution=severity_dist,
        high_risk_findings=high_risk_items,
        policy_gaps=policy_gaps,
        regulation_gaps=regulation_gaps,
        remediation_summary=remediation_summary,
        reassessment_summary=reassessment_summary,
        resolution_summary=resolution_summary,
        trend_summary=trend_summary,
        has_sufficient_history=has_sufficient_history,
        history_message=history_msg,
        audit_summary=audit_summary,
    )
