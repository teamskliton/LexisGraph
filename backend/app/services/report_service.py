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
            If no report with the given ID exists or if it is soft deleted.
        """
        report = db.get(ComplianceReport, report_id)
        if not report or report.is_deleted:
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
        List reports with comprehensive filtering, sorting, and pagination (excludes soft deleted reports).
        """
        stmt = select(ComplianceReport).where(ComplianceReport.is_deleted == False)

        if organization_id:
            stmt = stmt.where(ComplianceReport.organization_id == organization_id)
        elif user_id:
            from app.db.models.rbac import OrganizationMember, MemberStatus
            from app.db.models.organization import Organization

            member_org_ids = db.scalars(
                select(OrganizationMember.organization_id).where(
                    OrganizationMember.user_id == user_id,
                    OrganizationMember.status == MemberStatus.ACTIVE,
                )
            ).all()
            created_org_ids = db.scalars(
                select(Organization.id).where(Organization.created_by == user_id)
            ).all()
            accessible_org_ids = list(set(member_org_ids) | set(created_org_ids))
            if accessible_org_ids:
                stmt = stmt.where(
                    or_(
                        ComplianceReport.organization_id.in_(accessible_org_ids),
                        ComplianceReport.created_by == user_id,
                    )
                )
            else:
                stmt = stmt.where(ComplianceReport.created_by == user_id)

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
        Retrieve all non-deleted reports belonging to a specific organization, ordered newest first.
        """
        stmt = (
            select(ComplianceReport)
            .where(ComplianceReport.organization_id == organization_id, ComplianceReport.is_deleted == False)
        )
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
        """Soft delete a report in PostgreSQL."""
        report = db.get(ComplianceReport, report_id)
        if not report or report.is_deleted:
            return False
        report.is_deleted = True
        db.commit()
        return True

    def compare_reports(
        self,
        db: Session,
        report_id_1: uuid.UUID,
        report_id_2: uuid.UUID,
    ) -> dict:
        """
        Compare two compliance reports.
        Calculates score diff, resolved findings, new regressions, and recommendation changes.
        """
        r1 = self.get_report(db, report_id_1)
        r2 = self.get_report(db, report_id_2)

        s1 = r1.overall_score or 0.0
        s2 = r2.overall_score or 0.0
        if 0 < s1 <= 1.0:
            s1 *= 100
        if 0 < s2 <= 1.0:
            s2 *= 100
        score_diff = round(s2 - s1, 1)

        findings1 = {f.policy_clause_id or f.citation or str(f.id): f for f in getattr(r1, "findings_list", [])}
        findings2 = {f.policy_clause_id or f.citation or str(f.id): f for f in getattr(r2, "findings_list", [])}

        resolved = []
        regressions = []
        new_findings = []

        for cid, f2 in findings2.items():
            if cid not in findings1:
                new_findings.append({
                    "clause_id": cid,
                    "status": f2.status,
                    "severity": f2.severity,
                    "reasoning": f2.reasoning,
                })
            else:
                f1 = findings1[cid]
                if f1.status in ("NON_COMPLIANT", "PARTIAL") and f2.status == "COMPLIANT":
                    resolved.append({
                        "clause_id": cid,
                        "previous_status": f1.status,
                        "current_status": f2.status,
                    })
                elif f1.status == "COMPLIANT" and f2.status in ("NON_COMPLIANT", "PARTIAL"):
                    regressions.append({
                        "clause_id": cid,
                        "previous_status": f1.status,
                        "current_status": f2.status,
                        "severity": f2.severity,
                    })

        return {
            "report_1": {
                "id": str(r1.id),
                "created_at": r1.created_at,
                "overall_score": round(s1, 1),
                "risk_level": r1.risk_level,
                "version": r1.version,
            },
            "report_2": {
                "id": str(r2.id),
                "created_at": r2.created_at,
                "overall_score": round(s2, 1),
                "risk_level": r2.risk_level,
                "version": r2.version,
            },
            "score_diff": score_diff,
            "resolved_findings": resolved,
            "regression_findings": regressions,
            "new_findings": new_findings,
            "recommendation_changes": [
                {"clause_id": cid, "recommendation": f2.recommendation}
                for cid, f2 in findings2.items()
                if f2.recommendation and (cid not in findings1 or findings1[cid].recommendation != f2.recommendation)
            ],
        }


def get_report_service() -> ReportService:
    """Dependency provider / factory for ReportService."""
    return ReportService()
