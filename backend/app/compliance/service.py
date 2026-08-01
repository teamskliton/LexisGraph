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
from app.services.job_worker import execute_compliance_job

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
    Initiate asynchronous compliance analysis for an organization.
    Validates organization ownership, regulation, and policy documents.
    Creates a ComplianceJob in QUEUED status and enqueues non-blocking worker execution.
    Returns immediately in < 1 second.
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

        if cached_report and not cached_report.is_deleted:
            logger.info(
                "Existing report reused: report_id=%s for organization_id=%s (policy_hash=%s, regulation_hash=%s)",
                cached_report.id,
                data.organization_id,
                policy_hash,
                regulation_hash,
            )
            # Create a completed job reference for cached report
            cached_job = crud.create_compliance_job(
                db,
                organization_id=data.organization_id,
                regulation_id=data.regulation_id,
                policy_document_id=data.policy_document_id,
                user_id=user_id,
            )
            cached_job.status = crud.ComplianceJobStatus.COMPLETED
            cached_job.progress = 100
            cached_job.current_step = "Completed (Cached)"
            cached_job.report_id = cached_report.id
            db.commit()

            return {
                "job_id": cached_job.id,
                "status": "COMPLETED",
                "report_id": cached_report.id,
                "existing_report": True,
            }

    # 5. Create ComplianceJob record in QUEUED status
    job = crud.create_compliance_job(
        db,
        organization_id=data.organization_id,
        regulation_id=data.regulation_id,
        policy_document_id=data.policy_document_id,
        user_id=user_id,
    )

    logger.info("Job queued: job_id=%s organization_id=%s user_id=%s", job.id, data.organization_id, user_id)

    # 6. Enqueue non-blocking background job worker
    try:
        background_tasks.add_task(execute_compliance_job, job.id)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to enqueue compliance job worker for job_id=%s", job.id)

    log_activity(
        db,
        user_id=user_id,
        event_type="COMPLIANCE_STARTED",
        title="Queued Compliance Audit Job",
        description=f"Queued async compliance analysis job for organization '{org.name}'",
        icon_type="report",
        extra_data={"job_id": str(job.id), "organization_id": str(data.organization_id)},
    )

    return {
        "job_id": job.id,
        "status": "QUEUED",
        "existing_report": False,
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
    if not report or report.is_deleted:
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

    logger.info("Report loaded: report_id=%s", report_id)

    return {
        "id": report.id,
        "organization_id": report.organization_id,
        "regulation_id": report.regulation_id,
        "regulation_document_id": report.regulation_id,
        "policy_document_id": report.policy_document_id,
        "overall_score": report.overall_score,
        "risk_level": report.risk_level,
        "total_clauses": report.total_clauses,
        "compliant_clauses": report.compliant_clauses,
        "partial_clauses": report.partial_clauses,
        "non_compliant_clauses": report.non_compliant_clauses,
        "total_matches": report.total_matches or report.compliant_clauses or 0,
        "total_partial_matches": report.total_partial_matches or report.partial_clauses or 0,
        "total_missing": report.total_missing or report.non_compliant_clauses or 0,
        "status": report.status,
        "report_status": report.report_status,
        "summary": text_summary,
        "executive_summary": report.executive_summary or text_summary,
        "recommendations": report.recommendations,
        "details": details_payload,
        "report_json": report.report_json or details_payload,
        "processing_time_seconds": report.processing_time_seconds,
        "processing_time_ms": report.processing_time_ms or (report.processing_time_seconds * 1000.0 if report.processing_time_seconds else None),
        "is_deleted": report.is_deleted,
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
        reports = crud.list_compliance_reports_by_org(db, organization_id, skip=skip, limit=limit)
    else:
        reports = crud.list_compliance_reports_by_user(db, user_id, skip=skip, limit=limit)

    logger.info("Report loaded: list count=%s for user=%s", len(reports), user_id)
    return reports


def delete_compliance_report_by_id(
    db: Session,
    report_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """
    Soft delete a compliance report by ID after verifying organization ownership.
    """
    report = crud.get_compliance_report(db, report_id, include_deleted=True)
    if not report or report.is_deleted:
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
    logger.info("Report deleted: report_id=%s by user=%s", report_id, user_id)


# ---------------------------------------------------------------------------
# ComplianceJob Service functions
# ---------------------------------------------------------------------------

def get_compliance_job_by_id(
    db: Session,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
) -> crud.ComplianceJob:
    """
    Get job progress, status, and details by ID.
    Validates user authorization.
    """
    job = crud.get_compliance_job(db, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Compliance job not found.",
        )

    if job.created_by != user_id and job.organization.created_by != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this compliance job.",
        )

    return job


def list_compliance_jobs(
    db: Session,
    user_id: uuid.UUID,
    organization_id: uuid.UUID | None = None,
    status_filter: crud.ComplianceJobStatus | str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Sequence[crud.ComplianceJob]:
    """
    List active/recent compliance jobs for the current user.
    """
    return crud.list_compliance_jobs_by_user(
        db,
        user_id=user_id,
        organization_id=organization_id,
        status_filter=status_filter,
        skip=skip,
        limit=limit,
    )


def cancel_compliance_job_by_id(
    db: Session,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
) -> crud.ComplianceJob:
    """
    Cancel a queued or running compliance job.
    """
    job = crud.cancel_compliance_job(db, job_id, user_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Compliance job not found or cannot be cancelled.",
        )
    logger.info("Job cancelled: job_id=%s by user=%s", job_id, user_id)
    return job
