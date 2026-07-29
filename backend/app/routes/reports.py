"""
Reports API routes.
"""
from __future__ import annotations

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.compliance.models import ComplianceReportStatus
from app.db.session import get_db
from app.schemas.report import (
    ReportDetailResponse,
    ReportItemResponse,
    ReportPaginatedResponse,
)
from app.services.report_service import (
    ReportNotFoundError,
    ReportService,
    get_report_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get(
    "",
    response_model=ReportPaginatedResponse,
    summary="List all reports (paginated)",
)
@router.get(
    "/",
    response_model=ReportPaginatedResponse,
    summary="List all reports (paginated)",
    include_in_schema=False,
)
def list_reports(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    status: Optional[ComplianceReportStatus] = Query(None, description="Optional report status filter"),
    db: Session = Depends(get_db),
    service: ReportService = Depends(get_report_service),
) -> ReportPaginatedResponse:
    """
    List reports ordered by `created_at` DESC.

    Supports pagination (`page`, `page_size`) and filtering by `status`
    (`COMPLETED`, `FAILED`, `PROCESSING`, `PENDING`).
    """
    items, total = service.list_reports(
        db,
        page=page,
        page_size=page_size,
        status_filter=status,
    )
    return ReportPaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        items=[ReportItemResponse.model_validate(item) for item in items],
    )


@router.get(
    "/organization/{organization_id}",
    response_model=List[ReportItemResponse],
    summary="Get reports for an organization",
)
def get_organization_reports(
    organization_id: uuid.UUID,
    status: Optional[ComplianceReportStatus] = Query(None, description="Optional report status filter"),
    db: Session = Depends(get_db),
    service: ReportService = Depends(get_report_service),
) -> List[ReportItemResponse]:
    """
    Return every report belonging to a specific organization, ordered newest first.
    """
    items = service.list_reports_by_organization(
        db,
        organization_id=organization_id,
        status_filter=status,
    )
    return [ReportItemResponse.model_validate(item) for item in items]


@router.get(
    "/{report_id}",
    response_model=ReportDetailResponse,
    summary="Get complete report by ID",
)
def get_report(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    service: ReportService = Depends(get_report_service),
) -> ReportDetailResponse:
    """
    Return the complete report details by ID directly from PostgreSQL.
    """
    try:
        report = service.get_report(db, report_id)
        return ReportDetailResponse.model_validate(report)
    except ReportNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID '{report_id}' not found.",
        )
