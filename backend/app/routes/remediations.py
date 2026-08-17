"""
Remediation Management & Evidence REST API Routes (Sprint 7.4).
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.compliance.models import ComplianceReport, ReportFinding
from app.core.dependencies import get_current_user
from app.core.rbac_dependencies import (
    ROLE_RANK,
    get_user_org_role,
    is_org_admin,
    is_org_analyst_or_admin,
)
from app.db.models.document import Document
from app.db.models.organization import Organization
from app.db.models.rbac import MemberStatus, OrganizationMember, UserRole
from app.db.models.remediation import FindingRemediation, RemediationEvidence, RemediationCycle
from app.db.models.user import User
from app.db.session import get_db
from app.routes.reports import verify_user_organization_access
from app.schemas.remediation import (
    LinkDocumentEvidenceRequest,
    RemediationApproveRequest,
    RemediationCreateRequest,
    RemediationEvidenceResponse,
    RemediationRejectRequest,
    RemediationResponse,
    RemediationReturnRequest,
    RemediationSubmitRequest,
    RemediationCycleResponse,
    RemediationUpdateRequest,
    RemediationUserItem,
    RemediationVerifyRequest,
)
from app.services import audit_service
from app.services.activity_service import log_activity
from app.services.notification_service import create_notification, notify_finding_stakeholders
from app.services.storage import store_remediation_evidence

logger = logging.getLogger(__name__)

router = APIRouter(tags=["remediations"])


def _get_finding_and_verify_access(
    db: Session,
    finding_id: uuid.UUID,
    current_user: Optional[User],
    require_mutation: bool = False,
) -> tuple[ReportFinding, ComplianceReport, Optional[UserRole]]:
    """Helper to verify finding exists and caller has organization access."""
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    finding = db.get(ReportFinding, finding_id)
    if not finding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Finding not found.",
        )

    report = db.get(ComplianceReport, finding.report_id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Compliance report associated with finding not found.",
        )

    if not verify_user_organization_access(db, current_user.id, report.organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this organization's findings.",
        )

    user_role = get_user_org_role(db, current_user.id, report.organization_id)

    if require_mutation:
        if user_role == UserRole.VIEWER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Viewers have read-only access and cannot modify remediation records.",
            )

    return finding, report, user_role


def _format_cycle_response(
    db: Session,
    cycle: RemediationCycle,
) -> RemediationCycleResponse:
    """Serialize RemediationCycle into RemediationCycleResponse."""
    sub_user = cycle.submitter or (db.get(User, cycle.submitted_by) if cycle.submitted_by else None)
    submitter_item = (
        RemediationUserItem(id=str(sub_user.id), full_name=sub_user.full_name, email=sub_user.email)
        if sub_user
        else None
    )
    rev_user = cycle.reviewer or (db.get(User, cycle.reviewed_by) if cycle.reviewed_by else None)
    reviewer_item = (
        RemediationUserItem(id=str(rev_user.id), full_name=rev_user.full_name, email=rev_user.email)
        if rev_user
        else None
    )
    return RemediationCycleResponse(
        id=str(cycle.id),
        remediation_id=str(cycle.remediation_id),
        finding_id=str(cycle.finding_id),
        organization_id=str(cycle.organization_id),
        cycle_number=cycle.cycle_number,
        status=cycle.status,
        submission_note=cycle.submission_note,
        submitted_by=str(cycle.submitted_by),
        submitted_at=cycle.submitted_at,
        submitter=submitter_item,
        reviewed_by=str(cycle.reviewed_by) if cycle.reviewed_by else None,
        reviewed_at=cycle.reviewed_at,
        reviewer=reviewer_item,
        result=cycle.result,
        rejection_reason=cycle.rejection_reason,
        verification_note=cycle.verification_note,
        evidence_snapshot=cycle.evidence_snapshot,
    )

def _format_evidence_response(db: Session, ev: RemediationEvidence) -> RemediationEvidenceResponse:
    """Serialize RemediationEvidence model to RemediationEvidenceResponse."""
    up_item = None
    if ev.uploaded_by:
        u = ev.uploader or db.get(User, ev.uploaded_by)
        if u:
            up_item = RemediationUserItem(id=str(u.id), full_name=u.full_name, email=u.email)

    return RemediationEvidenceResponse(
        id=str(ev.id),
        remediation_id=str(ev.remediation_id),
        finding_id=str(ev.finding_id),
        organization_id=str(ev.organization_id),
        original_filename=ev.original_filename,
        file_size=ev.file_size,
        mime_type=ev.mime_type,
        description=ev.description,
        cycle_id=str(ev.cycle_id) if ev.cycle_id else None,
        cycle_number=ev.cycle_number,
        document_id=str(ev.document_id) if ev.document_id else None,
        document_type=ev.document_type,
        version=ev.version,
        uploaded_by=str(ev.uploaded_by),
        uploaded_at=ev.uploaded_at,
        uploader=up_item,
    )


def _format_remediation_response(
    db: Session,
    rem: FindingRemediation,
) -> RemediationResponse:
    """Serialize FindingRemediation into RemediationResponse."""
    now_utc = datetime.now(timezone.utc)
    is_overdue = False
    if rem.due_date:
        d_utc = rem.due_date if rem.due_date.tzinfo else rem.due_date.replace(tzinfo=timezone.utc)
        if d_utc < now_utc and rem.status not in ("VERIFIED", "APPROVED"):
            is_overdue = True

    # Build user items
    assignee_item = None
    if rem.assigned_to:
        u = rem.assignee or db.get(User, rem.assigned_to)
        if u:
            assignee_item = RemediationUserItem(id=str(u.id), full_name=u.full_name, email=u.email)

    creator_item = None
    if rem.created_by:
        u = rem.creator or db.get(User, rem.created_by)
        if u:
            creator_item = RemediationUserItem(id=str(u.id), full_name=u.full_name, email=u.email)

    verifier_item = None
    if rem.verified_by:
        u = rem.verifier or db.get(User, rem.verified_by)
        if u:
            verifier_item = RemediationUserItem(id=str(u.id), full_name=u.full_name, email=u.email)

    admin_approver_item = None
    if rem.admin_approved_by:
        u = rem.admin_approver or db.get(User, rem.admin_approved_by)
        if u:
            admin_approver_item = RemediationUserItem(id=str(u.id), full_name=u.full_name, email=u.email)

    # Build evidence list
    evidence_list: List[RemediationEvidenceResponse] = [
        _format_evidence_response(db, ev) for ev in rem.evidence_items
    ]

    # Get latest cycle info
    current_cycle = db.query(RemediationCycle).filter(
        RemediationCycle.remediation_id == rem.id
    ).order_by(RemediationCycle.cycle_number.desc()).first()

    cycles_count = db.query(RemediationCycle).filter(
        RemediationCycle.remediation_id == rem.id
    ).count()

    return RemediationResponse(
        id=str(rem.id),
        finding_id=str(rem.finding_id),
        organization_id=str(rem.organization_id),
        title=rem.title,
        description=rem.description,
        assigned_to=str(rem.assigned_to) if rem.assigned_to else None,
        assignee=assignee_item,
        due_date=rem.due_date,
        is_overdue=is_overdue,
        priority=rem.priority,
        status=rem.status,
        created_by=str(rem.created_by),
        creator=creator_item,
        created_at=rem.created_at,
        updated_at=rem.updated_at,
        verified_by=str(rem.verified_by) if rem.verified_by else None,
        verifier=verifier_item,
        verified_at=rem.verified_at,
        verification_note=rem.verification_note,
        admin_approved_by=str(rem.admin_approved_by) if rem.admin_approved_by else None,
        admin_approver=admin_approver_item,
        admin_approved_at=rem.admin_approved_at,
        admin_note=rem.admin_note,
        evidence=evidence_list,
        current_cycle_number=current_cycle.cycle_number if current_cycle else None,
        cycles_count=cycles_count,
    )


def _validate_org_member(db: Session, user_id: uuid.UUID, org_id: uuid.UUID) -> User:
    """Ensure user is an active member or owner of the organization."""
    org = db.get(Organization, org_id)
    is_owner = org and org.created_by == user_id

    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id,
        OrganizationMember.status == MemberStatus.ACTIVE,
    ).first()

    if not member and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned user is not an active member of this organization.",
        )

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assigned user does not exist.",
        )
    return user


@router.get(
    "/findings/{finding_id}/remediation",
    response_model=Optional[RemediationResponse],
    summary="Get remediation record for a finding",
)
def get_finding_remediation(
    finding_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Optional[RemediationResponse]:
    """Retrieve remediation plan, status, owner, due date, priority, and evidence for a finding."""
    finding, report, _ = _get_finding_and_verify_access(db, finding_id, current_user, require_mutation=False)

    rem = db.query(FindingRemediation).filter(
        FindingRemediation.finding_id == finding.id
    ).first()

    if not rem:
        return None

    return _format_remediation_response(db, rem)


@router.post(
    "/findings/{finding_id}/remediation",
    response_model=RemediationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create or initialize remediation record for a finding",
)
def create_finding_remediation(
    finding_id: uuid.UUID,
    data: Optional[RemediationCreateRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RemediationResponse:
    """Create a remediation plan for a finding requiring corrective action."""
    finding, report, user_role = _get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    # Check if remediation already exists
    rem = db.query(FindingRemediation).filter(
        FindingRemediation.finding_id == finding.id
    ).first()

    title_val = (data.title.strip() if data and data.title else None) or f"Remediation for Finding #{str(finding.id)[:8]}"
    desc_val = (data.description.strip() if data and data.description else None) or finding.recommendation or finding.reasoning
    priority_val = (data.priority.upper() if data and data.priority else "HIGH")
    if priority_val not in ("LOW", "MEDIUM", "HIGH", "CRITICAL"):
        priority_val = "HIGH"

    assignee_id = data.assigned_to if data else None
    if assignee_id:
        _validate_org_member(db, assignee_id, report.organization_id)

    due_date_val = data.due_date if data else None

    if rem:
        # Update existing
        rem.title = title_val
        if desc_val:
            rem.description = desc_val
        rem.priority = priority_val
        if assignee_id is not None:
            rem.assigned_to = assignee_id
        if due_date_val is not None:
            rem.due_date = due_date_val
        rem.updated_at = datetime.now(timezone.utc)
    else:
        rem = FindingRemediation(
            id=uuid.uuid4(),
            finding_id=finding.id,
            organization_id=report.organization_id,
            title=title_val,
            description=desc_val,
            assigned_to=assignee_id or finding.assigned_to,
            due_date=due_date_val or finding.remediation_due_date,
            priority=priority_val,
            status="NOT_STARTED",
            created_by=current_user.id,
        )
        db.add(rem)

    # Sync finding's remediation_due_date if set
    if due_date_val:
        finding.remediation_due_date = due_date_val

    db.commit()
    db.refresh(rem)

    log_activity(
        db,
        user_id=current_user.id,
        event_type="REMEDIATION_CREATED",
        title=f"Created Remediation for Finding #{str(finding.id)[:8]}",
        description=rem.title,
        icon_type="report",
        extra_data={
            "finding_id": str(finding.id),
            "report_id": str(report.id),
            "remediation_id": str(rem.id),
            "priority": rem.priority,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="REMEDIATION_CREATED",
        organization_id=report.organization_id,
        entity="FindingRemediation",
        entity_id=str(rem.id),
    )

    if rem.assigned_to and rem.assigned_to != current_user.id:
        create_notification(
            db=db,
            recipient_id=rem.assigned_to,
            organization_id=report.organization_id,
            type="FINDING_ASSIGNED",
            title="Remediation Assigned",
            message=f"Remediation for Finding #{str(finding.id)[:8]} was assigned to you by {current_user.full_name}.",
            finding_id=finding.id,
            report_id=report.id,
            actor_id=current_user.id,
        )
        db.commit()

    return _format_remediation_response(db, rem)


@router.patch(
    "/findings/{finding_id}/remediation",
    response_model=RemediationResponse,
    summary="Update remediation fields",
)
def update_finding_remediation(
    finding_id: uuid.UUID,
    data: RemediationUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RemediationResponse:
    """Update remediation details (title, description, owner, due date, priority)."""
    finding, report, user_role = _get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    rem = db.query(FindingRemediation).filter(
        FindingRemediation.finding_id == finding.id
    ).first()

    if not rem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Remediation record not found for this finding.",
        )

    old_assignee = rem.assigned_to

    if data.title is not None:
        rem.title = data.title.strip() or rem.title

    if data.description is not None:
        rem.description = data.description

    if data.priority is not None:
        p_val = data.priority.upper()
        if p_val in ("LOW", "MEDIUM", "HIGH", "CRITICAL"):
            rem.priority = p_val

    if data.due_date is not None:
        rem.due_date = data.due_date
        finding.remediation_due_date = data.due_date

    if data.assigned_to is not None:
        _validate_org_member(db, data.assigned_to, report.organization_id)
        rem.assigned_to = data.assigned_to

    if data.status is not None:
        st_val = data.status.upper()
        if st_val in ("NOT_STARTED", "IN_PROGRESS", "READY_FOR_REVIEW", "VERIFIED", "REJECTED"):
            rem.status = st_val

    rem.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rem)

    log_activity(
        db,
        user_id=current_user.id,
        event_type="REMEDIATION_UPDATED",
        title=f"Updated Remediation for Finding #{str(finding.id)[:8]}",
        description=f"Updated remediation details ({rem.priority}, {rem.status})",
        icon_type="report",
        extra_data={
            "finding_id": str(finding.id),
            "remediation_id": str(rem.id),
        },
    )

    if rem.assigned_to and rem.assigned_to != old_assignee and rem.assigned_to != current_user.id:
        create_notification(
            db=db,
            recipient_id=rem.assigned_to,
            organization_id=report.organization_id,
            type="FINDING_ASSIGNED",
            title="Remediation Assigned",
            message=f"Remediation for Finding #{str(finding.id)[:8]} was assigned to you by {current_user.full_name}.",
            finding_id=finding.id,
            report_id=report.id,
            actor_id=current_user.id,
        )
        db.commit()

    return _format_remediation_response(db, rem)


@router.post(
    "/findings/{finding_id}/remediation/start",
    response_model=RemediationResponse,
    summary="Start working on remediation",
)
def start_remediation(
    finding_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RemediationResponse:
    """Transition remediation status to IN_PROGRESS."""
    finding, report, _ = _get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    rem = db.query(FindingRemediation).filter(
        FindingRemediation.finding_id == finding.id
    ).first()

    if not rem:
        # Initialize if not present
        rem = FindingRemediation(
            id=uuid.uuid4(),
            finding_id=finding.id,
            organization_id=report.organization_id,
            title=f"Remediation for Finding #{str(finding.id)[:8]}",
            description=finding.recommendation or finding.reasoning,
            assigned_to=current_user.id,
            status="IN_PROGRESS",
            created_by=current_user.id,
        )
        db.add(rem)
    else:
        rem.status = "IN_PROGRESS"
        rem.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(rem)

    log_activity(
        db,
        user_id=current_user.id,
        event_type="REMEDIATION_STARTED",
        title=f"Started Remediation for Finding #{str(finding.id)[:8]}",
        description=f"{current_user.full_name} started working on remediation.",
        icon_type="check",
        extra_data={"finding_id": str(finding.id), "remediation_id": str(rem.id)},
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="REMEDIATION_STARTED",
        organization_id=report.organization_id,
        entity="FindingRemediation",
        entity_id=str(rem.id),
    )

    return _format_remediation_response(db, rem)


@router.post(
    "/findings/{finding_id}/remediation/submit",
    response_model=RemediationResponse,
    summary="Submit remediation for review (Creates new cycle)",
)
def submit_remediation_for_review(
    finding_id: uuid.UUID,
    data: Optional[RemediationSubmitRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RemediationResponse:
    """Transition remediation status to READY_FOR_REVIEW and record a snapshot review cycle."""
    finding, report, _ = _get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    rem = db.query(FindingRemediation).filter(
        FindingRemediation.finding_id == finding.id
    ).with_for_update().first()

    if not rem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Remediation record not found. Please create remediation first.",
        )

    if rem.status == "READY_FOR_REVIEW":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Remediation is already submitted and pending review.",
        )

    if rem.status == "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Remediation has already been approved.",
        )

    # Calculate next cycle number
    last_cycle = db.query(RemediationCycle).filter(
        RemediationCycle.remediation_id == rem.id
    ).order_by(RemediationCycle.cycle_number.desc()).first()

    next_cycle_num = (last_cycle.cycle_number + 1) if last_cycle else 1

    # Snapshot current evidence files
    evidence_items = db.query(RemediationEvidence).filter(
        RemediationEvidence.remediation_id == rem.id
    ).all()
    snapshot_data = [
        {
            "id": str(ev.id),
            "filename": ev.original_filename,
            "size": ev.file_size,
            "mime_type": ev.mime_type,
            "uploaded_at": ev.uploaded_at.isoformat() if ev.uploaded_at else None,
            "description": ev.description,
        }
        for ev in evidence_items
    ]
    snapshot_str = json.dumps(snapshot_data)

    submission_note = data.submission_note if data else None

    # Create new RemediationCycle
    cycle = RemediationCycle(
        id=uuid.uuid4(),
        remediation_id=rem.id,
        finding_id=finding.id,
        organization_id=report.organization_id,
        cycle_number=next_cycle_num,
        status="READY_FOR_REVIEW",
        submission_note=submission_note,
        submitted_by=current_user.id,
        submitted_at=datetime.now(timezone.utc),
        evidence_snapshot=snapshot_str,
    )
    db.add(cycle)

    rem.status = "READY_FOR_REVIEW"
    rem.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rem)

    note_text = f": {submission_note}" if submission_note else ""
    log_activity(
        db,
        user_id=current_user.id,
        event_type="REMEDIATION_CYCLE_SUBMITTED",
        title=f"Submitted Remediation Cycle {next_cycle_num} for Finding #{str(finding.id)[:8]}",
        description=f"{current_user.full_name} submitted remediation Cycle {next_cycle_num} for review{note_text}.",
        icon_type="send",
        extra_data={
            "finding_id": str(finding.id),
            "organization_id": str(report.organization_id),
            "remediation_id": str(rem.id),
            "cycle_id": str(cycle.id),
            "cycle_number": next_cycle_num,
            "submission_note": submission_note,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="REMEDIATION_CYCLE_SUBMITTED",
        organization_id=report.organization_id,
        entity="RemediationCycle",
        entity_id=str(cycle.id),
    )

    # Notify Reviewers and Admins
    notify_finding_stakeholders(
        db=db,
        organization_id=report.organization_id,
        finding_id=finding.id,
        report_id=report.id,
        assignee_id=rem.assigned_to,
        actor_id=current_user.id,
        event_type="FINDING_SUBMITTED_FOR_REVIEW",
        title=f"Remediation Cycle {next_cycle_num} Ready for Review",
        message=f"Remediation Cycle {next_cycle_num} for Finding #{str(finding.id)[:8]} was submitted for review by {current_user.full_name}.",
    )
    db.commit()

    return _format_remediation_response(db, rem)


@router.post(
    "/findings/{finding_id}/remediation/verify",
    response_model=RemediationResponse,
    summary="Verify remediation (Reviewer & Admin only)",
)
def verify_remediation(
    finding_id: uuid.UUID,
    data: Optional[RemediationVerifyRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RemediationResponse:
    """Mark remediation as VERIFIED. Only Reviewers and Admins are permitted."""
    finding, report, user_role = _get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    role_str = (user_role.value if hasattr(user_role, "value") else str(user_role or "")).upper()
    if role_str not in ("ADMIN", "ORGANIZATION_ADMIN", "SUPER_ADMIN", "REVIEWER"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Reviewers and Administrators are permitted to verify remediation work.",
        )

    rem = db.query(FindingRemediation).filter(
        FindingRemediation.finding_id == finding.id
    ).with_for_update().first()

    if not rem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Remediation record not found.",
        )

    if rem.status == "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Remediation has already been approved.",
        )

    # Update latest cycle to VERIFIED
    latest_cycle = db.query(RemediationCycle).filter(
        RemediationCycle.remediation_id == rem.id
    ).order_by(RemediationCycle.cycle_number.desc()).first()

    cycle_num = latest_cycle.cycle_number if latest_cycle else 1
    if latest_cycle:
        latest_cycle.status = "VERIFIED"
        latest_cycle.result = "VERIFIED"
        latest_cycle.reviewed_by = current_user.id
        latest_cycle.reviewed_at = datetime.now(timezone.utc)
        if data and data.verification_note:
            latest_cycle.verification_note = data.verification_note

    rem.status = "VERIFIED"
    rem.verified_by = current_user.id
    rem.verified_at = datetime.now(timezone.utc)
    if data and data.verification_note:
        rem.verification_note = data.verification_note
    rem.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(rem)

    note_str = f": {data.verification_note}" if (data and data.verification_note) else ""
    log_activity(
        db,
        user_id=current_user.id,
        event_type="REMEDIATION_CYCLE_VERIFIED",
        title=f"Verified Remediation Cycle {cycle_num} for Finding #{str(finding.id)[:8]}",
        description=f"{current_user.full_name} verified remediation Cycle {cycle_num}{note_str}",
        icon_type="check",
        extra_data={
            "finding_id": str(finding.id),
            "organization_id": str(report.organization_id),
            "remediation_id": str(rem.id),
            "cycle_id": str(latest_cycle.id) if latest_cycle else None,
            "cycle_number": cycle_num,
            "verification_note": data.verification_note if data else None,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="REMEDIATION_CYCLE_VERIFIED",
        organization_id=report.organization_id,
        entity="FindingRemediation",
        entity_id=str(rem.id),
    )

    # Notify Admins and Assignee
    notify_finding_stakeholders(
        db=db,
        organization_id=report.organization_id,
        finding_id=finding.id,
        report_id=report.id,
        assignee_id=rem.assigned_to,
        actor_id=current_user.id,
        event_type="FINDING_STATUS_CHANGED",
        title="Remediation Verified",
        message=f"Remediation for Finding #{str(finding.id)[:8]} was verified by {current_user.full_name}.",
    )
    db.commit()

    return _format_remediation_response(db, rem)


@router.post(
    "/findings/{finding_id}/remediation/reject",
    response_model=RemediationResponse,
    summary="Reject remediation and return to In Progress (Reviewer & Admin only)",
)
def reject_remediation(
    finding_id: uuid.UUID,
    data: Optional[RemediationRejectRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RemediationResponse:
    """Reject remediation and return to IN_PROGRESS. Only Reviewers and Admins are permitted."""
    finding, report, user_role = _get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    role_str = (user_role.value if hasattr(user_role, "value") else str(user_role or "")).upper()
    if role_str not in ("ADMIN", "ORGANIZATION_ADMIN", "SUPER_ADMIN", "REVIEWER"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Reviewers and Administrators are permitted to reject remediation work.",
        )

    rem = db.query(FindingRemediation).filter(
        FindingRemediation.finding_id == finding.id
    ).with_for_update().first()

    if not rem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Remediation record not found.",
        )

    if rem.status == "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Remediation has already been approved. Return it before rejecting.",
        )

    reason = data.rejection_reason if (data and data.rejection_reason) else "Insufficient evidence or corrective action"

    # Mark active cycle as REJECTED
    latest_cycle = db.query(RemediationCycle).filter(
        RemediationCycle.remediation_id == rem.id
    ).order_by(RemediationCycle.cycle_number.desc()).first()

    cycle_num = latest_cycle.cycle_number if latest_cycle else 1
    if latest_cycle:
        latest_cycle.status = "REJECTED"
        latest_cycle.result = "REJECTED"
        latest_cycle.reviewed_by = current_user.id
        latest_cycle.reviewed_at = datetime.now(timezone.utc)
        latest_cycle.rejection_reason = reason

    rem.status = "REJECTED"
    rem.verification_note = f"Rejected by {current_user.full_name}: {reason}"
    rem.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(rem)

    log_activity(
        db,
        user_id=current_user.id,
        event_type="REMEDIATION_CYCLE_REJECTED",
        title=f"Rejected Remediation Cycle {cycle_num} for Finding #{str(finding.id)[:8]}",
        description=f"Returned for further work: {reason}",
        icon_type="alert",
        extra_data={
            "finding_id": str(finding.id),
            "organization_id": str(report.organization_id),
            "remediation_id": str(rem.id),
            "cycle_id": str(latest_cycle.id) if latest_cycle else None,
            "cycle_number": cycle_num,
            "reason": reason,
            "rejection_reason": reason,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="REMEDIATION_CYCLE_REJECTED",
        organization_id=report.organization_id,
        entity="FindingRemediation",
        entity_id=str(rem.id),
    )

    if rem.assigned_to and rem.assigned_to != current_user.id:
        create_notification(
            db=db,
            recipient_id=rem.assigned_to,
            organization_id=report.organization_id,
            type="FINDING_STATUS_CHANGED",
            title="Remediation Returned for Revision",
            message=f"Remediation for Finding #{str(finding.id)[:8]} was returned for further work by {current_user.full_name}: {reason}.",
            finding_id=finding.id,
            report_id=report.id,
            actor_id=current_user.id,
        )
        db.commit()

    return _format_remediation_response(db, rem)


@router.post(
    "/findings/{finding_id}/remediation/approve",
    response_model=RemediationResponse,
    summary="Approve remediation (Admin only)",
)
def approve_remediation(
    finding_id: uuid.UUID,
    data: Optional[RemediationApproveRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RemediationResponse:
    """Approve remediation and mark as APPROVED. Only Organization Admins are permitted."""
    finding, report, user_role = _get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    role_str = (user_role.value if hasattr(user_role, "value") else str(user_role or "")).upper()
    if role_str not in ("ADMIN", "ORGANIZATION_ADMIN", "SUPER_ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Organization Administrators are permitted to approve remediation.",
        )

    rem = db.query(FindingRemediation).filter(
        FindingRemediation.finding_id == finding.id
    ).with_for_update().first()

    if not rem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Remediation record not found.",
        )

    if rem.status == "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Remediation has already been approved.",
        )

    if rem.status != "VERIFIED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Remediation must be verified before approval.",
        )

    latest_cycle = db.query(RemediationCycle).filter(
        RemediationCycle.remediation_id == rem.id
    ).order_by(RemediationCycle.cycle_number.desc()).first()

    cycle_num = latest_cycle.cycle_number if latest_cycle else 1

    rem.status = "APPROVED"
    rem.admin_approved_by = current_user.id
    rem.admin_approved_at = datetime.now(timezone.utc)
    if data and data.admin_note:
        rem.admin_note = data.admin_note
    rem.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(rem)

    note_str = f": {data.admin_note}" if (data and data.admin_note) else ""
    log_activity(
        db,
        user_id=current_user.id,
        event_type="REMEDIATION_APPROVED",
        title=f"Approved Remediation for Finding #{str(finding.id)[:8]}",
        description=f"{current_user.full_name} approved remediation (Cycle {cycle_num}){note_str}",
        icon_type="check",
        extra_data={
            "finding_id": str(finding.id),
            "organization_id": str(report.organization_id),
            "remediation_id": str(rem.id),
            "cycle_number": cycle_num,
            "admin_note": data.admin_note if data else None,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="REMEDIATION_APPROVED",
        organization_id=report.organization_id,
        entity="FindingRemediation",
        entity_id=str(rem.id),
    )

    notify_finding_stakeholders(
        db=db,
        organization_id=report.organization_id,
        finding_id=finding.id,
        report_id=report.id,
        assignee_id=rem.assigned_to,
        actor_id=current_user.id,
        event_type="FINDING_RESOLVED",
        title="Remediation Approved",
        message=f"Remediation for Finding #{str(finding.id)[:8]} was approved by Admin {current_user.full_name}.",
    )
    db.commit()

    return _format_remediation_response(db, rem)


@router.post(
    "/findings/{finding_id}/remediation/return",
    response_model=RemediationResponse,
    summary="Return approved remediation for rework (Admin only)",
)
def return_remediation(
    finding_id: uuid.UUID,
    data: Optional[RemediationReturnRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RemediationResponse:
    """Return an approved remediation back to IN_PROGRESS. Only Admins are permitted."""
    finding, report, user_role = _get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    role_str = (user_role.value if hasattr(user_role, "value") else str(user_role or "")).upper()
    if role_str not in ("ADMIN", "ORGANIZATION_ADMIN", "SUPER_ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Organization Administrators are permitted to return approved remediation.",
        )

    rem = db.query(FindingRemediation).filter(
        FindingRemediation.finding_id == finding.id
    ).with_for_update().first()

    if not rem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Remediation record not found.",
        )

    if rem.status != "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only approved remediations can be returned.",
        )

    reason = data.return_reason if (data and data.return_reason) else "Returned by administrator for rework"

    rem.status = "IN_PROGRESS"
    rem.admin_approved_by = None
    rem.admin_approved_at = None
    rem.admin_note = f"Returned: {reason}"
    rem.updated_at = datetime.now(timezone.utc)

    finding.lifecycle_status = "REOPENED"
    finding.reopen_reason = f"Remediation returned: {reason}"

    db.commit()
    db.refresh(rem)

    log_activity(
        db,
        user_id=current_user.id,
        event_type="REMEDIATION_RETURNED",
        title=f"Returned Remediation for Finding #{str(finding.id)[:8]}",
        description=f"Returned to In Progress: {reason}",
        icon_type="rotate",
        extra_data={
            "finding_id": str(finding.id),
            "organization_id": str(report.organization_id),
            "remediation_id": str(rem.id),
            "reason": reason,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="REMEDIATION_RETURNED",
        organization_id=report.organization_id,
        entity="FindingRemediation",
        entity_id=str(rem.id),
    )

    notify_finding_stakeholders(
        db=db,
        organization_id=report.organization_id,
        finding_id=finding.id,
        report_id=report.id,
        assignee_id=rem.assigned_to,
        actor_id=current_user.id,
        event_type="FINDING_REOPENED",
        title="Remediation Returned for Rework",
        message=f"Approved remediation for Finding #{str(finding.id)[:8]} was returned for rework by Admin {current_user.full_name}: {reason}.",
    )
    db.commit()

    return _format_remediation_response(db, rem)


@router.get(
    "/findings/{finding_id}/remediation/cycles",
    response_model=List[RemediationCycleResponse],
    summary="List all remediation review cycles in descending order (Sprint 7.5)",
)
def list_remediation_cycles(
    finding_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[RemediationCycleResponse]:
    """Retrieve full chronological history of remediation review cycles."""
    finding, report, _ = _get_finding_and_verify_access(db, finding_id, current_user, require_mutation=False)

    rem = db.query(FindingRemediation).filter(
        FindingRemediation.finding_id == finding.id
    ).first()

    if not rem:
        return []

    cycles = db.query(RemediationCycle).filter(
        RemediationCycle.remediation_id == rem.id
    ).order_by(RemediationCycle.cycle_number.desc()).all()

    return [_format_cycle_response(db, c) for c in cycles]


@router.get(
    "/findings/{finding_id}/remediation/cycles/{cycle_id}",
    response_model=RemediationCycleResponse,
    summary="Get single remediation cycle details (Sprint 7.5)",
)
def get_remediation_cycle(
    finding_id: uuid.UUID,
    cycle_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RemediationCycleResponse:
    """Retrieve details for a single remediation cycle."""
    finding, report, _ = _get_finding_and_verify_access(db, finding_id, current_user, require_mutation=False)

    rem = db.query(FindingRemediation).filter(
        FindingRemediation.finding_id == finding.id
    ).first()

    if not rem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Remediation record not found.",
        )

    cycle = db.query(RemediationCycle).filter(
        RemediationCycle.id == cycle_id,
        RemediationCycle.remediation_id == rem.id,
    ).first()

    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Remediation cycle not found.",
        )

    return _format_cycle_response(db, cycle)


@router.post(
    "/findings/{finding_id}/remediation/evidence",
    response_model=RemediationEvidenceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload remediation evidence file",
)
def upload_remediation_evidence(
    finding_id: uuid.UUID,
    file: UploadFile = File(..., description="Evidence file (PDF, DOCX, PNG, JPG, TXT)"),
    description: Optional[str] = Form(None, description="Optional description of evidence"),
    cycle_number: Optional[int] = Form(None, description="Optional associated remediation cycle number"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RemediationEvidenceResponse:
    """Upload and attach evidence document/image to remediation record."""
    finding, report, _ = _get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    rem = db.query(FindingRemediation).filter(
        FindingRemediation.finding_id == finding.id
    ).first()

    if not rem:
        # Initialize remediation record if not existing
        rem = FindingRemediation(
            id=uuid.uuid4(),
            finding_id=finding.id,
            organization_id=report.organization_id,
            title=f"Remediation for Finding #{str(finding.id)[:8]}",
            description=finding.recommendation or finding.reasoning,
            assigned_to=current_user.id,
            status="IN_PROGRESS",
            created_by=current_user.id,
        )
        db.add(rem)
        db.commit()
        db.refresh(rem)

    # Determine active cycle number and cycle ID
    active_cycle = db.query(RemediationCycle).filter(
        RemediationCycle.remediation_id == rem.id
    ).order_by(RemediationCycle.cycle_number.desc()).first()

    target_cycle_num = cycle_number or (active_cycle.cycle_number if active_cycle else 1)
    target_cycle_id = active_cycle.id if active_cycle and (cycle_number is None or active_cycle.cycle_number == cycle_number) else None

    # Store file safely
    stored = store_remediation_evidence(file)

    evidence = RemediationEvidence(
        id=uuid.uuid4(),
        remediation_id=rem.id,
        finding_id=finding.id,
        organization_id=report.organization_id,
        original_filename=stored.original_filename,
        stored_filename=stored.stored_filename,
        file_path=stored.path,
        file_size=stored.size,
        mime_type=stored.mime_type,
        description=description.strip() if description else None,
        cycle_id=target_cycle_id,
        cycle_number=target_cycle_num,
        uploaded_by=current_user.id,
    )
    db.add(evidence)
    db.commit()
    db.refresh(evidence)

    log_activity(
        db,
        user_id=current_user.id,
        event_type="REMEDIATION_EVIDENCE_UPLOADED",
        title=f"Uploaded Evidence for Finding #{str(finding.id)[:8]}",
        description=f"Attached evidence file: {evidence.original_filename} (Cycle {target_cycle_num})",
        icon_type="document",
        extra_data={
            "finding_id": str(finding.id),
            "remediation_id": str(rem.id),
            "evidence_id": str(evidence.id),
            "filename": evidence.original_filename,
            "cycle_number": target_cycle_num,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="REMEDIATION_EVIDENCE_UPLOADED",
        organization_id=report.organization_id,
        entity="RemediationEvidence",
        entity_id=str(evidence.id),
    )

    return _format_evidence_response(db, evidence)


@router.post(
    "/findings/{finding_id}/remediation/evidence/link-document",
    response_model=RemediationEvidenceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Link existing organization document as remediation evidence (Sprint 7.10)",
)
def link_document_evidence(
    finding_id: uuid.UUID,
    data: LinkDocumentEvidenceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RemediationEvidenceResponse:
    """Link an existing document from organization library as finding evidence without duplicating storage."""
    finding, report, _ = _get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    # Validate Document exists and belongs to the same organization
    doc = db.get(Document, data.document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found in organization library.",
        )

    if doc.organization_id != report.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-organization document linking is forbidden.",
        )

    rem = db.query(FindingRemediation).filter(
        FindingRemediation.finding_id == finding.id
    ).first()

    if not rem:
        rem = FindingRemediation(
            id=uuid.uuid4(),
            finding_id=finding.id,
            organization_id=report.organization_id,
            title=f"Remediation for Finding #{str(finding.id)[:8]}",
            description=finding.recommendation or finding.reasoning,
            assigned_to=current_user.id,
            status="IN_PROGRESS",
            created_by=current_user.id,
        )
        db.add(rem)
        db.commit()
        db.refresh(rem)

    active_cycle = db.query(RemediationCycle).filter(
        RemediationCycle.remediation_id == rem.id
    ).order_by(RemediationCycle.cycle_number.desc()).first()

    target_cycle_num = data.cycle_number or (active_cycle.cycle_number if active_cycle else 1)
    target_cycle_id = active_cycle.id if active_cycle and (data.cycle_number is None or active_cycle.cycle_number == data.cycle_number) else None

    # Check if this document is already linked to this remediation & cycle
    existing_link = db.query(RemediationEvidence).filter(
        RemediationEvidence.remediation_id == rem.id,
        RemediationEvidence.document_id == doc.id,
        RemediationEvidence.cycle_number == target_cycle_num,
    ).first()

    if existing_link:
        return _format_evidence_response(db, existing_link)

    evidence = RemediationEvidence(
        id=uuid.uuid4(),
        remediation_id=rem.id,
        finding_id=finding.id,
        organization_id=report.organization_id,
        document_id=doc.id,
        original_filename=doc.original_filename or "document.pdf",
        stored_filename=doc.stored_filename or f"doc_{doc.id}",
        file_path=doc.file_path or "",
        file_size=doc.file_size or 0,
        mime_type=doc.mime_type or "application/pdf",
        document_type=getattr(doc, "document_type", None) or "POLICY",
        version=getattr(doc, "version_tag", None) or (str(doc.version) if getattr(doc, "version", None) is not None else None),
        description=data.description.strip() if data.description else f"Linked from document library: {doc.original_filename}",
        cycle_id=target_cycle_id,
        cycle_number=target_cycle_num,
        uploaded_by=current_user.id,
    )
    db.add(evidence)
    db.commit()
    db.refresh(evidence)

    log_activity(
        db,
        user_id=current_user.id,
        event_type="REMEDIATION_EVIDENCE_ATTACHED",
        title=f"Attached Document Evidence for Finding #{str(finding.id)[:8]}",
        description=f"Attached existing document: {evidence.original_filename} (Cycle {target_cycle_num})",
        icon_type="document",
        extra_data={
            "finding_id": str(finding.id),
            "remediation_id": str(rem.id),
            "evidence_id": str(evidence.id),
            "document_id": str(doc.id),
            "filename": evidence.original_filename,
            "cycle_number": target_cycle_num,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="REMEDIATION_EVIDENCE_ATTACHED",
        organization_id=report.organization_id,
        entity="RemediationEvidence",
        entity_id=str(evidence.id),
    )

    return _format_evidence_response(db, evidence)


@router.get(
    "/findings/{finding_id}/remediation/evidence/{evidence_id}/download",
    summary="Download remediation evidence file",
)
def download_remediation_evidence(
    finding_id: uuid.UUID,
    evidence_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Securely download an evidence file verifying caller belongs to same organization."""
    finding, report, _ = _get_finding_and_verify_access(db, finding_id, current_user, require_mutation=False)

    evidence = db.get(RemediationEvidence, evidence_id)
    if not evidence or evidence.finding_id != finding.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evidence file not found.",
        )

    if evidence.organization_id != report.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-organization evidence access is forbidden.",
        )

    file_to_serve = Path(evidence.file_path) if evidence.file_path else None
    if not file_to_serve or not file_to_serve.exists():
        from app.services.storage import _STORAGE_ROOT
        alt_path_evidence = _STORAGE_ROOT / "evidence" / evidence.stored_filename
        alt_path_documents = _STORAGE_ROOT / "documents" / evidence.stored_filename
        alt_path_root = _STORAGE_ROOT / evidence.stored_filename
        if alt_path_evidence.exists():
            file_to_serve = alt_path_evidence
            evidence.file_path = str(alt_path_evidence)
            db.commit()
        elif alt_path_documents.exists():
            file_to_serve = alt_path_documents
            evidence.file_path = str(alt_path_documents)
            db.commit()
        elif alt_path_root.exists():
            file_to_serve = alt_path_root
            evidence.file_path = str(alt_path_root)
            db.commit()
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Evidence file content not found on server storage.",
            )

    return FileResponse(
        path=str(file_to_serve),
        filename=evidence.original_filename,
        media_type=evidence.mime_type or "application/octet-stream",
    )


@router.delete(
    "/findings/{finding_id}/remediation/evidence/{evidence_id}",
    summary="Delete remediation evidence file",
)
def delete_remediation_evidence(
    finding_id: uuid.UUID,
    evidence_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an evidence file. Allowed for uploader or Organization Admin."""
    finding, report, user_role = _get_finding_and_verify_access(db, finding_id, current_user, require_mutation=True)

    evidence = db.get(RemediationEvidence, evidence_id)
    if not evidence or evidence.finding_id != finding.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evidence file not found.",
        )

    is_admin = is_org_admin(db, current_user.id, report.organization_id)
    if evidence.uploaded_by != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the uploader or an Organization Admin can delete this evidence file.",
        )

    # Delete from disk if exists
    try:
        if os.path.exists(evidence.file_path):
            os.remove(evidence.file_path)
    except Exception as exc:
        logger.warning("Failed removing file from disk: %s", exc)

    ev_filename = evidence.original_filename
    ev_cycle = evidence.cycle_number

    db.delete(evidence)
    db.commit()

    log_activity(
        db,
        user_id=current_user.id,
        event_type="REMEDIATION_EVIDENCE_DELETED",
        title=f"Deleted Evidence for Finding #{str(finding.id)[:8]}",
        description=f"Deleted evidence file: {ev_filename}",
        icon_type="trash",
        extra_data={
            "finding_id": str(finding.id),
            "organization_id": str(report.organization_id),
            "evidence_id": str(evidence_id),
            "filename": ev_filename,
            "cycle_number": ev_cycle,
        },
    )

    audit_service.log_audit_event(
        db,
        user_id=current_user.id,
        action="REMEDIATION_EVIDENCE_DELETED",
        organization_id=report.organization_id,
        entity="RemediationEvidence",
        entity_id=str(evidence_id),
    )

    return {"message": "Evidence file deleted successfully."}
