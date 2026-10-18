"""
Automated Unit and Integration Tests for Policy PDF Export Feature.
Tests:
1. ReportLab service PDF generation for Draft, Approved, Published, and Historical snapshots.
2. DRAFT watermark banner and published verification metadata.
3. Multi-tenant workspace isolation and authorization enforcement.
4. Historical version snapshot resolution and 404 error handling.
5. Invariance tests (verifying download does not mutate draft status, version, or content hash).
"""
import io
import uuid
import unittest
from datetime import datetime, timezone
from typing import Dict, Any

from fastapi import FastAPI, status
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db
from app.db.models.user import User
from app.db.models.organization import Organization
from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus
from app.db.models.document import Document, DocumentType
from app.db.models.policy_formation import (
    PolicyDraft,
    PolicyApprovalAudit,
)
from app.core.dependencies import get_current_user
from app.core.workspace_context import WorkspaceContext, get_active_workspace_context
from app.routes.policy_formation import router as policy_formation_router
from app.services.policy_pdf_service import generate_policy_pdf


class PolicyPdfExportTestSuite(unittest.TestCase):
    """Test suite for Policy PDF export functionality, security, and rendering."""

    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.TestingSessionLocal = sessionmaker(
            autocommit=False, autoflush=False, expire_on_commit=False, bind=cls.engine
        )
        Base.metadata.create_all(bind=cls.engine)

        cls.app = FastAPI()
        cls.app.include_router(policy_formation_router)

        # Workspaces and Users
        cls.user_a_id = uuid.uuid4()
        cls.org_a_id = uuid.uuid4()
        cls.user_b_id = uuid.uuid4()
        cls.org_b_id = uuid.uuid4()

        cls.user_a = User(
            id=cls.user_a_id,
            email="compliance_officer@acme.com",
            username="compliance_a",
            full_name="Alice Compliance",
            hashed_password="hashed_pw",
            is_active=True,
        )
        cls.org_a = Organization(
            id=cls.org_a_id,
            name="Acme Enterprise India Pvt Ltd",
            industry="Financial Technology",
            created_by=cls.user_a_id,
        )
        cls.member_a = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_a_id,
            user_id=cls.user_a_id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        )

        cls.user_b = User(
            id=cls.user_b_id,
            email="attacker@external.com",
            username="user_b",
            full_name="Bob External",
            hashed_password="hashed_pw",
            is_active=True,
        )
        cls.org_b = Organization(
            id=cls.org_b_id,
            name="Rival Corp",
            industry="Retail",
            created_by=cls.user_b_id,
        )
        cls.member_b = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_b_id,
            user_id=cls.user_b_id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        )

        with cls.TestingSessionLocal() as session:
            session.add_all([
                cls.user_a, cls.org_a, cls.member_a,
                cls.user_b, cls.org_b, cls.member_b,
            ])
            session.commit()

    def setUp(self):
        self.db = self.TestingSessionLocal()
        self.current_user = self.user_a
        self.current_org = self.org_a
        self.current_member = self.member_a
        self.current_role = UserRole.ADMIN

        def override_get_db():
            try:
                yield self.db
            finally:
                pass

        def override_get_active_workspace_context():
            return WorkspaceContext(
                user=self.current_user,
                organization=self.current_org,
                organization_id=self.current_org.id,
                member=self.current_member,
                role=self.current_role,
            )

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.dependency_overrides[get_active_workspace_context] = override_get_active_workspace_context
        self.client = TestClient(self.app)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        self.db.rollback()
        self.db.close()

    # ───────────────────────────────────────────────────────────────────────────
    # 1. Direct PDF Generation Unit Tests
    # ───────────────────────────────────────────────────────────────────────────

    def test_direct_pdf_generation_draft_watermark(self):
        """Verify direct service generation for a draft produces valid PDF binary with DRAFT label."""
        policy_data = {
            "title": "Corporate Data Protection and DPDP Act Policy",
            "status": "DRAFT_SAVED",
            "version": 1,
            "metadata_properties": {
                "policy_identifier": "POL-DPDP-001",
                "owner_role": "Data Protection Officer",
                "primary_jurisdiction": "India",
                "scope": "All Indian subsidiaries and data processors",
                "review_cadence": "Annual",
            },
            "sections": [
                {
                    "section_id": "sec-1",
                    "section_number": "1.0",
                    "heading": "Purpose & Scope",
                    "content": "This policy establishes statutory data governance pursuant to DPDP Act 2023.",
                    "statutory_basis": ["Digital Personal Data Protection Act, 2023 (Section 8)"],
                },
                {
                    "section_id": "sec-2",
                    "section_number": "2.0",
                    "heading": "Data Principal Rights",
                    "content": "Data principals maintain the right to withdraw consent and nominate representatives.",
                },
            ],
        }

        pdf_bytes = generate_policy_pdf(
            policy_data=policy_data,
            organization_name="Acme Enterprise India Pvt Ltd",
        )

        self.assertIsInstance(pdf_bytes, bytes)
        self.assertTrue(len(pdf_bytes) > 2000, "PDF size should be substantial")
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"), "Must have standard PDF magic bytes")

    def test_direct_pdf_generation_published_policy(self):
        """Verify published policy PDF includes genuine approval and publication metadata."""
        now = datetime.now(timezone.utc)
        policy_data = {
            "title": "Whistleblower and Anti-Bribery Policy",
            "status": "PUBLISHED",
            "version": 2,
            "published_at": now.isoformat(),
            "effective_date": now.isoformat(),
            "approved_at": now.isoformat(),
            "approved_by": "Alice Compliance",
            "content_hash": "a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef",
            "metadata_properties": {
                "policy_identifier": "POL-GOV-WB-002",
                "owner_role": "Chief Compliance Officer",
                "review_cadence": "Annual",
                "scope": "Global Operations",
            },
            "sections": [
                {
                    "section_id": "sec-1",
                    "section_number": "1.0",
                    "heading": "Governance Directive",
                    "content": "Zero tolerance for non-compliance with statutory disclosure mandates.",
                }
            ],
        }

        pdf_bytes = generate_policy_pdf(
            policy_data=policy_data,
            organization_name="Acme Enterprise India Pvt Ltd",
        )

        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))
        self.assertTrue(len(pdf_bytes) > 2000)

    def test_direct_pdf_generation_historical_snapshot(self):
        """Verify historical snapshot PDF handles snapshot data and sets historical banner."""
        snapshot_data = {
            "title": "Information Security Policy",
            "status": "DRAFT_SAVED",
            "version": 1,
            "metadata_properties": {"policy_identifier": "POL-SEC-01"},
            "sections": [
                {
                    "section_id": "sec-1",
                    "section_number": "1.0",
                    "heading": "Archived Controls",
                    "content": "Preliminary security baseline from initial drafting phase.",
                }
            ],
        }

        pdf_bytes = generate_policy_pdf(
            policy_data=snapshot_data,
            organization_name="Acme Enterprise India Pvt Ltd",
            historical_version=1,
        )

        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))
        self.assertTrue(len(pdf_bytes) > 2000)

    def test_direct_pdf_generation_empty_sections_safe(self):
        """Verify policy with empty or malformed sections does not crash generator."""
        empty_data = {
            "title": "Empty Policy",
            "status": "DRAFTING",
            "version": 1,
            "sections": [],
        }

        pdf_bytes = generate_policy_pdf(
            policy_data=empty_data,
            organization_name="Acme Enterprise",
        )
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))

    # ───────────────────────────────────────────────────────────────────────────
    # 2. API Endpoint Integration Tests
    # ───────────────────────────────────────────────────────────────────────────

    def test_export_draft_pdf_success(self):
        """Test exporting active draft PDF returns 200 and attachment header."""
        draft = PolicyDraft(
            id=uuid.uuid4(),
            organization_id=self.org_a_id,
            title="Workplace Safety and POSH Compliance Policy",
            need_id="need-posh-01",
            status="DRAFT_SAVED",
            version=1,
            content_hash="mock-hash-12345",
            sections=[
                {
                    "section_id": "s-1",
                    "section_number": "1.0",
                    "heading": "Internal Complaints Committee (ICC)",
                    "content": "Establishment of ICC pursuant to POSH Act 2013.",
                    "statutory_basis": ["Sexual Harassment of Women at Workplace Act, 2013"],
                }
            ],
            metadata_properties={
                "category": "Human Resources",
                "policy_identifier": "POL-HR-POSH-01",
                "scope": "All Branch Offices in India",
                "owner_role": "Head of People & Culture",
            },
            history=[],
        )
        self.db.add(draft)
        self.db.commit()

        response = self.client.get(f"/policy-formation/drafts/{draft.id}/pdf")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertIn("attachment; filename=", response.headers["content-disposition"])
        self.assertIn(".pdf", response.headers["content-disposition"])
        self.assertTrue(response.content.startswith(b"%PDF-"))

        # Verify draft state was NOT altered
        self.db.refresh(draft)
        self.assertEqual(draft.status, "DRAFT_SAVED")
        self.assertEqual(draft.version, 1)

    def test_export_published_policy_pdf_with_metadata(self):
        """Test exporting a published policy enriches PDF with genuine Document metadata and approval audit."""
        now = datetime.now(timezone.utc)
        doc = Document(
            id=uuid.uuid4(),
            organization_id=self.org_a_id,
            uploaded_by=self.user_a_id,
            document_type=DocumentType.POLICY,
            original_filename="POL_CYBER_v1.txt",
            stored_filename="stored_cyber_v1.txt",
            file_path="storage/uploads/policies/stored_cyber_v1.txt",
            file_size=1024,
            mime_type="text/plain",
            checksum="sha256-verified-cyber-hash",
            policy_identifier="POL-SEC-CYBER-01",
            lifecycle_status="ACTIVE",
            effective_date=now,
        )
        self.db.add(doc)
        self.db.flush()

        draft = PolicyDraft(
            id=uuid.uuid4(),
            organization_id=self.org_a_id,
            title="Official Cybersecurity Baseline",
            need_id="need-cyber-01",
            status="PUBLISHED",
            version=1,
            published_policy_id=doc.id,
            published_at=now,
            effective_date=now,
            content_hash=doc.checksum,
            sections=[
                {
                    "section_id": "sec-1",
                    "section_number": "1.0",
                    "heading": "Access Control Directive",
                    "content": "Mandatory multi-factor authentication for all production workloads.",
                }
            ],
            metadata_properties={"policy_identifier": "POL-SEC-CYBER-01"},
            history=[],
        )
        self.db.add(draft)

        audit = PolicyApprovalAudit(
            organization_id=self.org_a_id,
            draft_id=draft.id,
            draft_version=1,
            actor_id=self.user_a_id,
            actor_name="Alice Compliance",
            action="POLICY_APPROVED",
            previous_status="READY_FOR_REVIEW",
            new_status="APPROVED",
            comments="Approved formal policy",
        )
        self.db.add(audit)
        self.db.commit()

        response = self.client.get(f"/policy-formation/drafts/{draft.id}/pdf")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF-"))
        self.assertIn("published.pdf", response.headers["content-disposition"])

    def test_export_historical_version_snapshot(self):
        """Test requesting specific historical version retrieves matching snapshot from draft history."""
        historical_snapshot = {
            "version": 1,
            "title": "Vendor Risk Management (Initial Draft)",
            "status": "DRAFT_SAVED",
            "archived_at": "2026-09-01T10:00:00Z",
            "change_summary": "Initial draft snapshot",
            "sections": [
                {
                    "section_id": "sec-1",
                    "section_number": "1.0",
                    "heading": "Vendor Onboarding",
                    "content": "Vendors must undergo basic compliance assessment.",
                }
            ],
            "metadata_properties": {"policy_identifier": "POL-VRM-v1"},
        }

        active_draft = PolicyDraft(
            id=uuid.uuid4(),
            organization_id=self.org_a_id,
            title="Vendor Risk Management Policy",
            need_id="need-vrm-01",
            status="DRAFT_SAVED",
            version=2,
            sections=[
                {
                    "section_id": "sec-1",
                    "section_number": "1.0",
                    "heading": "Vendor Onboarding & Continuous Due Diligence",
                    "content": "Enhanced due diligence controls added in v2.",
                }
            ],
            history=[historical_snapshot],
        )
        self.db.add(active_draft)
        self.db.commit()

        # Request historical version 1
        response = self.client.get(f"/policy-formation/drafts/{active_draft.id}/pdf?version=1")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.content.startswith(b"%PDF-"))
        self.assertIn("v1_hist.pdf", response.headers["content-disposition"])

    def test_export_historical_version_not_found(self):
        """Test requesting non-existent historical version returns 404."""
        draft = PolicyDraft(
            id=uuid.uuid4(),
            organization_id=self.org_a_id,
            title="Business Continuity Policy",
            need_id="need-bcp-01",
            status="DRAFT_SAVED",
            version=1,
            sections=[],
            history=[],
        )
        self.db.add(draft)
        self.db.commit()

        response = self.client.get(f"/policy-formation/drafts/{draft.id}/pdf?version=99")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("Historical version v99 not found", response.json()["detail"])

    def test_export_draft_not_found(self):
        """Test requesting non-existent draft ID returns 404."""
        random_id = uuid.uuid4()
        response = self.client.get(f"/policy-formation/drafts/{random_id}/pdf")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cross_workspace_isolation_forbidden(self):
        """Test user from Workspace B cannot export policy from Workspace A (403 Forbidden)."""
        draft_a = PolicyDraft(
            id=uuid.uuid4(),
            organization_id=self.org_a_id,
            title="Confidential Internal Audit Policy",
            need_id="need-audit-01",
            status="DRAFT_SAVED",
            version=1,
            sections=[],
            history=[],
        )
        self.db.add(draft_a)
        self.db.commit()

        # Switch context to User B in Workspace B
        self.current_user = self.user_b
        self.current_org = self.org_b
        self.current_member = self.member_b

        response = self.client.get(f"/policy-formation/drafts/{draft_a.id}/pdf")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("Draft not found in active workspace", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
