"""
Compliance domain service layer. Handles business logic, permissions, and engine orchestration.
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Sequence

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.compliance import crud
from app.compliance.models import ComplianceReport, ComplianceReportStatus
from app.compliance.schemas import ComplianceAnalyzeRequest, ComplianceReportCreate
from app.db.models import Document, DocumentType, Organization, Regulation
from app.db.session import SessionLocal
from app.services.activity_service import log_activity

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

    # 2. Validate Regulation
    reg_doc = db.get(Regulation, data.regulation_id)
    if not reg_doc:
        reg_doc = db.get(Document, data.regulation_id)
        if not reg_doc or reg_doc.document_type != DocumentType.REGULATION:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Regulation document not found.",
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

    # 4. Check Compliance Report Cache
    policy_hash = policy_doc.checksum
    regulation_hash = getattr(reg_doc, "document_hash", None) or getattr(reg_doc, "checksum", None) or ""

    if policy_hash and regulation_hash:
        cached_report = db.scalars(
            select(ComplianceReport)
            .where(
                ComplianceReport.organization_id == data.organization_id,
                ComplianceReport.status == ComplianceReportStatus.COMPLETED,
                ComplianceReport.policy_hash == policy_hash,
                ComplianceReport.regulation_hash == regulation_hash,
            )
            .order_by(ComplianceReport.created_at.desc())
        ).first()

        if cached_report:
            logger.info(
                "CACHE HIT: Reusing completed compliance report id=%s for organization_id=%s (policy_hash=%s, regulation_hash=%s)",
                cached_report.id,
                data.organization_id,
                policy_hash,
                regulation_hash,
            )
            return {
                "report_id": cached_report.id,
                "status": cached_report.status,
            }

    logger.info(
        "CACHE MISS: Initiating new compliance check for organization_id=%s (policy_hash=%s, regulation_hash=%s)",
        data.organization_id,
        policy_hash,
        regulation_hash,
    )

    # 5. Create ComplianceReport record in PROCESSING status
    report = ComplianceReport(
        organization_id=data.organization_id,
        regulation_id=data.regulation_id,
        policy_document_id=data.policy_document_id,
        policy_hash=policy_hash,
        regulation_hash=regulation_hash,
        status=ComplianceReportStatus.PROCESSING,
        created_by=user_id,
    )
    db.add(report)
    try:
        db.commit()
        db.refresh(report)
    except Exception:
        db.rollback()
        logger.error("Failed creating report... organization_id=%s", data.organization_id)
        raise

    logger.info("Creating report... report_id=%s created successfully", report.id)

    # 6. Enqueue background task
    try:
        background_tasks.add_task(_run_background_analysis, report.id)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to enqueue background analysis for report_id=%s", report.id)

    logger.info("Enqueued compliance analysis report_id=%s for user=%s", report.id, user_id)

    log_activity(
        db,
        user_id=user_id,
        event_type="COMPLIANCE_STARTED",
        title="Started Compliance Check",
        description=f"Initiated compliance analysis for organization '{org.name}'",
        icon_type="report",
        extra_data={"report_id": str(report.id), "organization_id": str(data.organization_id)},
    )

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

    # Parse details: summary column stores the full result JSON payload
    details_payload = None
    text_summary = report.summary  # fallback plain text
    if report.summary:
        try:
            details_payload = json.loads(report.summary)
            # Extract the human-readable summary text from within the JSON
            if isinstance(details_payload, dict):
                text_summary = details_payload.get("summary") or report.summary
        except Exception:  # noqa: BLE001
            details_payload = None

    # Fallback for old reports whose summary was plain text (not JSON):
    # Reconstruct a minimal details dict from the DB clause-count columns so the
    # frontend receives real numbers instead of zeros.
    if details_payload is None and report.status.value == "COMPLETED":
        details_payload = {
            "overall_score": report.overall_score or 0.0,
            "status": "COMPLETED",
            "summary": text_summary or "",
            "total_regulation_clauses": report.total_clauses or 0,
            "compliant_count": report.compliant_clauses or 0,
            "partially_compliant_count": report.partial_clauses or 0,
            "non_compliant_count": report.non_compliant_clauses or 0,
            "failed_count": 0,
            "evaluated_clauses": [],
            "missing_clauses": [],
            "weak_clauses": [],
            "recommendations": report.recommendations or [],
        }

    return {
        "id": report.id,
        "organization_id": report.organization_id,
        "regulation_id": report.regulation_id,
        "policy_document_id": report.policy_document_id,
        "overall_score": report.overall_score,
        "total_clauses": report.total_clauses,
        "compliant_clauses": report.compliant_clauses,
        "partial_clauses": report.partial_clauses,
        "non_compliant_clauses": report.non_compliant_clauses,
        "status": report.status,
        "report_status": report.report_status,
        "summary": text_summary,
        "recommendations": report.recommendations,
        "details": details_payload,
        "processing_time_seconds": report.processing_time_seconds,
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
