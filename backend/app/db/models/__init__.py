"""
Database models.

Each model is defined in its own module under this package.
Import models here to make them available for Alembic autogenerate.

Usage
-----
    from app.db.models import User, Organization, Document
"""
from app.db.models.user import User
from app.db.models.organization import Organization
from app.db.models.document import Document, DocumentType, ProcessingStatus
from app.compliance.models import ComplianceReport, ComplianceReportStatus
from app.models.report import Report

__all__ = [
    "User",
    "Organization",
    "Document",
    "DocumentType",
    "ProcessingStatus",
    "ComplianceReport",
    "ComplianceReportStatus",
    "Report",
]