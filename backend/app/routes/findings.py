"""
Findings API routes for Lifecycle, Collaboration & Compliance Operations.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_, func
from sqlalchemy.orm import Session

from app.compliance.models import ComplianceReport, ReportFinding, FindingComment
from app.core.dependencies import get_current_user
from app.core.rbac_dependencies import is_org_admin, is_org_analyst_or_admin, get_user_org_role, ROLE_RANK
from app.db.models import User, Organization
from app.db.models.rbac import OrganizationMember, MemberStatus, UserRole
from app.db.models.activity import Activity
from app.db.session import get_db
from app.schemas.finding import (
    FindingActivityItem,
    FindingAssignRequest,
    FindingAssigneeResponse,
    FindingCommentCreateRequest,
    FindingCommentResolveRequest,
    FindingCommentResponse,
    FindingItemResponse,
    FindingPaginatedResponse,
    FindingRejectRequest,
    FindingReopenRequest,
    FindingResolveRequest,
    FindingStatusUpdateRequest,
    FindingSubmitReviewRequest,
    FindingRemediationUpdateRequest,
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
        reopen_reason=finding.reopen_reason,
        remediation_due_date=finding.remediation_due_date,
        is_overdue=is_overdue,
        comments_count=comments_cnt,
        organization_id=org_id_str,
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


ALLOWED_TRANSITIONS = {
    "OPEN": {"IN_REVIEW"},
    "IN_REVIEW": {"REMEDIATION", "REMEDIATION_REQUIRED", "POTENTIAL_FALSE_POSITIVE", "ADMIN_REVIEW", "OPEN"},
    "REMEDIATION": {"ADMIN_REVIEW", "IN_REVIEW", "RESOLVED", "REMEDIATION_REQUIRED"},
    "REMEDIATION_REQUIRED": {"ADMIN_REVIEW", "IN_REVIEW", "RESOLVED", "REMEDIATION"},
    "POTENTIAL_FALSE_POSITIVE": {"ADMIN_REVIEW", "IN_REVIEW", "REJECTED"},
    "ADMIN_REVIEW": {"RESOLVED", "REJECTED", "IN_REVIEW", "REMEDIATION", "POTENTIAL_FALSE_POSITIVE"},
    "RESOLVED": {"OPEN", "REOPENED", "IN_REVIEW"},
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
    if new_status == "RESOLVED":
        if not is_org_admin(db, current_user.id, report.organization_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Organization Admins are permitted to resolve findings. Reviewers can submit reviews and move findings to remediation.",
            )
    elif new_status in ("REOPENED", "REJECTED"):
        if not is_org_admin(db, current_user.id, report.organization_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Only Organization Admins are permitted to set finding status to '{new_status}'. Reviewers can submit findings for Admin review.",
            )

    old_status = (finding.lifecycle_status or "OPEN").upper()

    if new_status != old_status:
        allowed = ALLOWED_TRANSITIONS.get(old_status, set())
        if new_status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid lifecycle transition from '{old_status}' to '{new_status}'. Allowed: {', '.join(allowed) or 'None'}",
            )

    finding.lifecycle_status = new_status
    finding.updated_at = datetime.now(timezone.utc)
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

    log_activity(
        db,
        user_id=current_user.id,
        event_type="FINDING_ASSIGNED",
        title=f"Assigned Finding #{str(finding.id)[:8]}",
        description=f"Assigned to {assignee_name}",
        icon_type="user",
        extra_data={
            "finding_id": str(finding.id),
            "report_id": str(report.id),
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


@router.post(
    "/{finding_id}/resolve",
    response_model=FindingItemResponse,
    summary="Mark finding as RESOLVED",
)
def resolve_finding(
    finding_id: uuid.UUID,
    data: FindingResolveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingItemResponse:
    """Mark finding as RESOLVED with resolution note. Requires Organization Admin role."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    if not is_org_admin(db, current_user.id, report.organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Organization Admins are permitted to resolve findings. Reviewers can submit reviews and move findings to remediation.",
        )

    finding.lifecycle_status = "RESOLVED"
    finding.resolution_note = data.resolution_note
    finding.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(finding)

    log_activity(
        db,
        user_id=current_user.id,
        event_type="FINDING_RESOLVED",
        title=f"Resolved Finding #{str(finding.id)[:8]}",
        description=f"Marked RESOLVED: {data.resolution_note or 'Remediation completed'}",
        icon_type="check",
        extra_data={
            "finding_id": str(finding.id),
            "report_id": str(report.id),
            "resolution_note": data.resolution_note,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="FINDING_RESOLVED",
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
        event_type="FINDING_RESOLVED",
        title="Finding Resolved",
        message=f"Finding #{str(finding.id)[:8]} was marked RESOLVED by {current_user.full_name}: {data.resolution_note or 'Remediation completed'}.",
    )
    db.commit()

    return _format_finding_response(db, finding)


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
    """Reopen a previously resolved finding with reason. Requires Organization Admin role."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    if not is_org_admin(db, current_user.id, report.organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Organization Admins are permitted to reopen findings.",
        )

    finding.lifecycle_status = "REOPENED"
    finding.reopen_reason = data.reopen_reason
    finding.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(finding)

    log_activity(
        db,
        user_id=current_user.id,
        event_type="FINDING_REOPENED",
        title=f"Reopened Finding #{str(finding.id)[:8]}",
        description=f"Reopened finding: {data.reopen_reason or 'Returned to active remediation'}",
        icon_type="alert",
        extra_data={
            "finding_id": str(finding.id),
            "report_id": str(report.id),
            "reopen_reason": data.reopen_reason,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="FINDING_REOPENED",
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
        event_type="FINDING_REOPENED",
        title="Finding Reopened",
        message=f"Finding #{str(finding.id)[:8]} was reopened by {current_user.full_name}: {data.reopen_reason or 'Returned to active remediation'}.",
    )
    db.commit()

    return _format_finding_response(db, finding)


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


@router.get(
    "/{finding_id}/activity",
    response_model=List[FindingActivityItem],
    summary="Get finding lifecycle activity timeline",
)
def get_finding_activity(
    finding_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
) -> List[FindingActivityItem]:
    """Retrieve chronological activity log events for a finding."""
    finding, _, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=False)

    finding_str = str(finding.id)
    activities = db.query(Activity).filter(
        Activity.event_type.in_([
            "FINDING_STATUS_CHANGED",
            "FINDING_ASSIGNED",
            "FINDING_SUBMITTED_FOR_REVIEW",
            "FINDING_RESOLVED",
            "FINDING_REOPENED",
            "FINDING_FALSE_POSITIVE_FLAGGED",
            "FINDING_REJECTED",
            "FINDING_COMMENTED",
            "FINDING_COMMENT_RESOLVED",
            "FINDING_DUE_DATE_CHANGED",
        ])
    ).order_by(Activity.created_at.desc()).limit(100).all()

    filtered = [
        act for act in activities
        if act.extra_data and act.extra_data.get("finding_id") == finding_str
    ]

    return [
        FindingActivityItem(
            id=str(act.id),
            finding_id=finding_str,
            user_name=act.user.full_name if act.user else "System",
            event_type=act.event_type,
            title=act.title,
            description=act.description,
            created_at=act.created_at,
        )
        for act in filtered
    ]
