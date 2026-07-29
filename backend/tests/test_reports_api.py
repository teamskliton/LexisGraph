"""
Unit tests for Reports API endpoints.
"""
from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.db.models  # noqa: F401 - Register all models with Base.metadata
from app.compliance.models import ComplianceReport, ComplianceReportStatus
from app.db.models import Document, DocumentType, Organization, ProcessingStatus, User
from app.db.session import Base, get_db
from app.routes.reports import router as reports_router


class ReportsApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine)

        # Populate test fixtures
        db = cls.SessionLocal()
        cls.user = User(
            id=uuid.uuid4(),
            email="reports_test@example.com",
            username="reports_user",
            full_name="Reports User",
            hashed_password="hashed_password",
        )
        db.add(cls.user)
        db.commit()

        cls.org = Organization(
            id=uuid.uuid4(),
            name="Reports Org",
            created_by=cls.user.id,
        )
        db.add(cls.org)
        db.commit()

        cls.reg_doc = Document(
            id=uuid.uuid4(),
            organization_id=cls.org.id,
            uploaded_by=cls.user.id,
            original_filename="reg.pdf",
            stored_filename="reg.pdf",
            file_path="/tmp/reg.pdf",
            file_size=100,
            mime_type="application/pdf",
            checksum="abc",
            document_type=DocumentType.REGULATION,
            processing_status=ProcessingStatus.PROCESSED,
        )
        cls.policy_doc = Document(
            id=uuid.uuid4(),
            organization_id=cls.org.id,
            uploaded_by=cls.user.id,
            original_filename="policy.pdf",
            stored_filename="policy.pdf",
            file_path="/tmp/policy.pdf",
            file_size=100,
            mime_type="application/pdf",
            checksum="def",
            document_type=DocumentType.POLICY,
            processing_status=ProcessingStatus.PROCESSED,
        )
        db.add_all([cls.reg_doc, cls.policy_doc])
        db.commit()

        # Seed reports
        cls.report1 = ComplianceReport(
            id=uuid.uuid4(),
            organization_id=cls.org.id,
            regulation_document_id=cls.reg_doc.id,
            policy_document_id=cls.policy_doc.id,
            overall_score=85.5,
            total_clauses=10,
            compliant_clauses=8,
            partial_clauses=1,
            non_compliant_clauses=1,
            summary="High compliance",
            recommendations=["Fix clause 2"],
            status=ComplianceReportStatus.COMPLETED,
            processing_time_seconds=3.45,
            created_by=cls.user.id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        cls.report2 = ComplianceReport(
            id=uuid.uuid4(),
            organization_id=cls.org.id,
            regulation_document_id=cls.reg_doc.id,
            policy_document_id=cls.policy_doc.id,
            status=ComplianceReportStatus.PROCESSING,
            created_by=cls.user.id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add_all([cls.report1, cls.report2])
        db.commit()
        db.close()

        cls.app = FastAPI()
        cls.app.include_router(reports_router)

        def _override_get_db():
            db_session = cls.SessionLocal()
            try:
                yield db_session
            finally:
                db_session.close()

        cls.app.dependency_overrides[get_db] = _override_get_db
        cls.client = TestClient(cls.app)

    def test_list_reports_paginated(self):
        response = self.client.get("/reports?page=1&page_size=10")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total"], 2)
        self.assertEqual(data["page"], 1)
        self.assertEqual(data["page_size"], 10)
        self.assertEqual(len(data["items"]), 2)
        self.assertIn("overall_score", data["items"][0])
        self.assertIn("report_status", data["items"][0])

    def test_list_reports_filtered_by_status(self):
        response = self.client.get("/reports?status=COMPLETED")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["items"][0]["report_status"], "COMPLETED")
        self.assertEqual(data["items"][0]["overall_score"], 85.5)

    def test_get_report_by_id_success(self):
        response = self.client.get(f"/reports/{self.report1.id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["id"], str(self.report1.id))
        self.assertEqual(data["overall_score"], 85.5)
        self.assertEqual(data["total_clauses"], 10)
        self.assertEqual(data["compliant_clauses"], 8)
        self.assertEqual(data["report_status"], "COMPLETED")
        self.assertEqual(data["recommendations"], ["Fix clause 2"])

    def test_get_report_by_id_not_found(self):
        fake_id = uuid.uuid4()
        response = self.client.get(f"/reports/{fake_id}")
        self.assertEqual(response.status_code, 404)
        self.assertIn("not found", response.json()["detail"].lower())

    def test_get_organization_reports(self):
        response = self.client.get(f"/reports/organization/{self.org.id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["organization_id"], str(self.org.id))


if __name__ == "__main__":
    unittest.main()
