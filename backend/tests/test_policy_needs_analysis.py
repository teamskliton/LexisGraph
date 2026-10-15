"""
Unit and integration tests for Policy Formation Regulatory Discovery & Policy Needs Analysis (Stage 3).
Tests discovery, policy needs generation, policy coverage, decision preservation, and strict workspace isolation.
"""
import uuid
import unittest
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
from app.db.models.policy_formation import OrganizationAssessment, PolicyNeedsAnalysis
from app.core.dependencies import get_current_user
from app.core.workspace_context import WorkspaceContext, get_active_workspace_context
from app.routes.policy_formation import router as policy_formation_router


class PolicyNeedsAnalysisTestSuite(unittest.TestCase):
    """Test suite for Policy Needs Analysis, Regulatory Discovery, and Multi-Tenant Isolation."""

    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

        cls.app = FastAPI()
        cls.app.include_router(policy_formation_router)

        cls.user_a_id = uuid.uuid4()
        cls.org_a_id = uuid.uuid4()
        cls.user_b_id = uuid.uuid4()
        cls.org_b_id = uuid.uuid4()

        cls.user_a = User(
            id=cls.user_a_id,
            email="founder_a@startup.io",
            username="founder_a",
            full_name="Founder Alpha",
            hashed_password="pw",
            is_active=True,
        )
        cls.org_a = Organization(
            id=cls.org_a_id,
            name="AlphaTech Innovations",
            industry="Software & AI",
            created_by=cls.user_a_id,
        )

        cls.user_b = User(
            id=cls.user_b_id,
            email="tenant_b@competitor.io",
            username="tenant_b",
            full_name="Tenant Beta",
            hashed_password="pw",
            is_active=True,
        )
        cls.org_b = Organization(
            id=cls.org_b_id,
            name="Beta Enterprise",
            industry="Retail",
            created_by=cls.user_b_id,
        )

        db = cls.TestingSessionLocal()
        db.add_all([cls.user_a, cls.org_a, cls.user_b, cls.org_b])

        # Add existing policy document to Workspace A
        cls.doc_a = Document(
            id=uuid.uuid4(),
            organization_id=cls.org_a_id,
            uploaded_by=cls.user_a_id,
            original_filename="information_security_policy_v1.pdf",
            stored_filename="information_security_policy_v1.pdf",
            file_path="/tmp/infosec.pdf",
            file_size=2048,
            mime_type="application/pdf",
            checksum="hash123",
            document_type=DocumentType.POLICY,
            processing_status=ProcessingStatus.PROCESSED,
        )
        db.add(cls.doc_a)
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

        def override_workspace_context():
            return WorkspaceContext(
                user=self.current_user,
                organization=self.current_org,
                organization_id=self.current_org.id,
                member=None,
                role=UserRole.ADMIN,
            )

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = override_get_current_user
        self.app.dependency_overrides[get_active_workspace_context] = override_workspace_context
        self.client = TestClient(self.app)

    def tearDown(self):
        self.db.close()
        self.app.dependency_overrides.clear()

    def _create_sample_assessment(self, is_completed: bool = True) -> uuid.UUID:
        """Helper to create and populate an assessment."""
        assessment = OrganizationAssessment(
            id=uuid.uuid4(),
            organization_id=self.org_a.id,
            created_by=self.user_a.id,
            title="AlphaTech Policy Assessment",
            scope_type="ORGANIZATION",
            status="COMPLETED" if is_completed else "DRAFT",
            current_step=6,
            answers={
                "profile": {
                    "organization_name": "AlphaTech Innovations",
                    "org_type": "Startup",
                    "industry": "Software & AI",
                    "employee_count": "11-50",
                },
                "jurisdiction": {
                    "primary_country": "India",
                    "other_countries": ["European Union"],
                    "operating_locations": "Bengaluru, India",
                    "markets_served": "India, EU",
                },
                "activities": {
                    "personal_data": True,
                    "sensitive_data": True,
                    "cloud_services": True,
                    "ai_systems": True,
                    "payments": True,
                    "vendors": True,
                    "physical_facilities": False,
                    "licensed_activities": False,
                    "employment_types": ["Direct full-time", "Contractors"],
                },
                "scope": {
                    "scope_type": "ORGANIZATION",
                },
                "existing_policies": {
                    "has_existing_policies": True,
                    "starting_mode": "build_on_existing",
                    "selected_policy_ids": [str(self.doc_a.id)],
                    "certifications": ["ISO 27001"],
                },
            },
            version=1,
            completed_at=datetime.now(timezone.utc) if is_completed else None,
        )
        self.db.add(assessment)
        self.db.commit()
        return assessment.id

    def test_01_reject_incomplete_assessment(self):
        """Verify calling start analysis on an incomplete (DRAFT) assessment is rejected with HTTP 400."""
        draft_id = self._create_sample_assessment(is_completed=False)

        response = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(draft_id)},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("incomplete assessment", response.json()["detail"].lower())

    def test_02_start_analysis_on_completed_assessment(self):
        """Verify starting analysis on a completed assessment succeeds and populates all sections."""
        assessment_id = self._create_sample_assessment(is_completed=True)

        response = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(assessment_id)},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()

        self.assertEqual(data["status"], "COMPLETED")
        self.assertEqual(data["version"], 1)
        self.assertEqual(data["assessment_id"], str(assessment_id))
        self.assertIn("summary", data)
        self.assertGreater(data["summary"]["total_regulatory_discoveries"], 0)
        self.assertGreater(data["summary"]["total_policy_needs"], 0)

    def test_03_discoveries_provenance_and_evidence(self):
        """Verify regulatory discovery preserves provenance, statutory provisions, and triggers without fabrication."""
        assessment_id = self._create_sample_assessment(is_completed=True)

        response = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(assessment_id)},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        discoveries = response.json()["regulatory_discoveries"]

        discovered_acts = [d["act_name"] for d in discoveries]
        self.assertIn("DPDP Act", discovered_acts)
        self.assertIn("GDPR", discovered_acts)
        self.assertIn("POSH Act", discovered_acts)
        self.assertIn("ISO/IEC 27001", discovered_acts)

        # Inspect DPDP Act discovery evidence
        dpdp_item = next(d for d in discoveries if d["act_name"] == "DPDP Act")
        self.assertIn("Section 4", str(dpdp_item["relevant_provisions"]))
        self.assertIn("India", dpdp_item["jurisdiction"])
        # Truthful provenance: statutory registry entries without uploaded local PDFs are potentially_applicable or requires_verification
        self.assertIn(dpdp_item["evidence_status"], ["potentially_applicable", "requires_verification"])
        self.assertEqual(dpdp_item["source_origin"], "canonical_registry_reference")
        self.assertTrue(len(dpdp_item["trigger_answers"]) > 0)
        self.assertIn("personal data", dpdp_item["relevance_explanation"].lower())

    def test_04_policy_needs_generation(self):
        """Verify concrete policy needs are proposed with correct drivers, owner roles, and review frequencies."""
        assessment_id = self._create_sample_assessment(is_completed=True)

        response = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(assessment_id)},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        policy_needs = response.json()["policy_needs"]

        need_ids = [n["need_id"] for n in policy_needs]
        self.assertIn("need-info-sec", need_ids)
        self.assertIn("need-data-privacy", need_ids)
        self.assertIn("need-code-of-conduct", need_ids)
        self.assertIn("need-ai-governance", need_ids)
        self.assertIn("need-vendor-risk", need_ids)

        # Check AI Governance need (triggered by ai_systems == True)
        ai_need = next(n for n in policy_needs if n["need_id"] == "need-ai-governance")
        self.assertEqual(ai_need["category"], "Emerging Technologies")
        self.assertEqual(ai_need["suggested_priority"], "High")
        self.assertEqual(ai_need["recommended_owner_role"], "Chief Technology Officer / AI Lead")
        self.assertTrue(ai_need["requires_human_confirmation"])

    def test_05_workspace_policy_coverage_evaluation(self):
        """Verify coverage correctly evaluates existing workspace policy and identifies gaps."""
        assessment_id = self._create_sample_assessment(is_completed=True)

        response = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(assessment_id)},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        coverage_findings = response.json()["coverage_findings"]

        # Information Security Policy was in workspace as doc_a, but physical file does not exist on test disk
        info_sec_cov = next(c for c in coverage_findings if c["need_id"] == "need-info-sec")
        # Truthful classification: When file content is unreadable or only title matched, status is Requires review (never falsely Covered)
        self.assertEqual(info_sec_cov["coverage_status"], "Requires review")
        self.assertEqual(info_sec_cov["linked_document_id"], str(self.doc_a.id))
        self.assertIn("review", info_sec_cov["reason"].lower())

        # Data Privacy Policy was NOT uploaded
        privacy_cov = next(c for c in coverage_findings if c["need_id"] == "need-data-privacy")
        self.assertEqual(privacy_cov["coverage_status"], "Not found")
        self.assertIn("Limitation", privacy_cov["limitations_note"])

    def test_06_update_user_decisions(self):
        """Verify user review decisions, status markings, notes, and priority overrides can be persisted."""
        assessment_id = self._create_sample_assessment(is_completed=True)
        init_res = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(assessment_id)},
        )
        analysis_id = init_res.json()["id"]

        # Update decisions
        decisions_payload = {
            "decisions": {
                "need-info-sec": {
                    "decision": "ACCEPTED",
                    "priority_override": "Urgent",
                    "notes": "Reviewed existing policy against ISO 27001; confirmed adequate.",
                },
                "need-ai-governance": {
                    "decision": "DEFERRED",
                    "priority_override": "Low",
                    "notes": "Defer until Q3 AI pilot launch.",
                },
            }
        }
        update_res = self.client.put(
            f"/policy-formation/analyses/{analysis_id}/decisions",
            json=decisions_payload,
        )
        self.assertEqual(update_res.status_code, status.HTTP_200_OK)
        updated_data = update_res.json()

        decisions = updated_data["user_decisions"]
        self.assertEqual(decisions["need-info-sec"]["decision"], "ACCEPTED")
        self.assertEqual(decisions["need-info-sec"]["priority_override"], "Urgent")
        self.assertEqual(decisions["need-ai-governance"]["decision"], "DEFERRED")
        self.assertEqual(decisions["need-ai-governance"]["notes"], "Defer until Q3 AI pilot launch.")

    def test_07_rerun_preserves_user_decisions(self):
        """Verify rerunning an analysis preserves previous human review decisions and increments version."""
        assessment_id = self._create_sample_assessment(is_completed=True)
        init_res = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(assessment_id)},
        )
        analysis_id = init_res.json()["id"]

        # Save human review decision
        self.client.put(
            f"/policy-formation/analyses/{analysis_id}/decisions",
            json={
                "decisions": {
                    "need-data-privacy": {
                        "decision": "ACCEPTED",
                        "priority_override": "Urgent",
                        "notes": "Legal counsel confirmed mandatory under DPDP.",
                    }
                }
            },
        )

        # Trigger rerun
        rerun_res = self.client.post(f"/policy-formation/analyses/{analysis_id}/rerun")
        self.assertEqual(rerun_res.status_code, status.HTTP_200_OK)
        rerun_data = rerun_res.json()

        self.assertEqual(rerun_data["version"], 2)
        decisions = rerun_data["user_decisions"]
        self.assertIn("need-data-privacy", decisions)
        self.assertEqual(decisions["need-data-privacy"]["decision"], "ACCEPTED")
        self.assertEqual(decisions["need-data-privacy"]["priority_override"], "Urgent")
        self.assertEqual(decisions["need-data-privacy"]["notes"], "Legal counsel confirmed mandatory under DPDP.")

    def test_08_revisit_analysis_avoids_duplicates(self):
        """Verify starting analysis for an assessment that already has one returns existing record without duplicating."""
        assessment_id = self._create_sample_assessment(is_completed=True)

        res1 = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(assessment_id)},
        )
        id1 = res1.json()["id"]

        res2 = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(assessment_id)},
        )
        id2 = res2.json()["id"]

        self.assertEqual(id1, id2)

    def test_09_strict_workspace_isolation_denies_cross_tenant(self):
        """SECURITY TEST: Verify User B in Workspace B cannot access or modify Workspace A's analysis."""
        assessment_id = self._create_sample_assessment(is_completed=True)
        res = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(assessment_id)},
        )
        analysis_id = res.json()["id"]

        # Switch context to Tenant B
        self.current_user = self.user_b
        self.current_org = self.org_b

        # 1. Attempt GET by ID
        get_res = self.client.get(f"/policy-formation/analyses/{analysis_id}")
        self.assertEqual(get_res.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Attempt GET by Assessment
        by_ass_res = self.client.get(f"/policy-formation/analyses/assessment/{assessment_id}")
        self.assertEqual(by_ass_res.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Attempt PUT decisions
        put_res = self.client.put(
            f"/policy-formation/analyses/{analysis_id}/decisions",
            json={"decisions": {}},
        )
        self.assertEqual(put_res.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Attempt POST rerun
        rerun_res = self.client.post(f"/policy-formation/analyses/{analysis_id}/rerun")
        self.assertEqual(rerun_res.status_code, status.HTTP_403_FORBIDDEN)

        # 5. Attempt DELETE
        del_res = self.client.delete(f"/policy-formation/analyses/{analysis_id}")
        self.assertEqual(del_res.status_code, status.HTTP_403_FORBIDDEN)

    def test_10_missing_regulatory_evidence_handling(self):
        """Verify when an assessment has minimal activities, system handles missing evidence gracefully."""
        minimal_assessment = OrganizationAssessment(
            id=uuid.uuid4(),
            organization_id=self.org_a.id,
            created_by=self.user_a.id,
            title="Minimal Organization Assessment",
            scope_type="ORGANIZATION",
            status="COMPLETED",
            current_step=6,
            answers={
                "profile": {"organization_name": "Silent Holding Co", "org_type": "Other", "employee_count": "0"},
                "jurisdiction": {"primary_country": "Other", "other_countries": []},
                "activities": {
                    "personal_data": False,
                    "sensitive_data": False,
                    "cloud_services": False,
                    "ai_systems": False,
                    "payments": False,
                    "vendors": False,
                    "physical_facilities": False,
                    "licensed_activities": False,
                },
                "scope": {"scope_type": "ORGANIZATION"},
                "existing_policies": {"has_existing_policies": False},
            },
            version=1,
            completed_at=datetime.now(timezone.utc),
        )
        self.db.add(minimal_assessment)
        self.db.commit()

        res = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(minimal_assessment.id)},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        # Core governance needs still provided without fabricated regulations
        self.assertGreater(data["summary"]["total_policy_needs"], 0)
        # All discoveries must have valid evidence status and no fabricated citations
        for d in data["regulatory_discoveries"]:
            self.assertIn(d["evidence_status"], ["verified_source_requirement", "potentially_applicable", "requires_verification", "not_enough_evidence", "not_assessed"])
            self.assertIsNotNone(d["title"])

    def test_11_statutory_accuracy_and_commencement_warnings(self):
        """Verify statutory entries reflect accurate instrument types, thresholds, and commencement notices."""
        assessment_id = self._create_sample_assessment(is_completed=True)

        res = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(assessment_id)},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        discoveries = res.json()["regulatory_discoveries"]

        # 1. DPDP Act 2023: must reflect Central Government operational rules pending notification
        dpdp = next(d for d in discoveries if d["act_name"] == "DPDP Act")
        self.assertIn("Statutory Act", dpdp["legal_instrument_type"])
        self.assertIn("Section 1(2)", dpdp["commencement_status"])
        self.assertIn("pending notification", dpdp["commencement_status"].lower())
        self.assertIn("rules", dpdp["commencement_status"].lower())
        self.assertEqual(dpdp["source_origin"], "canonical_registry_reference")

        # 2. POSH Act 2013: must reflect 10+ worker threshold for Internal Committee vs Local Committee
        posh = next(d for d in discoveries if d["act_name"] == "POSH Act")
        self.assertIn("Statutory Act", posh["legal_instrument_type"])
        self.assertIn("10 or more workers", posh["applicability_thresholds"])
        self.assertIn("Section 4", str(posh["relevant_provisions"]))

        # 3. ISO/IEC 27001:2022: must be labeled as Voluntary Standard, NOT a parliamentary Act
        iso = next(d for d in discoveries if "ISO" in d["act_name"])
        self.assertEqual(iso["legal_instrument_type"], "Voluntary International Management Standard")
        self.assertIn("Voluntary", iso["applicability_thresholds"])

    def test_12_unrelated_policy_does_not_produce_false_coverage(self):
        """Verify unrelated policy titles (e.g. Travel/Expense) do NOT produce false coverage for privacy or security."""
        # Add an unrelated document to Workspace A
        unrelated_doc = Document(
            id=uuid.uuid4(),
            organization_id=self.org_a_id,
            uploaded_by=self.user_a_id,
            original_filename="travel_expense_reimbursement_policy.pdf",
            stored_filename="travel_expense_reimbursement_policy.pdf",
            file_path="/tmp/expense.pdf",
            file_size=1024,
            mime_type="application/pdf",
            checksum="expense_hash",
            document_type=DocumentType.POLICY,
            processing_status=ProcessingStatus.PROCESSED,
        )
        self.db.add(unrelated_doc)
        self.db.commit()

        assessment_id = self._create_sample_assessment(is_completed=True)
        res = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(assessment_id)},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        coverage_findings = res.json()["coverage_findings"]

        # Privacy policy must remain 'Not found', not falsely matched by expense policy
        privacy_cov = next(c for c in coverage_findings if c["need_id"] == "need-data-privacy")
        self.assertEqual(privacy_cov["coverage_status"], "Not found")
        self.assertNotEqual(privacy_cov.get("linked_document_id"), str(unrelated_doc.id))

    def test_13_optimistic_concurrency_conflict_409(self):
        """Verify submitting decisions with a mismatched expected_version raises HTTP 409 Conflict."""
        assessment_id = self._create_sample_assessment(is_completed=True)
        init_res = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(assessment_id)},
        )
        analysis_id = init_res.json()["id"]

        # Attempt to save decisions with mismatched expected_version (e.g. version 99)
        conflict_res = self.client.put(
            f"/policy-formation/analyses/{analysis_id}/decisions",
            json={
                "decisions": {
                    "need-data-privacy": {
                        "decision": "ACCEPTED",
                        "priority_override": "Urgent",
                    }
                },
                "expected_version": 99,
            },
        )
        self.assertEqual(conflict_res.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("modified", conflict_res.json()["detail"].lower())

    def test_14_version_history_snapshot_recovery(self):
        """Verify that rerunning an analysis preserves historical snapshots recoverable via the history API."""
        assessment_id = self._create_sample_assessment(is_completed=True)
        init_res = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(assessment_id)},
        )
        analysis_id = init_res.json()["id"]
        self.assertEqual(init_res.json()["version"], 1)

        # Update decisions on v1
        self.client.put(
            f"/policy-formation/analyses/{analysis_id}/decisions",
            json={
                "decisions": {
                    "need-data-privacy": {
                        "decision": "ACCEPTED",
                        "notes": "Reviewed in v1",
                    }
                },
                "expected_version": 1,
            },
        )

        # Trigger Rerun to produce v2
        rerun_res = self.client.post(f"/policy-formation/analyses/{analysis_id}/rerun")
        self.assertEqual(rerun_res.status_code, status.HTTP_200_OK)
        v2_data = rerun_res.json()
        self.assertEqual(v2_data["version"], 2)

        # Verify history API returns v1 snapshot
        history_res = self.client.get(f"/policy-formation/analyses/{analysis_id}/history")
        self.assertEqual(history_res.status_code, status.HTTP_200_OK)
        history_list = history_res.json()
        self.assertEqual(len(history_list), 1)
        self.assertEqual(history_list[0]["version"], 1)
        self.assertIn("archived_at", history_list[0])

        # Verify specific version endpoint retrieves exact v1 state
        v1_res = self.client.get(f"/policy-formation/analyses/{analysis_id}/history/1")
        self.assertEqual(v1_res.status_code, status.HTTP_200_OK)
        v1_snapshot = v1_res.json()
        self.assertEqual(v1_snapshot["version"], 1)
        self.assertEqual(v1_snapshot["user_decisions"]["need-data-privacy"]["notes"], "Reviewed in v1")

    def test_15_cascade_deletion_no_orphans(self):
        """Verify deleting an assessment cascades and removes associated PolicyNeedsAnalysis without orphans."""
        assessment_id = self._create_sample_assessment(is_completed=True)
        init_res = self.client.post(
            "/policy-formation/analyses",
            json={"assessment_id": str(assessment_id)},
        )
        analysis_id = init_res.json()["id"]

        # Ensure record exists in DB
        analysis_obj = self.db.query(PolicyNeedsAnalysis).filter_by(id=uuid.UUID(analysis_id)).first()
        self.assertIsNotNone(analysis_obj)

        # Delete assessment
        del_res = self.client.delete(f"/policy-formation/assessments/{assessment_id}")
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)

        # Verify analysis record was also deleted
        self.db.expire_all()
        orphaned_analysis = self.db.query(PolicyNeedsAnalysis).filter_by(id=uuid.UUID(analysis_id)).first()
        self.assertIsNone(orphaned_analysis)

    def test_16_completed_assessment_immutability(self):
        """Verify completed assessment answers and current step remain immutable."""
        assessment_id = self._create_sample_assessment(is_completed=True)

        # Attempt to modify a completed assessment
        update_res = self.client.put(
            f"/policy-formation/assessments/{assessment_id}",
            json={
                "title": "Tampered Assessment Title",
                "current_step": 1,
            },
        )
        self.assertEqual(update_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("completed", update_res.json()["detail"].lower())
