"""
Unit and integration test suite for In-App Notifications & Compliance Alerts (Sprint 6.9).
"""
from __future__ import annotations

import uuid
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.compliance.models import ComplianceReport, ComplianceReportStatus, ReportFinding
from app.db.models import Document, DocumentType, Organization, User, Regulation
from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus
from app.db.models.notification import Notification
from app.db.session import Base, get_db
from app.routes.findings import router as findings_router
from app.routes.notifications import router as notifications_router
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
        email=f"user_n1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_n1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="User N1 (Actor)",
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
        email=f"user_n2_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_n2_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="User N2 (Recipient)",
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
        email=f"user_nb1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_nb1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="External User B",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def org_a(db_session, user_a1, user_a2):
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
        role=UserRole.REVIEWER,
        status=MemberStatus.ACTIVE,
    )
    db_session.add_all([m1, m2])
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def report_a(db_session, org_a, user_a1, user_a2):
    reg = Regulation(
        id=uuid.uuid4(),
        title="POSH Act 2013",
        document_hash="posh_hash_789",
        uploaded_by=user_a1.id,
        original_filename="posh.pdf",
        stored_filename="posh_stored.pdf",
        file_path="/tmp/posh.pdf",
        file_size=1024,
        mime_type="application/pdf",
    )
    pol = Document(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        uploaded_by=user_a1.id,
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
        organization_id=org_a.id,
        regulation_id=reg.id,
        policy_document_id=pol.id,
        created_by=user_a1.id,
        status=ComplianceReportStatus.COMPLETED,
        overall_score=80.0,
        risk_level="MEDIUM",
    )
    db_session.add(report)
    db_session.commit()

    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="POL-POSH-4",
        regulation_clause_id="REG-POSH-10",
        status="NON_COMPLIANT",
        lifecycle_status="OPEN",
        confidence=0.90,
        severity="HIGH",
        reasoning="Internal Complaints Committee composition is non-compliant",
        recommendation="Designate a female presiding officer",
        citation="Section 4 POSH Act, 2013",
        assigned_to=user_a2.id,
    )
    db_session.add(finding)
    db_session.commit()
    db_session.refresh(report)
    return finding


class TestNotifications:
    def test_1_assignment_creates_notification_for_assignee(self, db_session, org_a, report_a, user_a1, user_a2):
        app = FastAPI()
        app.include_router(findings_router)
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # User A1 assigns finding to User A2
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)

        assign_resp = client.post(f"/findings/{report_a.id}/assign", json={"assignee_id": str(user_a2.id)})
        assert assign_resp.status_code == 200

        # User A2 checks notifications
        app.dependency_overrides[get_current_user] = lambda: user_a2
        notif_resp = client.get(f"/notifications?organization_id={org_a.id}")
        assert notif_resp.status_code == 200
        data = notif_resp.json()
        assert len(data) == 1
        assert data[0]["type"] == "FINDING_ASSIGNED"
        assert data[0]["user_id"] == str(user_a2.id)

    def test_2_self_assignment_prevents_notification(self, db_session, org_a, report_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        # User A1 assigns finding to User A1 (self-assignment)
        client.post(f"/findings/{report_a.id}/assign", json={"assignee_id": str(user_a1.id)})

        # Check User A1 notifications (should be zero)
        notif_resp = client.get(f"/notifications?organization_id={org_a.id}")
        assert notif_resp.status_code == 200
        assert len(notif_resp.json()) == 0

    def test_3_status_change_notifies_assigned_user(self, db_session, org_a, report_a, user_a1, user_a2):
        app = FastAPI()
        app.include_router(findings_router)
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # User A1 updates status of finding assigned to User A2
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)

        patch_resp = client.patch(f"/findings/{report_a.id}/status", json={"lifecycle_status": "IN_REVIEW"})
        assert patch_resp.status_code == 200

        # Check User A2 notifications
        app.dependency_overrides[get_current_user] = lambda: user_a2
        notif_resp = client.get(f"/notifications?organization_id={org_a.id}")
        assert notif_resp.status_code == 200
        data = notif_resp.json()
        assert len(data) == 1
        assert data[0]["type"] == "FINDING_STATUS_CHANGED"
        assert "IN_REVIEW" in data[0]["message"]

    def test_4_comment_notifies_assigned_user(self, db_session, org_a, report_a, user_a1, user_a2):
        app = FastAPI()
        app.include_router(findings_router)
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # User A1 comments on finding assigned to User A2
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)

        c_resp = client.post(f"/findings/{report_a.id}/comments", json={"content": "Need legal review on clause 4."})
        assert c_resp.status_code == 201

        # Check User A2 notifications
        app.dependency_overrides[get_current_user] = lambda: user_a2
        notif_resp = client.get(f"/notifications?organization_id={org_a.id}")
        assert notif_resp.status_code == 200
        data = notif_resp.json()
        assert len(data) == 1
        assert data[0]["type"] == "FINDING_COMMENTED"

    def test_5_unread_count_and_mark_read(self, db_session, org_a, report_a, user_a1, user_a2):
        app = FastAPI()
        app.include_router(findings_router)
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # User A1 triggers notification for User A2
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)
        client.post(f"/findings/{report_a.id}/comments", json={"content": "First comment."})

        # User A2 checks unread count
        app.dependency_overrides[get_current_user] = lambda: user_a2
        count_resp = client.get(f"/notifications/unread-count?organization_id={org_a.id}")
        assert count_resp.status_code == 200
        assert count_resp.json()["unread_count"] == 1

        # List notifications & get ID
        list_resp = client.get(f"/notifications?organization_id={org_a.id}")
        notif_id = list_resp.json()[0]["id"]

        # Mark read
        read_resp = client.patch(f"/notifications/{notif_id}/read")
        assert read_resp.status_code == 200
        assert read_resp.json()["is_read"] is True

        # Check unread count is now 0
        count_resp2 = client.get(f"/notifications/unread-count?organization_id={org_a.id}")
        assert count_resp2.json()["unread_count"] == 0

    def test_6_mark_all_read(self, db_session, org_a, report_a, user_a1, user_a2):
        app = FastAPI()
        app.include_router(findings_router)
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # Trigger 2 notifications for User A2
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)
        client.post(f"/findings/{report_a.id}/comments", json={"content": "Comment 1"})
        client.patch(f"/findings/{report_a.id}/status", json={"lifecycle_status": "IN_REVIEW"})

        # User A2 marks all read
        app.dependency_overrides[get_current_user] = lambda: user_a2
        read_all_resp = client.patch(f"/notifications/read-all?organization_id={org_a.id}")
        assert read_all_resp.status_code == 200
        assert "Marked 2 notifications as read" in read_all_resp.json()["message"]

        count_resp = client.get(f"/notifications/unread-count?organization_id={org_a.id}")
        assert count_resp.json()["unread_count"] == 0

    def test_7_unauthorized_notification_read(self, db_session, org_a, report_a, user_a1, user_a2, user_b1):
        app = FastAPI()
        app.include_router(findings_router)
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # Trigger notification for User A2
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)
        client.post(f"/findings/{report_a.id}/comments", json={"content": "Comment for User A2"})

        app.dependency_overrides[get_current_user] = lambda: user_a2
        list_resp = client.get(f"/notifications?organization_id={org_a.id}")
        notif_id = list_resp.json()[0]["id"]

        # User B1 attempts to mark User A2's notification as read -> FAILS 403 FORBIDDEN
        app.dependency_overrides[get_current_user] = lambda: user_b1
        bad_read = client.patch(f"/notifications/{notif_id}/read")
        assert bad_read.status_code == 403
        assert "only manage your own notifications" in bad_read.json()["detail"]
