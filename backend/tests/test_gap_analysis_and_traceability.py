"""
Sprint 8.1: Gap Analysis & Traceability Unit and Integration Tests.
Verifies:
- GET /compliance/{report_id}/gap-analysis endpoint
- Traceability chain: Regulation -> Clause -> Policy Evidence -> Status -> Finding
- Status mappings (COMPLIANT->COVERED, PARTIALLY_COMPLIANT->PARTIALLY_COVERED, NON_COMPLIANT->GAP, Heuristic->UNABLE_TO_DETERMINE)
- Staleness detection (hash mismatch)
- Multi-tenancy / Org isolation and RBAC
- Audit log persistence for analysis events
"""
from __future__ import annotations

import json
import unittest
import unittest.mock
import uuid

from fastapi import FastAPI, status
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from app.compliance.models import (
    ComplianceReport,
    ComplianceReportStatus,
    ReportFinding,
)
from app.compliance.routes import router as compliance_router
from app.core.dependencies import get_current_user
from app.db.models import Document, DocumentType, Organization, ProcessingStatus, User, Regulation
from app.db.models.rbac import AuditLog
from app.db.session import Base, get_db
from app.services.compliance_engine import store_compliance_report


class GapAnalysisAndTraceabilityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
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

        # Seed Primary User
        self.user = User(
            id=uuid.uuid4(),
            email="analyst@acme.com",
            username="analyst",
            full_name="Compliance Analyst",
            hashed_password="hashedpassword123",
            is_active=True,
            is_superuser=False,
        )
        self.db.add(self.user)

        # Seed Organization
        self.org = Organization(
            id=uuid.uuid4(),
            name="Acme Corp",
            description="Acme Corp Org",
            created_by=self.user.id,
        )
        self.db.add(self.org)

        # Seed Other Org & User (for multi-tenant isolation testing)
        self.other_user = User(
            id=uuid.uuid4(),
            email="other@corp.com",
            username="otheruser",
            full_name="Other User",
            hashed_password="hashedpassword123",
            is_active=True,
            is_superuser=False,
        )
        self.db.add(self.other_user)

        self.other_org = Organization(
            id=uuid.uuid4(),
            name="Other Corp",
            description="Other Corp Org",
            created_by=self.other_user.id,
        )
        self.db.add(self.other_org)

        # Seed Regulation
        self.reg_doc = Regulation(
            id=uuid.uuid4(),
            uploaded_by=self.user.id,
            title="Digital Personal Data Protection Act",
            act_name="DPDP Act",
            act_year=2023,
            version="2023",
            jurisdiction="India",
            original_filename="dpdp_act_2023.pdf",
            stored_filename="dpdp_act_2023_stored.pdf",
            file_path="/tmp/dpdp_act_2023.pdf",
            file_size=10240,
            mime_type="application/pdf",
            document_hash="reg_hash_dpdp_v1",
            processing_status=ProcessingStatus.PROCESSED,
        )
        self.db.add(self.reg_doc)

        # Seed Policy Document
        self.policy_doc = Document(
            id=uuid.uuid4(),
            organization_id=self.org.id,
            uploaded_by=self.user.id,
            original_filename="privacy_policy_v1.pdf",
            stored_filename="privacy_policy_v1_stored.pdf",
            file_path="/tmp/privacy_policy_v1.pdf",
            file_size=5120,
            mime_type="application/pdf",
            checksum="policy_hash_v1",
            document_type=DocumentType.POLICY,
            processing_status=ProcessingStatus.PROCESSED,
        )
        self.db.add(self.policy_doc)

        self.db.commit()

        # Build test app
        self.app = FastAPI()
        self.app.include_router(compliance_router)

        def _override_get_db():
            yield self.db

        def _override_get_current_user():
            return self.user

        self.app.dependency_overrides[get_db] = _override_get_db
        self.app.dependency_overrides[get_current_user] = _override_get_current_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.db.query(AuditLog).delete()
        self.db.query(ReportFinding).delete()
        self.db.query(ComplianceReport).delete()
        self.db.query(Document).delete()
        self.db.query(Regulation).delete()
        self.db.query(Organization).delete()
        self.db.query(User).delete()
        self.db.commit()
        self.db.close()

    def _create_sample_report_with_findings(self):
        """Helper to create a completed report with evaluated clauses and findings."""
        report_id = uuid.uuid4()
        evaluated_clauses = [
            {
                "regulation_clause_id": "reg_clause_001",
                "regulation_text": "Data fiduciary shall give notice to data principal before processing personal data.",
                "status": "COMPLIANT",
                "similarity_score": 0.92,
                "reasoning": "Policy Section 3 explicitly mandates prior notice before data collection.",
                "recommendation": None,
                "matched_policy_clause_id": "pol_clause_001",
                "matched_policy_text": "All users are provided clear notice regarding data collection prior to processing.",
                "total_policy_matches": 1,
            },
            {
                "regulation_clause_id": "reg_clause_002",
                "regulation_text": "Data fiduciary shall implement reasonable security safeguards to prevent data breach.",
                "status": "PARTIALLY_COMPLIANT",
                "similarity_score": 0.65,
                "reasoning": "Policy mentions encryption but lacks formal incident response and audit schedules.",
                "recommendation": "Incorporate incident response protocol and annual third-party audits.",
                "matched_policy_clause_id": "pol_clause_002",
                "matched_policy_text": "Data is encrypted at rest using AES-256.",
                "total_policy_matches": 2,
            },
            {
                "regulation_clause_id": "reg_clause_003",
                "regulation_text": "Data fiduciary shall erase personal data upon withdrawal of consent.",
                "status": "NON_COMPLIANT",
                "similarity_score": 0.20,
                "reasoning": "No mention of data erasure or right to be forgotten in current policy.",
                "recommendation": "Establish standard data deletion workflow upon consent withdrawal.",
                "matched_policy_clause_id": None,
                "matched_policy_text": None,
                "total_policy_matches": 0,
            },
            {
                "regulation_clause_id": "reg_clause_004",
                "regulation_text": "Data fiduciary shall appoint a Data Protection Officer based in India.",
                "status": "NON_COMPLIANT",
                "similarity_score": 0.15,
                "reasoning": "[Heuristic fallback — LLM unavailable] Keyword matching yielded low similarity.",
                "recommendation": "Designate a resident DPO and publish contact details.",
                "matched_policy_clause_id": None,
                "matched_policy_text": None,
                "total_policy_matches": 0,
            },
        ]

        report = ComplianceReport(
            id=report_id,
            organization_id=self.org.id,
            regulation_id=self.reg_doc.id,
            policy_document_id=self.policy_doc.id,
            policy_hash=self.policy_doc.checksum,
            regulation_hash=self.reg_doc.document_hash,
            overall_score=52.5,
            total_clauses=4,
            compliant_clauses=1,
            partial_clauses=1,
            non_compliant_clauses=2,
            risk_level="HIGH",
            status=ComplianceReportStatus.COMPLETED,
            summary=json.dumps({"evaluated_clauses": evaluated_clauses, "summary": "Audit completed."}),
            report_json={"evaluated_clauses": evaluated_clauses},
            processing_time_seconds=3.5,
            created_by=self.user.id,
        )
        self.db.add(report)

        # Attach findings for partial and non-compliant clauses
        finding_partial = ReportFinding(
            id=uuid.uuid4(),
            report_id=report.id,
            regulation_clause_id="reg_clause_002",
            severity="MEDIUM",
            status="PARTIALLY_COMPLIANT",
            lifecycle_status="OPEN",
            reasoning="Incomplete security safeguards in policy.",
            recommendation="Incorporate incident response protocol and annual third-party audits.",
        )
        finding_gap = ReportFinding(
            id=uuid.uuid4(),
            report_id=report.id,
            regulation_clause_id="reg_clause_003",
            severity="HIGH",
            status="NON_COMPLIANT",
            lifecycle_status="OPEN",
            reasoning="Missing data erasure policy.",
            recommendation="Establish standard data deletion workflow upon consent withdrawal.",
        )
        self.db.add_all([finding_partial, finding_gap])
        self.db.commit()

        return report, finding_partial, finding_gap

    def test_get_gap_analysis_endpoint_success(self):
        """Test GET /compliance/{report_id}/gap-analysis returns structured traceability."""
        report, finding_partial, finding_gap = self._create_sample_report_with_findings()

        res = self.client.get(f"/compliance/{report.id}/gap-analysis")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        # Check top-level metadata
        self.assertEqual(data["report_id"], str(report.id))
        self.assertEqual(data["organization_id"], str(self.org.id))
        self.assertEqual(data["report_status"], "COMPLETED")
        self.assertEqual(data["overall_score"], 52.5)
        self.assertEqual(data["risk_level"], "HIGH")
        self.assertFalse(data["is_stale"])
        self.assertIsNone(data["stale_reason"])

        # Check regulation metadata
        self.assertIsNotNone(data["regulation"])
        self.assertEqual(data["regulation"]["title"], "Digital Personal Data Protection Act")
        self.assertEqual(data["regulation"]["act_year"], 2023)

        # Check policy metadata
        self.assertIsNotNone(data["policy"])
        self.assertEqual(data["policy"]["original_filename"], "privacy_policy_v1.pdf")

        # Check coverage summary counts
        summary = data["coverage_summary"]
        self.assertEqual(summary["total_requirements"], 4)
        self.assertEqual(summary["covered"], 1)
        self.assertEqual(summary["partially_covered"], 1)
        self.assertEqual(summary["gap"], 1)
        self.assertEqual(summary["unable_to_determine"], 1)  # Heuristic fallback clause

        self.assertEqual(summary["covered_pct"], 25.0)
        self.assertEqual(summary["partial_pct"], 25.0)
        self.assertEqual(summary["gap_pct"], 25.0)
        self.assertEqual(summary["unable_pct"], 25.0)

        # Check clauses
        clauses = data["clauses"]
        self.assertEqual(len(clauses), 4)

        # Clause 1: COMPLIANT -> COVERED
        c1 = clauses[0]
        self.assertEqual(c1["regulation_clause_id"], "reg_clause_001")
        self.assertEqual(c1["coverage_status"], "COVERED")
        self.assertEqual(c1["raw_engine_status"], "COMPLIANT")
        self.assertIsNotNone(c1["policy_evidence"])
        self.assertIsNone(c1["finding"])

        # Clause 2: PARTIALLY_COMPLIANT -> PARTIALLY_COVERED with Finding link
        c2 = clauses[1]
        self.assertEqual(c2["regulation_clause_id"], "reg_clause_002")
        self.assertEqual(c2["coverage_status"], "PARTIALLY_COVERED")
        self.assertEqual(c2["raw_engine_status"], "PARTIALLY_COMPLIANT")
        self.assertIsNotNone(c2["finding"])
        self.assertEqual(c2["finding"]["finding_id"], str(finding_partial.id))
        self.assertEqual(c2["finding"]["severity"], "MEDIUM")

        # Clause 3: NON_COMPLIANT -> GAP with Finding link
        c3 = clauses[2]
        self.assertEqual(c3["regulation_clause_id"], "reg_clause_003")
        self.assertEqual(c3["coverage_status"], "GAP")
        self.assertEqual(c3["raw_engine_status"], "NON_COMPLIANT")
        self.assertIsNotNone(c3["finding"])
        self.assertEqual(c3["finding"]["finding_id"], str(finding_gap.id))
        self.assertEqual(c3["finding"]["severity"], "HIGH")

        # Clause 4: Heuristic NON_COMPLIANT -> UNABLE_TO_DETERMINE
        c4 = clauses[3]
        self.assertEqual(c4["regulation_clause_id"], "reg_clause_004")
        self.assertEqual(c4["coverage_status"], "UNABLE_TO_DETERMINE")
        self.assertEqual(c4["raw_engine_status"], "NON_COMPLIANT")

    def test_gap_analysis_staleness_detection(self):
        """Test stale indicator is set when policy document checksum changes."""
        report, _, _ = self._create_sample_report_with_findings()

        # Update policy checksum to simulate a document edit
        self.policy_doc.checksum = "new_modified_policy_checksum_v2"
        self.db.commit()

        res = self.client.get(f"/compliance/{report.id}/gap-analysis")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        self.assertTrue(data["is_stale"])
        self.assertIn("Policy document has been updated", data["stale_reason"])

    def test_multi_tenancy_organization_isolation(self):
        """Test that a user from a different organization cannot access the gap analysis."""
        report, _, _ = self._create_sample_report_with_findings()

        # Override user to the other user (belongs to different org)
        self.app.dependency_overrides[get_current_user] = lambda: self.other_user

        res = self.client.get(f"/compliance/{report.id}/gap-analysis")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("do not have access", res.json()["detail"])

    def test_nonexistent_report_returns_404(self):
        """Test that requesting gap analysis for non-existent report returns 404."""
        random_id = uuid.uuid4()
        res = self.client.get(f"/compliance/{random_id}/gap-analysis")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_audit_log_recorded_on_analysis_start(self):
        """Test that COMPLIANCE_ANALYSIS_STARTED is written to the AuditLog."""
        payload = {
            "organization_id": str(self.org.id),
            "regulation_id": str(self.reg_doc.id),
            "policy_document_id": str(self.policy_doc.id),
        }
        with unittest.mock.patch("app.compliance.service.execute_compliance_job"):
            res = self.client.post("/compliance/analyze", json=payload)
            self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)

        # Check AuditLog table
        audit_entry = (
            self.db.query(AuditLog)
            .filter(AuditLog.action == "COMPLIANCE_ANALYSIS_STARTED")
            .first()
        )
        self.assertIsNotNone(audit_entry)
        self.assertEqual(audit_entry.organization_id, self.org.id)
        self.assertEqual(audit_entry.user_id, self.user.id)
        self.assertEqual(audit_entry.entity, "ComplianceJob")


if __name__ == "__main__":
    unittest.main()
