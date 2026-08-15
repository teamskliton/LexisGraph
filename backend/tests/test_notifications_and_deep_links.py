"""
Sprint 7.3: In-App Notification Center, Finding Deep Links & Organization-Scoped Alerts Tests.
"""
from datetime import datetime, timezone
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
from app.db.models.notification import Notification
from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus
from app.db.session import Base, get_db
from app.routes.findings import router as findings_router
from app.routes.notifications import router as notifications_router
from app.core.dependencies import get_current_user
from app.services.notification_service import create_notification, notify_finding_stakeholders

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
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def user_admin(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"admin_{uuid.uuid4().hex[:6]}@example.com",
        username=f"admin_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Alice Administrator",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def user_reviewer(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"reviewer_{uuid.uuid4().hex[:6]}@example.com",
        username=f"reviewer_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Bob Reviewer",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def user_other_org(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"other_{uuid.uuid4().hex[:6]}@example.com",
        username=f"other_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="External Charlie",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def org_a(db_session, user_admin, user_reviewer):
    org = Organization(
        id=uuid.uuid4(),
        name="Alpha Compliance Org",
        created_by=user_admin.id,
    )
    db_session.add(org)
    db_session.commit()

    m1 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_admin.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    m2 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_reviewer.id,
        role=UserRole.REVIEWER,
        status=MemberStatus.ACTIVE,
    )
    db_session.add_all([m1, m2])
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def org_b(db_session, user_other_org):
    org = Organization(
        id=uuid.uuid4(),
        name="Beta External Org",
        created_by=user_other_org.id,
    )
    db_session.add(org)
    db_session.commit()

    mb = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_other_org.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    db_session.add(mb)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def finding_a(db_session, org_a, user_admin, user_reviewer):
    reg = Regulation(
        id=uuid.uuid4(),
        title="POSH Act 2013",
        document_hash="posh_hash_789",
        uploaded_by=user_admin.id,
        original_filename="posh.pdf",
        stored_filename="posh_stored.pdf",
        file_path="/tmp/posh.pdf",
        file_size=1024,
        mime_type="application/pdf",
    )
    pol = Document(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        uploaded_by=user_admin.id,
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
        created_by=user_admin.id,
        status=ComplianceReportStatus.COMPLETED,
        overall_score=80.0,
    )
    db_session.add(report)
    db_session.commit()

    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="POL-101",
        regulation_clause_id="REG-101",
        status="NON_COMPLIANT",
        lifecycle_status="OPEN",
        severity="HIGH",
        citation="Section 4(1)",
        reasoning="Internal Complaints Committee composition missing independent member.",
        recommendation="Appoint external NGO member to ICC committee.",
        assigned_to=user_reviewer.id,
    )
    db_session.add(finding)
    db_session.commit()
    db_session.refresh(finding)
    return finding


class TestNotificationCenterAndDeepLinks:
    def test_1_reviewer_submits_finding_admin_receives_notification_with_deep_link(
        self, db_session, finding_a, org_a, user_reviewer, user_admin
    ):
        """Reviewer submits finding for review -> Admin receives FINDING_SUBMITTED_FOR_REVIEW notification with finding_id and report_id."""
        app = FastAPI()
        app.include_router(findings_router)
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # 1. Reviewer moves to IN_REVIEW then submits for review
        app.dependency_overrides[get_current_user] = lambda: user_reviewer
        client = TestClient(app)
        client.patch(f"/findings/{finding_a.id}/status", json={"status": "IN_REVIEW"})

        res = client.post(
            f"/findings/{finding_a.id}/submit-for-review",
            json={"submission_note": "Ready for Administrator sign-off."},
        )
        assert res.status_code == 200
        assert res.json()["lifecycle_status"] == "ADMIN_REVIEW"

        # 2. Admin inspects Notification Center
        app.dependency_overrides[get_current_user] = lambda: user_admin
        client_admin = TestClient(app)
        notif_res = client_admin.get(f"/notifications?organization_id={org_a.id}")
        assert notif_res.status_code == 200
        notifs = notif_res.json()
        assert len(notifs) >= 1

        submit_notif = next((n for n in notifs if n["type"] == "FINDING_SUBMITTED_FOR_REVIEW"), None)
        assert submit_notif is not None
        assert submit_notif["finding_id"] == str(finding_a.id)
        assert submit_notif["report_id"] == str(finding_a.report_id)
        assert submit_notif["is_read"] is False

    def test_2_admin_resolves_finding_reviewer_receives_resolution_notification(
        self, db_session, finding_a, org_a, user_admin, user_reviewer
    ):
        """Admin resolves finding -> Reviewer/Assignee receives FINDING_RESOLVED notification."""
        app = FastAPI()
        app.include_router(findings_router)
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # Admin resolves
        app.dependency_overrides[get_current_user] = lambda: user_admin
        client = TestClient(app)
        res = client.post(
            f"/findings/{finding_a.id}/resolve",
            json={"resolution_note": "Remediation policy updated and verified."},
        )
        assert res.status_code == 200

        # Reviewer receives notification
        app.dependency_overrides[get_current_user] = lambda: user_reviewer
        client_rev = TestClient(app)
        notif_res = client_rev.get(f"/notifications?organization_id={org_a.id}")
        assert notif_res.status_code == 200
        notifs = notif_res.json()
        res_notif = next((n for n in notifs if n["type"] == "FINDING_RESOLVED"), None)
        assert res_notif is not None
        assert res_notif["finding_id"] == str(finding_a.id)

    def test_3_admin_reopens_finding_reviewer_receives_reopen_notification(
        self, db_session, finding_a, org_a, user_admin, user_reviewer
    ):
        """Admin reopens resolved finding -> Reviewer receives FINDING_REOPENED notification."""
        # Set finding to RESOLVED first
        finding_a.lifecycle_status = "RESOLVED"
        db_session.commit()

        app = FastAPI()
        app.include_router(findings_router)
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # Admin reopens
        app.dependency_overrides[get_current_user] = lambda: user_admin
        client = TestClient(app)
        res = client.post(
            f"/findings/{finding_a.id}/reopen",
            json={"reopen_reason": "Audit surfaced missing documentation."},
        )
        assert res.status_code == 200

        # Reviewer receives notification
        app.dependency_overrides[get_current_user] = lambda: user_reviewer
        client_rev = TestClient(app)
        notif_res = client_rev.get(f"/notifications?organization_id={org_a.id}")
        assert notif_res.status_code == 200
        notifs = notif_res.json()
        reopen_notif = next((n for n in notifs if n["type"] == "FINDING_REOPENED"), None)
        assert reopen_notif is not None
        assert reopen_notif["finding_id"] == str(finding_a.id)

    def test_4_comment_mention_creates_structured_notification_with_comment_id(
        self, db_session, finding_a, org_a, user_reviewer, user_admin
    ):
        """Mentioning a user in a discussion creates a FINDING_MENTIONED notification with finding_id, report_id, and comment_id."""
        app = FastAPI()
        app.include_router(findings_router)
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # Reviewer posts comment with @mention
        app.dependency_overrides[get_current_user] = lambda: user_reviewer
        client = TestClient(app)
        c_res = client.post(
            f"/findings/{finding_a.id}/comments",
            json={
                "content": f"@{user_admin.username} please review this clause applicability.",
                "mentioned_user_ids": [str(user_admin.id)],
            },
        )
        assert c_res.status_code == 201
        created_comment_id = c_res.json()["id"]

        # Admin checks notifications
        app.dependency_overrides[get_current_user] = lambda: user_admin
        client_admin = TestClient(app)
        notif_res = client_admin.get(f"/notifications?organization_id={org_a.id}")
        assert notif_res.status_code == 200
        mention_notif = next((n for n in notif_res.json() if n["type"] == "FINDING_MENTIONED"), None)
        assert mention_notif is not None
        assert mention_notif["finding_id"] == str(finding_a.id)
        assert mention_notif["comment_id"] == created_comment_id

    def test_5_comment_reply_and_resolution_notifications(
        self, db_session, finding_a, org_a, user_admin, user_reviewer
    ):
        """Replying to and resolving a comment sends notifications to the thread author with comment_id."""
        app = FastAPI()
        app.include_router(findings_router)
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # 1. Admin posts top comment
        app.dependency_overrides[get_current_user] = lambda: user_admin
        client_admin = TestClient(app)
        c_res = client_admin.post(
            f"/findings/{finding_a.id}/comments",
            json={"content": "Can we verify compliance of ICC members?"},
        )
        top_comment_id = c_res.json()["id"]

        # 2. Reviewer replies
        app.dependency_overrides[get_current_user] = lambda: user_reviewer
        client_rev = TestClient(app)
        reply_res = client_rev.post(
            f"/findings/{finding_a.id}/comments",
            json={
                "content": "Verified with HR team.",
                "parent_id": top_comment_id,
            },
        )
        reply_id = reply_res.json()["id"]

        # Admin receives FINDING_COMMENT_REPLIED
        app.dependency_overrides[get_current_user] = lambda: user_admin
        notifs_admin = client_admin.get(f"/notifications?organization_id={org_a.id}").json()
        reply_notif = next((n for n in notifs_admin if n["type"] == "FINDING_COMMENT_REPLIED"), None)
        assert reply_notif is not None
        assert reply_notif["comment_id"] == reply_id

        # 3. Reviewer resolves discussion
        app.dependency_overrides[get_current_user] = lambda: user_reviewer
        client_rev.patch(
            f"/findings/{finding_a.id}/comments/{top_comment_id}/resolve",
            json={"is_resolved": True},
        )

        # Admin receives FINDING_COMMENT_RESOLVED
        app.dependency_overrides[get_current_user] = lambda: user_admin
        notifs_admin_2 = client_admin.get(f"/notifications?organization_id={org_a.id}").json()
        resolve_notif = next((n for n in notifs_admin_2 if n["type"] == "FINDING_COMMENT_RESOLVED"), None)
        assert resolve_notif is not None
        assert resolve_notif["comment_id"] == top_comment_id

    def test_6_mark_notification_as_read_and_unread_count(
        self, db_session, finding_a, org_a, user_admin, user_reviewer
    ):
        """Mark single notification as read updates is_read and unread count immediately."""
        app = FastAPI()
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # Create unread notification for Admin
        notif = create_notification(
            db=db_session,
            recipient_id=user_admin.id,
            organization_id=org_a.id,
            type="FINDING_SUBMITTED_FOR_REVIEW",
            title="Review Alert",
            message="Finding #12345678 submitted for review.",
            finding_id=finding_a.id,
            report_id=finding_a.report_id,
            actor_id=user_reviewer.id,
        )
        db_session.commit()

        app.dependency_overrides[get_current_user] = lambda: user_admin
        client = TestClient(app)

        # Check unread count
        count_res = client.get(f"/notifications/unread-count?organization_id={org_a.id}")
        assert count_res.status_code == 200
        assert count_res.json()["unread_count"] >= 1

        # Mark as read
        read_res = client.patch(f"/notifications/{notif.id}/read")
        assert read_res.status_code == 200
        assert read_res.json()["is_read"] is True

        # Check unread count is now updated
        count_res_after = client.get(f"/notifications/unread-count?organization_id={org_a.id}")
        assert count_res_after.json()["unread_count"] == 0

    def test_7_user_cannot_read_or_mutate_another_users_notification(
        self, db_session, finding_a, org_a, user_admin, user_reviewer
    ):
        """User cannot mark another user's notification as read (HTTP 403 Forbidden)."""
        app = FastAPI()
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # Create notification for Admin
        notif = create_notification(
            db=db_session,
            recipient_id=user_admin.id,
            organization_id=org_a.id,
            type="FINDING_SUBMITTED_FOR_REVIEW",
            title="Confidential Admin Alert",
            message="Admin only notification content.",
            finding_id=finding_a.id,
            actor_id=user_reviewer.id,
        )
        db_session.commit()

        # Reviewer attempts to mark Admin's notification as read -> 403 Forbidden
        app.dependency_overrides[get_current_user] = lambda: user_reviewer
        client = TestClient(app)
        res = client.patch(f"/notifications/{notif.id}/read")
        assert res.status_code == 403
        assert "You can only manage your own notifications" in res.json()["detail"]

    def test_8_mark_all_as_read_scoped_to_current_user_and_org(
        self, db_session, finding_a, org_a, user_admin, user_reviewer
    ):
        """Mark all as read marks only the current user's unread notifications in the given org."""
        app = FastAPI()
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # Create 2 unread notifications for Admin and 1 for Reviewer
        create_notification(
            db=db_session,
            recipient_id=user_admin.id,
            organization_id=org_a.id,
            type="FINDING_ASSIGNED",
            title="Alert 1",
            message="Msg 1",
            finding_id=finding_a.id,
        )
        create_notification(
            db=db_session,
            recipient_id=user_admin.id,
            organization_id=org_a.id,
            type="FINDING_STATUS_CHANGED",
            title="Alert 2",
            message="Msg 2",
            finding_id=finding_a.id,
        )
        notif_rev = create_notification(
            db=db_session,
            recipient_id=user_reviewer.id,
            organization_id=org_a.id,
            type="FINDING_COMMENTED",
            title="Alert Reviewer",
            message="Msg Reviewer",
            finding_id=finding_a.id,
        )
        db_session.commit()

        # Admin marks all as read
        app.dependency_overrides[get_current_user] = lambda: user_admin
        client = TestClient(app)
        res = client.patch(f"/notifications/read-all?organization_id={org_a.id}")
        assert res.status_code == 200

        # Verify Admin has 0 unread
        count_admin = client.get(f"/notifications/unread-count?organization_id={org_a.id}").json()["unread_count"]
        assert count_admin == 0

        # Verify Reviewer's notification remains UNREAD (not affected by Admin's mark-all-read!)
        db_session.expire_all()
        rev_record = db_session.get(Notification, notif_rev.id)
        assert rev_record.is_read is False

    def test_9_cross_organization_notification_access_rejected(
        self, db_session, org_b, user_admin
    ):
        """User cannot access notifications using an organization_id they do not belong to (HTTP 403 Forbidden)."""
        app = FastAPI()
        app.include_router(notifications_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # User Admin (belongs to Org A only) attempts to query Org B notifications
        app.dependency_overrides[get_current_user] = lambda: user_admin
        client = TestClient(app)
        res = client.get(f"/notifications?organization_id={org_b.id}")
        assert res.status_code == 403
        assert "You do not have access to this organization" in res.json()["detail"]

    def test_10_duplicate_notification_creation_suppressed(
        self, db_session, finding_a, org_a, user_admin, user_reviewer
    ):
        """Rapid duplicate calls to create_notification for identical event are suppressed."""
        n1 = create_notification(
            db=db_session,
            recipient_id=user_admin.id,
            organization_id=org_a.id,
            type="FINDING_SUBMITTED_FOR_REVIEW",
            title="Submission Notice",
            message="Finding submitted for review.",
            finding_id=finding_a.id,
            actor_id=user_reviewer.id,
        )
        db_session.commit()
        assert n1 is not None

        # Rapid duplicate call within 3 seconds
        n2 = create_notification(
            db=db_session,
            recipient_id=user_admin.id,
            organization_id=org_a.id,
            type="FINDING_SUBMITTED_FOR_REVIEW",
            title="Submission Notice",
            message="Finding submitted for review.",
            finding_id=finding_a.id,
            actor_id=user_reviewer.id,
        )
        assert n2 is None  # Suppressed!
