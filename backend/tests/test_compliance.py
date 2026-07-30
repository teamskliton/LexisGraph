"""
Unit and integration tests for Compliance domain (models, schemas, crud, service, routes).
"""
from __future__ import annotations

import unittest
import uuid

from fastapi import FastAPI, status
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from app.compliance.models import ComplianceReport, ComplianceReportStatus
from app.compliance.schemas import (
    ComplianceReportCreate,
    ComplianceReportUpdate,
)
from app.compliance import crud, service
from app.compliance.routes import router as compliance_router
from app.core.dependencies import get_current_user
from app.db.models import Document, DocumentType, Organization, ProcessingStatus, User, Regulation
from app.db.session import Base, get_db


class ComplianceDomainTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create in-memory SQLite database for testing
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.TestingSessionLocal = sessionmaker(
            autocommit=False, autoflush=False, bind=cls.engine
        )
        Base.metadata.create_all(bind=cls.engine)

    def setUp(self):
        self.db: Session = self.TestingSessionLocal()

        # Seed User
        self.user = User(
            id=uuid.uuid4(),
            email="testuser@example.com",
            username="testuser",
            full_name="Test User",
            hashed_password="hashedpassword123",
            is_active=True,
            is_superuser=False,
        )
        self.db.add(self.user)

        # Seed Organization Owner
        self.org = Organization(
            id=uuid.uuid4(),
            name="Acme Legal",
            description="Acme Legal Org",
            created_by=self.user.id,
        )
        self.db.add(self.org)

        # Seed Other User (Non-owner)
        self.other_user = User(
            id=uuid.uuid4(),
            email="other@example.com",
            username="otheruser",
            full_name="Other User",
            hashed_password="hashedpassword123",
            is_active=True,
            is_superuser=False,
        )
        self.db.add(self.other_user)

        # Seed Regulation
        self.reg_doc = Regulation(
            id=uuid.uuid4(),
            uploaded_by=self.user.id,
            title="GDPR Regulation",
            original_filename="gdpr_regulation.pdf",
            stored_filename="gdpr_regulation_stored.pdf",
            file_path="/tmp/gdpr.pdf",
            file_size=1024,
            mime_type="application/pdf",
            document_hash="abc123hash",
            processing_status=ProcessingStatus.PROCESSED,
        )
        self.db.add(self.reg_doc)

        # Seed Policy Document
        self.policy_doc = Document(
            id=uuid.uuid4(),
            organization_id=self.org.id,
            uploaded_by=self.user.id,
            original_filename="company_privacy_policy.pdf",
            stored_filename="company_privacy_policy_stored.pdf",
            file_path="/tmp/policy.pdf",
            file_size=2048,
            mime_type="application/pdf",
            checksum="def456hash",
            document_type=DocumentType.POLICY,
            processing_status=ProcessingStatus.PROCESSED,
        )
        self.db.add(self.policy_doc)

        self.db.commit()

    def tearDown(self):
        self.db.query(ComplianceReport).delete()
        self.db.query(Document).delete()
        self.db.query(Regulation).delete()
        self.db.query(Organization).delete()
        self.db.query(User).delete()
        self.db.commit()
        self.db.close()

    def test_compliance_report_model_creation(self):
        report = ComplianceReport(
            id=uuid.uuid4(),
            organization_id=self.org.id,
            regulation_id=self.reg_doc.id,
            policy_document_id=self.policy_doc.id,
            overall_score=85.5,
            status=ComplianceReportStatus.COMPLETED,
            summary="High compliance across privacy requirements.",
            created_by=self.user.id,
        )
        self.db.add(report)
        self.db.commit()

        fetched = self.db.get(ComplianceReport, report.id)
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched.status, ComplianceReportStatus.COMPLETED)
        self.assertEqual(fetched.overall_score, 85.5)
        self.assertEqual(fetched.organization_id, self.org.id)

    def test_crud_operations(self):
        report_in = ComplianceReportCreate(
            organization_id=self.org.id,
            regulation_id=self.reg_doc.id,
            policy_document_id=self.policy_doc.id,
        )

        # Create
        report = crud.create_compliance_report(self.db, report_in, self.user.id)
        self.assertIsNotNone(report.id)
        self.assertEqual(report.status, ComplianceReportStatus.PENDING)

        # Get
        fetched = crud.get_compliance_report(self.db, report.id)
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched.id, report.id)

        # List by Org
        org_reports = crud.list_compliance_reports_by_org(self.db, self.org.id)
        self.assertEqual(len(org_reports), 1)

        # List by User
        user_reports = crud.list_compliance_reports_by_user(self.db, self.user.id)
        self.assertEqual(len(user_reports), 1)

        # Update
        update_in = ComplianceReportUpdate(
            overall_score=92.0,
            status=ComplianceReportStatus.COMPLETED,
            summary="Fully compliant",
        )
        updated = crud.update_compliance_report(self.db, report.id, update_in)
        self.assertIsNotNone(updated)
        self.assertEqual(updated.overall_score, 92.0)
        self.assertEqual(updated.status, ComplianceReportStatus.COMPLETED)

        # Delete
        success = crud.delete_compliance_report(self.db, report.id)
        self.assertTrue(success)
        self.assertIsNone(crud.get_compliance_report(self.db, report.id))

    def test_post_compliance_analyze_endpoint(self):
        app = FastAPI()
        app.include_router(compliance_router)

        def _override_get_db():
            yield self.db

        def _override_get_current_user():
            return self.user

        app.dependency_overrides[get_db] = _override_get_db
        app.dependency_overrides[get_current_user] = _override_get_current_user

        client = TestClient(app)

        # POST /compliance/analyze
        payload = {
            "organization_id": str(self.org.id),
            "regulation_id": str(self.reg_doc.id),
            "policy_document_id": str(self.policy_doc.id),
        }
        res = client.post("/compliance/analyze", json=payload)
        self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)
        data = res.json()
        self.assertIn("report_id", data)
        self.assertEqual(data["status"], "PROCESSING")
        report_id = data["report_id"]

        # GET /compliance/{report_id}
        res_get = client.get(f"/compliance/{report_id}")
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)
        report_data = res_get.json()
        self.assertEqual(report_data["id"], report_id)
        self.assertEqual(report_data["organization_id"], str(self.org.id))

    def test_organization_owner_restriction(self):
        app = FastAPI()
        app.include_router(compliance_router)

        def _override_get_db():
            yield self.db

        def _override_get_other_user():
            return self.other_user

        app.dependency_overrides[get_db] = _override_get_db
        app.dependency_overrides[get_current_user] = _override_get_other_user

        client = TestClient(app)

        # Non-owner attempting POST /compliance/analyze
        payload = {
            "organization_id": str(self.org.id),
            "regulation_id": str(self.reg_doc.id),
            "policy_document_id": str(self.policy_doc.id),
        }
        res = client.post("/compliance/analyze", json=payload)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_compliance_report_caching(self):
        app = FastAPI()
        app.include_router(compliance_router)

        def _override_get_db():
            yield self.db

        def _override_get_current_user():
            return self.user

        app.dependency_overrides[get_db] = _override_get_db
        app.dependency_overrides[get_current_user] = _override_get_current_user

        client = TestClient(app)

        payload = {
            "organization_id": str(self.org.id),
            "regulation_id": str(self.reg_doc.id),
            "policy_document_id": str(self.policy_doc.id),
        }

        # 1. First execution -> CACHE MISS (creates report)
        res1 = client.post("/compliance/analyze", json=payload)
        self.assertEqual(res1.status_code, status.HTTP_202_ACCEPTED)
        report_id_1 = res1.json()["report_id"]
        self.assertEqual(res1.json()["status"], "PROCESSING")

        # 2. Mark report 1 as COMPLETED
        report1 = self.db.get(ComplianceReport, uuid.UUID(report_id_1))
        report1.status = ComplianceReportStatus.COMPLETED
        report1.overall_score = 90.0
        self.db.commit()

        # 3. Second execution with identical document hashes -> CACHE HIT
        res2 = client.post("/compliance/analyze", json=payload)
        self.assertEqual(res2.status_code, status.HTTP_202_ACCEPTED)
        report_id_2 = res2.json()["report_id"]
        self.assertEqual(report_id_1, report_id_2)  # Reused cached report
        self.assertEqual(res2.json()["status"], "COMPLETED")

        # 4. Modify policy checksum -> CACHE MISS (creates new report)
        self.policy_doc.checksum = "new_modified_policy_checksum"
        self.db.commit()

        res3 = client.post("/compliance/analyze", json=payload)
        self.assertEqual(res3.status_code, status.HTTP_202_ACCEPTED)
        report_id_3 = res3.json()["report_id"]
        self.assertNotEqual(report_id_1, report_id_3)  # Brand new report created
        self.assertEqual(res3.json()["status"], "PROCESSING")

    def test_regulation_versioning(self):
        # 1. Create multiple versions of Code of Wages
        reg_v2019 = Regulation(
            id=uuid.uuid4(),
            title="Code of Wages (v2019)",
            act_name="Code of Wages",
            version="2019",
            jurisdiction="India",
            uploaded_by=self.user.id,
            original_filename="code_of_wages_2019.pdf",
            stored_filename="wages_2019.pdf",
            file_path="/tmp/wages_2019.pdf",
            file_size=1024,
            mime_type="application/pdf",
            document_hash="hash_wages_2019",
            processing_status=ProcessingStatus.PROCESSED,
        )
        reg_v2026 = Regulation(
            id=uuid.uuid4(),
            title="Code of Wages (v2026)",
            act_name="Code of Wages",
            version="2026",
            jurisdiction="India",
            uploaded_by=self.user.id,
            original_filename="code_of_wages_2026.pdf",
            stored_filename="wages_2026.pdf",
            file_path="/tmp/wages_2026.pdf",
            file_size=1024,
            mime_type="application/pdf",
            document_hash="hash_wages_2026",
            processing_status=ProcessingStatus.PROCESSED,
        )
        self.db.add_all([reg_v2019, reg_v2026])
        self.db.commit()

        # 2. Both regulation versions exist in DB without overwriting
        regs = self.db.query(Regulation).filter(Regulation.act_name == "Code of Wages").all()
        self.assertEqual(len(regs), 2)
        versions = {r.version for r in regs}
        self.assertEqual(versions, {"2019", "2026"})

        # 3. Create compliance report tied specifically to v2026
        report = ComplianceReport(
            id=uuid.uuid4(),
            organization_id=self.org.id,
            regulation_id=reg_v2026.id,
            policy_document_id=self.policy_doc.id,
            overall_score=88.0,
            status=ComplianceReportStatus.COMPLETED,
            created_by=self.user.id,
        )
        self.db.add(report)
        self.db.commit()

        fetched_report = self.db.get(ComplianceReport, report.id)
        self.assertEqual(fetched_report.regulation_id, reg_v2026.id)
        self.assertEqual(fetched_report.regulation.version, "2026")


if __name__ == "__main__":
    unittest.main()
