"""
Unit and integration test suite for Finding Lifecycle & Compliance Operations.
"""
from __future__ import annotations

import unittest
import uuid
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.compliance.models import ComplianceReport, ComplianceReportStatus, ReportFinding, FindingComment
from app.db.models import Document, DocumentType, Organization, User, Regulation
from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus
from app.db.session import Base, get_db
from app.routes.findings import router as findings_router
from app.routes.reports import router as reports_router
from app.core.dependencies import get_current_user

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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
def user_a1(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"usera1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"usera1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="User A1 (Admin)",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def user_a2(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"usera2_{uuid.uuid4().hex[:6]}@example.com",
        username=f"usera2_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="User A2 (Analyst)",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def user_viewer(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"userviewer_{uuid.uuid4().hex[:6]}@example.com",
        username=f"userviewer_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="User Viewer (Read-only)",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def user_b1(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"userb1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"userb1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="User B1 (Org B Admin)",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def org_a(db_session, user_a1, user_a2, user_viewer):
    org = Organization(
        id=uuid.uuid4(),
        name="Organization Alpha",
        created_by=user_a1.id,
    )
    db_session.add(org)
    db_session.commit()

    m1 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_a1.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    m2 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_a2.id,
        role=UserRole.LEGAL_ANALYST,
        status=MemberStatus.ACTIVE,
    )
    mv = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_viewer.id,
        role=UserRole.VIEWER,
        status=MemberStatus.ACTIVE,
    )
    db_session.add_all([m1, m2, mv])
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def org_b(db_session, user_b1):
    org = Organization(
        id=uuid.uuid4(),
        name="Organization Beta",
        created_by=user_b1.id,
    )
    db_session.add(org)
    db_session.commit()

    mb = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_b1.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    db_session.add(mb)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def report_a(db_session, org_a, user_a1):
    reg = Regulation(
        id=uuid.uuid4(),
        title="POCSO Act 2012",
        document_hash="pocso_hash_123",
        uploaded_by=user_a1.id,
        original_filename="pocso.pdf",
        stored_filename="pocso_stored.pdf",
        file_path="/tmp/pocso.pdf",
        file_size=1024,
        mime_type="application/pdf",
    )
    pol = Document(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        uploaded_by=user_a1.id,
        document_type=DocumentType.POLICY,
        original_filename="org_a_policy.pdf",
        stored_filename="org_a_policy_stored.pdf",
        file_path="/tmp/org_a_policy.pdf",
        file_size=2048,
        mime_type="application/pdf",
        checksum="org_a_policy_hash",
    )
    db_session.add_all([reg, pol])
    db_session.commit()

    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        regulation_id=reg.id,
        policy_document_id=pol.id,
        created_by=user_a1.id,
        status=ComplianceReportStatus.COMPLETED,
        overall_score=65.0,
        risk_level="HIGH",
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)
    return report


@pytest.fixture(scope="function")
def finding_a(db_session, report_a):
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=report_a.id,
        policy_clause_id="POL-POSH-4",
        regulation_clause_id="REG-POSH-10",
        status="NON_COMPLIANT",
        lifecycle_status="OPEN",
        confidence=0.88,
        severity="HIGH",
        reasoning="Internal Complaints Committee composition is non-compliant",
        recommendation="Designate a female presiding officer",
        citation="Section 4 POSH Act, 2013",
    )
    db_session.add(finding)
    db_session.commit()
    db_session.refresh(finding)
    return finding


class TestFindingLifecycleOperations:
    def test_lifecycle_status_transitions_and_resolution(self, db_session, report_a, finding_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)

        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        # 1. Invalid direct transition OPEN -> RESOLVED (Fails 400 Bad Request)
        bad_trans_resp = client.patch(f"/findings/{finding_a.id}/status", json={"lifecycle_status": "RESOLVED"})
        assert bad_trans_resp.status_code == 400
        assert "Invalid lifecycle transition" in bad_trans_resp.json()["detail"]

        # 2. Invalid status string (Fails 400 Bad Request)
        bad_status_resp = client.patch(f"/findings/{finding_a.id}/status", json={"status": "INVALID_STATUS"})
        assert bad_status_resp.status_code == 400
        assert "Invalid status" in bad_status_resp.json()["detail"]

        # 3. Valid transition OPEN -> IN_REVIEW using status alias
        resp1 = client.patch(f"/findings/{finding_a.id}/status", json={"status": "IN_REVIEW"})
        assert resp1.status_code == 200
        assert resp1.json()["lifecycle_status"] == "IN_REVIEW"

        # 4. Valid transition IN_REVIEW -> OPEN
        resp_back_open = client.patch(f"/findings/{finding_a.id}/status", json={"lifecycle_status": "OPEN"})
        assert resp_back_open.status_code == 200
        assert resp_back_open.json()["lifecycle_status"] == "OPEN"

        # Return back to IN_REVIEW -> REMEDIATION
        client.patch(f"/findings/{finding_a.id}/status", json={"lifecycle_status": "IN_REVIEW"})
        resp2 = client.patch(f"/findings/{finding_a.id}/status", json={"lifecycle_status": "REMEDIATION"})
        assert resp2.status_code == 200
        assert resp2.json()["lifecycle_status"] == "REMEDIATION"

        # 5. Mark RESOLVED with resolution note
        resp3 = client.post(f"/findings/{finding_a.id}/resolve", json={"resolution_note": "Designated Presiding Officer"})
        assert resp3.status_code == 200
        assert resp3.json()["lifecycle_status"] == "RESOLVED"
        assert resp3.json()["resolution_note"] == "Designated Presiding Officer"

        # 6. Reopen finding with reason
        resp4 = client.post(f"/findings/{finding_a.id}/reopen", json={"reopen_reason": "Audit requires additional evidence"})
        assert resp4.status_code == 200
        assert resp4.json()["lifecycle_status"] == "REOPENED"
        assert resp4.json()["reopen_reason"] == "Audit requires additional evidence"

    def test_organization_scoped_assignment_and_security(self, db_session, report_a, finding_a, user_a1, user_a2, user_b1):
        app = FastAPI()
        app.include_router(findings_router)

        current_auth_user = [user_a1]

        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: current_auth_user[0]

        client = TestClient(app)

        # Assign Finding A to User A2 (Org A member) -> SUCCESS
        resp_assign = client.post(f"/findings/{finding_a.id}/assign", json={"assignee_id": str(user_a2.id)})
        assert resp_assign.status_code == 200
        assert resp_assign.json()["assigned_to"] == str(user_a2.id)
        assert resp_assign.json()["assignee"]["full_name"] == user_a2.full_name

        # Assign Finding A to User B1 (Org B member) -> FAILS 400 BAD REQUEST
        resp_bad_assign = client.post(f"/findings/{finding_a.id}/assign", json={"assignee_id": str(user_b1.id)})
        assert resp_bad_assign.status_code == 400
        assert "Assignee is not an active member" in resp_bad_assign.json()["detail"]

        # User B1 (Org B) attempts to modify Finding A status -> FAILS 403 FORBIDDEN
        current_auth_user[0] = user_b1
        resp_unauth_patch = client.patch(f"/findings/{finding_a.id}/status", json={"lifecycle_status": "RESOLVED"})
        assert resp_unauth_patch.status_code == 403
        assert "You do not have access" in resp_unauth_patch.json()["detail"]

    def test_viewer_role_read_only_restriction(self, db_session, finding_a, user_viewer):
        app = FastAPI()
        app.include_router(findings_router)

        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_viewer

        client = TestClient(app)

        # GET single finding -> SUCCESS (Read-only allowed)
        get_resp = client.get(f"/findings/{finding_a.id}")
        assert get_resp.status_code == 200

        # Viewer attempts status update -> FAILS 403 FORBIDDEN
        patch_resp = client.patch(f"/findings/{finding_a.id}/status", json={"lifecycle_status": "IN_REVIEW"})
        assert patch_resp.status_code == 403
        assert "Viewers have read-only access" in patch_resp.json()["detail"]

    def test_comments_and_activity_timeline(self, db_session, finding_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)

        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        # 1. Post comment
        c_resp = client.post(f"/findings/{finding_a.id}/comments", json={"content": "Clause amendment pending legal review."})
        assert c_resp.status_code == 201
        comment_id = c_resp.json()["id"]
        assert c_resp.json()["content"] == "Clause amendment pending legal review."

        # 2. List comments
        list_resp = client.get(f"/findings/{finding_a.id}/comments")
        assert list_resp.status_code == 200
        assert len(list_resp.json()) == 1

        # 3. Get activity timeline
        act_resp = client.get(f"/findings/{finding_a.id}/activity")
        assert act_resp.status_code == 200
        activities = act_resp.json()
        assert len(activities) >= 1
        assert activities[0]["event_type"] == "FINDING_COMMENTED"

        # 4. Delete comment
        del_resp = client.delete(f"/findings/{finding_a.id}/comments/{comment_id}")
        assert del_resp.status_code == 204
