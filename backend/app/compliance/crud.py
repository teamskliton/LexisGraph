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
        regulation_document_id=report_in.regulation_document_id,
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
) -> ComplianceReport | None:
    """
    Retrieve a compliance report by its primary key UUID.
    """
    stmt = select(ComplianceReport).where(ComplianceReport.id == report_id)
    return db.scalars(stmt).first()


def list_compliance_reports_by_org(
    db: Session,
    organization_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> Sequence[ComplianceReport]:
    """
    List compliance reports for a specific organization.
    """
    stmt = (
        select(ComplianceReport)
        .where(ComplianceReport.organization_id == organization_id)
        .order_by(ComplianceReport.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return db.scalars(stmt).all()


def list_compliance_reports_by_user(
    db: Session,
    user_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> Sequence[ComplianceReport]:
    """
    List compliance reports created by a specific user.
    """
    stmt = (
        select(ComplianceReport)
        .where(ComplianceReport.created_by == user_id)
        .order_by(ComplianceReport.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
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
    Delete a compliance report record.
    """
    report = get_compliance_report(db, report_id)
    if not report:
        return False

    db.delete(report)
    db.commit()
    return True
