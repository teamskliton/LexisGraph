"""
Compliance domain API endpoints.
"""
from __future__ import annotations

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session

from app.compliance import service
from app.compliance.schemas import (
    ComplianceAnalyzeRequest,
    ComplianceAnalyzeResponse,
    ComplianceReportResponse,
)
from app.core.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compliance", tags=["compliance"])


@router.post(
    "/analyze",
    response_model=ComplianceAnalyzeResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Initiate compliance analysis (Async Job)",
)
@router.post(
    "",
    response_model=ComplianceAnalyzeResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Initiate compliance analysis",
    include_in_schema=False,
)
@router.post(
    "/",
    response_model=ComplianceAnalyzeResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Initiate compliance analysis (alias)",
    include_in_schema=False,
)
def analyze_compliance(
    data: ComplianceAnalyzeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComplianceAnalyzeResponse:
    """
    Initiate asynchronous compliance analysis between a regulation document and a policy document.

    - **organization_id**: UUID of the organization
    - **regulation_id**: UUID of the regulation document
    - **policy_document_id**: UUID of the policy document

    Requires JWT authentication. Only the organization owner can execute analysis.
    Returns 202 Accepted immediately with `{ "job_id": "...", "status": "QUEUED" }`.
    """
    res = service.analyze_compliance_report(db, data, current_user.id, background_tasks)
    return ComplianceAnalyzeResponse(
        job_id=res["job_id"],
        status=res["status"],
        report_id=res.get("report_id"),
        existing_report=res.get("existing_report", False),
    )


@router.get(
    "/{report_id}",
    response_model=ComplianceReportResponse,
    summary="Get complete compliance report by ID",
)
def get_compliance_report(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComplianceReportResponse:
    """
    Get complete details of a specific compliance report.

    - **report_id**: UUID of the compliance report

    Requires JWT authentication. Only the organization owner can access the report.
    """
    report_dict = service.get_compliance_report_by_id(db, report_id, current_user.id)
    return ComplianceReportResponse.model_validate(report_dict)


@router.get(
    "/reports",
    response_model=List[ComplianceReportResponse],
    summary="List compliance reports",
)
@router.get(
    "/",
    response_model=List[ComplianceReportResponse],
    summary="List compliance reports (alias)",
    include_in_schema=False,
)
def list_compliance_reports(
    organization_id: Optional[uuid.UUID] = Query(None, description="Filter by organization ID"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ComplianceReportResponse]:
    """
    List compliance reports created by or accessible to the current user.
    """
    reports = service.list_compliance_reports(
        db,
        current_user.id,
        organization_id=organization_id,
        skip=skip,
        limit=limit,
    )
    return [ComplianceReportResponse.model_validate(service.get_compliance_report_by_id(db, r.id, current_user.id)) for r in reports]


@router.delete(
    "/{report_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a compliance report",
)
def delete_compliance_report(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """
    Delete a compliance report. Only the organization owner can delete.
    """
    service.delete_compliance_report_by_id(db, report_id, current_user.id)
    return None


@router.get(
    "/{report_id}/export/pdf",
    summary="Export compliance report as PDF",
)
def export_compliance_report_pdf_endpoint(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Export full compliance report as a styled PDF document.
    """
    from fastapi.responses import StreamingResponse
    from app.services.export_service import export_compliance_report_pdf

    report_dict = service.get_compliance_report_by_id(db, report_id, current_user.id)
    pdf_bytes = export_compliance_report_pdf(report_dict)
    filename = f"compliance_report_{str(report_id)[:8]}.pdf"

    from app.services.activity_service import log_activity
    log_activity(
        db,
        user_id=current_user.id,
        event_type="PDF_DOWNLOADED",
        title="Downloaded PDF Report",
        description=f"Exported compliance report '{filename}'",
        icon_type="download",
        extra_data={"report_id": str(report_id)},
    )

    return StreamingResponse(
        pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get(
    "/{report_id}/export/json",
    summary="Export compliance report as JSON",
)
def export_compliance_report_json_endpoint(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Export full compliance report as JSON.
    """
    from fastapi.responses import JSONResponse

    report_dict = service.get_compliance_report_by_id(db, report_id, current_user.id)
    filename = f"compliance_report_{str(report_id)[:8]}.json"

    return JSONResponse(
        content=report_dict,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

