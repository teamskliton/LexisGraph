"""
Report service handling PostgreSQL CRUD operations.
"""
from __future__ import annotations

import uuid
from typing import List, Optional, Tuple

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.compliance.models import ComplianceReport, ComplianceReportStatus
from app.schemas.report import ReportCreate, ReportUpdate


class ReportNotFoundError(Exception):
    """Raised when a requested report is not found in PostgreSQL."""

    def __init__(self, report_id: uuid.UUID):
        self.report_id = report_id
        super().__init__(f"Report {report_id} not found")


class ReportService:
    """
    Service layer for Report entity operations in PostgreSQL.
    All business logic for fetching, paginating, and filtering reports resides here.
    """

    def get_report(
        self,
        db: Session,
        report_id: uuid.UUID,
    ) -> ComplianceReport:
        """
        Retrieve a single report by ID from PostgreSQL.

        Raises
        ------
        ReportNotFoundError
            If no report with the given ID exists.
        """
        report = db.get(ComplianceReport, report_id)
        if not report:
            raise ReportNotFoundError(report_id)
        return report

    def list_reports(
        self,
        db: Session,
        page: int = 1,
        page_size: int = 10,
        status_filter: Optional[ComplianceReportStatus] = None,
    ) -> Tuple[List[ComplianceReport], int]:
        """
        List reports ordered by created_at DESC with pagination and status filtering.

        Parameters
        ----------
        db : Session
            SQLAlchemy session connected to PostgreSQL.
        page : int
            Page number (1-indexed, default: 1).
        page_size : int
            Number of records per page (default: 10).
        status_filter : Optional[ComplianceReportStatus]
            Optional status filter (e.g. COMPLETED, FAILED, PROCESSING).

        Returns
        -------
        Tuple[List[ComplianceReport], int]
            A tuple containing (list_of_report_items, total_count).
        """
        stmt = select(ComplianceReport)
        count_stmt = select(func.count()).select_from(ComplianceReport)

        if status_filter:
            stmt = stmt.where(ComplianceReport.status == status_filter)
            count_stmt = count_stmt.where(ComplianceReport.status == status_filter)

        total = db.scalar(count_stmt) or 0

        offset = (page - 1) * page_size
        stmt = stmt.order_by(ComplianceReport.created_at.desc()).offset(offset).limit(page_size)

        items = list(db.scalars(stmt).all())
        return items, total

    def list_reports_by_organization(
        self,
        db: Session,
        organization_id: uuid.UUID,
        status_filter: Optional[ComplianceReportStatus] = None,
    ) -> List[ComplianceReport]:
        """
        Retrieve all reports belonging to a specific organization, ordered newest first (created_at DESC).

        Parameters
        ----------
        db : Session
            SQLAlchemy session connected to PostgreSQL.
        organization_id : uuid.UUID
            The organization UUID to filter by.
        status_filter : Optional[ComplianceReportStatus]
            Optional status filter.

        Returns
        -------
        List[ComplianceReport]
            List of reports for the organization.
        """
        stmt = select(ComplianceReport).where(ComplianceReport.organization_id == organization_id)
        if status_filter:
            stmt = stmt.where(ComplianceReport.status == status_filter)
        stmt = stmt.order_by(ComplianceReport.created_at.desc())
        return list(db.scalars(stmt).all())

    def create_report(
        self,
        db: Session,
        report_in: ReportCreate,
        user_id: uuid.UUID,
    ) -> ComplianceReport:
        """Create a new report in PostgreSQL."""
        pass

    def update_report(
        self,
        db: Session,
        report_id: uuid.UUID,
        report_in: ReportUpdate,
        user_id: uuid.UUID,
    ) -> Optional[ComplianceReport]:
        """Update a report in PostgreSQL."""
        pass

    def delete_report(
        self,
        db: Session,
        report_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> bool:
        """Delete a report from PostgreSQL."""
        pass


def get_report_service() -> ReportService:
    """Dependency provider / factory for ReportService."""
    return ReportService()
