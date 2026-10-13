"""
Automated Security Test Suite: Application-Wide Workspace & Multi-Tenant Data Isolation.

Comprehensive verification covering:
- Documents & Clauses (Viewer, detail, Qdrant/PostgreSQL boundaries)
- Document Uploads & Storage scoping
- Data Export (User data, global data)
- Regulations & Organization Links (RBAC & multi-tenancy)
- Knowledge Graph & Traversal (/graph-view, builds, history)
- Findings Lifecycle & Access Control (Read, patch, mutate)
- Remediation Plans & Evidence
- Compliance Jobs & WebSocket/SSE Streams
- Dashboard KPIs & Activity Scoping
- Notifications & Unread Counts
- Retrieval & Debug Administration Gateways
"""
from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from fastapi import FastAPI, status
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.compliance.models import ComplianceJob, ComplianceJobStatus, ComplianceReport, ComplianceReportStatus, ReportFinding
from app.core.dependencies import get_current_user, get_optional_current_user
from app.core.workspace_context import WorkspaceContext, get_active_workspace_context
from app.db.models import (
    Document,
    DocumentType,
    Notification,
    Organization,
    ProcessingStatus,
    Regulation,
    User,
)
from app.db.models.rbac import MemberStatus, OrganizationMember, UserRole
from app.db.models.regulation import OrganizationRegulation
from app.db.models.remediation import FindingRemediation
from app.db.session import Base, get_db

from app.routes.dashboard import router as dashboard_router
from app.routes.debug import router as debug_router
from app.routes.documents import router as documents_router
from app.routes.export import router as export_router
from app.routes.fetch import router as fetch_router
from app.routes.findings import router as findings_router
from app.routes.graph import router as graph_router
from app.routes.jobs import router as jobs_router
from app.routes.notifications import router as notifications_router
from app.routes.regulations import router as regulations_router
from app.routes.remediations import router as remediations_router
from app.routes.retrieval import router as retrieval_router
from app.routes.upload import router as upload_router


class ApplicationWideDataIsolationTestSuite(unittest.TestCase):
    """Zero-trust multi-tenancy verification across all LexisGraph modules."""

    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine, expire_on_commit=False)

        db = cls.SessionLocal()

        # 1. Users
        cls.user_a = User(
            id=uuid.uuid4(),
            email="owner_a@acme-corp.com",
            username="owner_a",
            full_name="Owner Tenant A",
            hashed_password="pw_a",
            is_active=True,
        )
        cls.user_b = User(
            id=uuid.uuid4(),
            email="owner_b@globex-corp.com",
            username="owner_b",
            full_name="Owner Tenant B",
            hashed_password="pw_b",
            is_active=True,
        )
        cls.user_c = User(
            id=uuid.uuid4(),
            email="viewer_a@acme-corp.com",
            username="viewer_a",
            full_name="Viewer Tenant A",
            hashed_password="pw_c",
            is_active=True,
        )
        cls.user_external = User(
            id=uuid.uuid4(),
            email="outsider@unknown.com",
            username="outsider",
            full_name="Outsider No Org",
            hashed_password="pw_out",
            is_active=True,
        )
        db.add_all([cls.user_a, cls.user_b, cls.user_c, cls.user_external])
        db.commit()

        # 2. Organizations
        cls.org_a = Organization(
            id=uuid.uuid4(),
            name="Acme Corp Workspace A",
            created_by=cls.user_a.id,
        )
        cls.org_b = Organization(
            id=uuid.uuid4(),
            name="Globex Corp Workspace B",
            created_by=cls.user_b.id,
        )
        db.add_all([cls.org_a, cls.org_b])
        db.commit()

        # 3. Organization Memberships
        cls.member_a = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_a.id,
            user_id=cls.user_a.id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        )
        cls.member_b = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_b.id,
            user_id=cls.user_b.id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        )
        cls.member_c = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_a.id,
            user_id=cls.user_c.id,
            role=UserRole.VIEWER,
            status=MemberStatus.ACTIVE,
        )
        db.add_all([cls.member_a, cls.member_b, cls.member_c])
        db.commit()

        # 4. Global Regulation
        cls.global_reg = Regulation(
            id=uuid.uuid4(),
            title="Digital Personal Data Protection Act 2023",
            act_name="DPDP Act",
            version="1.0",
            document_hash="dpdp_hash_12345",
            original_filename="dpdp_act.pdf",
            stored_filename="dpdp_act_stored.pdf",
            file_path="/data/regulations/dpdp_act.pdf",
            file_size=1024,
            mime_type="application/pdf",
            processing_status="COMPLETED",
            uploaded_by=cls.user_a.id,
        )
        db.add(cls.global_reg)
        db.commit()

        # 5. Documents
        cls.doc_a = Document(
            id=uuid.uuid4(),
            original_filename="Acme_Internal_Security_Policy.pdf",
            stored_filename="acme_policy_stored.pdf",
            file_path="/data/acme/policy.pdf",
            file_size=2048,
            mime_type="application/pdf",
            checksum="acme_hash_secret_a",
            document_type=DocumentType.POLICY,
            organization_id=cls.org_a.id,
            uploaded_by=cls.user_a.id,
            processing_status=ProcessingStatus.PROCESSED,
            progress=100,
        )
        cls.doc_b = Document(
            id=uuid.uuid4(),
            original_filename="Globex_Trade_Secret_Policy.pdf",
            stored_filename="globex_policy_stored.pdf",
            file_path="/data/globex/policy.pdf",
            file_size=2048,
            mime_type="application/pdf",
            checksum="globex_hash_secret_b",
            document_type=DocumentType.POLICY,
            organization_id=cls.org_b.id,
            uploaded_by=cls.user_b.id,
            processing_status=ProcessingStatus.PROCESSED,
            progress=100,
        )
        db.add_all([cls.doc_a, cls.doc_b])
        db.commit()

        # 6. Reports & Findings
        cls.report_a = ComplianceReport(
            id=uuid.uuid4(),
            policy_document_id=cls.doc_a.id,
            regulation_id=cls.global_reg.id,
            organization_id=cls.org_a.id,
            overall_score=88.5,
            risk_level="LOW",
            created_by=cls.user_a.id,
            status=ComplianceReportStatus.COMPLETED,
            is_deleted=False,
            summary="Acme compliance evaluation",
        )
        cls.report_b = ComplianceReport(
            id=uuid.uuid4(),
            policy_document_id=cls.doc_b.id,
            regulation_id=cls.global_reg.id,
            organization_id=cls.org_b.id,
            overall_score=45.0,
            risk_level="CRITICAL",
            created_by=cls.user_b.id,
            status=ComplianceReportStatus.COMPLETED,
            is_deleted=False,
            summary="Globex compliance evaluation",
        )
        db.add_all([cls.report_a, cls.report_b])
        db.commit()

        cls.finding_a = ReportFinding(
            id=uuid.uuid4(),
            report_id=cls.report_a.id,
            policy_clause_id=f"pol:{cls.doc_a.id}_clause_1",
            regulation_clause_id="dpdp_clause_4",
            severity="MEDIUM",
            status="NON_COMPLIANT",
            lifecycle_status="OPEN",
            confidence=0.85,
            reasoning="Acme retention period exceeds standard.",
            recommendation="Shorten retention cycle.",
            citation="Acme security retention rule clause 1",
        )
        cls.finding_b = ReportFinding(
            id=uuid.uuid4(),
            report_id=cls.report_b.id,
            policy_clause_id=f"pol:{cls.doc_b.id}_clause_1",
            regulation_clause_id="dpdp_clause_8",
            severity="CRITICAL",
            status="NON_COMPLIANT",
            lifecycle_status="OPEN",
            confidence=0.95,
            reasoning="Globex lacks at-rest encryption.",
            recommendation="Implement AES-256.",
            citation="Globex data encryption clause 1",
        )
        db.add_all([cls.finding_a, cls.finding_b])
        db.commit()

        # 7. Remediation
        cls.remediation_a = FindingRemediation(
            id=uuid.uuid4(),
            finding_id=cls.finding_a.id,
            organization_id=cls.org_a.id,
            title="Remediate Acme Retention",
            description="Update data destruction timetable",
            status="IN_PROGRESS",
            priority="MEDIUM",
            created_by=cls.user_a.id,
        )
        db.add(cls.remediation_a)
        db.commit()

        # 8. Compliance Jobs
        cls.job_a = ComplianceJob(
            id=uuid.uuid4(),
            policy_document_id=cls.doc_a.id,
            regulation_id=cls.global_reg.id,
            organization_id=cls.org_a.id,
            created_by=cls.user_a.id,
            status=ComplianceJobStatus.RUNNING,
            progress=65,
            current_step="Evaluating clauses",
        )
        cls.job_b = ComplianceJob(
            id=uuid.uuid4(),
            policy_document_id=cls.doc_b.id,
            regulation_id=cls.global_reg.id,
            organization_id=cls.org_b.id,
            created_by=cls.user_b.id,
            status=ComplianceJobStatus.RUNNING,
            progress=40,
            current_step="Extracting sections",
        )
        db.add_all([cls.job_a, cls.job_b])
        db.commit()

        # 9. Notification
        cls.notif_a = Notification(
            id=uuid.uuid4(),
            user_id=cls.user_a.id,
            organization_id=cls.org_a.id,
            type="FINDING_NEW",
            title="New finding created",
            message=f"Finding #{cls.finding_a.id} detected",
            is_read=False,
            finding_id=cls.finding_a.id,
        )
        cls.notif_b = Notification(
            id=uuid.uuid4(),
            user_id=cls.user_b.id,
            organization_id=cls.org_b.id,
            type="FINDING_NEW",
            title="Globex critical gap",
            message=f"Finding #{cls.finding_b.id} detected",
            is_read=False,
            finding_id=cls.finding_b.id,
        )
        db.add_all([cls.notif_a, cls.notif_b])
        db.commit()
        db.close()

        # Setup FastAPI Test App with all routers
        cls.app = FastAPI()
        cls.app.include_router(documents_router)
        cls.app.include_router(upload_router, prefix="/api/v1")
        cls.app.include_router(export_router)
        cls.app.include_router(regulations_router)
        cls.app.include_router(graph_router)
        cls.app.include_router(findings_router)
        cls.app.include_router(remediations_router)
        cls.app.include_router(jobs_router)
        cls.app.include_router(dashboard_router)
        cls.app.include_router(notifications_router)
        cls.app.include_router(retrieval_router)
        cls.app.include_router(debug_router)
        cls.app.include_router(fetch_router)

        cls.active_user = None

        def override_get_db():
            session = cls.SessionLocal()
            try:
                yield session
            finally:
                session.close()

        def override_get_current_user():
            if cls.active_user is None:
                from fastapi import HTTPException
                raise HTTPException(status_code=401, detail="Not authenticated")
            return cls.active_user

        def override_get_optional_current_user():
            return cls.active_user

        def override_active_workspace_context():
            if cls.active_user is None:
                from fastapi import HTTPException
                raise HTTPException(status_code=401, detail="Not authenticated")
            # Return Org A context for User A & User C, Org B context for User B
            target_org = cls.org_b if cls.active_user.id == cls.user_b.id else cls.org_a
            user_role = (
                UserRole.VIEWER if cls.active_user.id == cls.user_c.id else UserRole.ADMIN
            )
            return WorkspaceContext(
                user=cls.active_user,
                organization=target_org,
                organization_id=target_org.id,
                member=None,
                role=user_role,
            )

        cls.app.dependency_overrides[get_db] = override_get_db
        cls.app.dependency_overrides[get_current_user] = override_get_current_user
        cls.app.dependency_overrides[get_optional_current_user] = override_get_optional_current_user
        cls.app.dependency_overrides[get_active_workspace_context] = override_active_workspace_context

        cls.client = TestClient(cls.app)

    # ---------------------------------------------------------------------------
    # 1. Document Viewer & Clause Isolation
    # ---------------------------------------------------------------------------

    def test_document_viewer_cross_tenant_denial(self):
        """User B from Tenant B cannot view Tenant A's document in document viewer."""
        type(self).active_user = self.user_b
        res = self.client.get(f"/documents/{self.doc_a.id}/viewer")
        self.assertIn(res.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_document_viewer_unauthenticated_denial(self):
        """Unauthenticated caller cannot view Document A."""
        type(self).active_user = None
        res = self.client.get(f"/documents/{self.doc_a.id}/viewer")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_document_viewer_legitimate_tenant_access(self):
        """User A from Tenant A can view Document A."""
        type(self).active_user = self.user_a
        res = self.client.get(f"/documents/{self.doc_a.id}/viewer")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["title"], self.doc_a.original_filename)

    def test_clause_detail_cross_tenant_denial(self):
        """User B cannot view private policy clause from Tenant A."""
        type(self).active_user = self.user_b
        clause_id = f"pol:{self.doc_a.id}_clause_1"
        res = self.client.get(f"/documents/clauses/{clause_id}")
        self.assertIn(res.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    # ---------------------------------------------------------------------------
    # 2. Upload & Storage Isolation
    # ---------------------------------------------------------------------------

    def test_upload_unauthenticated_denial(self):
        """Unauthenticated POST /api/v1/upload must be rejected with 401."""
        type(self).active_user = None
        files = {"file": ("test.pdf", b"%PDF-dummy-content", "application/pdf")}
        res = self.client.post("/api/v1/upload", files=files)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_upload_cross_tenant_workspace_injection_denial(self):
        """User B cannot upload documents targeting Tenant A's workspace."""
        type(self).active_user = self.user_b
        files = {"file": ("malicious.pdf", b"%PDF-dummy", "application/pdf")}
        headers = {"X-Workspace-Id": str(self.org_a.id)}
        res = self.client.post("/api/v1/upload", files=files, headers=headers)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ---------------------------------------------------------------------------
    # 3. Export Isolation
    # ---------------------------------------------------------------------------

    def test_export_user_data_unauthenticated_denial(self):
        """Unauthenticated GET /export/user is rejected with 401."""
        type(self).active_user = None
        res = self.client.get("/export/user")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_export_user_data_tenant_isolation(self):
        """User A export contains Tenant A policy and ZERO Tenant B policies."""
        type(self).active_user = self.user_a
        headers = {"X-Workspace-Id": str(self.org_a.id)}
        res = self.client.get("/export/user", headers=headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        doc_names = [d["original_filename"] for d in data.get("documents", [])]
        self.assertIn("Acme_Internal_Security_Policy.pdf", doc_names)
        self.assertNotIn("Globex_Trade_Secret_Policy.pdf", doc_names)

        # Conversely, User B export contains Tenant B and ZERO Tenant A policies
        type(self).active_user = self.user_b
        headers_b = {"X-Workspace-Id": str(self.org_b.id)}
        res_b = self.client.get("/export/user", headers=headers_b)
        self.assertEqual(res_b.status_code, status.HTTP_200_OK)
        data_b = res_b.json()
        doc_names_b = [d["original_filename"] for d in data_b.get("documents", [])]
        self.assertIn("Globex_Trade_Secret_Policy.pdf", doc_names_b)
        self.assertNotIn("Acme_Internal_Security_Policy.pdf", doc_names_b)

    # ---------------------------------------------------------------------------
    # 4. Regulations Link/Unlink RBAC & Isolation
    # ---------------------------------------------------------------------------

    def test_regulations_link_cross_tenant_denial(self):
        """User B cannot link a regulation to Tenant A's organization."""
        type(self).active_user = self.user_b
        payload = {
            "organization_id": str(self.org_a.id),
            "regulation_id": str(self.global_reg.id),
        }
        res = self.client.post("/regulations/link", json=payload)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_regulations_unlink_cross_tenant_denial(self):
        """User B cannot unlink a regulation from Tenant A's organization."""
        type(self).active_user = self.user_b
        payload = {
            "organization_id": str(self.org_a.id),
            "regulation_id": str(self.global_reg.id),
        }
        res = self.client.post("/regulations/unlink", json=payload)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_regulations_link_viewer_role_denial(self):
        """Viewer (User C) in Tenant A cannot link regulations (requires analyst or admin)."""
        type(self).active_user = self.user_c
        payload = {
            "organization_id": str(self.org_a.id),
            "regulation_id": str(self.global_reg.id),
        }
        res = self.client.post("/regulations/link", json=payload)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_regulations_link_admin_success(self):
        """Admin (User A) in Tenant A can link regulations."""
        type(self).active_user = self.user_a
        payload = {
            "organization_id": str(self.org_a.id),
            "regulation_id": str(self.global_reg.id),
        }
        res = self.client.post("/regulations/link", json=payload)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["message"], "Regulation linked successfully")

    def test_regulations_list_cross_tenant_filter_denial(self):
        """User B cannot query regulations scoped to Tenant A."""
        type(self).active_user = self.user_b
        res = self.client.get(f"/regulations?organization_id={self.org_a.id}")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ---------------------------------------------------------------------------
    # 5. Knowledge Graph View & Build Isolation
    # ---------------------------------------------------------------------------

    def test_graph_view_unauthenticated_denial(self):
        """Unauthenticated caller cannot query /graph-view."""
        type(self).active_user = None
        res = self.client.get("/graph-view")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_graph_view_cross_tenant_org_denial(self):
        """User B cannot query Tenant A's graph snapshot."""
        type(self).active_user = self.user_b
        res = self.client.get(f"/graph-view?organization_id={self.org_a.id}")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_graph_view_cross_tenant_doc_denial(self):
        """User B cannot probe Tenant A's document via /graph-view?document_id=..."""
        type(self).active_user = self.user_b
        res = self.client.get(f"/graph-view?document_id={self.doc_a.id}")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_graph_build_unauthenticated_and_role_denial(self):
        """Unauthenticated and Viewer users cannot trigger /build-graph."""
        type(self).active_user = None
        res = self.client.post("/build-graph")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        type(self).active_user = self.user_c  # Viewer
        res_viewer = self.client.post("/build-graph")
        self.assertEqual(res_viewer.status_code, status.HTTP_403_FORBIDDEN)

    # ---------------------------------------------------------------------------
    # 6. Findings Access & Mutation Isolation
    # ---------------------------------------------------------------------------

    def test_finding_unauthenticated_denial(self):
        """Unauthenticated GET /findings/{id} returns 401."""
        type(self).active_user = None
        res = self.client.get(f"/findings/{self.finding_a.id}")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_finding_cross_tenant_access_denial(self):
        """User B cannot retrieve Tenant A's finding."""
        type(self).active_user = self.user_b
        res = self.client.get(f"/findings/{self.finding_a.id}")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_finding_cross_tenant_mutation_denial(self):
        """User B cannot update Tenant A's finding."""
        type(self).active_user = self.user_b
        patch_data = {"severity": "LOW"}
        res = self.client.patch(f"/findings/{self.finding_a.id}", json=patch_data)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_finding_viewer_mutation_denial(self):
        """Viewer (User C) in Tenant A cannot mutate finding severity."""
        type(self).active_user = self.user_c
        patch_data = {"severity": "LOW"}
        res = self.client.patch(f"/findings/{self.finding_a.id}", json=patch_data)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_finding_legitimate_tenant_access(self):
        """User A can retrieve Tenant A's finding."""
        type(self).active_user = self.user_a
        res = self.client.get(f"/findings/{self.finding_a.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["severity"], "MEDIUM")

    # ---------------------------------------------------------------------------
    # 7. Remediation Isolation
    # ---------------------------------------------------------------------------

    def test_remediation_cross_tenant_access_denial(self):
        """User B cannot retrieve Tenant A's remediation."""
        type(self).active_user = self.user_b
        res = self.client.get(f"/findings/{self.finding_a.id}/remediation")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_remediation_viewer_creation_denial(self):
        """Viewer (User C) cannot create remediation record."""
        type(self).active_user = self.user_c
        res = self.client.post(
            f"/findings/{self.finding_a.id}/remediation",
            json={"title": "Viewer attempt"},
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_remediation_legitimate_access(self):
        """User A can view Tenant A's remediation."""
        type(self).active_user = self.user_a
        res = self.client.get(f"/findings/{self.finding_a.id}/remediation")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["title"], "Remediate Acme Retention")

    # ---------------------------------------------------------------------------
    # 8. Jobs Status & Stream Isolation
    # ---------------------------------------------------------------------------

    def test_job_status_cross_tenant_denial(self):
        """User B cannot get status of Job A belonging to Tenant A."""
        type(self).active_user = self.user_b
        res = self.client.get(f"/jobs/{self.job_a.id}")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_job_cancel_cross_tenant_denial(self):
        """User B cannot cancel Job A."""
        type(self).active_user = self.user_b
        res = self.client.delete(f"/jobs/{self.job_a.id}")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_job_legitimate_status_access(self):
        """User A can get status of Job A."""
        type(self).active_user = self.user_a
        res = self.client.get(f"/jobs/{self.job_a.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["progress"], 65)

    # ---------------------------------------------------------------------------
    # 9. Dashboard KPIs & Activity Scoping
    # ---------------------------------------------------------------------------

    def test_dashboard_stats_tenant_isolation(self):
        """Dashboard stats for Tenant A reflect only Tenant A's documents and reports."""
        type(self).active_user = self.user_a
        res = self.client.get("/dashboard/stats")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        kpis = res.json()["kpis"]
        self.assertEqual(kpis["total_policies"], 1)
        self.assertEqual(kpis["total_compliance_reports"], 1)
        self.assertEqual(kpis["average_compliance_score"], 88.5)

        # Tenant B dashboard
        type(self).active_user = self.user_b
        res_b = self.client.get("/dashboard/stats")
        self.assertEqual(res_b.status_code, status.HTTP_200_OK)
        kpis_b = res_b.json()["kpis"]
        self.assertEqual(kpis_b["total_policies"], 1)
        self.assertEqual(kpis_b["total_compliance_reports"], 1)
        self.assertEqual(kpis_b["average_compliance_score"], 45.0)

    # ---------------------------------------------------------------------------
    # 10. Notifications Isolation
    # ---------------------------------------------------------------------------

    def test_notifications_cross_tenant_isolation(self):
        """User A sees only User A notifications, User B sees only User B notifications."""
        type(self).active_user = self.user_a
        res = self.client.get("/notifications")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        titles = [n["title"] for n in res.json()]
        self.assertIn("New finding created", titles)
        self.assertNotIn("Globex critical gap", titles)

        type(self).active_user = self.user_b
        res_b = self.client.get("/notifications")
        self.assertEqual(res_b.status_code, status.HTTP_200_OK)
        titles_b = [n["title"] for n in res_b.json()]
        self.assertIn("Globex critical gap", titles_b)
        self.assertNotIn("New finding created", titles_b)

    def test_notification_cross_user_mark_read_denial(self):
        """User B cannot mark User A's notification as read."""
        type(self).active_user = self.user_b
        res = self.client.patch(f"/notifications/{self.notif_a.id}/read")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ---------------------------------------------------------------------------
    # 11. Retrieval & Debug Gateway Gatekeeping
    # ---------------------------------------------------------------------------

    def test_retrieval_unauthenticated_and_cross_tenant_denial(self):
        """Unauthenticated and cross-tenant retrieval queries are rejected."""
        type(self).active_user = None
        res = self.client.get("/retrieve?query=confidential")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        type(self).active_user = self.user_b
        res_cross = self.client.get(f"/retrieve?query=confidential&organization_id={self.org_a.id}")
        self.assertEqual(res_cross.status_code, status.HTTP_403_FORBIDDEN)

    def test_debug_endpoints_gatekeeping(self):
        """Debug user documents and neo4j state require superadmin privileges."""
        type(self).active_user = None
        res_anon = self.client.get("/debug/user-documents")
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)

        type(self).active_user = self.user_c  # Non-admin viewer
        res_viewer = self.client.get("/debug/user-documents")
        self.assertEqual(res_viewer.status_code, status.HTTP_403_FORBIDDEN)

    def test_fetch_scrapers_gatekeeping(self):
        """External scraper triggers require authentication and analyst/admin role."""
        type(self).active_user = None
        res_anon = self.client.get("/fetch")
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)

        type(self).active_user = self.user_c  # Viewer role
        res_viewer = self.client.get("/fetch")
        self.assertEqual(res_viewer.status_code, status.HTTP_403_FORBIDDEN)


if __name__ == "__main__":
    unittest.main()
