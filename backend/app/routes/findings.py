"""
Findings API routes for Lifecycle & Compliance Operations.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_, func
from sqlalchemy.orm import Session

from app.compliance.models import ComplianceReport, ReportFinding, FindingComment
from app.core.dependencies import get_current_user
from app.db.models import User, Organization
from app.db.models.rbac import OrganizationMember, MemberStatus, UserRole
from app.db.models.activity import Activity
from app.db.session import get_db
from app.schemas.finding import (
    FindingActivityItem,
    FindingAssignRequest,
    FindingAssigneeResponse,
    FindingCommentCreateRequest,
    FindingCommentResponse,
    FindingItemResponse,
    FindingReopenRequest,
    FindingResolveRequest,
    FindingStatusUpdateRequest,
    FindingRemediationUpdateRequest,
)
from app.services import audit_service
from app.services.activity_service import log_activity
from app.services.notification_service import create_notification

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/findings", tags=["findings"])


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
                detail="You do not have access to this organization's findings.",
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

    if not target_org:
        return []

    resolved_org_id = target_org.id

    # Fetch active reports for organization
    org_reports = db.scalars(
        select(ComplianceReport)
        .where(
            ComplianceReport.organization_id == resolved_org_id,
            or_(ComplianceReport.is_deleted == False, ComplianceReport.is_deleted.is_(None)),
        )
    ).all()

    report_ids = [r.id for r in org_reports]

    if not report_ids:
        return []

    query = select(ReportFinding).where(
        ReportFinding.report_id.in_(report_ids),
        ReportFinding.assigned_to == current_user.id,
    )

    if lifecycle_status and lifecycle_status.upper() != "ALL":
        query = query.where(ReportFinding.lifecycle_status == lifecycle_status.upper())

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
        created_at=finding.created_at,
        updated_at=finding.updated_at or finding.created_at,
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
    "IN_REVIEW": {"REMEDIATION", "OPEN"},
    "REMEDIATION": {"RESOLVED", "IN_REVIEW"},
    "RESOLVED": {"OPEN", "REOPENED"},
    "REOPENED": {"IN_REVIEW"},
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
    """Update lifecycle status of a finding (OPEN, IN_REVIEW, REMEDIATION, RESOLVED, REOPENED)."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    raw_status = data.lifecycle_status or data.status
    if not raw_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status field is required.",
        )

    new_status = raw_status.upper()
    valid_statuses = {"OPEN", "IN_REVIEW", "REMEDIATION", "RESOLVED", "REOPENED"}

    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{raw_status}'. Allowed: OPEN, IN_REVIEW, REMEDIATION, RESOLVED, REOPENED",
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
    log_activity(
        db,
        user_id=current_user.id,
        event_type="FINDING_STATUS_CHANGED",
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
        action="FINDING_STATUS_CHANGED",
        organization_id=report.organization_id,
        entity="ReportFinding",
        entity_id=str(finding.id),
    )

    if finding.assigned_to and finding.assigned_to != current_user.id:
        create_notification(
            db=db,
            recipient_id=finding.assigned_to,
            organization_id=report.organization_id,
            type="FINDING_STATUS_CHANGED",
            title="Finding Status Changed",
            message=f"Finding #{str(finding.id)[:8]} moved to {new_status}.",
            finding_id=finding.id,
            report_id=report.id,
            actor_id=current_user.id,
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

    if finding.assigned_to and finding.assigned_to != current_user.id:
        create_notification(
            db=db,
            recipient_id=finding.assigned_to,
            organization_id=report.organization_id,
            type="FINDING_DUE_DATE_CHANGED",
            title="Remediation Due Date Updated",
            message=f"Due date for Finding #{str(finding.id)[:8]} updated to {due_str}.",
            finding_id=finding.id,
            report_id=report.id,
            actor_id=current_user.id,
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

    if data.assignee_id and data.assignee_id != current_user.id:
        create_notification(
            db=db,
            recipient_id=data.assignee_id,
            organization_id=report.organization_id,
            type="FINDING_ASSIGNED",
            title="Finding Assigned",
            message=f"Finding #{str(finding.id)[:8]} was assigned to you.",
            finding_id=finding.id,
            report_id=report.id,
            actor_id=current_user.id,
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
    """Mark finding as RESOLVED with resolution note."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

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
    """Reopen a previously resolved finding with reason."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

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

    if finding.assigned_to and finding.assigned_to != current_user.id:
        create_notification(
            db=db,
            recipient_id=finding.assigned_to,
            organization_id=report.organization_id,
            type="FINDING_REOPENED",
            title="Finding Reopened",
            message=f"Finding #{str(finding.id)[:8]} was reopened.",
            finding_id=finding.id,
            report_id=report.id,
            actor_id=current_user.id,
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
    """Retrieve comment history for a finding."""
    finding, _, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=False)

    comments = db.query(FindingComment).filter(
        FindingComment.finding_id == finding.id
    ).order_by(FindingComment.created_at.asc()).all()

    return [
        FindingCommentResponse(
            id=str(c.id),
            finding_id=str(c.finding_id),
            user_id=str(c.user_id),
            user_name=c.user.full_name if c.user else "Team Member",
            user_email=c.user.email if c.user else "",
            content=c.content,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in comments
    ]


@router.post(
    "/{finding_id}/comments",
    response_model=FindingCommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add comment to finding",
)
def add_comment(
    finding_id: uuid.UUID,
    data: FindingCommentCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingCommentResponse:
    """Post a comment on a finding."""
    finding, report, _ = get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    content_stripped = (data.content or "").strip()
    if not content_stripped:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Comment content cannot be empty or whitespace-only.",
        )

    comment = FindingComment(
        id=uuid.uuid4(),
        finding_id=finding.id,
        user_id=current_user.id,
        content=content_stripped,
    )
    db.add(comment)

    finding.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(comment)

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

    if finding.assigned_to and finding.assigned_to != current_user.id:
        create_notification(
            db=db,
            recipient_id=finding.assigned_to,
            organization_id=report.organization_id,
            type="FINDING_COMMENTED",
            title="New Review Comment",
            message=f"{current_user.full_name} commented on Finding #{str(finding.id)[:8]}.",
            finding_id=finding.id,
            report_id=report.id,
            actor_id=current_user.id,
        )
        db.commit()

    return FindingCommentResponse(
        id=str(comment.id),
        finding_id=str(comment.finding_id),
        user_id=str(comment.user_id),
        user_name=current_user.full_name,
        user_email=current_user.email,
        content=comment.content,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


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
            "FINDING_RESOLVED",
            "FINDING_REOPENED",
            "FINDING_COMMENTED",
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
