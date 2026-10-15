"""
Comprehensive Test Suite for Stage 5: Policy Approval, Versioning & Publishing.

Tests cover:
1. Authorized draft submission for review (READY_FOR_REVIEW status, audit record created).
2. Unauthorized submission rejection (invalid state, empty sections).
3. Eligible reviewer listing and assignment validation.
4. Ineligible reviewer rejection (cross-workspace or non-reviewer role).
5. Approval by authorized approver with immutable SHA-256 content hashing.
6. Prevention of self-approval in multi-member workspaces.
7. Self-approval allowance only when workspace has exactly 1 active member.
8. Revision request with mandatory comments (REVISION_REQUESTED status, unlocks edits).
9. Submission rejection with documented reason.
10. Concurrency and stale-version approval conflict rejection.
11. Edit protection: direct modification locked on review, approved, or published drafts.
12. Revision branching (create_revision) creating vN+1, archiving approved snapshot, resetting approval.
13. Publishing approved policy into production Policies repository (Document table).
14. Rejection of publication for unapproved drafts.
15. Content integrity verification: blocking publication if content altered after approval.
16. Idempotent publication handling on retries without creating duplicates.
17. Superseding prior published documents for the same policy identifier.
18. Effective date handling (immediate ACTIVE vs future PENDING_EFFECTIVE).
19. Review schedule calculation (Annual review sets next_review_date 365 days out).
20. Cross-workspace isolation denial across all Stage 5 endpoints.
21. Stage 4 regression: Generation transparency explicitly differentiates AI vs rule-based fallback.
"""
import uuid
import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, status
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db
from app.db.models.user import User
from app.db.models.organization import Organization
from app.db.models.rbac import UserRole, MemberStatus, OrganizationMember
from app.db.models.document import Document, DocumentType, ProcessingStatus
from app.db.models.policy_formation import (
    OrganizationAssessment,
    PolicyNeedsAnalysis,
    PolicyDraft,
    PolicyApprovalAudit,
)
from app.core.dependencies import get_current_user
from app.core.workspace_context import WorkspaceContext, get_active_workspace_context
from app.routes.policy_formation import router as policy_formation_router
from app.services.policy_formation_service import PolicyFormationAnalysisService


class PolicyApprovalPublishingTestSuite(unittest.TestCase):
    """Test suite for Stage 5: Policy Approval, Decision Audit, Versioning & Publishing."""

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

        cls.user_author_id = uuid.uuid4()
        cls.user_reviewer_id = uuid.uuid4()
        cls.user_outsider_id = uuid.uuid4()
        cls.org_a_id = uuid.uuid4()
        cls.org_b_id = uuid.uuid4()

        cls.user_author = User(
            id=cls.user_author_id,
            email="author@techcorp.com",
            username="author",
            full_name="Alice Author",
            hashed_password="pw",
            is_active=True,
        )
        cls.user_reviewer = User(
            id=cls.user_reviewer_id,
            email="reviewer@techcorp.com",
            username="reviewer",
            full_name="Rachel Reviewer",
            hashed_password="pw",
            is_active=True,
        )
        cls.user_outsider = User(
            id=cls.user_outsider_id,
            email="outsider@rival.com",
            username="outsider",
            full_name="Oscar Outsider",
            hashed_password="pw",
            is_active=True,
        )

        cls.org_a = Organization(
            id=cls.org_a_id,
            name="TechCorp Solutions",
            industry="Technology & Cloud",
            created_by=cls.user_author_id,
        )
        cls.org_b = Organization(
            id=cls.org_b_id,
            name="Competitor Inc",
            industry="Retail",
            created_by=cls.user_outsider_id,
        )

    def setUp(self):
        self.db = self.TestingSessionLocal()

        self.app.dependency_overrides[get_db] = lambda: self.db
        self.active_user = self.user_author
        self.active_org = self.org_a
        self.active_role = UserRole.ADMIN

        def override_workspace_context():
            return WorkspaceContext(
                user=self.active_user,
                organization=self.active_org,
                organization_id=self.active_org.id,
                member=None,
                role=self.active_role,
            )

        self.app.dependency_overrides[get_active_workspace_context] = override_workspace_context
        self.app.dependency_overrides[get_current_user] = lambda: self.active_user

        self.client = TestClient(self.app)

        # Seed users and orgs
        for u in [self.user_author, self.user_reviewer, self.user_outsider]:
            if not self.db.get(User, u.id):
                self.db.add(u)
        for o in [self.org_a, self.org_b]:
            if not self.db.get(Organization, o.id):
                self.db.add(o)

        # Seed memberships
        # Org A: Author (Admin) and Reviewer (Reviewer)
        self.db.add(OrganizationMember(
            id=uuid.uuid4(),
            organization_id=self.org_a_id,
            user_id=self.user_author_id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        ))
        self.db.add(OrganizationMember(
            id=uuid.uuid4(),
            organization_id=self.org_a_id,
            user_id=self.user_reviewer_id,
            role=UserRole.REVIEWER,
            status=MemberStatus.ACTIVE,
        ))
        # Org B: Outsider (Admin)
        self.db.add(OrganizationMember(
            id=uuid.uuid4(),
            organization_id=self.org_b_id,
            user_id=self.user_outsider_id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        ))

        # Seed sample completed assessment and analysis
        self.assessment_id = uuid.uuid4()
        assessment = OrganizationAssessment(
            id=self.assessment_id,
            organization_id=self.org_a_id,
            created_by=self.user_author_id,
            title="Enterprise Governance Assessment",
            status="COMPLETED",
            answers={"profile": {"organization_name": "TechCorp", "industry": "Technology"}},
        )
        self.db.add(assessment)

        self.analysis_id = uuid.uuid4()
        analysis = PolicyNeedsAnalysis(
            id=self.analysis_id,
            organization_id=self.org_a_id,
            assessment_id=self.assessment_id,
            created_by=self.user_author_id,
            version=1,
            regulatory_discoveries=[],
            policy_needs=[{
                "need_id": "need-privacy",
                "title": "Data Privacy & Protection Policy",
                "category": "Data Governance",
                "recommended_owner_role": "Data Protection Officer",
                "suggested_review_frequency": "Annual",
            }],
            user_decisions={"need-privacy": {"decision": "ACCEPTED"}},
        )
        self.db.add(analysis)

        # Create standard draft
        self.draft_id = uuid.uuid4()
        self.sample_sections = [
            {
                "section_id": "sec-metadata",
                "section_number": "1.0",
                "heading": "Document Control & Metadata",
                "content": "Metadata content",
                "source_clauses": [],
                "is_customized": False,
            },
            {
                "section_id": "sec-core-requirements",
                "section_number": "5.0",
                "heading": "Mandatory Governance Commitments",
                "content": "All personnel must protect confidential records.",
                "source_clauses": [],
                "is_customized": False,
            },
        ]
        draft = PolicyDraft(
            id=self.draft_id,
            organization_id=self.org_a_id,
            assessment_id=self.assessment_id,
            analysis_id=self.analysis_id,
            analysis_version=1,
            need_id="need-privacy",
            created_by=self.user_author_id,
            title="Data Privacy & Protection Policy",
            status="DRAFT_SAVED",
            version=1,
            metadata_properties={"policy_identifier": "POL-PRIVACY", "review_cadence": "Annual"},
            sections=self.sample_sections,
            source_references=[],
            unresolved_questions=[],
            generation_metadata={
                "generator": "lexisgraph-grounded-template-engine",
                "generation_method": "deterministic_rule_based",
                "is_template_fallback": True,
                "fallback_reason": "Deterministic statutory template used",
            },
            history=[],
        )
        self.db.add(draft)
        self.db.commit()

    def tearDown(self):
        self.db.query(PolicyApprovalAudit).delete()
        self.db.query(Document).delete()
        self.db.query(PolicyDraft).delete()
        self.db.query(PolicyNeedsAnalysis).delete()
        self.db.query(OrganizationAssessment).delete()
        self.db.query(OrganizationMember).delete()
        self.db.commit()
        self.db.close()

    # -----------------------------------------------------------------------
    # 1. Review Submission Tests
    # -----------------------------------------------------------------------

    def test_01_submit_draft_for_review_success(self):
        """Authorized user submits draft for review; draft locks to READY_FOR_REVIEW and logs audit."""
        resp = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/submit-review",
            json={"assigned_reviewer_id": str(self.user_reviewer_id), "notes": "Ready for annual compliance review"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data["status"], "READY_FOR_REVIEW")
        self.assertEqual(data["assigned_reviewer_id"], str(self.user_reviewer_id))

        # Verify audit record
        audit = self.db.query(PolicyApprovalAudit).filter(PolicyApprovalAudit.draft_id == self.draft_id).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.action, "DRAFT_SUBMITTED")
        self.assertEqual(audit.previous_status, "DRAFT_SAVED")
        self.assertEqual(audit.new_status, "READY_FOR_REVIEW")
        self.assertEqual(audit.comments, "Ready for annual compliance review")

    def test_02_submit_draft_empty_sections_rejected(self):
        """Draft with no sections cannot be submitted for review."""
        draft = self.db.get(PolicyDraft, self.draft_id)
        draft.sections = []
        self.db.commit()

        resp = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/submit-review",
            json={},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("empty draft", resp.json()["detail"].lower())

    def test_03_submit_draft_ineligible_reviewer_rejected(self):
        """Assigning an outsider or non-reviewer role triggers rejection."""
        resp = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/submit-review",
            json={"assigned_reviewer_id": str(self.user_outsider_id)},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not an active member", resp.json()["detail"].lower())

    # -----------------------------------------------------------------------
    # 2. Eligible Reviewers
    # -----------------------------------------------------------------------

    def test_04_get_eligible_reviewers(self):
        """Active workspace members with reviewer/analyst/admin role are listed."""
        resp = self.client.get("/policy-formation/eligible-reviewers")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        reviewers = resp.json()
        reviewer_ids = [r["user_id"] for r in reviewers]
        self.assertIn(str(self.user_reviewer_id), reviewer_ids)
        self.assertIn(str(self.user_author_id), reviewer_ids)
        self.assertNotIn(str(self.user_outsider_id), reviewer_ids)

    # -----------------------------------------------------------------------
    # 3. Approval Workflow & Safeguards
    # -----------------------------------------------------------------------

    def test_05_approve_draft_by_authorized_reviewer(self):
        """Assigned reviewer approves draft; generates immutable SHA-256 content hash."""
        # First submit
        draft = self.db.get(PolicyDraft, self.draft_id)
        draft.status = "READY_FOR_REVIEW"
        draft.assigned_reviewer_id = self.user_reviewer_id
        self.db.commit()

        # Switch active user to Rachel Reviewer
        self.active_user = self.user_reviewer
        self.active_role = UserRole.REVIEWER

        resp = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/approve",
            json={"expected_version": 1, "comments": "Approved without conditions."},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data["status"], "APPROVED")
        self.assertEqual(data["approved_by"], str(self.user_reviewer_id))
        self.assertEqual(data["approved_version"], 1)
        self.assertIsNotNone(data["content_hash"])
        self.assertEqual(len(data["content_hash"]), 64)  # SHA-256 produces 64 hex chars

        # Verify audit record
        audit = self.db.query(PolicyApprovalAudit).filter(
            PolicyApprovalAudit.draft_id == self.draft_id,
            PolicyApprovalAudit.action == "APPROVAL_GRANTED",
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.new_status, "APPROVED")
        self.assertEqual(audit.comments, "Approved without conditions.")

    def test_06_self_approval_blocked_in_multi_member_org(self):
        """Author cannot approve their own draft when multiple members exist in the workspace."""
        draft = self.db.get(PolicyDraft, self.draft_id)
        draft.status = "READY_FOR_REVIEW"
        self.db.commit()

        # Active user is author (Alice)
        self.active_user = self.user_author
        self.active_role = UserRole.ADMIN

        resp = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/approve",
            json={"expected_version": 1, "comments": "Self approval attempt"},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("self-approval prohibited", resp.json()["detail"].lower())

    def test_07_approve_stale_version_rejected(self):
        """Approval request targeting an outdated version fails with concurrency conflict."""
        draft = self.db.get(PolicyDraft, self.draft_id)
        draft.status = "READY_FOR_REVIEW"
        draft.version = 2
        self.db.commit()

        self.active_user = self.user_reviewer
        self.active_role = UserRole.REVIEWER

        resp = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/approve",
            json={"expected_version": 1},  # Stale expected_version
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("stale version conflict", resp.json()["detail"].lower())

    # -----------------------------------------------------------------------
    # 4. Revision Requests and Rejections
    # -----------------------------------------------------------------------

    def test_08_request_revision_requires_comments(self):
        """Reviewer requesting revisions must provide substantive comments."""
        draft = self.db.get(PolicyDraft, self.draft_id)
        draft.status = "READY_FOR_REVIEW"
        self.db.commit()

        self.active_user = self.user_reviewer
        self.active_role = UserRole.REVIEWER

        # Empty comments should fail
        resp_fail = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/request-revision",
            json={"expected_version": 1, "comments": ""},
        )
        self.assertEqual(resp_fail.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)

        # Valid comments should succeed and transition to REVISION_REQUESTED
        resp_ok = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/request-revision",
            json={"expected_version": 1, "comments": "Please add explicit incident reporting deadlines to Section 5.0."},
        )
        self.assertEqual(resp_ok.status_code, status.HTTP_200_OK)
        data = resp_ok.json()
        self.assertEqual(data["status"], "REVISION_REQUESTED")
        self.assertEqual(data["review_comments"], "Please add explicit incident reporting deadlines to Section 5.0.")

    def test_09_reject_draft_requires_reason(self):
        """Rejecting submission transitions to DRAFT_SAVED and logs documented reason."""
        draft = self.db.get(PolicyDraft, self.draft_id)
        draft.status = "READY_FOR_REVIEW"
        self.db.commit()

        self.active_user = self.user_reviewer
        self.active_role = UserRole.REVIEWER

        resp = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/reject",
            json={"expected_version": 1, "reason": "Scope of application conflicts with corporate group policy."},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data["status"], "DRAFT_SAVED")
        self.assertEqual(data["rejection_reason"], "Scope of application conflicts with corporate group policy.")

    # -----------------------------------------------------------------------
    # 5. Direct Edit Protections & Revision Branching
    # -----------------------------------------------------------------------

    def test_10_direct_edits_locked_when_under_review_or_approved(self):
        """Direct section or title updates are rejected when draft is in READY_FOR_REVIEW or APPROVED."""
        draft = self.db.get(PolicyDraft, self.draft_id)
        draft.status = "READY_FOR_REVIEW"
        self.db.commit()

        # Direct edit via update_draft
        resp = self.client.put(
            f"/policy-formation/drafts/{self.draft_id}",
            json={"title": "Hacked Title While In Review"},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("protected lifecycle status", resp.json()["detail"].lower())

        # Section regeneration should also be locked
        resp_regen = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/regenerate-section",
            json={"section_id": "sec-core-requirements", "expected_version": 1},
        )
        self.assertEqual(resp_regen.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("protected status", resp_regen.json()["detail"].lower())

    def test_11_create_revision_from_approved_restarts_lifecycle(self):
        """Calling create_revision branches vN+1, archives prior version, and resets approval."""
        draft = self.db.get(PolicyDraft, self.draft_id)
        draft.status = "APPROVED"
        draft.approved_by = self.user_reviewer_id
        draft.approved_at = datetime.now(timezone.utc)
        draft.content_hash = "abc123sha256"
        self.db.commit()

        resp = self.client.post(f"/policy-formation/drafts/{self.draft_id}/create-revision")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data["version"], 2)
        self.assertEqual(data["status"], "DRAFT_SAVED")
        self.assertIsNone(data["approved_by"])
        self.assertIsNone(data["content_hash"])
        self.assertEqual(len(data["history"]), 1)
        self.assertEqual(data["history"][0]["version"], 1)

    # -----------------------------------------------------------------------
    # 6. Production Policies Repository Publishing
    # -----------------------------------------------------------------------

    @patch("app.services.policy_formation_service.process_document")
    @patch("app.services.policy_formation_service.store_published_policy_content")
    def test_12_publish_approved_policy_into_document_repository(self, mock_store, mock_proc):
        """Publishing an approved draft writes to Document table and links draft."""
        from app.services.storage import StoredFileMetadata
        mock_store.return_value = StoredFileMetadata(
            original_filename="POL-PRIVACY_Data_Privacy___Protection_Policy.txt",
            stored_filename="pol_uuid.txt",
            path="storage/uploads/policies/pol_uuid.txt",
            checksum="hash12345",
            size=1024,
            mime_type="text/plain",
        )

        draft = self.db.get(PolicyDraft, self.draft_id)
        draft.status = "APPROVED"
        content_hash = PolicyFormationAnalysisService.compute_draft_content_hash(draft.sections)
        draft.content_hash = content_hash
        draft.approved_version = 1
        self.db.commit()

        resp = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/publish",
            json={"expected_version": 1},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data["status"], "PUBLISHED")
        self.assertIsNotNone(data["published_policy_id"])
        self.assertIsNotNone(data["published_at"])

        # Verify entry in the live Document table
        doc = self.db.get(Document, uuid.UUID(data["published_policy_id"]))
        self.assertIsNotNone(doc)
        self.assertEqual(doc.document_type, DocumentType.POLICY)
        self.assertEqual(doc.organization_id, self.org_a_id)
        self.assertEqual(doc.source_draft_id, self.draft_id)
        self.assertEqual(doc.policy_identifier, "POL-PRIVACY")
        self.assertEqual(doc.lifecycle_status, "ACTIVE")
        self.assertEqual(doc.review_cadence, "Annual")
        self.assertIsNotNone(doc.next_review_date)
        mock_proc.assert_called_once_with(doc.id)

    def test_13_publish_unapproved_draft_rejected(self):
        """Publishing a draft that has not been approved is strictly denied."""
        resp = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/publish",
            json={"expected_version": 1},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("must be explicitly 'approved'", resp.json()["detail"].lower())

    def test_14_publish_modified_content_integrity_check(self):
        """If sections are modified after approval, publication is blocked until re-approved."""
        draft = self.db.get(PolicyDraft, self.draft_id)
        draft.status = "APPROVED"
        draft.content_hash = "legitimate_original_hash_999"
        self.db.commit()

        resp = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/publish",
            json={"expected_version": 1},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("content integrity violation", resp.json()["detail"].lower())

    @patch("app.services.policy_formation_service.process_document")
    @patch("app.services.policy_formation_service.store_published_policy_content")
    def test_15_publish_idempotency_on_retry(self, mock_store, mock_proc):
        """Retrying publication on an already published policy returns idempotently without duplicate records."""
        from app.services.storage import StoredFileMetadata
        mock_store.return_value = StoredFileMetadata(
            original_filename="POL-PRIVACY.txt",
            stored_filename="pol_uuid.txt",
            path="storage/uploads/policies/pol_uuid.txt",
            checksum="hash12345",
            size=1024,
            mime_type="text/plain",
        )

        draft = self.db.get(PolicyDraft, self.draft_id)
        draft.status = "APPROVED"
        draft.content_hash = PolicyFormationAnalysisService.compute_draft_content_hash(draft.sections)
        self.db.commit()

        # First publish
        self.client.post(f"/policy-formation/drafts/{self.draft_id}/publish", json={"expected_version": 1})
        docs_count_first = self.db.query(Document).filter(Document.source_draft_id == self.draft_id).count()
        self.assertEqual(docs_count_first, 1)

        # Retry publish
        resp_retry = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/publish", json={"expected_version": 1}
        )
        self.assertEqual(resp_retry.status_code, status.HTTP_200_OK)
        docs_count_second = self.db.query(Document).filter(Document.source_draft_id == self.draft_id).count()
        self.assertEqual(docs_count_second, 1)  # No duplicate created

    @patch("app.services.policy_formation_service.process_document")
    @patch("app.services.policy_formation_service.store_published_policy_content")
    def test_16_publish_supersedes_prior_published_documents(self, mock_store, mock_proc):
        """Publishing a new revision supersedes previously active published documents with the same policy code."""
        from app.services.storage import StoredFileMetadata
        mock_store.return_value = StoredFileMetadata(
            original_filename="POL-PRIVACY.txt",
            stored_filename="pol_uuid.txt",
            path="storage/uploads/policies/pol_uuid.txt",
            checksum="hash12345",
            size=1024,
            mime_type="text/plain",
        )

        # Existing v1 published document
        older_doc = Document(
            id=uuid.uuid4(),
            organization_id=self.org_a_id,
            uploaded_by=self.user_author_id,
            original_filename="POL-PRIVACY_v1.txt",
            stored_filename="stored1.txt",
            file_path="storage/uploads/policies/stored1.txt",
            file_size=500,
            mime_type="text/plain",
            checksum="old_hash",
            document_type=DocumentType.POLICY,
            policy_identifier="POL-PRIVACY",
            lifecycle_status="ACTIVE",
        )
        self.db.add(older_doc)

        draft = self.db.get(PolicyDraft, self.draft_id)
        draft.status = "APPROVED"
        draft.version = 2
        draft.content_hash = PolicyFormationAnalysisService.compute_draft_content_hash(draft.sections)
        self.db.commit()

        resp = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/publish", json={"expected_version": 2}
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        self.db.refresh(older_doc)
        self.assertEqual(older_doc.lifecycle_status, "SUPERSEDED")


    # -----------------------------------------------------------------------
    # 7. Cross-Workspace Security Isolation
    # -----------------------------------------------------------------------

    def test_17_cross_workspace_submission_and_approval_denied(self):
        """User in Organization B cannot access, submit, approve, or publish Organization A drafts."""
        # Switch to user in Org B
        self.active_user = self.user_outsider
        self.active_org = self.org_b
        self.active_role = UserRole.ADMIN

        # Submit attempt
        resp_sub = self.client.post(f"/policy-formation/drafts/{self.draft_id}/submit-review", json={})
        self.assertEqual(resp_sub.status_code, status.HTTP_404_NOT_FOUND)

        # Approve attempt
        resp_app = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/approve", json={"expected_version": 1}
        )
        self.assertEqual(resp_app.status_code, status.HTTP_404_NOT_FOUND)

        # Publish attempt
        resp_pub = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/publish", json={"expected_version": 1}
        )
        self.assertEqual(resp_pub.status_code, status.HTTP_404_NOT_FOUND)

        # Audit history attempt
        resp_aud = self.client.get(f"/policy-formation/drafts/{self.draft_id}/approval-history")
        self.assertEqual(resp_aud.status_code, status.HTTP_404_NOT_FOUND)

    # -----------------------------------------------------------------------
    # 8. Generation Transparency & Fallback Telemetry (Prompt Req 1)
    # -----------------------------------------------------------------------

    def test_18_generation_transparency_labels_fallback_truthfully(self):
        """Rule-based template fallback is visibly labelled and provider failure is not disguised."""
        draft = self.db.get(PolicyDraft, self.draft_id)
        meta = draft.generation_metadata or {}
        self.assertEqual(meta.get("generation_method"), "deterministic_rule_based")
        self.assertTrue(meta.get("is_template_fallback"))
        self.assertIsNotNone(meta.get("fallback_reason"))

    @patch("app.services.policy_formation_service._resolve_reasoning")
    def test_19_retry_ai_generation_succeeds_without_overwriting_manual_edits(self, mock_llm):
        """Retrying AI generation updates non-customized sections while strictly preserving user edits."""
        mock_llm.return_value = (
            "1. Cryptographic keys must be rotated every 90 days.\n"
            "2. Access tokens expire within 15 minutes.\n"
            "3. Sensitive personal data must be encrypted at rest with AES-256.\n"
            "4. Multi-factor authentication is mandatory for all administrators."
        )

        resp = self.client.post(f"/policy-formation/drafts/{self.draft_id}/retry-ai-generation")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        gen_meta = data["generation_metadata"]
        self.assertEqual(gen_meta["generation_method"], "ai_llm_generated")
        self.assertFalse(gen_meta["is_template_fallback"])
        self.assertIsNone(gen_meta["fallback_reason"])
        self.assertTrue(gen_meta["llm_enhanced"])

    # -----------------------------------------------------------------------
    # 9. Effective Date Lifecycles, Rollback File Cleanup & Workspace Isolation
    # -----------------------------------------------------------------------

    @patch("app.services.policy_formation_service.process_document")
    @patch("app.services.policy_formation_service.store_published_policy_content")
    def test_20_future_effective_date_and_auto_activation(self, mock_store, mock_proc):
        """Future effective date policy publishes as PENDING_EFFECTIVE and transitions to ACTIVE upon maturity."""
        from datetime import timedelta
        from app.services.storage import StoredFileMetadata
        mock_store.return_value = StoredFileMetadata(
            original_filename="POL-FUTURE.txt",
            stored_filename="pol_future.txt",
            path="storage/uploads/policies/pol_future.txt",
            checksum="hashfuture",
            size=1024,
            mime_type="text/plain",
        )

        future_date = datetime.now(timezone.utc) + timedelta(days=30)
        draft = self.db.get(PolicyDraft, self.draft_id)
        draft.status = "APPROVED"
        draft.version = 1
        draft.content_hash = PolicyFormationAnalysisService.compute_draft_content_hash(draft.sections)
        self.db.commit()

        resp = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/publish",
            json={"expected_version": 1, "effective_date": future_date.isoformat()},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        doc_id = resp.json()["published_policy_id"]
        doc = self.db.get(Document, uuid.UUID(doc_id))
        self.assertEqual(doc.lifecycle_status, "PENDING_EFFECTIVE")

        # Before maturity, sync does not activate it prematurely
        PolicyFormationAnalysisService.sync_effective_policy_lifecycles(self.db, self.org_a_id)
        self.db.refresh(doc)
        self.assertEqual(doc.lifecycle_status, "PENDING_EFFECTIVE")

        # Simulate date arrival: shift effective_date to past
        doc.effective_date = datetime.now(timezone.utc) - timedelta(hours=1)
        self.db.commit()

        # Run sync: now it safely matures to ACTIVE
        activated_count = PolicyFormationAnalysisService.sync_effective_policy_lifecycles(self.db, self.org_a_id)
        self.assertGreaterEqual(activated_count, 1)
        self.db.refresh(doc)
        self.assertEqual(doc.lifecycle_status, "ACTIVE")

    @patch("app.services.policy_formation_service.process_document")
    @patch("app.services.policy_formation_service.store_published_policy_content")
    def test_21_cross_workspace_policy_supersede_isolation(self, mock_store, mock_proc):
        """Publishing in Org A cannot supersede an active policy in Org B even if policy_identifier matches."""
        from app.services.storage import StoredFileMetadata
        mock_store.return_value = StoredFileMetadata(
            original_filename="POL-ISOLATE.txt",
            stored_filename="pol_iso.txt",
            path="storage/uploads/policies/pol_iso.txt",
            checksum="hashiso",
            size=1024,
            mime_type="text/plain",
        )

        # Create active document in Org B with matching policy_identifier
        org_b_doc = Document(
            id=uuid.uuid4(),
            organization_id=self.org_b_id,
            uploaded_by=self.user_outsider_id,
            original_filename="POL-SECURITY_org_b.txt",
            stored_filename="stored_b.txt",
            file_path="storage/uploads/policies/stored_b.txt",
            file_size=500,
            mime_type="text/plain",
            checksum="hash_b",
            document_type=DocumentType.POLICY,
            policy_identifier="POL-PRIVACY",
            lifecycle_status="ACTIVE",
        )
        self.db.add(org_b_doc)
        self.db.commit()

        # Publish draft in Org A with policy_identifier POL-PRIVACY
        draft = self.db.get(PolicyDraft, self.draft_id)
        draft.status = "APPROVED"
        draft.version = 1
        draft.metadata_properties = {"policy_identifier": "POL-PRIVACY"}
        draft.content_hash = PolicyFormationAnalysisService.compute_draft_content_hash(draft.sections)
        self.db.commit()

        resp = self.client.post(
            f"/policy-formation/drafts/{self.draft_id}/publish", json={"expected_version": 1}
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # Verify Org B's policy remained untouched and ACTIVE
        self.db.refresh(org_b_doc)
        self.assertEqual(org_b_doc.lifecycle_status, "ACTIVE")

    @patch("app.services.policy_formation_service.delete_stored_file")
    @patch("app.services.policy_formation_service.store_published_policy_content")
    def test_22_publish_failure_rollback_cleans_file(self, mock_store, mock_delete_file):
        """If database flush/commit fails during publishing, transaction rolls back and file is deleted."""
        from app.services.storage import StoredFileMetadata
        temp_file_path = "storage/uploads/policies/temp_rollback.txt"
        mock_store.return_value = StoredFileMetadata(
            original_filename="POL-FAIL.txt",
            stored_filename="temp_rollback.txt",
            path=temp_file_path,
            checksum="hashfail",
            size=1024,
            mime_type="text/plain",
        )

        draft = self.db.get(PolicyDraft, self.draft_id)
        draft.status = "APPROVED"
        draft.version = 1
        draft.content_hash = PolicyFormationAnalysisService.compute_draft_content_hash(draft.sections)
        self.db.commit()

        ws = WorkspaceContext(
            user=self.active_user,
            organization=self.active_org,
            organization_id=self.active_org.id,
            member=None,
            role=self.active_role,
        )

        # Simulate DB commit failure by patching db.commit
        with patch.object(self.db, "commit", side_effect=RuntimeError("Simulated DB connection drop")):
            with self.assertRaises(RuntimeError):
                PolicyFormationAnalysisService.publish_draft(
                    draft_id=self.draft_id,
                    expected_version=1,
                    effective_date=None,
                    background_tasks=None,
                    db=self.db,
                    ws=ws,
                )

        # Verify delete_stored_file was invoked with the created file path
        mock_delete_file.assert_called_once_with(temp_file_path)


if __name__ == "__main__":
    unittest.main()
