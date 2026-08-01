"""
Compliance domain CRUD database operations.
"""
from __future__ import annotations

import uuid
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.compliance.models import ComplianceReport, ComplianceReportStatus
from app.compliance.schemas import ComplianceReportCreate, ComplianceReportUpdate


def create_compliance_report(
    db: Session,
    report_in: ComplianceReportCreate,
    user_id: uuid.UUID,
) -> ComplianceReport:
    """
    Create a new compliance report record in PENDING status.
    """
    report = ComplianceReport(
        organization_id=report_in.organization_id,
        regulation_id=report_in.regulation_id,
        policy_document_id=report_in.policy_document_id,
        status=ComplianceReportStatus.PENDING,
        created_by=user_id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def get_compliance_report(
    db: Session,
    report_id: uuid.UUID,
    include_deleted: bool = False,
) -> ComplianceReport | None:
    """
    Retrieve a compliance report by its primary key UUID.
    """
    stmt = select(ComplianceReport).where(ComplianceReport.id == report_id)
    if not include_deleted:
        stmt = stmt.where(ComplianceReport.is_deleted == False)
    return db.scalars(stmt).first()


def list_compliance_reports_by_org(
    db: Session,
    organization_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
    include_deleted: bool = False,
) -> Sequence[ComplianceReport]:
    """
    List compliance reports for a specific organization.
    """
    stmt = (
        select(ComplianceReport)
        .where(ComplianceReport.organization_id == organization_id)
    )
    if not include_deleted:
        stmt = stmt.where(ComplianceReport.is_deleted == False)
    stmt = stmt.order_by(ComplianceReport.created_at.desc()).offset(skip).limit(limit)
    return db.scalars(stmt).all()


def list_compliance_reports_by_user(
    db: Session,
    user_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
    include_deleted: bool = False,
) -> Sequence[ComplianceReport]:
    """
    List compliance reports created by a specific user.
    """
    stmt = (
        select(ComplianceReport)
        .where(ComplianceReport.created_by == user_id)
    )
    if not include_deleted:
        stmt = stmt.where(ComplianceReport.is_deleted == False)
    stmt = stmt.order_by(ComplianceReport.created_at.desc()).offset(skip).limit(limit)
    return db.scalars(stmt).all()


def update_compliance_report(
    db: Session,
    report_id: uuid.UUID,
    report_in: ComplianceReportUpdate,
) -> ComplianceReport | None:
    """
    Update attributes of an existing compliance report.
    """
    report = get_compliance_report(db, report_id)
    if not report:
        return None

    update_data = report_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(report, field, value)

    db.commit()
    db.refresh(report)
    return report


def delete_compliance_report(
    db: Session,
    report_id: uuid.UUID,
) -> bool:
    """
    Soft delete a compliance report record.
    """
    report = get_compliance_report(db, report_id, include_deleted=True)
    if not report:
        return False

    report.is_deleted = True
    db.commit()
    return True


# ---------------------------------------------------------------------------
# ComplianceJob CRUD operations
# ---------------------------------------------------------------------------

from app.compliance.models import ComplianceJob, ComplianceJobStatus


def create_compliance_job(
    db: Session,
    organization_id: uuid.UUID,
    regulation_id: uuid.UUID,
    policy_document_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ComplianceJob:
    """
    Create a new ComplianceJob record in QUEUED status.
    """
    job = ComplianceJob(
        organization_id=organization_id,
        regulation_id=regulation_id,
        policy_document_id=policy_document_id,
        status=ComplianceJobStatus.QUEUED,
        progress=0,
        current_step="QUEUED",
        created_by=user_id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_compliance_job(
    db: Session,
    job_id: uuid.UUID,
) -> ComplianceJob | None:
    """
    Retrieve a compliance job by ID.
    """
    stmt = select(ComplianceJob).where(ComplianceJob.id == job_id)
    return db.scalars(stmt).first()


def list_compliance_jobs_by_user(
    db: Session,
    user_id: uuid.UUID,
    organization_id: uuid.UUID | None = None,
    status_filter: ComplianceJobStatus | str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Sequence[ComplianceJob]:
    """
    List compliance jobs created by a user with optional org & status filtering.
    """
    stmt = select(ComplianceJob).where(ComplianceJob.created_by == user_id)
    if organization_id:
        stmt = stmt.where(ComplianceJob.organization_id == organization_id)
    if status_filter:
        stmt = stmt.where(ComplianceJob.status == status_filter)
    stmt = stmt.order_by(ComplianceJob.created_at.desc()).offset(skip).limit(limit)
    return db.scalars(stmt).all()


def cancel_compliance_job(
    db: Session,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ComplianceJob | None:
    """
    Cancel a queued or running compliance job.
    """
    job = get_compliance_job(db, job_id)
    if not job:
        return None
    if job.created_by != user_id and job.organization.created_by != user_id:
        return None

    if job.status in (ComplianceJobStatus.QUEUED, ComplianceJobStatus.RUNNING):
        job.status = ComplianceJobStatus.CANCELLED
        job.current_step = "CANCELLED by user"
        db.commit()
        db.refresh(job)

    return job
