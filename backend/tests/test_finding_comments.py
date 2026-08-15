"""
Unit and integration test suite for Finding Comments & Review Collaboration (Sprint 6.8).
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
from app.compliance.models import ComplianceReport, ComplianceReportStatus, ReportFinding, FindingComment
from app.db.models import Document, DocumentType, Organization, User, Regulation
from app.db.models.notification import Notification
from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus
from app.db.session import Base, get_db
from app.routes.findings import router as findings_router
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
        email=f"user_c1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_c1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Shrimant Vishal Marathe",
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
        email=f"user_c2_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_c2_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Jeet Patil",
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
        email=f"user_cb1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_cb1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="External User B",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def user_a_analyst(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"user_analyst_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_analyst_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Analyst User A",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def user_a_viewer(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"user_viewer_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_viewer_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Viewer User A",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def user_b_reviewer(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"user_b_rev_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_b_rev_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Reviewer User B",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def org_a(db_session, user_a1, user_a2, user_a_analyst, user_a_viewer):
    org = Organization(
        id=uuid.uuid4(),
        name="LexisGraph Legal Org",
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
    m3 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_a_analyst.id,
        role=UserRole.COMPLIANCE_ANALYST,
        status=MemberStatus.ACTIVE,
    )
    m4 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_a_viewer.id,
        role=UserRole.VIEWER,
        status=MemberStatus.ACTIVE,
    )
    db_session.add_all([m1, m2, m3, m4])
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def org_b(db_session, user_b1, user_b_reviewer):
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
    mb2 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_b_reviewer.id,
        role=UserRole.REVIEWER,
        status=MemberStatus.ACTIVE,
    )
    db_session.add_all([mb, mb2])
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def report_a(db_session, org_a, user_a1):
    reg = Regulation(
        id=uuid.uuid4(),
        title="POSH Act 2013",
        document_hash="posh_hash_456",
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
    )
    db_session.add(finding)
    db_session.commit()
    db_session.refresh(report)
    return finding


class TestFindingComments:
    def test_1_get_empty_comments_list(self, db_session, report_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)
        response = client.get(f"/findings/{report_a.id}/comments")
        assert response.status_code == 200
        assert response.json() == []

    def test_2_post_valid_comment(self, db_session, report_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)
        response = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Please verify whether this clause applies to the current workforce."},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["content"] == "Please verify whether this clause applies to the current workforce."
        assert data["user_name"] == user_a1.full_name
        assert data["user_id"] == str(user_a1.id)

    def test_3_get_comments_chronological(self, db_session, report_a, user_a1, user_a2):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session

        client = TestClient(app)

        # Comment 1 by User A1
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Please verify whether this clause applies to the current workforce."},
        )

        # Comment 2 by User A2
        app.dependency_overrides[get_current_user] = lambda: user_a2
        client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "I will verify this with HR."},
        )

        # GET comments
        response = client.get(f"/findings/{report_a.id}/comments")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 2
        assert comments[0]["user_name"] == user_a1.full_name
        assert comments[1]["user_name"] == user_a2.full_name

    def test_4_empty_comment_rejected(self, db_session, report_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)
        response = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": ""},
        )
        assert response.status_code in (400, 422)

    def test_5_whitespace_comment_rejected(self, db_session, report_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)
        response = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "     \n\t  "},
        )
        assert response.status_code == 400
        assert "cannot be empty or whitespace-only" in response.json()["detail"]

    def test_6_finding_not_found(self, db_session, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)
        rand_finding_id = str(uuid.uuid4())
        response = client.get(f"/findings/{rand_finding_id}/comments")
        assert response.status_code == 404

    def test_7_unauthorized_organization_member(self, db_session, report_a, user_b1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_b1

        client = TestClient(app)
        response = client.get(f"/findings/{report_a.id}/comments")
        assert response.status_code == 403

    def test_8_cross_organization_comment_rejected(self, db_session, report_a, user_b1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_b1

        client = TestClient(app)
        response = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Attempting cross-org comment"},
        )
        assert response.status_code == 403
        assert "You do not have access" in response.json()["detail"]

    def test_9_authentication_required(self, db_session, report_a):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session

        client = TestClient(app)
        response = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Unauthenticated comment"},
        )
        assert response.status_code in (401, 403)

    def test_10_comment_persistence_after_reload(self, db_session, report_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)
        client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Persistent comment test content."},
        )

        # Query direct from DB session
        comments = db_session.query(FindingComment).filter(FindingComment.finding_id == report_a.id).all()
        assert len(comments) == 1
        assert comments[0].content == "Persistent comment test content."

    def test_11_threaded_replies_nesting_and_author_role(self, db_session, report_a, user_a1, user_a2):
        """Top-level comment and nested reply with user_role populated."""
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # 1. Admin posts top comment
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)
        top_res = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Please verify if the retention rule applies."},
        )
        assert top_res.status_code == 201
        top_id = top_res.json()["id"]
        assert top_res.json()["user_role"] == "ADMIN"

        # 2. Reviewer replies
        app.dependency_overrides[get_current_user] = lambda: user_a2
        client = TestClient(app)
        reply_res = client.post(
            f"/findings/{report_a.id}/comments",
            json={
                "content": "Verified. It applies to Clause 4.2.",
                "parent_id": top_id,
            },
        )
        assert reply_res.status_code == 201
        assert reply_res.json()["parent_id"] == top_id
        assert reply_res.json()["user_role"] == "REVIEWER"

        # 3. List comments returns nested tree
        list_res = client.get(f"/findings/{report_a.id}/comments")
        assert list_res.status_code == 200
        tree = list_res.json()
        assert len(tree) == 1
        assert tree[0]["id"] == top_id
        assert len(tree[0]["replies"]) == 1
        assert tree[0]["replies"][0]["content"] == "Verified. It applies to Clause 4.2."

    def test_12_resolve_and_reopen_comment_discussion_finding_status_unchanged(self, db_session, report_a, user_a1, user_a2):
        """Resolving a comment discussion does NOT modify the finding's lifecycle status."""
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # Initial finding lifecycle status is OPEN
        f_init = db_session.get(ReportFinding, report_a.id)
        assert f_init.lifecycle_status == "OPEN"

        # 1. User A1 posts comment
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)
        post_res = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Question about clause applicability."},
        )
        comment_id = post_res.json()["id"]

        # 2. User A2 resolves comment
        app.dependency_overrides[get_current_user] = lambda: user_a2
        client = TestClient(app)
        resolve_res = client.patch(
            f"/findings/{report_a.id}/comments/{comment_id}/resolve",
            json={"is_resolved": True},
        )
        assert resolve_res.status_code == 200
        assert resolve_res.json()["is_resolved"] is True
        assert resolve_res.json()["resolved_by"] == str(user_a2.id)

        # Verify Finding lifecycle status is STILL OPEN (Not Resolved!)
        db_session.expire_all()
        f_after = db_session.get(ReportFinding, report_a.id)
        assert f_after.lifecycle_status == "OPEN"

        # 3. User A1 reopens discussion
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)
        reopen_res = client.patch(
            f"/findings/{report_a.id}/comments/{comment_id}/resolve",
            json={"is_resolved": False},
        )
        assert reopen_res.status_code == 200
        assert reopen_res.json()["is_resolved"] is False

    def test_13_cross_finding_reply_rejected(self, db_session, report_a, org_a, user_a1):
        """Attempting to reply with a parent_id belonging to another finding is rejected."""
        # Create second finding in same org
        finding_2 = ReportFinding(
            id=uuid.uuid4(),
            report_id=report_a.report_id,
            policy_clause_id="POL-202",
            regulation_clause_id="REG-202",
            status="NON_COMPLIANT",
            lifecycle_status="OPEN",
            severity="HIGH",
            citation="Article 6",
        )
        db_session.add(finding_2)
        db_session.commit()

        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)

        # Post comment on Finding 1
        res1 = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Comment on Finding 1."},
        )
        comment_1_id = res1.json()["id"]

        # Attempt to reply on Finding 2 with Finding 1's comment as parent_id
        res2 = client.post(
            f"/findings/{finding_2.id}/comments",
            json={
                "content": "Attempting invalid cross-finding reply.",
                "parent_id": comment_1_id,
            },
        )
        assert res2.status_code == 400
        assert "Parent comment not found for this finding" in res2.json()["detail"]

    def test_14_cross_org_comment_resolution_rejected(self, db_session, report_a, user_b1, user_a1):
        """User from Org B cannot resolve comment in Org A."""
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # User A1 posts comment in Org A
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)
        res = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Confidential org finding discussion."},
        )
        comment_id = res.json()["id"]

        # User B1 (from Org B) attempts to resolve
        app.dependency_overrides[get_current_user] = lambda: user_b1
        client = TestClient(app)
        res_resolve = client.patch(
            f"/findings/{report_a.id}/comments/{comment_id}/resolve",
            json={"is_resolved": True},
        )
        assert res_resolve.status_code == 403

    def test_15_mention_member_creates_notification(self, db_session, report_a, user_a1, user_a2):
        """Mentioning a colleague via @username creates a FINDING_MENTIONED notification."""
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)

        res = client.post(
            f"/findings/{report_a.id}/comments",
            json={
                "content": f"@{user_a2.username} please review the updated policy clause.",
                "mentioned_user_ids": [str(user_a2.id)],
            },
        )
        assert res.status_code == 201

        # Check notification for user_a2
        notifs = db_session.query(Notification).filter(
            Notification.user_id == user_a2.id,
            Notification.type == "FINDING_MENTIONED",
        ).all()
        assert len(notifs) >= 1
        assert str(notifs[0].finding_id) == str(report_a.id)

    def test_16_reply_creates_notification_for_parent_author(self, db_session, report_a, user_a1, user_a2):
        """Replying to a comment creates a FINDING_COMMENT_REPLIED notification for the parent author."""
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # User A1 posts top comment
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)
        top_res = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Initial question from author."},
        )
        top_id = top_res.json()["id"]

        # User A2 replies
        app.dependency_overrides[get_current_user] = lambda: user_a2
        client = TestClient(app)
        reply_res = client.post(
            f"/findings/{report_a.id}/comments",
            json={
                "content": "Here is the verified answer.",
                "parent_id": top_id,
            },
        )
        assert reply_res.status_code == 201

        # User A1 should have received a FINDING_COMMENT_REPLIED notification
        notifs = db_session.query(Notification).filter(
            Notification.user_id == user_a1.id,
            Notification.type == "FINDING_COMMENT_REPLIED",
        ).all()
        assert len(notifs) >= 1
        assert str(notifs[0].finding_id) == str(report_a.id)

    def test_17_resolve_comment_creates_notification_for_author(self, db_session, report_a, user_a1, user_a2):
        """Resolving a discussion creates FINDING_COMMENT_RESOLVED notification for the comment author."""
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # User A1 posts comment
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)
        res = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Please verify if this requires remediation."},
        )
        comment_id = res.json()["id"]

        # User A2 resolves discussion
        app.dependency_overrides[get_current_user] = lambda: user_a2
        client = TestClient(app)
        client.patch(
            f"/findings/{report_a.id}/comments/{comment_id}/resolve",
            json={"is_resolved": True},
        )

        # Author user_a1 receives notification
        notifs = db_session.query(Notification).filter(
            Notification.user_id == user_a1.id,
            Notification.type == "FINDING_COMMENT_RESOLVED",
        ).all()
        assert len(notifs) >= 1
        assert str(notifs[0].finding_id) == str(report_a.id)

    def test_18_admin_can_resolve_and_reopen_discussion(self, db_session, report_a, user_a1):
        """ADMIN: Resolve discussion -> ALLOWED (200), Reopen discussion -> ALLOWED (200)."""
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)
        c_res = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Admin discussion point."},
        )
        c_id = c_res.json()["id"]

        # Admin resolves discussion
        res_resolve = client.patch(
            f"/findings/{report_a.id}/comments/{c_id}/resolve",
            json={"is_resolved": True},
        )
        assert res_resolve.status_code == 200
        assert res_resolve.json()["is_resolved"] is True

        # Finding lifecycle status remains OPEN
        db_session.expire_all()
        finding = db_session.get(ReportFinding, report_a.id)
        assert finding.lifecycle_status == "OPEN"

        # Admin reopens discussion
        res_reopen = client.patch(
            f"/findings/{report_a.id}/comments/{c_id}/resolve",
            json={"is_resolved": False},
        )
        assert res_reopen.status_code == 200
        assert res_reopen.json()["is_resolved"] is False

    def test_19_reviewer_can_resolve_and_reopen_discussion(self, db_session, report_a, user_a1, user_a2):
        """REVIEWER: Resolve discussion -> ALLOWED (200), Reopen discussion -> ALLOWED (200)."""
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # Admin creates comment
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)
        c_res = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Discussion point for Reviewer."},
        )
        c_id = c_res.json()["id"]

        # Reviewer resolves discussion
        app.dependency_overrides[get_current_user] = lambda: user_a2
        client = TestClient(app)
        res_resolve = client.patch(
            f"/findings/{report_a.id}/comments/{c_id}/resolve",
            json={"is_resolved": True},
        )
        assert res_resolve.status_code == 200
        assert res_resolve.json()["is_resolved"] is True

        # Finding lifecycle status remains unchanged
        db_session.expire_all()
        finding = db_session.get(ReportFinding, report_a.id)
        assert finding.lifecycle_status == "OPEN"

        # Reviewer reopens discussion
        res_reopen = client.patch(
            f"/findings/{report_a.id}/comments/{c_id}/resolve",
            json={"is_resolved": False},
        )
        assert res_reopen.status_code == 200
        assert res_reopen.json()["is_resolved"] is False

    def test_20_compliance_analyst_cannot_resolve_discussion(self, db_session, report_a, user_a1, user_a_analyst):
        """COMPLIANCE ANALYST: Add comment -> ALLOWED, Resolve discussion -> FORBIDDEN (403)."""
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # Admin creates comment
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)
        c_res = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Analyst comment test."},
        )
        c_id = c_res.json()["id"]

        # Compliance Analyst attempts to resolve discussion -> 403 Forbidden
        app.dependency_overrides[get_current_user] = lambda: user_a_analyst
        client = TestClient(app)
        res_resolve = client.patch(
            f"/findings/{report_a.id}/comments/{c_id}/resolve",
            json={"is_resolved": True},
        )
        assert res_resolve.status_code == 403
        assert "Only Reviewers and Administrators are permitted" in res_resolve.json()["detail"]

    def test_21_viewer_cannot_resolve_discussion(self, db_session, report_a, user_a1, user_a_viewer):
        """VIEWER: Resolve discussion -> FORBIDDEN (403)."""
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # Admin creates comment
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)
        c_res = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Viewer comment resolution test."},
        )
        c_id = c_res.json()["id"]

        # Viewer attempts to resolve discussion -> 403 Forbidden
        app.dependency_overrides[get_current_user] = lambda: user_a_viewer
        client = TestClient(app)
        res_resolve = client.patch(
            f"/findings/{report_a.id}/comments/{c_id}/resolve",
            json={"is_resolved": True},
        )
        assert res_resolve.status_code == 403

    def test_22_cross_org_reviewer_cannot_resolve_discussion(self, db_session, report_a, user_a1, user_b_reviewer):
        """Cross-Org Reviewer attempting to resolve discussion -> FORBIDDEN (403)."""
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session

        # Org A Admin creates comment
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client = TestClient(app)
        c_res = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Org A secret discussion."},
        )
        c_id = c_res.json()["id"]

        # Org B Reviewer attempts to resolve Org A discussion -> 403 Forbidden
        app.dependency_overrides[get_current_user] = lambda: user_b_reviewer
        client = TestClient(app)
        res = client.patch(
            f"/findings/{report_a.id}/comments/{c_id}/resolve",
            json={"is_resolved": True},
        )
        assert res.status_code == 403
        assert "You do not have access" in res.json()["detail"]

    def test_23_reviewer_cannot_resolve_finding_reaffirming_separation(self, db_session, report_a, user_a2):
        """Reaffirming Sprint 7.1/7.2 separation: Reviewer can resolve discussion, but CANNOT resolve finding (403)."""
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a2

        client = TestClient(app)
        # Attempt to resolve finding as Reviewer -> MUST FAIL with 403
        res = client.post(
            f"/findings/{report_a.id}/resolve",
            json={"resolution_note": "Reviewer trying to resolve finding illegally."},
        )
        assert res.status_code == 403
        assert "Only Organization Admins are permitted to resolve findings" in res.json()["detail"]
