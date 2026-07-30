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


from datetime import datetime
from app.core.dependencies import get_current_user
from app.db.models import User


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
    organization_id: Optional[uuid.UUID] = Query(None, description="Filter by Organization ID"),
    regulation_id: Optional[uuid.UUID] = Query(None, description="Filter by Regulation ID"),
    status: Optional[ComplianceReportStatus] = Query(None, description="Optional report status filter"),
    risk_level: Optional[str] = Query(None, description="Filter by Risk Level (LOW, MEDIUM, HIGH, CRITICAL)"),
    start_date: Optional[datetime] = Query(None, description="Filter by created_at >= start_date"),
    end_date: Optional[datetime] = Query(None, description="Filter by created_at <= end_date"),
    report_id: Optional[str] = Query(None, description="Search by Report ID substring"),
    policy_name: Optional[str] = Query(None, description="Search by Policy Document Name substring"),
    sort_by: Optional[str] = Query("newest", description="Sort order: newest, oldest, highest_score, lowest_score"),
    db: Session = Depends(get_db),
    service: ReportService = Depends(get_report_service),
    current_user: Optional[User] = Depends(get_current_user),
) -> ReportPaginatedResponse:
    """
    List reports with comprehensive server-side filtering, sorting, and pagination.
    """
    user_id = current_user.id if current_user else None
    items, total = service.list_reports(
        db,
        page=page,
        page_size=page_size,
        organization_id=organization_id,
        regulation_id=regulation_id,
        status_filter=status,
        risk_level=risk_level,
        start_date=start_date,
        end_date=end_date,
        report_id_query=report_id,
        policy_name_query=policy_name,
        sort_by=sort_by,
        user_id=user_id,
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
