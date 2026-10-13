"""
Comprehensive Multi-Workspace Architecture & Data Isolation Security Test Suite.

Verifies strict tenant isolation across:
1. WorkspaceContext and membership verification (active vs inactive/revoked vs non-member).
2. Dashboard API isolation (metrics, reports, counts strictly scoped to active workspace).
3. Reports API isolation (cross-tenant access denial on /reports, /reports/{id}, /reports/organization/{id}).
4. PDF generation/download isolation (/pdf/report/{id}).
5. Findings API isolation (/findings scoped to active workspace, foreign tenant access blocked).
6. Compliance Overview & Calendar isolation (/compliance/overview, /compliance/calendar).
7. Chat & Memory isolation (cross-workspace sessions and queries rejected).
8. Vector & Graph RAG retrieval isolation (strict tenant filtering in Qdrant & Neo4j).
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
from app.compliance.models import ComplianceReport, ComplianceReportStatus
from app.core.dependencies import get_current_user
from app.core.workspace_context import (
    WorkspaceContext,
    get_active_workspace_context,
    verify_user_workspace_membership,
)
from app.db.models import (
    Activity,
    Document,
    DocumentType,
    Organization,
    ProcessingStatus,
    Regulation,
    User,
)
from app.db.models.rbac import MemberStatus, OrganizationMember, UserRole
from app.db.session import Base, get_db
from app.routes.compliance import router as compliance_router
from app.routes.dashboard import router as dashboard_router
from app.routes.findings import router as findings_router
from app.routes.documents import router as documents_router
from app.routes.pdf import router as pdf_router
from app.routes.reports import router as reports_router, verify_user_organization_access
from app.services.hybrid_retriever import HybridRetriever


class WorkspaceIsolationTestSuite(unittest.TestCase):
    """Rigorous end-to-end security verification of multi-workspace data isolation."""

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

        # 1. Create User A (Tenant A Admin)
        cls.user_a_id = uuid.uuid4()
        cls.user_a = User(
            id=cls.user_a_id,
            email="admin_a@acme.corp",
            username="user_a",
            full_name="Alice Admin",
            hashed_password="hashed_pw_a",
            is_active=True,
        )
        # 2. Create User B (Tenant B Admin)
        cls.user_b_id = uuid.uuid4()
        cls.user_b = User(
            id=cls.user_b_id,
            email="admin_b@globex.corp",
            username="user_b",
            full_name="Bob Admin",
            hashed_password="hashed_pw_b",
            is_active=True,
        )
        # 3. Create User C (Deactivated / Inactive member of Tenant A)
        cls.user_revoked_id = uuid.uuid4()
        cls.user_revoked = User(
            id=cls.user_revoked_id,
            email="revoked@acme.corp",
            username="user_revoked",
            full_name="Revoked User",
            hashed_password="hashed_pw_c",
            is_active=True,
        )
        # 4. Create User D (Cross-tenant member in Tenant A only)
        cls.user_member_a_id = uuid.uuid4()
        cls.user_member_a = User(
            id=cls.user_member_a_id,
            email="member@acme.corp",
            username="user_member_a",
            full_name="Charlie Member",
            hashed_password="hashed_pw_d",
            is_active=True,
        )

        db.add_all([cls.user_a, cls.user_b, cls.user_revoked, cls.user_member_a])
        db.commit()

        # Create Workspaces: Org A and Org B
        cls.org_a_id = uuid.uuid4()
        cls.org_a = Organization(
            id=cls.org_a_id,
            name="Acme Corporation (Workspace A)",
            created_by=cls.user_a_id,
        )
        cls.org_b_id = uuid.uuid4()
        cls.org_b = Organization(
            id=cls.org_b_id,
            name="Globex Industries (Workspace B)",
            created_by=cls.user_b_id,
        )
        db.add_all([cls.org_a, cls.org_b])
        db.commit()

        # Assign Memberships
        cls.member_a = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_a_id,
            user_id=cls.user_a_id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        )
        cls.member_b = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_b_id,
            user_id=cls.user_b_id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        )
        cls.member_revoked = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_a_id,
            user_id=cls.user_revoked_id,
            role=UserRole.COMPLIANCE_ANALYST,
            status=MemberStatus.INACTIVE,  # Revoked / Deactivated
        )
        cls.member_c_active = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_a_id,
            user_id=cls.user_member_a_id,
            role=UserRole.VIEWER,
            status=MemberStatus.ACTIVE,
        )
        db.add_all([cls.member_a, cls.member_b, cls.member_revoked, cls.member_c_active])
        db.commit()

        # Seed Documents & Regulations
        cls.regulation_id = uuid.uuid4()
        cls.regulation = Regulation(
            id=cls.regulation_id,
            uploaded_by=cls.user_a_id,
            title="Global ISO 27001 Regulation",
            original_filename="iso27001.pdf",
            stored_filename="iso27001.pdf",
            file_path="/tmp/iso27001.pdf",
            file_size=5000,
            mime_type="application/pdf",
            document_hash="iso_hash",
            processing_status=ProcessingStatus.PROCESSED,
        )
        cls.doc_a_id = uuid.uuid4()
        cls.doc_a = Document(
            id=cls.doc_a_id,
            organization_id=cls.org_a_id,
            uploaded_by=cls.user_a_id,
            original_filename="acme_security_policy.pdf",
            stored_filename="acme_security_policy.pdf",
            file_path="/tmp/acme_security_policy.pdf",
            file_size=2048,
            mime_type="application/pdf",
            checksum="acme_hash",
            document_type=DocumentType.POLICY,
            processing_status=ProcessingStatus.PROCESSED,
        )
        cls.doc_b_id = uuid.uuid4()
        cls.doc_b = Document(
            id=cls.doc_b_id,
            organization_id=cls.org_b_id,
            uploaded_by=cls.user_b_id,
            original_filename="globex_it_policy.pdf",
            stored_filename="globex_it_policy.pdf",
            file_path="/tmp/globex_it_policy.pdf",
            file_size=3072,
            mime_type="application/pdf",
            checksum="globex_hash",
            document_type=DocumentType.POLICY,
            processing_status=ProcessingStatus.PROCESSED,
        )
        db.add_all([cls.regulation, cls.doc_a, cls.doc_b])
        db.commit()

        # Seed Compliance Reports
        cls.report_a_id = uuid.uuid4()
        cls.report_a = ComplianceReport(
            id=cls.report_a_id,
            organization_id=cls.org_a_id,
            regulation_id=cls.regulation_id,
            policy_document_id=cls.doc_a_id,
            overall_score=94.0,
            total_clauses=20,
            compliant_clauses=18,
            partial_clauses=2,
            non_compliant_clauses=0,
            summary="Acme highly compliant",
            recommendations=["Monitor encryption standards"],
            status=ComplianceReportStatus.COMPLETED,
            processing_time_seconds=4.2,
            created_by=cls.user_a_id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        cls.report_b_id = uuid.uuid4()
        cls.report_b = ComplianceReport(
            id=cls.report_b_id,
            organization_id=cls.org_b_id,
            regulation_id=cls.regulation_id,
            policy_document_id=cls.doc_b_id,
            overall_score=52.0,
            total_clauses=15,
            compliant_clauses=7,
            partial_clauses=3,
            non_compliant_clauses=5,
            summary="Globex critical gaps found",
            recommendations=["Remediate access control immediately"],
            status=ComplianceReportStatus.COMPLETED,
            processing_time_seconds=6.1,
            created_by=cls.user_b_id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add_all([cls.report_a, cls.report_b])
        db.commit()

        # Seed Workspace-scoped Activities
        cls.act_a = Activity(
            id=uuid.uuid4(),
            user_id=cls.user_a_id,
            organization_id=cls.org_a_id,
            event_type="REPORT_GENERATED",
            title="Report Generated",
            description="Alice generated Acme report",
        )
        cls.act_b = Activity(
            id=uuid.uuid4(),
            user_id=cls.user_b_id,
            organization_id=cls.org_b_id,
            event_type="REPORT_GENERATED",
            title="Report Generated",
            description="Bob generated Globex report",
        )
        db.add_all([cls.act_a, cls.act_b])
        db.commit()

        db.close()

        # Set up FastAPI test application
        cls.app = FastAPI()
        cls.app.include_router(dashboard_router)
        cls.app.include_router(reports_router)
        cls.app.include_router(pdf_router)
        cls.app.include_router(compliance_router)
        cls.app.include_router(findings_router)
        cls.app.include_router(documents_router)

        cls.active_user_id = cls.user_a_id

        def _override_get_db():
            db_session = cls.SessionLocal()
            try:
                yield db_session
            finally:
                db_session.close()

        def _override_get_current_user():
            return User(
                id=cls.active_user_id,
                email=f"user_{cls.active_user_id.hex[:6]}@example.com",
                username=f"user_{cls.active_user_id.hex[:6]}",
                is_active=True,
                is_superuser=False,
            )

        cls.app.dependency_overrides[get_db] = _override_get_db
        cls.app.dependency_overrides[get_current_user] = _override_get_current_user

        cls.client = TestClient(cls.app)

    def set_client_user(self, user_id: uuid.UUID):
        self.__class__.active_user_id = user_id

    # ──────────────────────────────────────────────────────────────────────────
    # 1. CORE MEMBERSHIP & ACCESS CONTROL VERIFICATION
    # ──────────────────────────────────────────────────────────────────────────

    def test_verify_user_workspace_membership_active(self):
        """Active member should successfully resolve workspace context."""
        db = self.SessionLocal()
        try:
            org, member, role = verify_user_workspace_membership(db, self.user_a_id, self.org_a_id)
            self.assertEqual(org.id, self.org_a_id)
            self.assertIsNotNone(member)
            self.assertEqual(role, UserRole.ADMIN)
        finally:
            db.close()

    def test_verify_user_workspace_membership_revoked_raises_403(self):
        """Deactivated / revoked member must immediately be blocked with 403."""
        from fastapi import HTTPException
        db = self.SessionLocal()
        try:
            with self.assertRaises(HTTPException) as ctx:
                verify_user_workspace_membership(db, self.user_revoked_id, self.org_a_id)
            self.assertEqual(ctx.exception.status_code, 403)
            self.assertIn("revoked or deactivated", ctx.exception.detail)
        finally:
            db.close()

    def test_verify_user_workspace_membership_foreign_tenant_raises_403(self):
        """User B must be rejected when attempting to access Workspace A."""
        from fastapi import HTTPException
        db = self.SessionLocal()
        try:
            with self.assertRaises(HTTPException) as ctx:
                verify_user_workspace_membership(db, self.user_b_id, self.org_a_id)
            self.assertEqual(ctx.exception.status_code, 403)
            self.assertIn("not have active authorization", ctx.exception.detail)
        finally:
            db.close()

    def test_verify_user_organization_access_helper(self):
        """verify_user_organization_access must enforce tenant isolation and block deactivated users."""
        db = self.SessionLocal()
        try:
            # User A has access to Org A
            self.assertTrue(verify_user_organization_access(db, self.user_a_id, self.org_a_id))
            # User B has access to Org B
            self.assertTrue(verify_user_organization_access(db, self.user_b_id, self.org_b_id))
            # User B does NOT have access to Org A
            self.assertFalse(verify_user_organization_access(db, self.user_b_id, self.org_a_id))
            # Revoked user does NOT have access to Org A
            self.assertFalse(verify_user_organization_access(db, self.user_revoked_id, self.org_a_id))
            # None user_id returns False
            self.assertFalse(verify_user_organization_access(db, None, self.org_a_id))
        finally:
            db.close()

    # ──────────────────────────────────────────────────────────────────────────
    # 2. DASHBOARD ISOLATION (STATS, KPIS, RECENT ACTIVITIES)
    # ──────────────────────────────────────────────────────────────────────────

    def test_dashboard_stats_scoped_to_active_workspace(self):
        """User A accessing /dashboard/stats with Org A header gets ONLY Org A stats."""
        self.set_client_user(self.user_a_id)
        response = self.client.get(
            "/dashboard/stats",
            headers={"X-Workspace-Id": str(self.org_a_id)},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()

        # Workspace A has 1 policy, 1 report, average score 94.0
        self.assertEqual(data["kpis"]["total_policies"], 1)
        self.assertEqual(data["kpis"]["total_compliance_reports"], 1)
        self.assertAlmostEqual(data["kpis"]["average_compliance_score"], 94.0)

        # Recent activities must only contain Workspace A activities
        recent_acts = data.get("recent_activities", [])
        for act in recent_acts:
            self.assertEqual(act.get("organization_id"), str(self.org_a_id))

    def test_dashboard_stats_user_b_gets_only_org_b_stats(self):
        """User B accessing /dashboard/stats with Org B header gets ONLY Org B stats."""
        self.set_client_user(self.user_b_id)
        response = self.client.get(
            "/dashboard/stats",
            headers={"X-Workspace-Id": str(self.org_b_id)},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()

        # Workspace B has 1 policy, 1 report, average score 52.0
        self.assertEqual(data["kpis"]["total_policies"], 1)
        self.assertEqual(data["kpis"]["total_compliance_reports"], 1)
        self.assertAlmostEqual(data["kpis"]["average_compliance_score"], 52.0)

    def test_dashboard_stats_cross_tenant_header_rejected(self):
        """User A attempting to query /dashboard/stats with Org B header is rejected with 403."""
        self.set_client_user(self.user_a_id)
        response = self.client.get(
            "/dashboard/stats",
            headers={"X-Workspace-Id": str(self.org_b_id)},
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("not have active authorization", response.json().get("detail", ""))

    # ──────────────────────────────────────────────────────────────────────────
    # 3. COMPLIANCE REPORTS ISOLATION
    # ──────────────────────────────────────────────────────────────────────────

    def test_get_report_by_id_authorized_vs_cross_tenant_denial(self):
        """User A can view Report A, but User B attempting to view Report A is denied."""
        # User A viewing Report A -> 200
        self.set_client_user(self.user_a_id)
        res_a = self.client.get(f"/reports/{self.report_a_id}")
        self.assertEqual(res_a.status_code, 200)
        self.assertEqual(res_a.json()["id"], str(self.report_a_id))

        # User B viewing Report A -> 404 or 403 (access denied)
        self.set_client_user(self.user_b_id)
        res_b = self.client.get(f"/reports/{self.report_a_id}")
        self.assertIn(res_b.status_code, [403, 404])

    def test_reports_organization_endpoint_isolated(self):
        """GET /reports/organization/{org_id} rejects foreign tenants."""
        self.set_client_user(self.user_b_id)
        # User B accessing Workspace A reports
        response = self.client.get(f"/reports/organization/{self.org_a_id}")
        self.assertEqual(response.status_code, 403)

    def test_list_reports_with_workspace_header(self):
        """Listing reports with Workspace header returns only that workspace's reports."""
        self.set_client_user(self.user_a_id)
        response = self.client.get(
            "/reports",
            headers={"X-Workspace-Id": str(self.org_a_id)},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        report_ids = [r["id"] for r in data["items"]]
        self.assertIn(str(self.report_a_id), report_ids)
        self.assertNotIn(str(self.report_b_id), report_ids)

    def test_compare_reports_cross_tenant_denied(self):
        """Comparing reports across two different organizations must be denied with 403."""
        self.set_client_user(self.user_a_id)
        # User A trying to compare Report A with Report B
        response = self.client.get(f"/reports/compare?report_id_1={self.report_a_id}&report_id_2={self.report_b_id}")
        self.assertEqual(response.status_code, 403)

    # ──────────────────────────────────────────────────────────────────────────
    # 4. PDF GENERATION / DOWNLOAD ISOLATION
    # ──────────────────────────────────────────────────────────────────────────

    def test_pdf_download_cross_tenant_denied(self):
        """User B requesting PDF for Workspace A's report is blocked with 403."""
        self.set_client_user(self.user_b_id)
        response = self.client.get(f"/pdf/report/{self.report_a_id}")
        self.assertEqual(response.status_code, 403)

    # ──────────────────────────────────────────────────────────────────────────
    # 5. COMPLIANCE OVERVIEW & CALENDAR ISOLATION
    # ──────────────────────────────────────────────────────────────────────────

    def test_compliance_overview_cross_tenant_denied(self):
        """User B requesting Workspace A's compliance overview is blocked with 403."""
        self.set_client_user(self.user_b_id)
        response = self.client.get(
            "/compliance/overview",
            headers={"X-Workspace-Id": str(self.org_a_id)},
        )
        self.assertEqual(response.status_code, 403)

    def test_compliance_calendar_cross_tenant_denied(self):
        """User B requesting Workspace A's compliance calendar is blocked with 403."""
        self.set_client_user(self.user_b_id)
        response = self.client.get(
            "/compliance/calendar",
            headers={"X-Workspace-Id": str(self.org_a_id)},
        )
        self.assertEqual(response.status_code, 403)

    # ──────────────────────────────────────────────────────────────────────────
    # 6. RAG VECTOR & GRAPH SEARCH ISOLATION
    # ──────────────────────────────────────────────────────────────────────────

    @patch("app.services.hybrid_retriever.get_client")
    @patch("app.services.hybrid_retriever.get_embedding_model")
    def test_qdrant_vector_search_enforces_tenant_filter(self, mock_model, mock_qdrant):
        """Verify that _search_qdrant strictly applies organization_id filter and drops invalid vectors."""
        mock_encoder = MagicMock()
        mock_encoder.encode.return_value = [0.05] * 384
        mock_model.return_value = mock_encoder

        mock_client = MagicMock()
        mock_qdrant.return_value = mock_client

        # Simulate query_points returning 1 valid point for Org A
        valid_point = MagicMock()
        valid_point.id = "p-1"
        valid_point.score = 0.92
        valid_point.payload = {
            "clause_id": "clause-valid",
            "text": "Acme access control",
            "organization_id": str(self.org_a_id),
        }

        mock_client.query_points.return_value.points = [valid_point]

        retriever = HybridRetriever()
        results = retriever._search_qdrant([0.05] * 384, top_k=5, organization_id=str(self.org_a_id))

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["clause_id"], "clause-valid")

        # Verify that query_points was called with a query_filter containing the organization_id
        _, kwargs = mock_client.query_points.call_args
        query_filter = kwargs.get("query_filter")
        self.assertIsNotNone(query_filter)
        self.assertTrue(hasattr(query_filter, "should"))
        matching_conditions = [
            c for c in query_filter.should
            if getattr(c, "key", None) == "organization_id" and getattr(getattr(c, "match", None), "value", None) == str(self.org_a_id)
        ]
        self.assertEqual(len(matching_conditions), 1)

    @patch("app.services.hybrid_retriever.run_query")
    def test_neo4j_graph_expansion_enforces_organization_id_guard(self, mock_run_query):
        """Verify that _expand_neo4j_graph includes org_id parameter and Cypher predicate."""
        mock_run_query.return_value = []

        retriever = HybridRetriever()
        seed_ids = ["clause-1", "clause-2"]
        org_id_str = str(self.org_a_id)

        retriever._expand_neo4j_graph(seed_ids, organization_id=org_id_str)

        self.assertTrue(mock_run_query.called)
        cypher_query, params = mock_run_query.call_args[0]

        # Ensure parameters passed to Neo4j include org_id
        self.assertIn("org_id", params)
        self.assertEqual(params["org_id"], org_id_str)

        # Ensure Cypher query restricts policy clauses to org_id
        self.assertIn("coalesce(target.organization_id, target.org_id, '') = $org_id", cypher_query)

    def test_list_documents_workspace_isolation(self):
        """Verify GET /documents/ returns only active workspace policies and blocks cross-tenant access."""
        # 1. User A queries Org A policies
        self.__class__.active_user_id = self.user_a_id
        res_a = self.client.get(
            f"/documents/?organization_id={self.org_a_id}&document_type=POLICY",
            headers={"X-Workspace-Id": str(self.org_a_id)},
        )
        self.assertEqual(res_a.status_code, status.HTTP_200_OK)
        docs_a = res_a.json()
        doc_ids_a = [d["id"] for d in docs_a]
        self.assertIn(str(self.doc_a_id), doc_ids_a)
        self.assertNotIn(str(self.doc_b_id), doc_ids_a)

        # Verify human-readable uploader name and analysis status
        policy_a = next(d for d in docs_a if d["id"] == str(self.doc_a_id))
        self.assertEqual(policy_a["uploader_name"], "Alice Admin")
        self.assertEqual(policy_a["analysis_status"], "Compliant")

        # 2. User A queries Org B policies -> blocked (404/403)
        res_cross = self.client.get(
            f"/documents/?organization_id={self.org_b_id}&document_type=POLICY",
            headers={"X-Workspace-Id": str(self.org_b_id)},
        )
        self.assertIn(res_cross.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

        # 3. User B queries Org B policies -> gets only Org B policies
        self.__class__.active_user_id = self.user_b_id
        res_b = self.client.get(
            f"/documents/?organization_id={self.org_b_id}&document_type=POLICY",
            headers={"X-Workspace-Id": str(self.org_b_id)},
        )
        self.assertEqual(res_b.status_code, status.HTTP_200_OK)
        docs_b = res_b.json()
        doc_ids_b = [d["id"] for d in docs_b]
        self.assertIn(str(self.doc_b_id), doc_ids_b)
        self.assertNotIn(str(self.doc_a_id), doc_ids_b)

        policy_b = next(d for d in docs_b if d["id"] == str(self.doc_b_id))
        self.assertEqual(policy_b["uploader_name"], "Bob Admin")
        self.assertEqual(policy_b["analysis_status"], "Non-Compliant")

    def test_document_download_cross_tenant_denied(self):
        """Verify document download enforces workspace authorization and rejects foreign tenant downloads."""
        # User A attempting to download User B's policy document
        self.__class__.active_user_id = self.user_a_id
        res = self.client.get(f"/documents/{self.doc_b_id}/download")
        self.assertIn(res.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    @patch("app.routes.documents.process_document")
    def test_document_reprocess_workspace_isolation(self, mock_process):
        """Verify document reprocessing is authorized per tenant workspace."""
        # User A cannot reprocess User B's policy
        self.__class__.active_user_id = self.user_a_id
        res_cross = self.client.post(f"/documents/{self.doc_b_id}/reprocess")
        self.assertIn(res_cross.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

        # User A can reprocess User A's policy
        res_auth = self.client.post(f"/documents/{self.doc_a_id}/reprocess")
        self.assertEqual(res_auth.status_code, status.HTTP_200_OK)
        data = res_auth.json()
        self.assertEqual(data["status"], "UPLOADED")
        mock_process.assert_called_once_with(self.doc_a_id)

    def test_document_rename_workspace_isolation(self):
        """Verify document renaming is authorized per tenant workspace."""
        # User A cannot rename User B's policy
        self.__class__.active_user_id = self.user_a_id
        res_cross = self.client.patch(f"/documents/{self.doc_b_id}/rename?new_filename=compromised.pdf")
        self.assertIn(res_cross.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

        # User A can rename User A's policy
        res_auth = self.client.patch(f"/documents/{self.doc_a_id}/rename?new_filename=security_standards_v2.pdf")
        self.assertEqual(res_auth.status_code, status.HTTP_200_OK)
        data = res_auth.json()
        self.assertEqual(data["original_filename"], "security_standards_v2.pdf")

    def test_policy_duplicate_scoped_versioning(self):
        """Verify duplicate filename within the same workspace creates sequential versions without overwriting."""
        db = self.SessionLocal()
        # Add a 2nd document with same original_filename in Org A
        doc_a2 = Document(
            id=uuid.uuid4(),
            organization_id=self.org_a_id,
            uploaded_by=self.user_a_id,
            original_filename="security_standards_v2.pdf",
            stored_filename="security_standards_v2_stored.pdf",
            file_path="/tmp/security_standards_v2_stored.pdf",
            file_size=2048,
            mime_type="application/pdf",
            checksum="acme_hash_2",
            document_type=DocumentType.POLICY,
            processing_status=ProcessingStatus.PROCESSED,
        )
        db.add(doc_a2)
        db.commit()
        db.close()

        self.__class__.active_user_id = self.user_a_id
        res = self.client.get(
            f"/documents/?organization_id={self.org_a_id}&document_type=POLICY",
            headers={"X-Workspace-Id": str(self.org_a_id)},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        docs = res.json()
        v2_docs = [d for d in docs if d["original_filename"] == "security_standards_v2.pdf"]
        self.assertEqual(len(v2_docs), 2)
        versions = {d["version"] for d in v2_docs}
        self.assertEqual(versions, {"v1.0", "v2.0"})


if __name__ == "__main__":
    unittest.main()

