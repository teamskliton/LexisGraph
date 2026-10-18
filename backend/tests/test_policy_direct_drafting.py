"""
Test Suite for Direct Individual Policy Creation ("Create a Specific Policy").

Verifies:
1. Direct draft creation without an Organization Assessment or Policy Needs Analysis.
2. Preset category selection and statutory reference grounding.
3. Scope handling: Entire Organization, Branch (with branch_name validation), Department (with department_name validation).
4. Validation constraints on title, purpose, and scope.
5. Idempotent resumption on duplicate draft requests.
6. Workspace isolation: Drafts are strictly tenant-isolated.
7. Resilience against LLM failures with transparent deterministic template fallback.
8. Complete Stage 5 lifecycle compatibility: Review, approval, SHA-256 integrity, and publishing.
"""
import uuid
import unittest
from unittest.mock import patch
from datetime import datetime, timezone

from fastapi import FastAPI, status
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db
from app.db.models.user import User
from app.db.models.organization import Organization
from app.db.models.rbac import UserRole, OrganizationMember, MemberStatus
from app.db.models.document import Document, DocumentType, ProcessingStatus
from app.db.models.policy_formation import (
    OrganizationAssessment,
    PolicyNeedsAnalysis,
    PolicyDraft,
    PolicyApprovalAudit,
)
from app.core.workspace_context import WorkspaceContext, get_active_workspace_context
from app.routes.policy_formation import router as policy_formation_router


class PolicyDirectDraftingTestSuite(unittest.TestCase):
    """Test suite for Create a Specific Policy workflow."""

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

        cls.org_a_id = uuid.uuid4()
        cls.user_a_creator_id = uuid.uuid4()
        cls.user_a_reviewer_id = uuid.uuid4()

        cls.org_b_id = uuid.uuid4()
        cls.user_b_id = uuid.uuid4()

        # Seed Users & Orgs once in setUpClass
        cls.user_a_creator = User(
            id=cls.user_a_creator_id,
            email="creator@lexiscorp.com",
            username="creator_a",
            full_name="Alice Creator",
            hashed_password="pw",
            is_active=True,
        )
        cls.org_a = Organization(
            id=cls.org_a_id,
            name="LexisCorp Global",
            created_by=cls.user_a_creator_id,
        )
        cls.user_a_reviewer = User(
            id=cls.user_a_reviewer_id,
            email="reviewer@lexiscorp.com",
            username="reviewer_a",
            full_name="Bob Reviewer",
            hashed_password="pw",
            is_active=True,
        )
        cls.member_creator = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_a_id,
            user_id=cls.user_a_creator_id,
            role=UserRole.COMPLIANCE_ANALYST,
            status=MemberStatus.ACTIVE,
        )
        cls.member_reviewer = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_a_id,
            user_id=cls.user_a_reviewer_id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        )

        cls.user_b = User(
            id=cls.user_b_id,
            email="userb@othercorp.com",
            username="user_b",
            full_name="Charlie Tenant",
            hashed_password="pw",
            is_active=True,
        )
        cls.org_b = Organization(
            id=cls.org_b_id,
            name="OtherCorp Ltd",
            created_by=cls.user_b_id,
        )
        cls.member_b = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_b_id,
            user_id=cls.user_b_id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        )

        init_db = cls.TestingSessionLocal()
        init_db.add_all([
            cls.user_a_creator,
            cls.org_a,
            cls.user_a_reviewer,
            cls.member_creator,
            cls.member_reviewer,
            cls.user_b,
            cls.org_b,
            cls.member_b,
        ])
        init_db.commit()
        init_db.close()

    def setUp(self):
        self.db = self.TestingSessionLocal()
        self.org_a = self.db.get(Organization, self.org_a_id)
        self.user_a_creator = self.db.get(User, self.user_a_creator_id)
        self.user_a_reviewer = self.db.get(User, self.user_a_reviewer_id)
        self.org_b = self.db.get(Organization, self.org_b_id)
        self.user_b = self.db.get(User, self.user_b_id)

        # Workspace Contexts
        self.ws_context_creator = WorkspaceContext(
            user=self.user_a_creator,
            organization=self.org_a,
            organization_id=self.org_a_id,
            member=self.member_creator,
            role=UserRole.COMPLIANCE_ANALYST,
        )
        self.ws_context_reviewer = WorkspaceContext(
            user=self.user_a_reviewer,
            organization=self.org_a,
            organization_id=self.org_a_id,
            member=self.member_reviewer,
            role=UserRole.ADMIN,
        )
        self.ws_context_tenant_b = WorkspaceContext(
            user=self.user_b,
            organization=self.org_b,
            organization_id=self.org_b_id,
            member=self.member_b,
            role=UserRole.ADMIN,
        )

        def override_get_db():
            try:
                yield self.db
            finally:
                pass

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.dependency_overrides[get_active_workspace_context] = lambda: self.ws_context_creator
        self.client = TestClient(self.app)

        self.reasoning_patcher = patch(
            "app.services.policy_formation_service._resolve_reasoning",
            return_value="1. Mandatory security measures must be implemented.\n2. Cryptographic controls applied.\n3. Auditing enabled.\n4. Access restricted.\n5. Continuous monitoring.",
        )
        self.reasoning_patcher.start()

    def tearDown(self):
        self.reasoning_patcher.stop()
        self.db.rollback()
        self.db.query(PolicyApprovalAudit).delete()
        self.db.query(Document).delete()
        self.db.query(PolicyDraft).delete()
        self.db.commit()
        self.db.close()
        self.app.dependency_overrides.clear()

    def test_create_direct_draft_organization_scope(self):
        """Verify creating a direct policy draft with organization-wide scope."""
        payload = {
            "title": "Corporate Data Privacy and Protection Policy",
            "category": "Data Protection & Privacy",
            "purpose": "Establish mandatory standards for collecting, processing, and storing personal data.",
            "scope_type": "ORGANIZATION",
            "primary_jurisdiction": "India",
            "owner_role": "Data Protection Officer",
            "review_cadence": "Annual",
            "specific_context": "Covers both customer personal data and employee HR records.",
        }

        response = self.client.post("/policy-formation/drafts/direct", json=payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.text)

        data = response.json()
        self.assertIsNotNone(data["id"])
        self.assertIsNone(data["assessment_id"])
        self.assertIsNone(data["analysis_id"])
        self.assertTrue(data["need_id"].startswith("direct-"))
        self.assertEqual(data["title"], "Corporate Data Privacy and Protection Policy")
        self.assertEqual(data["status"], "DRAFT_SAVED")
        self.assertEqual(data["version"], 1)

        # Check metadata
        meta = data["metadata_properties"]
        self.assertEqual(meta["origin_type"], "DIRECT_CREATION")
        self.assertEqual(meta["scope_type"], "ORGANIZATION")
        self.assertIn("LexisCorp Global", meta["scope"])
        self.assertEqual(meta["owner_role"], "Data Protection Officer")

        # Check 12 standard sections
        sections = data["sections"]
        self.assertEqual(len(sections), 12)
        sec_ids = [s["section_id"] for s in sections]
        self.assertIn("sec-metadata", sec_ids)
        self.assertIn("sec-purpose", sec_ids)
        self.assertIn("sec-scope", sec_ids)
        self.assertIn("sec-core-requirements", sec_ids)
        self.assertIn("sec-statutory", sec_ids)
        self.assertIn("sec-limitations", sec_ids)

        # Verify statutory references include DPDP Act
        source_refs = data["source_references"]
        act_names = [s["act_name"] for s in source_refs]
        self.assertTrue(any("DPDP" in a or "Data Protection" in a for a in act_names))

    def test_create_direct_draft_branch_scope(self):
        """Verify creating a direct draft with Branch scope requires and persists branch_name."""
        payload = {
            "title": "Branch Physical & Cyber Security Standard",
            "category": "Information Security & Cyber",
            "purpose": "Mandate access control and server room entry controls for regional offices.",
            "scope_type": "BRANCH",
            "branch_name": "Bangalore Development Center",
            "primary_jurisdiction": "India",
            "owner_role": "Chief Information Security Officer",
            "review_cadence": "Annual",
        }

        response = self.client.post("/policy-formation/drafts/direct", json=payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.text)

        data = response.json()
        meta = data["metadata_properties"]
        self.assertEqual(meta["scope_type"], "BRANCH")
        self.assertEqual(meta["branch_name"], "Bangalore Development Center")
        self.assertIn("BRANCH: Bangalore Development Center", meta["scope"])

        # Check Section 3 markdown includes branch name
        sec_scope = next(s for s in data["sections"] if s["section_id"] == "sec-scope")
        self.assertIn("Bangalore Development Center", sec_scope["content"])

    def test_create_direct_draft_department_scope(self):
        """Verify creating a direct draft with Department scope requires and persists department_name."""
        payload = {
            "title": "Human Resources Workplace Conduct & Anti-Harassment Policy",
            "category": "HR & Workplace Governance",
            "purpose": "Define acceptable workplace conduct and zero-tolerance harassment provisions.",
            "scope_type": "DEPARTMENT",
            "department_name": "Human Resources & Talent Acquisition",
            "primary_jurisdiction": "India",
            "owner_role": "Head of People Operations",
            "review_cadence": "Annual",
        }

        response = self.client.post("/policy-formation/drafts/direct", json=payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.text)

        data = response.json()
        meta = data["metadata_properties"]
        self.assertEqual(meta["scope_type"], "DEPARTMENT")
        self.assertEqual(meta["department_name"], "Human Resources & Talent Acquisition")
        self.assertIn("DEPARTMENT: Human Resources & Talent Acquisition", meta["scope"])

    def test_create_direct_draft_scope_validation_failures(self):
        """Ensure missing branch or department names raise 400 Bad Request."""
        # 1. Branch missing branch_name
        res1 = self.client.post(
            "/policy-formation/drafts/direct",
            json={
                "title": "Regional Security Policy",
                "category": "Information Security",
                "purpose": "Regional security standards.",
                "scope_type": "BRANCH",
                "branch_name": "   ",  # Blank
            },
        )
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Branch", res1.json()["detail"])

        # 2. Department missing department_name
        res2 = self.client.post(
            "/policy-formation/drafts/direct",
            json={
                "title": "Department Finance Policy",
                "category": "Corporate Governance",
                "purpose": "Department financial guidelines.",
                "scope_type": "DEPARTMENT",
                "department_name": None,
            },
        )
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Department", res2.json()["detail"])

    def test_create_direct_draft_input_length_validation(self):
        """Ensure short title or purpose fail Pydantic schema validation."""
        # Short title
        res = self.client.post(
            "/policy-formation/drafts/direct",
            json={"title": "AB", "category": "HR", "purpose": "Valid length purpose string", "scope_type": "ORGANIZATION"},
        )
        self.assertEqual(res.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)

        # Short purpose
        res2 = self.client.post(
            "/policy-formation/drafts/direct",
            json={"title": "Valid Policy Title", "category": "HR", "purpose": "No", "scope_type": "ORGANIZATION"},
        )
        self.assertEqual(res2.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)

    def test_create_direct_draft_duplicate_idempotency(self):
        """Repeated submissions with the same title return the existing draft without duplication."""
        payload = {
            "title": "Unique Whistleblower Protection Policy",
            "category": "Corporate Governance",
            "purpose": "Provide safe and confidential reporting channels for misconduct.",
            "scope_type": "ORGANIZATION",
        }

        # First creation
        res1 = self.client.post("/policy-formation/drafts/direct", json=payload)
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        draft1_id = res1.json()["id"]

        # Duplicate submission
        res2 = self.client.post("/policy-formation/drafts/direct", json=payload)
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        draft2_id = res2.json()["id"]

        self.assertEqual(draft1_id, draft2_id)

        # Confirm only 1 record in database
        total_drafts = self.db.query(PolicyDraft).filter(
            PolicyDraft.organization_id == self.org_a_id,
            PolicyDraft.title == "Unique Whistleblower Protection Policy",
        ).count()
        self.assertEqual(total_drafts, 1)

    def test_direct_draft_workspace_isolation(self):
        """Draft created in Workspace A cannot be accessed or updated by Workspace B."""
        # Create draft in Org A
        res = self.client.post(
            "/policy-formation/drafts/direct",
            json={
                "title": "Confidential Intellectual Property Standard",
                "category": "Corporate Governance",
                "purpose": "Protect proprietary inventions, code, and trade secrets.",
                "scope_type": "ORGANIZATION",
            },
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        draft_id = res.json()["id"]

        # Switch context to Tenant B
        self.app.dependency_overrides[get_active_workspace_context] = lambda: self.ws_context_tenant_b
        res_tenant_b = self.client.get(f"/policy-formation/drafts/{draft_id}")
        self.assertEqual(res_tenant_b.status_code, status.HTTP_404_NOT_FOUND)

    def test_direct_draft_llm_failure_transparent_fallback(self):
        """When LLM provider fails, direct draft generation falls back transparently without failing."""
        with patch("app.services.policy_formation_service._resolve_reasoning", side_effect=Exception("OpenRouter API Timeout")):
            res = self.client.post(
                "/policy-formation/drafts/direct",
                json={
                    "title": "AI Cloud Storage Policy",
                    "category": "Vendor & Third-Party Risk",
                    "purpose": "Governance rules for cloud storage suppliers.",
                    "scope_type": "ORGANIZATION",
                },
            )
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            data = res.json()
            telemetry = data["generation_metadata"]
            self.assertTrue(telemetry["is_template_fallback"])
            self.assertIn("AI provider error", telemetry["fallback_reason"])

    @patch("app.services.policy_formation_service.process_document")
    @patch("app.services.policy_formation_service.store_published_policy_content")
    def test_direct_draft_full_stage5_lifecycle(self, mock_store, mock_proc):
        """Verify direct draft smoothly flows through Review -> Approval -> Publishing to Document table."""
        from app.services.storage import StoredFileMetadata
        mock_store.return_value = StoredFileMetadata(
            original_filename="POL-DIR-TEST.txt",
            stored_filename="stored_direct.txt",
            path="storage/uploads/policies/stored_direct.txt",
            checksum="hash12345",
            size=1024,
            mime_type="text/plain",
        )

        # 1. Create Direct Draft
        res = self.client.post(
            "/policy-formation/drafts/direct",
            json={
                "title": "Third-Party Vendor Risk Assessment Policy",
                "category": "Vendor & Third-Party Risk",
                "purpose": "Establish mandatory security reviews and audits for external SaaS vendors.",
                "scope_type": "ORGANIZATION",
                "owner_role": "Compliance Director",
                "review_cadence": "Annual",
            },
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        draft_id = res.json()["id"]
        version = res.json()["version"]

        # 2. Submit for Review (as Creator)
        sub_res = self.client.post(
            f"/policy-formation/drafts/{draft_id}/submit-review",
            json={
                "expected_version": version,
                "notes": "Direct draft ready for compliance executive sign-off.",
                "assigned_reviewer_id": str(self.user_a_reviewer_id),
            },
        )
        self.assertEqual(sub_res.status_code, status.HTTP_200_OK, sub_res.text)
        self.assertEqual(sub_res.json()["status"], "READY_FOR_REVIEW")

        # 3. Approve Draft (as Reviewer)
        self.app.dependency_overrides[get_active_workspace_context] = lambda: self.ws_context_reviewer
        appr_res = self.client.post(
            f"/policy-formation/drafts/{draft_id}/approve",
            json={
                "expected_version": version,
                "comments": "Approved. Statutory and operational controls meet standards.",
            },
        )
        self.assertEqual(appr_res.status_code, status.HTTP_200_OK, appr_res.text)
        appr_data = appr_res.json()
        self.assertEqual(appr_data["status"], "APPROVED")
        self.assertIsNotNone(appr_data["content_hash"])

        # 4. Publish Draft (as Admin / Reviewer)
        pub_res = self.client.post(
            f"/policy-formation/drafts/{draft_id}/publish",
            json={
                "expected_version": version,
            },
        )
        self.assertEqual(pub_res.status_code, status.HTTP_200_OK, pub_res.text)
        pub_data = pub_res.json()
        self.assertEqual(pub_data["status"], "PUBLISHED")
        self.assertIsNotNone(pub_data["published_policy_id"])

        # Verify published Document exists in repository
        published_doc_id = uuid.UUID(pub_data["published_policy_id"])
        doc = self.db.query(Document).filter(Document.id == published_doc_id).first()
        self.assertIsNotNone(doc)
        self.assertEqual(doc.document_type, DocumentType.POLICY)
        self.assertEqual(doc.source_draft_id, uuid.UUID(draft_id))
        self.assertEqual(doc.organization_id, self.org_a_id)
        self.assertEqual(doc.lifecycle_status, "ACTIVE")


if __name__ == "__main__":
    unittest.main()
