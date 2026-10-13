"""
Report service handling PostgreSQL CRUD operations.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional, Tuple

from sqlalchemy import select, func, or_, and_, cast, String
from sqlalchemy.orm import Session, joinedload

from app.compliance.models import ComplianceReport, ComplianceReportStatus
from app.db.models.document import Document
from app.db.models.regulation import Regulation
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
        Retrieve a single report by ID from PostgreSQL with eager-loaded relationships.

        Raises
        ------
        ReportNotFoundError
            If no report with the given ID exists or if it is soft deleted.
        """
        stmt = (
            select(ComplianceReport)
            .options(
                joinedload(ComplianceReport.regulation),
                joinedload(ComplianceReport.policy_document),
                joinedload(ComplianceReport.organization),
            )
            .where(ComplianceReport.id == report_id, ComplianceReport.is_deleted == False)
        )
        report = db.scalar(stmt)
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
        search_query: Optional[str] = None,
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

        # Unified search across ID, document filename, regulation title, and summary
        needs_doc_join = False
        if search_query and search_query.strip():
            needs_doc_join = True
            sq = f"%{search_query.strip()}%"
            stmt = stmt.outerjoin(Document, ComplianceReport.policy_document_id == Document.id)
            stmt = stmt.outerjoin(Regulation, ComplianceReport.regulation_id == Regulation.id)
            stmt = stmt.where(
                or_(
                    cast(ComplianceReport.id, String).ilike(sq),
                    Document.original_filename.ilike(sq),
                    Regulation.title.ilike(sq),
                    Regulation.act_name.ilike(sq),
                    ComplianceReport.summary.ilike(sq),
                )
            )

        if report_id_query and report_id_query.strip():
            q = f"%{report_id_query.strip()}%"
            stmt = stmt.where(cast(ComplianceReport.id, String).ilike(q))

        if policy_name_query and policy_name_query.strip():
            if not needs_doc_join:
                stmt = stmt.outerjoin(Document, ComplianceReport.policy_document_id == Document.id)
            q = f"%{policy_name_query.strip()}%"
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
        stmt = (
            stmt.offset(offset)
            .limit(page_size)
            .options(
                joinedload(ComplianceReport.regulation),
                joinedload(ComplianceReport.policy_document),
                joinedload(ComplianceReport.organization),
            )
        )

        items = list(db.scalars(stmt).unique().all())
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
            .options(
                joinedload(ComplianceReport.regulation),
                joinedload(ComplianceReport.policy_document),
                joinedload(ComplianceReport.organization),
            )
            .where(ComplianceReport.organization_id == organization_id, ComplianceReport.is_deleted == False)
        )
        if status_filter:
            stmt = stmt.where(ComplianceReport.status == status_filter)
        stmt = stmt.order_by(ComplianceReport.created_at.desc())
        return list(db.scalars(stmt).unique().all())

    def get_organization_report_summary(
        self,
        db: Session,
        organization_id: uuid.UUID,
    ) -> dict:
        """
        Compute KPI summary for an organization's compliance reports:
        1. total_reports: Total reports created for this organization.
        2. latest_score: Score of the most recent completed report.
        3. latest_report_date: Date of the most recent completed report.
        4. latest_risk_level: Risk severity of the most recent completed report.
        5. average_score: Average compliance score across completed reports.
        6. high_risk_count: Count of reports classified as HIGH or CRITICAL.
        """
        stmt = (
            select(ComplianceReport)
            .where(
                ComplianceReport.organization_id == organization_id,
                ComplianceReport.is_deleted == False,
            )
            .order_by(ComplianceReport.created_at.desc())
        )
        reports = list(db.scalars(stmt).all())
        total_reports = len(reports)

        completed_reports = [
            r for r in reports
            if r.status == ComplianceReportStatus.COMPLETED and r.overall_score is not None
        ]

        latest_report = completed_reports[0] if completed_reports else (reports[0] if reports else None)
        latest_score: Optional[float] = None
        latest_date: Optional[str] = None
        latest_risk: Optional[str] = None

        if latest_report and latest_report.overall_score is not None:
            raw_s = latest_report.overall_score
            latest_score = round(raw_s * 100, 1) if 0 < raw_s <= 1.0 else round(raw_s, 1)
            latest_date = latest_report.created_at.isoformat() if latest_report.created_at else None
            latest_risk = latest_report.risk_level

        if completed_reports:
            scores = []
            for r in completed_reports:
                s = r.overall_score
                if s is not None:
                    scores.append(s * 100 if 0 < s <= 1.0 else s)
            avg_score = round(sum(scores) / len(scores), 1) if scores else None
        else:
            avg_score = None

        high_risk_count = sum(
            1 for r in reports
            if (r.risk_level and r.risk_level.upper() in ("HIGH", "CRITICAL"))
            or (r.overall_score is not None and ((0 <= r.overall_score < 0.70) or (0 <= r.overall_score < 70.0 and r.overall_score > 1.0)))
        )

        return {
            "total_reports": total_reports,
            "latest_score": latest_score,
            "latest_report_date": latest_date,
            "latest_risk_level": latest_risk,
            "average_score": avg_score,
            "high_risk_count": high_risk_count,
        }

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
