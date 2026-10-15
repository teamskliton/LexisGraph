"""
Unit and integration tests for Policy Formation Organization Assessment (Stage 2).
Tests CRUD, autosave, completion validation, and strict cross-workspace data isolation.
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
from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus
from app.db.models.document import Document, DocumentType, ProcessingStatus
from app.db.models.policy_formation import OrganizationAssessment
from app.core.dependencies import get_current_user
from app.core.workspace_context import WorkspaceContext, get_active_workspace_context
from app.routes.policy_formation import router as policy_formation_router


class PolicyFormationAssessmentTestSuite(unittest.TestCase):
    """Test suite for Organization Assessment and multi-tenant isolation."""

    @classmethod
    def setUpClass(cls):
        # In-memory SQLite for fast, isolated testing
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
            email="user_a@example.com",
            username="user_a",
            full_name="User A",
            hashed_password="pw",
            is_active=True,
        )
        cls.org_a = Organization(
            id=cls.org_a_id,
            name="Workspace A Corp",
            industry="Technology",
            created_by=cls.user_a_id,
        )

        cls.user_b = User(
            id=cls.user_b_id,
            email="user_b@example.com",
            username="user_b",
            full_name="User B",
            hashed_password="pw",
            is_active=True,
        )
        cls.org_b = Organization(
            id=cls.org_b_id,
            name="Workspace B LLC",
            industry="Healthcare",
            created_by=cls.user_b_id,
        )

        db = cls.TestingSessionLocal()
        db.add_all([cls.user_a, cls.org_a, cls.user_b, cls.org_b])
        cls.doc_a = Document(
            id=uuid.uuid4(),
            organization_id=cls.org_a_id,
            uploaded_by=cls.user_a_id,
            original_filename="sec_policy.pdf",
            stored_filename="sec_policy.pdf",
            file_path="/tmp/sec.pdf",
            file_size=1024,
            mime_type="application/pdf",
            checksum="abc",
            document_type=DocumentType.POLICY,
            processing_status=ProcessingStatus.PROCESSED,
        )
        db.add(cls.doc_a)
        db.commit()
        db.close()

    def setUp(self):
        self.db = self.TestingSessionLocal()
        # Fresh instances bound to current session
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

    def test_01_create_assessment_session(self):
        """Test creating a new assessment session."""
        response = self.client.post(
            "/policy-formation/assessments",
            json={"title": "Custom Assessment 1", "resume_if_exists": False},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertEqual(data["title"], "Custom Assessment 1")
        self.assertEqual(data["organization_id"], str(self.org_a.id))
        self.assertEqual(data["status"], "DRAFT")
        self.assertEqual(data["current_step"], 1)
        self.assertIn("profile", data["answers"])
        self.assertEqual(data["answers"]["profile"]["organization_name"], "Workspace A Corp")

    def test_02_autosave_answers_and_step(self):
        """Test autosaving updated step and answers."""
        # Create draft
        resp = self.client.post("/policy-formation/assessments", json={"resume_if_exists": False})
        assessment_id = resp.json()["id"]

        # Update Step 1 & Step 2 answers
        update_payload = {
            "current_step": 2,
            "answers": {
                "profile": {
                    "organization_name": "Updated Org Name",
                    "org_type": "Startup",
                    "industry": "FinTech",
                    "employee_count": "11-50",
                },
                "jurisdiction": {
                    "primary_country": "United States",
                    "state_province": "California",
                    "other_countries": ["United Kingdom", "Germany"],
                },
            },
        }
        update_resp = self.client.put(f"/policy-formation/assessments/{assessment_id}", json=update_payload)
        self.assertEqual(update_resp.status_code, status.HTTP_200_OK)
        data = update_resp.json()
        self.assertEqual(data["current_step"], 2)
        self.assertEqual(data["answers"]["profile"]["organization_name"], "Updated Org Name")
        self.assertEqual(data["answers"]["jurisdiction"]["primary_country"], "United States")
        self.assertEqual(len(data["answers"]["jurisdiction"]["other_countries"]), 2)

    def test_03_resume_latest_draft(self):
        """Test resuming existing incomplete assessment."""
        # Create draft
        self.client.post("/policy-formation/assessments", json={"resume_if_exists": False})

        # Fetch latest
        latest_resp = self.client.get("/policy-formation/assessments/latest")
        self.assertEqual(latest_resp.status_code, status.HTTP_200_OK)
        latest_data = latest_resp.json()
        self.assertIsNotNone(latest_data)
        self.assertEqual(latest_data["status"], "DRAFT")

    def test_04_complete_assessment_validation(self):
        """Test completing assessment with validation."""
        # Create draft
        resp = self.client.post("/policy-formation/assessments", json={"resume_if_exists": False})
        assessment_id = resp.json()["id"]

        # If org name is empty, completion must fail
        self.client.put(
            f"/policy-formation/assessments/{assessment_id}",
            json={"answers": {"profile": {"organization_name": ""}}},
        )
        fail_resp = self.client.post(f"/policy-formation/assessments/{assessment_id}/complete")
        self.assertEqual(fail_resp.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)

        # Fix org name and complete
        self.client.put(
            f"/policy-formation/assessments/{assessment_id}",
            json={"answers": {"profile": {"organization_name": "Valid Org"}}},
        )
        complete_resp = self.client.post(f"/policy-formation/assessments/{assessment_id}/complete")
        self.assertEqual(complete_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(complete_resp.json()["status"], "COMPLETED")
        self.assertIsNotNone(complete_resp.json()["completed_at"])

    def test_05_workspace_isolation_cross_tenant_denied(self):
        """
        SECURITY TEST:
        Ensure User B in Workspace B CANNOT read, update, complete, or delete
        Workspace A's assessment.
        """
        # Create assessment in Workspace A
        resp = self.client.post("/policy-formation/assessments", json={"resume_if_exists": False})
        assessment_a_id = resp.json()["id"]

        # Switch context to Workspace B
        self.current_user = self.user_b
        self.current_org = self.org_b

        # Attempt to read Workspace A's assessment
        read_attempt = self.client.get(f"/policy-formation/assessments/{assessment_a_id}")
        self.assertEqual(read_attempt.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt to update Workspace A's assessment
        update_attempt = self.client.put(
            f"/policy-formation/assessments/{assessment_a_id}",
            json={"title": "Hacked Title"},
        )
        self.assertEqual(update_attempt.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt to complete Workspace A's assessment
        complete_attempt = self.client.post(f"/policy-formation/assessments/{assessment_a_id}/complete")
        self.assertEqual(complete_attempt.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt to delete Workspace A's assessment
        delete_attempt = self.client.delete(f"/policy-formation/assessments/{assessment_a_id}")
        self.assertEqual(delete_attempt.status_code, status.HTTP_403_FORBIDDEN)

    def test_06_available_policies_scoped_to_workspace(self):
        """Verify only policies belonging to the active workspace are returned."""
        # Workspace A query
        resp_a = self.client.get("/policy-formation/assessments/policies/available")
        self.assertEqual(resp_a.status_code, status.HTTP_200_OK)
        policies_a = resp_a.json()
        self.assertEqual(len(policies_a), 1)
        self.assertEqual(policies_a[0]["title"], "sec_policy.pdf")

        # Switch context to Workspace B
        self.current_user = self.user_b
        self.current_org = self.org_b
        resp_b = self.client.get("/policy-formation/assessments/policies/available")
        self.assertEqual(resp_b.status_code, status.HTTP_200_OK)
        policies_b = resp_b.json()
        # Workspace B has 0 policies, shouldn't leak Workspace A's policy
        self.assertEqual(len(policies_b), 0)


if __name__ == "__main__":
    unittest.main()
