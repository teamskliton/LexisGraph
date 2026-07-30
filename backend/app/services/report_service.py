"""
Report service handling PostgreSQL CRUD operations.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Tuple

from sqlalchemy import select, func, or_, and_, cast, String
from sqlalchemy.orm import Session

from app.compliance.models import ComplianceReport, ComplianceReportStatus
from app.db.models.document import Document
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
        organization_id: Optional[uuid.UUID] = None,
        regulation_id: Optional[uuid.UUID] = None,
        status_filter: Optional[ComplianceReportStatus] = None,
        risk_level: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        report_id_query: Optional[str] = None,
        policy_name_query: Optional[str] = None,
        sort_by: Optional[str] = "newest",
        user_id: Optional[uuid.UUID] = None,
    ) -> Tuple[List[ComplianceReport], int]:
        """
        List reports with comprehensive filtering, sorting, and pagination.
        """
        stmt = select(ComplianceReport)

        if user_id:
            stmt = stmt.where(ComplianceReport.created_by == user_id)

        if organization_id:
            stmt = stmt.where(ComplianceReport.organization_id == organization_id)

        if regulation_id:
            stmt = stmt.where(ComplianceReport.regulation_id == regulation_id)

        if status_filter:
            stmt = stmt.where(ComplianceReport.status == status_filter)

        if risk_level:
            rl = risk_level.upper()
            if rl == "LOW":
                stmt = stmt.where(
                    or_(
                        and_(ComplianceReport.overall_score >= 0.85, ComplianceReport.overall_score <= 1.0),
                        ComplianceReport.overall_score >= 85.0,
                    )
                )
            elif rl == "MEDIUM":
                stmt = stmt.where(
                    or_(
                        and_(ComplianceReport.overall_score >= 0.70, ComplianceReport.overall_score < 0.85),
                        and_(ComplianceReport.overall_score >= 70.0, ComplianceReport.overall_score < 85.0),
                    )
                )
            elif rl == "HIGH":
                stmt = stmt.where(
                    or_(
                        and_(ComplianceReport.overall_score >= 0.50, ComplianceReport.overall_score < 0.70),
                        and_(ComplianceReport.overall_score >= 50.0, ComplianceReport.overall_score < 70.0),
                    )
                )
            elif rl == "CRITICAL":
                stmt = stmt.where(
                    or_(
                        and_(ComplianceReport.overall_score >= 0.0, ComplianceReport.overall_score < 0.50),
                        and_(ComplianceReport.overall_score >= 0.0, ComplianceReport.overall_score < 50.0),
                    )
                )

        if start_date:
            stmt = stmt.where(ComplianceReport.created_at >= start_date)

        if end_date:
            stmt = stmt.where(ComplianceReport.created_at <= end_date)

        if report_id_query and report_id_query.strip():
            q = f"%{report_id_query.strip()}%"
            stmt = stmt.where(cast(ComplianceReport.id, String).ilike(q))

        if policy_name_query and policy_name_query.strip():
            q = f"%{policy_name_query.strip()}%"
            stmt = stmt.join(Document, ComplianceReport.policy_document_id == Document.id, isouter=True)
            stmt = stmt.where(Document.original_filename.ilike(q))

        # Total matching count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = db.scalar(count_stmt) or 0

        # Sorting
        if sort_by == "oldest":
            stmt = stmt.order_by(ComplianceReport.created_at.asc())
        elif sort_by == "highest_score":
            stmt = stmt.order_by(ComplianceReport.overall_score.desc().nulls_last())
        elif sort_by == "lowest_score":
            stmt = stmt.order_by(ComplianceReport.overall_score.asc().nulls_last())
        else:  # newest
            stmt = stmt.order_by(ComplianceReport.created_at.desc())

        offset = (page - 1) * page_size
        stmt = stmt.offset(offset).limit(page_size)

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
