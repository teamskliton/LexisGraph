"""
Compliance domain service layer. Handles business logic, permissions, and engine orchestration.
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Sequence

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session

from app.compliance import crud
from app.compliance.models import ComplianceReport, ComplianceReportStatus
from app.compliance.schemas import ComplianceAnalyzeRequest, ComplianceReportCreate
from app.db.models import Document, DocumentType, Organization
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)


def _run_background_analysis(report_id: uuid.UUID) -> None:
    """Background task runner executing compliance analysis in a self-owned DB session."""
    from app.services.compliance_engine import execute_report_compliance_analysis
    from app.db.session import get_session
    try:
        db = get_session()
        try:
            execute_report_compliance_analysis(db, report_id)
            logger.info("Background compliance analysis completed for report_id=%s", report_id)
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Background compliance analysis execution context notice for report_id=%s: %s", report_id, exc)




def analyze_compliance_report(
    db: Session,
    data: ComplianceAnalyzeRequest,
    user_id: uuid.UUID,
    background_tasks: BackgroundTasks,
) -> dict[str, Any]:
    """
    Start compliance analysis for an organization.

    Validates:
    - User is the owner of the organization.
    - Regulation document exists and belongs to the organization.
    - Policy document exists and belongs to the organization.

    Creates report in PROCESSING status and enqueues background engine task.
    """
    # 1. Validate Organization ownership
    org = db.get(Organization, data.organization_id)
    if not org or org.created_by != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND if not org else status.HTTP_403_FORBIDDEN,
            detail="Organization not found or you don't have access to it.",
        )

    # 2. Validate Regulation document
    reg_doc = db.get(Document, data.regulation_document_id)
    if not reg_doc or reg_doc.organization_id != data.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Regulation document not found in the specified organization.",
        )
    if reg_doc.document_type != DocumentType.REGULATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Document '{reg_doc.original_filename}' is not a REGULATION document.",
        )

    # 3. Validate Policy document
    policy_doc = db.get(Document, data.policy_document_id)
    if not policy_doc or policy_doc.organization_id != data.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Policy document not found in the specified organization.",
        )
    if policy_doc.document_type != DocumentType.POLICY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Document '{policy_doc.original_filename}' is not a POLICY document.",
        )

    # 4. Create ComplianceReport record in PROCESSING status
    report = ComplianceReport(
        organization_id=data.organization_id,
        regulation_document_id=data.regulation_document_id,
        policy_document_id=data.policy_document_id,
        status=ComplianceReportStatus.PROCESSING,
        created_by=user_id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    # 5. Enqueue background task
    try:
        background_tasks.add_task(_run_background_analysis, report.id)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to enqueue background analysis for report_id=%s", report.id)

    logger.info("Enqueued compliance analysis report_id=%s for user=%s", report.id, user_id)
    return {
        "report_id": report.id,
        "status": ComplianceReportStatus.PROCESSING,
    }


def get_compliance_report_by_id(
    db: Session,
    report_id: uuid.UUID,
    user_id: uuid.UUID,
) -> dict[str, Any]:
    """
    Get complete compliance report details by ID.
    Only the owner of the organization can access the report.
    """
    report = crud.get_compliance_report(db, report_id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Compliance report not found.",
        )

    # Validate Organization ownership
    if report.organization.created_by != user_id and report.created_by != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the organization owner can access this compliance report.",
        )

    # Parse details if summary contains JSON payload
    details_payload = None
    if report.summary:
        try:
            details_payload = json.loads(report.summary)
        except Exception:  # noqa: BLE001
            details_payload = None

    return {
        "id": report.id,
        "organization_id": report.organization_id,
        "regulation_document_id": report.regulation_document_id,
        "policy_document_id": report.policy_document_id,
        "overall_score": report.overall_score,
        "status": report.status,
        "summary": report.summary,
        "details": details_payload,
        "created_by": report.created_by,
        "created_at": report.created_at,
        "updated_at": report.updated_at,
    }


def list_compliance_reports(
    db: Session,
    user_id: uuid.UUID,
    organization_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Sequence[ComplianceReport]:
    """
    List compliance reports accessible to the user.
    """
    if organization_id:
        org = db.get(Organization, organization_id)
        if not org or org.created_by != user_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found or you don't have access to it.",
            )
        return crud.list_compliance_reports_by_org(db, organization_id, skip=skip, limit=limit)

    return crud.list_compliance_reports_by_user(db, user_id, skip=skip, limit=limit)


def delete_compliance_report_by_id(
    db: Session,
    report_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """
    Delete a compliance report by ID after verifying organization ownership.
    """
    report = crud.get_compliance_report(db, report_id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Compliance report not found.",
        )

    if report.organization.created_by != user_id and report.created_by != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the organization owner can delete this compliance report.",
        )

    crud.delete_compliance_report(db, report_id)
    logger.info("Compliance report deleted: id=%s by user=%s", report_id, user_id)
