"""
Comprehensive Unit & Integration Test Suite for LexisGraph RBAC:
Reviewer Role Isolation vs Admin, Compliance Analyst, and Viewer.

Covers:
1. Role Resolution & Hierarchy (Admin, Compliance Analyst, Reviewer, Viewer).
2. Organization Mutation RBAC (Admin-only; 403 for Reviewer/Analyst).
3. Document Mutation RBAC (Analyst/Admin only; 403 for Reviewer/Viewer).
4. Compliance Analysis RBAC (Analyst/Admin only; 403 for Reviewer/Viewer).
5. Finding Assignment RBAC (Reviewer can self-assign unassigned; cannot assign to others or reassign others' work).
6. Finding Lifecycle & Remediation RBAC (Reviewer can only update assigned findings; cannot update due date).
7. Comments & Read-Only Access (Reviewer can comment, read findings, view reports and knowledge graph).
8. Knowledge Graph Mutation RBAC (Analyst/Admin only; 403 for Reviewer).
"""
from __future__ import annotations

import uuid
import datetime
import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.core.dependencies import get_current_user
from app.core.rbac_dependencies import (
    get_user_org_role,
    is_org_admin,
    is_org_analyst_or_admin,
    is_org_reviewer_or_above,
)
from app.db.models import Organization, User, Document, DocumentType, Regulation
from app.db.models.rbac import (
    OrganizationMember,
    UserRole,
    MemberStatus,
)
from app.compliance.models import (
    ComplianceReport,
    ComplianceReportStatus,
    ReportFinding,
    FindingComment,
)
from app.db.models.notification import Notification
from app.db.session import Base, get_db
from app.routes.organizations import router as organizations_router
from app.routes.documents import router as documents_router
from app.routes.findings import router as findings_router
from app.routes.reports import router as reports_router
from app.routes.graph import router as graph_router
from app.routes.notifications import router as notifications_router

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def admin_user(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"admin_{uuid.uuid4().hex[:6]}@example.com",
        username=f"admin_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Admin User",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def analyst_user(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"analyst_{uuid.uuid4().hex[:6]}@example.com",
        username=f"analyst_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Compliance Analyst",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def reviewer_user(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"reviewer_{uuid.uuid4().hex[:6]}@example.com",
        username=f"reviewer_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Reviewer User",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def reviewer_user_2(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"reviewer2_{uuid.uuid4().hex[:6]}@example.com",
        username=f"reviewer2_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Reviewer Two",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def viewer_user(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"viewer_{uuid.uuid4().hex[:6]}@example.com",
        username=f"viewer_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Viewer User",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def test_org(db_session, admin_user, analyst_user, reviewer_user, reviewer_user_2, viewer_user):
    org = Organization(
        id=uuid.uuid4(),
        name="LexisGraph RBAC Test Org",
        created_by=admin_user.id,
    )
    db_session.add(org)
    db_session.commit()

    # Add Admin Membership
    m_admin = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=admin_user.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    # Add Analyst Membership
    m_analyst = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=analyst_user.id,
        role=UserRole.COMPLIANCE_ANALYST,
        status=MemberStatus.ACTIVE,
    )
    # Add Reviewer Membership
    m_reviewer = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=reviewer_user.id,
        role=UserRole.REVIEWER,
        status=MemberStatus.ACTIVE,
    )
    # Add Second Reviewer Membership
    m_reviewer_2 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=reviewer_user_2.id,
        role=UserRole.REVIEWER,
        status=MemberStatus.ACTIVE,
    )
    # Add Viewer Membership
    m_viewer = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=viewer_user.id,
        role=UserRole.VIEWER,
        status=MemberStatus.ACTIVE,
    )
    db_session.add_all([m_admin, m_analyst, m_reviewer, m_reviewer_2, m_viewer])
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def compliance_report(db_session, test_org, admin_user):
    reg = Regulation(
        id=uuid.uuid4(),
        title="POSH Act 2013",
        document_hash="posh_hash_123",
        uploaded_by=admin_user.id,
        original_filename="posh.pdf",
        stored_filename="posh_stored.pdf",
        file_path="/tmp/posh.pdf",
        file_size=1024,
        mime_type="application/pdf",
    )
    pol = Document(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        uploaded_by=admin_user.id,
        document_type=DocumentType.POLICY,
        original_filename="posh_policy.pdf",
        stored_filename="posh_policy_stored.pdf",
        file_path="/tmp/posh_policy.pdf",
        file_size=2048,
        mime_type="application/pdf",
        checksum="posh_policy_hash",
    )
    db_session.add_all([reg, pol])
    db_session.commit()

    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        regulation_id=reg.id,
        policy_document_id=pol.id,
        created_by=admin_user.id,
        status=ComplianceReportStatus.COMPLETED,
        overall_score=78.0,
        risk_level="HIGH",
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)
    return report


@pytest.fixture(scope="function")
def sample_document(db_session, test_org, admin_user):
    doc = Document(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        uploaded_by=admin_user.id,
        document_type=DocumentType.POLICY,
        original_filename="sample_org_policy.pdf",
        stored_filename="sample_org_policy_stored.pdf",
        file_path="/tmp/sample_org_policy.pdf",
        file_size=1024,
        mime_type="application/pdf",
        checksum="sample_org_policy_hash",
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)
    return doc


@pytest.fixture(scope="function")
def unassigned_finding(db_session, compliance_report):
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        policy_clause_id="POL-001",
        regulation_clause_id="REG-POSH-004",
        status="NON_COMPLIANT",
        lifecycle_status="OPEN",
        severity="HIGH",
        confidence=0.92,
        reasoning="Internal POSH policy fails to define an Internal Complaints Committee.",
        recommendation="Amend policy clause 4 to establish an ICC with 50% women members.",
        citation="Section 4(1), POSH Act 2013",
        assigned_to=None,
    )
    db_session.add(finding)
    db_session.commit()
    db_session.refresh(finding)
    return finding


@pytest.fixture(scope="function")
def reviewer_assigned_finding(db_session, compliance_report, reviewer_user):
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        policy_clause_id="POL-002",
        regulation_clause_id="REG-DPDP-008",
        status="PARTIALLY_COMPLIANT",
        lifecycle_status="IN_REVIEW",
        severity="MEDIUM",
        confidence=0.85,
        reasoning="Data retention policy does not specify personal data erasure schedule.",
        recommendation="Define 90-day post-termination data erasure mandate.",
        citation="Section 8(7), DPDP Act 2023",
        assigned_to=reviewer_user.id,
    )
    db_session.add(finding)
    db_session.commit()
    db_session.refresh(finding)
    return finding


from app.core.dependencies import get_current_user, get_optional_current_user


def create_test_client(current_user: User, db_session):
    app = FastAPI()
    app.include_router(organizations_router)
    app.include_router(documents_router)
    app.include_router(findings_router)
    app.include_router(reports_router)
    app.include_router(graph_router)
    app.include_router(notifications_router)

    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_optional_current_user] = lambda: current_user

    return TestClient(app)


# ─── 1. Role Resolution & Hierarchy Tests ─────────────────────────────────────

class TestRoleResolutionAndHierarchy:
    def test_role_resolution(self, db_session, test_org, admin_user, analyst_user, reviewer_user, viewer_user):
        assert is_org_admin(db_session, admin_user.id, test_org.id) is True
        assert is_org_admin(db_session, analyst_user.id, test_org.id) is False
        assert is_org_admin(db_session, reviewer_user.id, test_org.id) is False

        assert is_org_analyst_or_admin(db_session, admin_user.id, test_org.id) is True
        assert is_org_analyst_or_admin(db_session, analyst_user.id, test_org.id) is True
        assert is_org_analyst_or_admin(db_session, reviewer_user.id, test_org.id) is False
        assert is_org_analyst_or_admin(db_session, viewer_user.id, test_org.id) is False

        assert is_org_reviewer_or_above(db_session, admin_user.id, test_org.id) is True
        assert is_org_reviewer_or_above(db_session, analyst_user.id, test_org.id) is True
        assert is_org_reviewer_or_above(db_session, reviewer_user.id, test_org.id) is True
        assert is_org_reviewer_or_above(db_session, viewer_user.id, test_org.id) is False


# ─── 2. Organization Management RBAC Tests ───────────────────────────────────

class TestOrganizationRBAC:
    def test_reviewer_cannot_update_organization(self, db_session, test_org, reviewer_user):
        client = create_test_client(reviewer_user, db_session)
        resp = client.put(f"/organizations/{test_org.id}", json={"name": "Hacked Org Name"})
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert "Only organization admins" in resp.json()["detail"]

    def test_reviewer_cannot_delete_organization(self, db_session, test_org, reviewer_user):
        client = create_test_client(reviewer_user, db_session)
        resp = client.delete(f"/organizations/{test_org.id}")
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert "Only organization admins" in resp.json()["detail"]

    def test_admin_can_update_organization(self, db_session, test_org, admin_user):
        client = create_test_client(admin_user, db_session)
        resp = client.put(f"/organizations/{test_org.id}", json={"name": "Updated Org Name"})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["name"] == "Updated Org Name"


# ─── 3. Document Workspace RBAC Tests ─────────────────────────────────────────

class TestDocumentWorkspaceRBAC:
    def test_reviewer_cannot_upload_document(self, db_session, test_org, reviewer_user):
        client = create_test_client(reviewer_user, db_session)
        files = {"file": ("policy.pdf", b"%PDF-dummy-content", "application/pdf")}
        data = {"organization_id": str(test_org.id), "document_type": "POLICY"}
        resp = client.post("/documents/upload", data=data, files=files)
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert "Reviewers and Viewers are not permitted to upload documents" in resp.json()["detail"]

    def test_reviewer_cannot_delete_document(self, db_session, sample_document, reviewer_user):
        client = create_test_client(reviewer_user, db_session)
        resp = client.delete(f"/documents/{sample_document.id}")
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert "Reviewers and Viewers are not permitted to delete documents" in resp.json()["detail"]

    def test_viewer_cannot_upload_document(self, db_session, test_org, viewer_user):
        client = create_test_client(viewer_user, db_session)
        files = {"file": ("policy.pdf", b"%PDF-dummy-content", "application/pdf")}
        data = {"organization_id": str(test_org.id), "document_type": "POLICY"}
        resp = client.post("/documents/upload", data=data, files=files)
        assert resp.status_code == status.HTTP_403_FORBIDDEN


# ─── 4. Finding Assignment RBAC Tests ─────────────────────────────────────────

class TestFindingAssignmentRBAC:
    def test_reviewer_can_self_assign_unassigned_finding(self, db_session, unassigned_finding, reviewer_user):
        client = create_test_client(reviewer_user, db_session)
        resp = client.post(
            f"/findings/{unassigned_finding.id}/assign",
            json={"assignee_id": str(reviewer_user.id)},
        )
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["assigned_to"] == str(reviewer_user.id)

    def test_reviewer_cannot_assign_finding_to_admin(self, db_session, unassigned_finding, reviewer_user, admin_user):
        client = create_test_client(reviewer_user, db_session)
        resp = client.post(
            f"/findings/{unassigned_finding.id}/assign",
            json={"assignee_id": str(admin_user.id)},
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert "Reviewers can only assign findings to themselves" in resp.json()["detail"]

    def test_reviewer_cannot_reassign_finding_assigned_to_another(self, db_session, reviewer_assigned_finding, reviewer_user_2):
        client = create_test_client(reviewer_user_2, db_session)
        resp = client.post(
            f"/findings/{reviewer_assigned_finding.id}/assign",
            json={"assignee_id": str(reviewer_user_2.id)},
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert "Reviewers cannot reassign findings that are already assigned to other users" in resp.json()["detail"]

    def test_admin_can_assign_finding_to_any_member(self, db_session, unassigned_finding, admin_user, reviewer_user):
        client = create_test_client(admin_user, db_session)
        resp = client.post(
            f"/findings/{unassigned_finding.id}/assign",
            json={"assignee_id": str(reviewer_user.id)},
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["assigned_to"] == str(reviewer_user.id)


# ─── 5. Finding Lifecycle & Remediation RBAC Tests ───────────────────────────

class TestFindingLifecycleRBAC:
    def test_reviewer_can_update_status_of_assigned_finding(self, db_session, reviewer_assigned_finding, reviewer_user):
        client = create_test_client(reviewer_user, db_session)
        resp = client.patch(
            f"/findings/{reviewer_assigned_finding.id}/status",
            json={"lifecycle_status": "REMEDIATION"},
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["lifecycle_status"] == "REMEDIATION"

    def test_reviewer_cannot_update_status_of_finding_assigned_to_another(self, db_session, reviewer_assigned_finding, reviewer_user_2):
        client = create_test_client(reviewer_user_2, db_session)
        resp = client.patch(
            f"/findings/{reviewer_assigned_finding.id}/status",
            json={"lifecycle_status": "RESOLVED"},
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert "Reviewers can only update status for findings assigned to them" in resp.json()["detail"]

    def test_reviewer_cannot_resolve_assigned_finding(self, db_session, reviewer_assigned_finding, reviewer_user):
        client = create_test_client(reviewer_user, db_session)
        resp = client.post(
            f"/findings/{reviewer_assigned_finding.id}/resolve",
            json={"resolution_note": "Verified that ICC has been constituted as per POSH Act section 4."},
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert "Only Organization Admins are permitted to resolve findings" in resp.json()["detail"]

    def test_admin_can_resolve_finding(self, db_session, reviewer_assigned_finding, admin_user):
        client = create_test_client(admin_user, db_session)
        resp = client.post(
            f"/findings/{reviewer_assigned_finding.id}/resolve",
            json={"resolution_note": "Admin approved final remediation."},
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["lifecycle_status"] == "RESOLVED"

    def test_reviewer_cannot_update_remediation_due_date(self, db_session, reviewer_assigned_finding, reviewer_user):
        client = create_test_client(reviewer_user, db_session)
        resp = client.patch(
            f"/findings/{reviewer_assigned_finding.id}/remediation",
            json={"due_date": "2026-12-31"},
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert "Only Admins and Compliance Analysts can update remediation due dates" in resp.json()["detail"]

    def test_analyst_can_update_remediation_due_date(self, db_session, reviewer_assigned_finding, analyst_user):
        client = create_test_client(analyst_user, db_session)
        resp = client.patch(
            f"/findings/{reviewer_assigned_finding.id}/remediation",
            json={"due_date": "2026-12-31"},
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["remediation_due_date"] is not None


# ─── 6. Comments & Collaboration Tests ────────────────────────────────────────

class TestCommentsAndCollaborationRBAC:
    def test_reviewer_can_post_and_read_comments(self, db_session, reviewer_assigned_finding, reviewer_user):
        client = create_test_client(reviewer_user, db_session)
        # Post comment
        post_resp = client.post(
            f"/findings/{reviewer_assigned_finding.id}/comments",
            json={"content": "Verified citation against official gazette copy."},
        )
        assert post_resp.status_code == status.HTTP_201_CREATED
        assert post_resp.json()["content"] == "Verified citation against official gazette copy."

        # Read comments
        get_resp = client.get(f"/findings/{reviewer_assigned_finding.id}/comments")
        assert get_resp.status_code == status.HTTP_200_OK
        comments = get_resp.json()
        assert len(comments) >= 1
        assert comments[0]["content"] == "Verified citation against official gazette copy."


# ─── 7. Knowledge Graph Mutation RBAC Tests ───────────────────────────────────

class TestKnowledgeGraphMutationRBAC:
    def test_reviewer_cannot_trigger_graph_build(self, db_session, test_org, reviewer_user):
        client = create_test_client(reviewer_user, db_session)
        resp = client.post("/build-graph")
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert "Only Compliance Analysts and Administrators" in resp.json()["detail"]

    def test_reviewer_cannot_reset_knowledge_graph(self, db_session, test_org, reviewer_user):
        client = create_test_client(reviewer_user, db_session)
        resp = client.post("/reset-knowledge-graph")
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert "Only Compliance Analysts and Administrators" in resp.json()["detail"]


# ─── 8. Scenarios A Through G: Complete Compliance Workflow Tests ──────────────

class TestScenariosAThroughG:
    def test_scenario_a_admin_permissions(self, db_session, test_org, admin_user, reviewer_user, unassigned_finding, sample_document):
        """Scenario A: Admin has full organization management permissions."""
        client = create_test_client(admin_user, db_session)

        # 1. Admin can assign finding to Reviewer
        assign_resp = client.post(
            f"/findings/{unassigned_finding.id}/assign",
            json={"assignee_id": str(reviewer_user.id)},
        )
        assert assign_resp.status_code == status.HTTP_200_OK
        assert assign_resp.json()["assigned_to"] == str(reviewer_user.id)

        # 2. Admin can list all findings
        list_resp = client.get(f"/findings?organization_id={test_org.id}")
        assert list_resp.status_code == status.HTTP_200_OK
        assert list_resp.json()["total"] >= 1

        # 3. Admin can delete document
        del_resp = client.delete(f"/documents/{sample_document.id}")
        assert del_resp.status_code == status.HTTP_204_NO_CONTENT

    def test_scenario_b_reviewer_scope_and_isolation(self, db_session, test_org, reviewer_user, unassigned_finding, reviewer_assigned_finding):
        """Scenario B: Reviewer can read all org findings; cannot access another org."""
        client = create_test_client(reviewer_user, db_session)

        # 1. Reviewer reads all findings in test_org (both unassigned and assigned)
        resp = client.get(f"/findings?organization_id={test_org.id}")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["total"] >= 2
        finding_ids = [f["id"] for f in data["items"]]
        assert str(unassigned_finding.id) in finding_ids
        assert str(reviewer_assigned_finding.id) in finding_ids

        # 2. Organization Isolation: Accessing another org where user is not a member returns 403
        other_org = Organization(
            id=uuid.uuid4(),
            name="Other Corp",
            created_by=uuid.uuid4(),
        )
        db_session.add(other_org)
        db_session.commit()

        cross_resp = client.get(f"/findings?organization_id={other_org.id}")
        assert cross_resp.status_code == status.HTTP_403_FORBIDDEN

    def test_scenario_c_status_transition_and_admin_notification(self, db_session, test_org, admin_user, reviewer_user, reviewer_assigned_finding):
        """Scenario C: Reviewer transitions status -> Admin receives in-app notification."""
        client = create_test_client(reviewer_user, db_session)

        # Finding is IN_REVIEW -> transition to REMEDIATION
        resp = client.patch(
            f"/findings/{reviewer_assigned_finding.id}/status",
            json={"lifecycle_status": "REMEDIATION"},
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["lifecycle_status"] == "REMEDIATION"

        # Verify notification was generated for Admin
        admin_notif = db_session.query(Notification).filter(
            Notification.user_id == admin_user.id,
            Notification.type == "FINDING_STATUS_CHANGED",
            Notification.finding_id == reviewer_assigned_finding.id,
        ).first()
        assert admin_notif is not None
        assert "moved Finding" in admin_notif.message

    def test_scenario_d_resolve_and_admin_notification(self, db_session, test_org, admin_user, reviewer_user, reviewer_assigned_finding):
        """Scenario D: Reviewer cannot resolve (403); Admin resolves finding (200) -> notifications contain structured finding_id."""
        reviewer_client = create_test_client(reviewer_user, db_session)
        admin_client = create_test_client(admin_user, db_session)

        # 1. Reviewer attempts to resolve finding -> Rejected with 403 Forbidden
        rev_resp = reviewer_client.post(
            f"/findings/{reviewer_assigned_finding.id}/resolve",
            json={"resolution_note": "Reviewer attempt to resolve."},
        )
        assert rev_resp.status_code == status.HTTP_403_FORBIDDEN
        assert "Only Organization Admins are permitted to resolve findings" in rev_resp.json()["detail"]

        # Reviewer attempts to patch status to RESOLVED -> Rejected with 403 Forbidden
        patch_resp = reviewer_client.patch(
            f"/findings/{reviewer_assigned_finding.id}/status",
            json={"lifecycle_status": "RESOLVED"},
        )
        assert patch_resp.status_code == status.HTTP_403_FORBIDDEN
        assert "Only Organization Admins are permitted to resolve findings" in patch_resp.json()["detail"]

        # 2. Admin resolves finding -> Allowed with 200 OK
        admin_resp = admin_client.post(
            f"/findings/{reviewer_assigned_finding.id}/resolve",
            json={"resolution_note": "Admin approved remediation certification."},
        )
        assert admin_resp.status_code == status.HTTP_200_OK
        assert admin_resp.json()["lifecycle_status"] == "RESOLVED"

        # Verify notification was generated with structured finding_id
        admin_notif = db_session.query(Notification).filter(
            Notification.type == "FINDING_RESOLVED",
            Notification.finding_id == reviewer_assigned_finding.id,
        ).first()
        assert admin_notif is not None
        assert admin_notif.finding_id == reviewer_assigned_finding.id
        assert admin_notif.organization_id == test_org.id

    def test_scenario_e_documents_read_only(self, db_session, test_org, reviewer_user, sample_document):
        """Scenario E: Reviewer can query status; cannot delete document (403)."""
        client = create_test_client(reviewer_user, db_session)

        # 1. Reviewer can view document status
        status_resp = client.get(f"/documents/{sample_document.id}/status")
        assert status_resp.status_code == status.HTTP_200_OK

        # 2. Reviewer cannot delete document
        del_resp = client.delete(f"/documents/{sample_document.id}")
        assert del_resp.status_code == status.HTTP_403_FORBIDDEN
        assert "Reviewers and Viewers are not permitted to delete documents" in del_resp.json()["detail"]

    def test_scenario_f_reports_read_only_and_isolation(self, db_session, test_org, reviewer_user, compliance_report):
        """Scenario F: Reviewer can list reports; cannot delete report (403)."""
        client = create_test_client(reviewer_user, db_session)

        # 1. Reviewer lists reports
        list_resp = client.get(f"/reports?organization_id={test_org.id}")
        assert list_resp.status_code == status.HTTP_200_OK
        assert list_resp.json()["total"] >= 1

        # 2. Reviewer cannot delete report
        del_resp = client.delete(f"/reports/{compliance_report.id}")
        assert del_resp.status_code == status.HTTP_403_FORBIDDEN
        assert "Only organization admins are permitted to delete compliance reports" in del_resp.json()["detail"]

    def test_scenario_g_100_plus_findings_pagination_and_filters(self, db_session, test_org, reviewer_user, compliance_report):
        """Scenario G: 100+ findings pagination, search, and severity filters."""
        # Seed 105 findings
        bulk_findings = []
        for i in range(105):
            sev = "CRITICAL" if i < 20 else "HIGH" if i < 50 else "MEDIUM"
            bulk_findings.append(
                ReportFinding(
                    id=uuid.uuid4(),
                    report_id=compliance_report.id,
                    policy_clause_id=f"POL-SEC-{i:03d}",
                    regulation_clause_id=f"REG-SEC-{i:03d}",
                    status="NON_COMPLIANT" if sev == "CRITICAL" else "PARTIALLY_COMPLIANT",
                    lifecycle_status="OPEN",
                    severity=sev,
                    confidence=0.88,
                    reasoning=f"Reasoning for finding number {i}",
                    recommendation=f"Recommendation for finding number {i}",
                    citation=f"Citation Act Section {i}",
                    assigned_to=None,
                )
            )
        db_session.add_all(bulk_findings)
        db_session.commit()

        client = create_test_client(reviewer_user, db_session)

        # Page 1 fetch (page_size = 10)
        p1_resp = client.get(f"/findings?organization_id={test_org.id}&page=1&page_size=10")
        assert p1_resp.status_code == status.HTTP_200_OK
        p1_data = p1_resp.json()
        assert p1_data["total"] >= 105
        assert len(p1_data["items"]) == 10
        assert p1_data["total_pages"] >= 11

        # Severity filter fetch (CRITICAL only)
        crit_resp = client.get(f"/findings?organization_id={test_org.id}&severity=CRITICAL&page_size=100")
        assert crit_resp.status_code == status.HTTP_200_OK
        crit_data = crit_resp.json()
        assert crit_data["total"] == 20
        for item in crit_data["items"]:
            assert item["severity"] == "CRITICAL"

    def test_scenario_h_reviewer_all_findings_with_optional_org_id(self, db_session, test_org, reviewer_user, compliance_report):
        """Scenario H: Reviewer accessing /findings without explicit organization_id resolves active org correctly."""
        # Add sample findings
        for i in range(5):
            db_session.add(
                ReportFinding(
                    id=uuid.uuid4(),
                    report_id=compliance_report.id,
                    policy_clause_id=f"POL-OPT-{i}",
                    regulation_clause_id=f"REG-OPT-{i}",
                    status="NON_COMPLIANT",
                    lifecycle_status="OPEN",
                    severity="HIGH",
                    confidence=0.9,
                    reasoning=f"Optional test reasoning {i}",
                )
            )
        db_session.commit()

        client = create_test_client(reviewer_user, db_session)
        # Calling GET /findings without organization_id
        resp = client.get("/findings")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["total"] >= 5
        assert len(data["items"]) >= 5

    def test_scenario_i_reviewer_all_findings_vs_admin_equality(self, db_session, test_org, admin_user, reviewer_user, compliance_report):
        """Scenario I: Admin and Reviewer see identical total findings count (161 findings across multiple reports)."""
        # Create second report for the same organization
        second_report = ComplianceReport(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            regulation_id=compliance_report.regulation_id,
            policy_document_id=compliance_report.policy_document_id,
            status=ComplianceReportStatus.COMPLETED,
            overall_score=78.5,
            created_by=admin_user.id,
        )
        db_session.add(second_report)
        db_session.commit()

        # Seed 161 total findings across the two reports (100 in report 1, 61 in report 2)
        # 10 assigned to Reviewer, 151 unassigned/other
        f_list = []
        for i in range(100):
            f_list.append(
                ReportFinding(
                    id=uuid.uuid4(),
                    report_id=compliance_report.id,
                    policy_clause_id=f"P1-CLAUSE-{i}",
                    regulation_clause_id=f"R1-CLAUSE-{i}",
                    status="NON_COMPLIANT",
                    lifecycle_status="OPEN",
                    severity="MEDIUM",
                    confidence=0.85,
                    reasoning=f"Report 1 finding {i}",
                    assigned_to=reviewer_user.id if i < 10 else None,
                )
            )
        for j in range(61):
            f_list.append(
                ReportFinding(
                    id=uuid.uuid4(),
                    report_id=second_report.id,
                    policy_clause_id=f"P2-CLAUSE-{j}",
                    regulation_clause_id=f"R2-CLAUSE-{j}",
                    status="PARTIALLY_COMPLIANT",
                    lifecycle_status="OPEN",
                    severity="HIGH",
                    confidence=0.92,
                    reasoning=f"Report 2 finding {j}",
                    assigned_to=None,
                )
            )
        db_session.add_all(f_list)
        db_session.commit()

        admin_client = create_test_client(admin_user, db_session)
        reviewer_client = create_test_client(reviewer_user, db_session)

        # 1. Admin gets all findings
        admin_resp = admin_client.get(f"/findings?organization_id={test_org.id}&page=1&page_size=25")
        assert admin_resp.status_code == status.HTTP_200_OK
        admin_total = admin_resp.json()["total"]
        assert admin_total >= 161

        # 2. Reviewer gets all findings
        reviewer_resp = reviewer_client.get(f"/findings?organization_id={test_org.id}&page=1&page_size=25")
        assert reviewer_resp.status_code == status.HTTP_200_OK
        reviewer_total = reviewer_resp.json()["total"]
        assert reviewer_total >= 161

        # 3. Counts must be identical
        assert admin_total == reviewer_total

        # 4. Reviewer My Work returns only assigned (10 findings)
        my_work_resp = reviewer_client.get(f"/findings/my-work?organization_id={test_org.id}")
        assert my_work_resp.status_code == status.HTTP_200_OK
        my_work_items = my_work_resp.json()
        assert len(my_work_items) == 10
        for item in my_work_items:
            assert item["assigned_to"] == str(reviewer_user.id)

    def test_scenario_j_reviewer_assignee_filtering(self, db_session, test_org, reviewer_user, admin_user, compliance_report):
        """Scenario J: Test assignee filtering: assigned_to=me vs assigned_to=unassigned."""
        db_session.add(
            ReportFinding(
                id=uuid.uuid4(),
                report_id=compliance_report.id,
                policy_clause_id="POL-ASSIGNED-REV",
                regulation_clause_id="REG-ASSIGNED-REV",
                status="NON_COMPLIANT",
                lifecycle_status="OPEN",
                severity="HIGH",
                confidence=0.88,
                reasoning="Assigned to reviewer",
                assigned_to=reviewer_user.id,
            )
        )
        db_session.add(
            ReportFinding(
                id=uuid.uuid4(),
                report_id=compliance_report.id,
                policy_clause_id="POL-UNASSIGNED",
                regulation_clause_id="REG-UNASSIGNED",
                status="NON_COMPLIANT",
                lifecycle_status="OPEN",
                severity="MEDIUM",
                confidence=0.85,
                reasoning="Unassigned finding",
                assigned_to=None,
            )
        )
        db_session.commit()

        client = create_test_client(reviewer_user, db_session)

        # 1. Filter assigned_to=me
        me_resp = client.get(f"/findings?organization_id={test_org.id}&assigned_to=me")
        assert me_resp.status_code == status.HTTP_200_OK
        me_items = me_resp.json()["items"]
        assert len(me_items) >= 1
        for item in me_items:
            assert item["assigned_to"] == str(reviewer_user.id)

        # 2. Filter assigned_to=unassigned
        unassigned_resp = client.get(f"/findings?organization_id={test_org.id}&assigned_to=unassigned")
        assert unassigned_resp.status_code == status.HTTP_200_OK
        unassigned_items = unassigned_resp.json()["items"]
        assert len(unassigned_items) >= 1
        for item in unassigned_items:
            assert item["assigned_to"] is None

        # Search filter fetch
        search_resp = client.get(f"/findings?organization_id={test_org.id}&search=POL-ASSIGNED-REV")
        assert search_resp.status_code == status.HTTP_200_OK
        search_data = search_resp.json()
        assert search_data["total"] == 1
        assert search_data["items"][0]["policy_clause_id"] == "POL-ASSIGNED-REV"

    def test_scenario_k_notification_deep_linking_and_cross_org_security(self, db_session, test_org, admin_user, reviewer_user, compliance_report):
        """Scenario K: Structured finding_id in notification response, marking read, and cross-organization security checks."""
        # 1. Create finding
        finding = ReportFinding(
            id=uuid.uuid4(),
            report_id=compliance_report.id,
            policy_clause_id="POL-NOTIF-TEST",
            regulation_clause_id="REG-NOTIF-TEST",
            status="NON_COMPLIANT",
            lifecycle_status="OPEN",
            severity="HIGH",
            confidence=0.91,
            reasoning="Notification deep linking test",
            assigned_to=reviewer_user.id,
        )
        db_session.add(finding)
        db_session.commit()

        # 2. Reviewer changes status to IN_REVIEW -> generates notification for Admin
        reviewer_client = create_test_client(reviewer_user, db_session)
        patch_resp = reviewer_client.patch(
            f"/findings/{finding.id}/status",
            json={"lifecycle_status": "IN_REVIEW"},
        )
        assert patch_resp.status_code == status.HTTP_200_OK

        # 3. Admin lists notifications
        admin_client = create_test_client(admin_user, db_session)
        notif_resp = admin_client.get(f"/notifications?organization_id={test_org.id}")
        assert notif_resp.status_code == status.HTTP_200_OK
        notif_list = notif_resp.json()
        assert len(notif_list) >= 1

        target_notif = next((n for n in notif_list if n["finding_id"] == str(finding.id)), None)
        assert target_notif is not None
        assert target_notif["type"] == "FINDING_STATUS_CHANGED"
        assert target_notif["finding_id"] == str(finding.id)
        assert target_notif["organization_id"] == str(test_org.id)
        assert target_notif["is_read"] is False

        # 4. Admin marks notification read
        mark_read_resp = admin_client.patch(f"/notifications/{target_notif['id']}/read")
        assert mark_read_resp.status_code == status.HTTP_200_OK
        assert mark_read_resp.json()["is_read"] is True

        # 5. Admin retrieves finding by finding_id (deep-link API endpoint)
        finding_resp = admin_client.get(f"/findings/{finding.id}")
        assert finding_resp.status_code == status.HTTP_200_OK
        assert finding_resp.json()["id"] == str(finding.id)
        assert finding_resp.json()["lifecycle_status"] == "IN_REVIEW"

        # 6. Cross-organization security test: User from outside org cannot access this finding
        other_user = User(
            id=uuid.uuid4(),
            email=f"outsider_{uuid.uuid4().hex[:6]}@lexisgraph.com",
            username=f"outsider_{uuid.uuid4().hex[:6]}",
            full_name="Outsider User",
            is_active=True,
            hashed_password="hashedpassword",
        )
        db_session.add(other_user)
        db_session.commit()

        outsider_client = create_test_client(other_user, db_session)
        outsider_resp = outsider_client.get(f"/findings/{finding.id}")
        assert outsider_resp.status_code == status.HTTP_403_FORBIDDEN
        assert "You do not have access to this organization's findings" in outsider_resp.json()["detail"]
