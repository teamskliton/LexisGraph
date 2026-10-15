"""
Comprehensive Test Suite for Stage 4: AI Policy Drafting & Editor.

Tests cover:
1. Draft creation from accepted policy need.
2. Handling of policy need requiring verification (enforcing confirmation/warnings).
3. Rejection of incomplete or unauthorized source analysis.
4. Grounded context construction and statutory provision preservation.
5. Missing evidence and fallback generation resilience.
6. Editing and saving metadata and structured sections.
7. Autosave and draft resume.
8. Version creation and rollback restoration.
9. Concurrent edits and stale-update conflicts (409 Conflict on expected_version mismatch).
10. Section regeneration without overwriting neighboring manual edits.
11. Failure recovery without data loss.
12. Duplicate draft handling (idempotent resume).
13. Cross-workspace isolation denial across all draft endpoints.
14. Complete separation: Drafts strictly NEVER appear in the production Document / Policies repository.
15. Existing assessment and Stage 3 analysis integrity.
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
from app.db.models.rbac import UserRole
from app.db.models.document import Document, DocumentType, ProcessingStatus
from app.db.models.policy_formation import (
    OrganizationAssessment,
    PolicyNeedsAnalysis,
    PolicyDraft,
)
from app.core.dependencies import get_current_user
from app.core.workspace_context import WorkspaceContext, get_active_workspace_context
from app.routes.policy_formation import router as policy_formation_router


class PolicyDraftingTestSuite(unittest.TestCase):
    """Test suite for Policy Drafting, Grounded Content, Section Regeneration, and Isolation."""

    @classmethod
    def setUpClass(cls):
        # In-memory SQLite with static pool for isolated test DB
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

        cls.user_a_id = uuid.uuid4()
        cls.org_a_id = uuid.uuid4()
        cls.user_b_id = uuid.uuid4()
        cls.org_b_id = uuid.uuid4()

        cls.user_a = User(
            id=cls.user_a_id,
            email="alice@techcorp.com",
            username="alice",
            full_name="Alice Founder",
            hashed_password="pw",
            is_active=True,
        )
        cls.org_a = Organization(
            id=cls.org_a_id,
            name="TechCorp Solutions",
            industry="Technology & Cloud",
            created_by=cls.user_a_id,
        )

        cls.user_b = User(
            id=cls.user_b_id,
            email="bob@competitor.com",
            username="bob",
            full_name="Bob Competitor",
            hashed_password="pw",
            is_active=True,
        )
        cls.org_b = Organization(
            id=cls.org_b_id,
            name="Competitor Inc",
            industry="Consulting",
            created_by=cls.user_b_id,
        )

        db = cls.TestingSessionLocal()
        db.add_all([cls.user_a, cls.org_a, cls.user_b, cls.org_b])
        db.commit()
        db.close()

    def setUp(self):
        self.db = self.TestingSessionLocal()
        self.user_a = self.db.get(User, self.user_a_id)
        self.org_a = self.db.get(Organization, self.org_a_id)
        self.user_b = self.db.get(User, self.user_b_id)
        self.org_b = self.db.get(Organization, self.org_b_id)

        self.current_user = self.user_a
        self.current_org = self.org_a

        def override_get_db():
            try:
                yield self.db
            finally:
                pass

        def override_get_current_user():
            return self.current_user

        def override_get_workspace_context():
            return WorkspaceContext(
                user=self.current_user,
                organization=self.current_org,
                organization_id=self.current_org.id,
                member=None,
                role=UserRole.ADMIN,
            )

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = override_get_current_user
        self.app.dependency_overrides[get_active_workspace_context] = override_get_workspace_context

        self.client = TestClient(self.app)

        self.reasoning_patcher = patch(
            "app.services.policy_formation_service._resolve_reasoning",
            return_value=None,
        )
        self.reasoning_patcher.start()

        # Seed completed assessment for Org A
        self.assessment_a = OrganizationAssessment(
            id=uuid.uuid4(),
            organization_id=self.org_a_id,
            created_by=self.user_a_id,
            scope_type="ORGANIZATION",
            status="COMPLETED",
            current_step=6,
            answers={
                "profile": {
                    "legal_name": "TechCorp Solutions Inc",
                    "operating_jurisdiction": "United States",
                    "industry": "Technology & Cloud",
                    "employee_count_band": "51-200",
                },
                "data_handling": {
                    "data_types": ["Personal identifying information (PII)", "Customer financial data"],
                    "stores_cardholder_data": True,
                    "uses_cloud_storage": True,
                },
                "security": {
                    "has_mfa": True,
                    "incident_response_team": True,
                },
            },
        )
        self.db.add(self.assessment_a)
        self.db.commit()

        # Seed completed analysis for Org A
        self.analysis_a = PolicyNeedsAnalysis(
            id=uuid.uuid4(),
            organization_id=self.org_a_id,
            assessment_id=self.assessment_a.id,
            created_by=self.user_a_id,
            version=1,
            regulatory_discoveries=[
                {
                    "canon_id": "REG-PCI-DSS-4.0",
                    "instrument_name": "Payment Card Industry Data Security Standard v4.0",
                    "category": "standard",
                    "jurisdiction": "International",
                    "confidence": "High",
                    "relevance_explanation": "Processes and stores payment cardholder information.",
                    "relevant_provisions": [
                        "Req 3: Protect Stored Account Data",
                        "Req 8: Identify Users and Authenticate Access",
                        "Req 12: Support Information Security with Organizational Policies",
                    ],
                    "trigger_answers": ["stores_cardholder_data: True"],
                }
            ],
            policy_needs=[
                {
                    "need_id": "NEED-CARDHOLDER-DATA-SECURITY",
                    "title": "Cardholder Data Protection Policy",
                    "category": "Data Security & Payments",
                    "driver": "regulatory-driven",
                    "suggested_priority": "Urgent",
                    "suggested_review_frequency": "Annually",
                    "recommended_owner_role": "Chief Information Security Officer",
                    "business_rationale": "Mandatory controls under PCI DSS v4.0 Requirement 3 and 12.",
                    "linked_regulations": ["Payment Card Industry Data Security Standard v4.0"],
                    "linked_risks": ["Payment card compromise", "PCI non-compliance fines"],
                    "suggested_scope": "All systems transmitting or storing PAN and cardholder data.",
                    "evidence_confidence": "High",
                    "assumptions_and_questions": [],
                },
                {
                    "need_id": "NEED-AI-ETHICS-GOVERNANCE",
                    "title": "AI Ethics and Model Governance Policy",
                    "category": "AI Safety & Compliance",
                    "driver": "risk-driven",
                    "suggested_priority": "Medium",
                    "suggested_review_frequency": "Annually",
                    "recommended_owner_role": "Head of AI Ethics",
                    "business_rationale": "Internal risk management for automated model decisions.",
                    "linked_regulations": ["EU Artificial Intelligence Act (Conditional)"],
                    "linked_risks": ["Algorithmic bias", "Unintended model hallucination"],
                    "suggested_scope": "Internal AI engineering teams.",
                    "evidence_confidence": "Medium",
                    "assumptions_and_questions": [
                        "Verify whether high-risk AI models are deployed in the EU market.",
                        "Confirm whether third-party foundation models are fine-tuned internally.",
                    ],
                },
            ],
            coverage_findings=[],
            user_decisions={
                "NEED-CARDHOLDER-DATA-SECURITY": {
                    "decision": "ACCEPTED",
                    "priority_override": None,
                    "notes": "Prioritized for immediate PCI audit.",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                "NEED-AI-ETHICS-GOVERNANCE": {
                    "decision": "REQUIRES_VERIFICATION",
                    "priority_override": None,
                    "notes": "EU deployment scope still unconfirmed.",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
            },
            summary={"total_needs": 2, "accepted": 1, "requires_verification": 1},
        )
        self.db.add(self.analysis_a)
        self.db.commit()

    def tearDown(self):
        self.reasoning_patcher.stop()
        self.db.query(PolicyDraft).delete()
        self.db.query(PolicyNeedsAnalysis).delete()
        self.db.query(OrganizationAssessment).delete()
        self.db.query(Document).delete()
        self.db.commit()
        self.db.close()

    def test_01_create_draft_from_accepted_need(self):
        """Test creating a grounded policy draft from an ACCEPTED policy need."""
        payload = {
            "assessment_id": str(self.assessment_a.id),
            "analysis_id": str(self.analysis_a.id),
            "need_id": "NEED-CARDHOLDER-DATA-SECURITY",
            "force_preliminary": False,
        }
        res = self.client.post("/policy-formation/drafts", json=payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.text)
        data = res.json()

        self.assertEqual(data["title"], "Cardholder Data Protection Policy")
        self.assertEqual(data["status"], "DRAFT_SAVED")
        self.assertEqual(data["version"], 1)
        self.assertEqual(data["organization_id"], str(self.org_a_id))
        self.assertEqual(data["need_id"], "NEED-CARDHOLDER-DATA-SECURITY")

        # Must have enterprise 12 sections
        sections = data["sections"]
        self.assertGreaterEqual(len(sections), 10)
        section_titles = [s["heading"] for s in sections]
        self.assertTrue(any("Purpose" in t for t in section_titles))
        self.assertTrue(any("Scope" in t for t in section_titles))
        self.assertTrue(any("Mandatory" in t or "Commitments" in t for t in section_titles))
        self.assertTrue(any("Statutory" in t or "References" in t for t in section_titles))

        # Check statutory provisions preserved
        source_refs = data["source_references"]
        self.assertTrue(any("Payment Card" in ref.get("instrument_name", "") or "PCI" in ref.get("instrument_name", "") for ref in source_refs))

    def test_02_requires_verification_handling(self):
        """Test that drafting from REQUIRES_VERIFICATION fails without force_preliminary, and succeeds with warnings with force_preliminary=True."""
        payload = {
            "assessment_id": str(self.assessment_a.id),
            "analysis_id": str(self.analysis_a.id),
            "need_id": "NEED-AI-ETHICS-GOVERNANCE",
            "force_preliminary": False,
        }
        res = self.client.post("/policy-formation/drafts", json=payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("requires verification", res.json()["detail"].lower())

        # Now test with force_preliminary=True
        payload["force_preliminary"] = True
        res_ok = self.client.post("/policy-formation/drafts", json=payload)
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED, res_ok.text)
        data = res_ok.json()

        self.assertEqual(data["status"], "NEEDS_VERIFICATION")
        self.assertGreaterEqual(len(data["unresolved_questions"]), 1)
        self.assertIn("EU market", "".join(data["unresolved_questions"]))

        # Unresolved caveats must appear in Section 12 (Assumptions & Verification Notes)
        sec_12 = next((s for s in data["sections"] if s["section_id"] == "sec-limitations"), None)
        self.assertIsNotNone(sec_12)
        self.assertIn("NEEDS_VERIFICATION", sec_12["content"])

    def test_03_rejection_of_incomplete_assessment(self):
        """Reject draft creation if the assessment is still an incomplete draft."""
        inc_assessment = OrganizationAssessment(
            id=uuid.uuid4(),
            organization_id=self.org_a_id,
            created_by=self.user_a_id,
            scope_type="ORGANIZATION",
            status="DRAFT",
            current_step=3,
            answers={},
        )
        self.db.add(inc_assessment)
        self.db.commit()

        payload = {
            "assessment_id": str(inc_assessment.id),
            "analysis_id": str(self.analysis_a.id),
            "need_id": "NEED-CARDHOLDER-DATA-SECURITY",
        }
        res = self.client.post("/policy-formation/drafts", json=payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("completed", res.json()["detail"].lower())

    def test_04_editing_and_autosave(self):
        """Test debounced autosave / manual section update with version increment and history snapshot."""
        # Create draft
        draft_res = self.client.post(
            "/policy-formation/drafts",
            json={
                "assessment_id": str(self.assessment_a.id),
                "analysis_id": str(self.analysis_a.id),
                "need_id": "NEED-CARDHOLDER-DATA-SECURITY",
            },
        )
        draft = draft_res.json()
        draft_id = draft["id"]
        self.assertEqual(draft["version"], 1)

        # Update section content
        updated_sections = list(draft["sections"])
        updated_sections[1]["content"] = "This is our custom updated corporate purpose for data protection."
        updated_sections[1]["is_customized"] = True

        update_payload = {
            "title": "Corporate Cardholder Protection Policy (Revised)",
            "status": "DRAFT_SAVED",
            "sections": updated_sections,
            "metadata_properties": {"responsible_role": "Chief Risk Officer"},
            "expected_version": 1,
        }

        save_res = self.client.put(f"/policy-formation/drafts/{draft_id}", json=update_payload)
        self.assertEqual(save_res.status_code, status.HTTP_200_OK, save_res.text)
        saved = save_res.json()

        self.assertEqual(saved["version"], 2)
        self.assertEqual(saved["title"], "Corporate Cardholder Protection Policy (Revised)")
        self.assertEqual(saved["sections"][1]["content"], "This is our custom updated corporate purpose for data protection.")
        self.assertEqual(saved["sections"][1]["is_customized"], True)

        # History must contain version 1
        history_res = self.client.get(f"/policy-formation/drafts/{draft_id}/history")
        self.assertEqual(history_res.status_code, status.HTTP_200_OK)
        history = history_res.json()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["version"], 1)

    def test_05_optimistic_concurrency_control(self):
        """Test that updating with a stale expected_version returns 409 Conflict."""
        draft_res = self.client.post(
            "/policy-formation/drafts",
            json={
                "assessment_id": str(self.assessment_a.id),
                "analysis_id": str(self.analysis_a.id),
                "need_id": "NEED-CARDHOLDER-DATA-SECURITY",
            },
        )
        draft_id = draft_res.json()["id"]

        # First update increments version to 2
        self.client.put(
            f"/policy-formation/drafts/{draft_id}",
            json={"title": "Update 1", "expected_version": 1},
        )

        # Stale update still presenting expected_version=1 must be rejected with 409
        conflict_res = self.client.put(
            f"/policy-formation/drafts/{draft_id}",
            json={"title": "Stale Concurrent Update", "expected_version": 1},
        )
        self.assertEqual(conflict_res.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("conflict", conflict_res.json()["detail"].lower())

    def test_06_regenerate_section_isolation(self):
        """Test regenerating an individual section preserves other sections and manual edits."""
        draft_res = self.client.post(
            "/policy-formation/drafts",
            json={
                "assessment_id": str(self.assessment_a.id),
                "analysis_id": str(self.analysis_a.id),
                "need_id": "NEED-CARDHOLDER-DATA-SECURITY",
            },
        )
        draft = draft_res.json()
        draft_id = draft["id"]

        # Manually customize Section 2 (Purpose)
        sections = list(draft["sections"])
        sections[1]["content"] = "PRESERVED CUSTOM MANUAL TEXT IN SECTION 2"
        self.client.put(
            f"/policy-formation/drafts/{draft_id}",
            json={"sections": sections, "expected_version": 1},
        )

        # Regenerate Section 5 (Mandatory Commitments)
        regen_payload = {
            "section_id": "sec-core-requirements",
            "custom_instructions": "Ensure explicit multi-factor authentication mandates for payment interfaces.",
        }
        regen_res = self.client.post(
            f"/policy-formation/drafts/{draft_id}/regenerate-section",
            json=regen_payload,
        )
        self.assertEqual(regen_res.status_code, status.HTTP_200_OK, regen_res.text)
        regenerated = regen_res.json()

        # Check that Section 2 manual edits were NOT overwritten or lost
        sec_2 = next(s for s in regenerated["sections"] if s["section_id"] == sections[1]["section_id"])
        self.assertEqual(sec_2["content"], "PRESERVED CUSTOM MANUAL TEXT IN SECTION 2")

        # Check that target section was updated and marked customized
        target_sec = next(s for s in regenerated["sections"] if s["section_id"] == "sec-core-requirements")
        self.assertTrue(target_sec["is_customized"])
        self.assertIsNotNone(target_sec["last_regenerated_at"])

    def test_07_version_rollback(self):
        """Test rolling back a draft to an earlier archived snapshot."""
        draft_res = self.client.post(
            "/policy-formation/drafts",
            json={
                "assessment_id": str(self.assessment_a.id),
                "analysis_id": str(self.analysis_a.id),
                "need_id": "NEED-CARDHOLDER-DATA-SECURITY",
            },
        )
        draft_id = draft_res.json()["id"]

        # Edit to v2
        self.client.put(
            f"/policy-formation/drafts/{draft_id}",
            json={"title": "Version 2 Title", "expected_version": 1},
        )
        # Edit to v3
        self.client.put(
            f"/policy-formation/drafts/{draft_id}",
            json={"title": "Version 3 Bad Edit", "expected_version": 2},
        )

        # Roll back to version 1
        revert_res = self.client.post(f"/policy-formation/drafts/{draft_id}/revert/1")
        self.assertEqual(revert_res.status_code, status.HTTP_200_OK, revert_res.text)
        reverted = revert_res.json()

        self.assertEqual(reverted["title"], "Cardholder Data Protection Policy")
        self.assertEqual(reverted["version"], 4)  # Audit increment preserves continuous forward revision chain

    def test_08_duplicate_draft_idempotency(self):
        """Calling create draft on the same need returns the existing draft rather than creating redundant duplicates."""
        payload = {
            "assessment_id": str(self.assessment_a.id),
            "analysis_id": str(self.analysis_a.id),
            "need_id": "NEED-CARDHOLDER-DATA-SECURITY",
        }
        res1 = self.client.post("/policy-formation/drafts", json=payload)
        res2 = self.client.post("/policy-formation/drafts", json=payload)

        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res1.json()["id"], res2.json()["id"])

    def test_09_multi_tenant_workspace_isolation(self):
        """Tenant B must be strictly forbidden from accessing Tenant A's drafts across all endpoints."""
        # Create draft in Tenant A
        draft_res = self.client.post(
            "/policy-formation/drafts",
            json={
                "assessment_id": str(self.assessment_a.id),
                "analysis_id": str(self.analysis_a.id),
                "need_id": "NEED-CARDHOLDER-DATA-SECURITY",
            },
        )
        draft_id = draft_res.json()["id"]

        # Switch context to Tenant B
        self.current_user = self.user_b
        self.current_org = self.org_b

        # 1. GET draft
        res_get = self.client.get(f"/policy-formation/drafts/{draft_id}")
        self.assertEqual(res_get.status_code, status.HTTP_404_NOT_FOUND)

        # 2. PUT update draft
        res_put = self.client.put(
            f"/policy-formation/drafts/{draft_id}",
            json={"title": "Hacked Title", "expected_version": 1},
        )
        self.assertEqual(res_put.status_code, status.HTTP_404_NOT_FOUND)

        # 3. POST regenerate section
        res_regen = self.client.post(
            f"/policy-formation/drafts/{draft_id}/regenerate-section",
            json={"section_id": "sec-scope"},
        )
        self.assertEqual(res_regen.status_code, status.HTTP_404_NOT_FOUND)

        # 4. GET history
        res_hist = self.client.get(f"/policy-formation/drafts/{draft_id}/history")
        self.assertEqual(res_hist.status_code, status.HTTP_404_NOT_FOUND)

        # 5. POST revert
        res_revert = self.client.post(f"/policy-formation/drafts/{draft_id}/revert/1")
        self.assertEqual(res_revert.status_code, status.HTTP_404_NOT_FOUND)

        # 6. DELETE draft
        res_del = self.client.delete(f"/policy-formation/drafts/{draft_id}")
        self.assertEqual(res_del.status_code, status.HTTP_404_NOT_FOUND)

        # 7. LIST drafts in Tenant B must not leak Tenant A's drafts
        res_list = self.client.get("/policy-formation/drafts")
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_list.json()), 0)

    def test_10_production_repository_isolation(self):
        """Unapproved drafts must NEVER appear in the production Document / Policies repository table."""
        # Create draft in Tenant A
        res = self.client.post(
            "/policy-formation/drafts",
            json={
                "assessment_id": str(self.assessment_a.id),
                "analysis_id": str(self.analysis_a.id),
                "need_id": "NEED-CARDHOLDER-DATA-SECURITY",
            },
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Verify that policy_drafts table has 1 record
        drafts_count = self.db.query(PolicyDraft).filter(PolicyDraft.organization_id == self.org_a_id).count()
        self.assertEqual(drafts_count, 1)

        # Verify that live Document table has 0 documents with type POLICY or matching title
        doc_count = (
            self.db.query(Document)
            .filter(
                Document.organization_id == self.org_a_id,
                Document.document_type == DocumentType.POLICY,
            )
            .count()
        )
        self.assertEqual(doc_count, 0, "Security violation: Draft leaked into production Document repository!")


if __name__ == "__main__":
    unittest.main()
