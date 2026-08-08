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
    "/compare",
    summary="Compare two compliance reports",
)
def compare_reports(
    report_id_1: uuid.UUID = Query(..., description="First report ID"),
    report_id_2: uuid.UUID = Query(..., description="Second report ID to compare against"),
    db: Session = Depends(get_db),
    service: ReportService = Depends(get_report_service),
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    Compare two compliance reports. Returns score diff, resolved findings, regressions, and recommendation changes.
    """
    try:
        return service.compare_reports(db, report_id_1, report_id_2)
    except ReportNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


def verify_user_organization_access(db: Session, user_id: Optional[uuid.UUID], organization_id: uuid.UUID) -> bool:
    if not user_id:
        return True
    from app.db.models.organization import Organization
    from app.db.models.rbac import OrganizationMember, MemberStatus
    from sqlalchemy import or_, select

    member_org_ids = db.scalars(
        select(OrganizationMember.organization_id).where(
            OrganizationMember.user_id == user_id,
            OrganizationMember.status == MemberStatus.ACTIVE,
        )
    ).all()

    org = db.query(Organization).filter(
        Organization.id == organization_id,
        or_(
            Organization.created_by == user_id,
            Organization.id.in_(member_org_ids) if member_org_ids else False,
        )
    ).first()

    return org is not None


@router.get(
    "/{report_id}",
    response_model=ReportDetailResponse,
    summary="Get complete report by ID",
)
def get_report(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    service: ReportService = Depends(get_report_service),
    current_user: Optional[User] = Depends(get_current_user),
) -> ReportDetailResponse:
    """
    Return the complete report details by ID directly from PostgreSQL.
    Enforces organization access authorization.
    """
    try:
        report = service.get_report(db, report_id)
        if current_user and not verify_user_organization_access(db, current_user.id, report.organization_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this organization's compliance report.",
            )
        logger.info("Report loaded: report_id=%s", report_id)
        return ReportDetailResponse.model_validate(report)
    except ReportNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID '{report_id}' not found.",
        )


@router.get(
    "/{report_id}/findings",
    summary="Get detailed findings list for a report",
)
def get_report_findings(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    service: ReportService = Depends(get_report_service),
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    Return clause-level findings for a compliance report with organization access verification.
    """
    try:
        report = service.get_report(db, report_id)
        if current_user and not verify_user_organization_access(db, current_user.id, report.organization_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this organization's compliance report findings.",
            )
        findings = getattr(report, "findings_list", [])
        if findings:
            return [
                {
                    "id": str(f.id),
                    "report_id": str(f.report_id),
                    "policy_clause_id": f.policy_clause_id,
                    "regulation_clause_id": f.regulation_clause_id,
                    "status": f.status,
                    "confidence": f.confidence,
                    "severity": f.severity,
                    "reasoning": f.reasoning,
                    "recommendation": f.recommendation,
                    "citation": f.citation,
                    "graph_path": f.graph_path,
                    "created_at": f.created_at,
                }
                for f in findings
            ]

        # Fallback: Extract from report_json or summary JSON if findings_list is empty
        extracted = []
        details_data = None
        if report.report_json and isinstance(report.report_json, dict):
            details_data = report.report_json
        elif report.summary:
            try:
                import json
                details_data = json.loads(report.summary)
            except Exception:
                pass

        if details_data and isinstance(details_data, dict):
            clauses = details_data.get("evaluated_clauses", [])
            for idx, c in enumerate(clauses):
                st = (c.get("status") or "NON_COMPLIANT").upper()
                sev = "HIGH" if st == "NON_COMPLIANT" else ("MEDIUM" if st == "PARTIALLY_COMPLIANT" else "LOW")
                extracted.append({
                    "id": f"finding-{report.id}-{idx}",
                    "report_id": str(report.id),
                    "policy_clause_id": c.get("policy_clause_id") or "POL-CLAUSE",
                    "regulation_clause_id": c.get("regulation_clause_id") or "REG-CLAUSE",
                    "status": st,
                    "confidence": c.get("similarity_score", 0.85),
                    "severity": sev,
                    "reasoning": c.get("reasoning"),
                    "recommendation": c.get("recommendation"),
                    "citation": c.get("regulation_text"),
                    "matched_policy_text": c.get("matched_policy_text"),
                    "graph_path": None,
                    "created_at": report.created_at,
                })
        return extracted
    except ReportNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID '{report_id}' not found.",
        )


@router.delete(
    "/{report_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft delete a compliance report",
)
def delete_report(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    service: ReportService = Depends(get_report_service),
    current_user: Optional[User] = Depends(get_current_user),
) -> None:
    """
    Soft delete a compliance report by ID.
    """
    user_id = current_user.id if current_user else uuid.UUID("00000000-0000-0000-0000-000000000000")
    if current_user:
        report = service.get_report(db, report_id)
        if not verify_user_organization_access(db, current_user.id, report.organization_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to delete this organization's report.",
            )
    success = service.delete_report(db, report_id, user_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID '{report_id}' not found.",
        )
    logger.info("Report deleted: report_id=%s", report_id)
    return None
