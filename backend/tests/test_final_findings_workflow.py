"""
Comprehensive Integration Test Suite for Final Findings Workflow:
Reviewer + Admin Lifecycle, RBAC Enforcement, Handoff, False-Positive Workflow,
Threaded Comments, @Mentions, Comment Resolution, and Notification Deep-Linking.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.compliance.models import ComplianceReport, ComplianceReportStatus, ReportFinding, FindingComment
from app.core.dependencies import get_current_user
from app.db.models import Organization, User, Document, DocumentType, Regulation
from app.db.models.notification import Notification
from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus
from app.db.session import Base, get_db
from app.routes.findings import router as findings_router
from app.routes.notifications import router as notifications_router

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
def admin_user(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"admin_{uuid.uuid4().hex[:6]}@example.com",
        username=f"admin_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd",
        full_name="Alice Admin",
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
        hashed_password="hashed_pwd",
        full_name="Bob Reviewer",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def reviewer_2(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"reviewer2_{uuid.uuid4().hex[:6]}@example.com",
        username=f"reviewer2_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd",
        full_name="Charlie Reviewer",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def org_alpha(db_session, admin_user, reviewer_user, reviewer_2):
    org = Organization(
        id=uuid.uuid4(),
        name="Alpha Org",
        created_by=admin_user.id,
    )
    db_session.add(org)
    db_session.commit()

    m_admin = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=admin_user.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    m_rev = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=reviewer_user.id,
        role=UserRole.REVIEWER,
        status=MemberStatus.ACTIVE,
    )
    m_rev2 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=reviewer_2.id,
        role=UserRole.REVIEWER,
        status=MemberStatus.ACTIVE,
    )
    db_session.add_all([m_admin, m_rev, m_rev2])
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def compliance_report(db_session, org_alpha, admin_user):
    doc = Document(
        id=uuid.uuid4(),
        organization_id=org_alpha.id,
        original_filename="policy.pdf",
        stored_filename="policy_stored.pdf",
        file_path="/tmp/policy.pdf",
        file_size=1024,
        mime_type="application/pdf",
        checksum="dummy_checksum",
        document_type=DocumentType.POLICY,
        uploaded_by=admin_user.id,
    )
    reg = Regulation(
        id=uuid.uuid4(),
        title="GDPR Framework",
        act_name="General Data Protection Regulation",
        jurisdiction="EU",
        document_hash="dummy_reg_hash",
        uploaded_by=admin_user.id,
        original_filename="gdpr.pdf",
        stored_filename="gdpr_stored.pdf",
        file_path="/tmp/gdpr.pdf",
        file_size=1024,
        mime_type="application/pdf",
    )
    db_session.add_all([doc, reg])
    db_session.commit()

    rep = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=org_alpha.id,
        regulation_id=reg.id,
        policy_document_id=doc.id,
        status=ComplianceReportStatus.COMPLETED,
        created_by=admin_user.id,
    )
    db_session.add(rep)
    db_session.commit()
    db_session.refresh(rep)
    return rep


@pytest.fixture(scope="function")
def sample_finding(db_session, compliance_report, reviewer_user):
    f = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        policy_clause_id="POL-101",
        regulation_clause_id="REG-Art5",
        status="NON_COMPLIANT",
        lifecycle_status="OPEN",
        severity="HIGH",
        reasoning="Data retention schedule is missing specified timelines.",
        recommendation="Include explicit retention timeline of 24 months.",
        citation="Article 5(1)(e) - Storage Limitation",
        assigned_to=reviewer_user.id,
    )
    db_session.add(f)
    db_session.commit()
    db_session.refresh(f)
    return f


def make_client(user: User, db_session):
    app = FastAPI()
    app.include_router(findings_router)
    app.include_router(notifications_router)
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


class TestFinalFindingsWorkflow:
    def test_1_reviewer_lifecycle_flow(self, db_session, reviewer_user, sample_finding):
        """Reviewer moves OPEN -> IN_REVIEW -> REMEDIATION -> ADMIN_REVIEW."""
        client = make_client(reviewer_user, db_session)

        # 1. Start Review
        res = client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "IN_REVIEW"})
        assert res.status_code == status.HTTP_200_OK
        assert res.json()["lifecycle_status"] == "IN_REVIEW"

        # 2. Move to Remediation
        res = client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "REMEDIATION"})
        assert res.status_code == status.HTTP_200_OK
        assert res.json()["lifecycle_status"] == "REMEDIATION"

        # 3. Submit for Admin Review via dedicated endpoint
        res = client.post(f"/findings/{sample_finding.id}/submit-for-review", json={"submission_note": "Remediation verified by Reviewer."})
        assert res.status_code == status.HTTP_200_OK
        assert res.json()["lifecycle_status"] == "ADMIN_REVIEW"

    def test_2_reviewer_cannot_resolve_backend_enforced(self, db_session, reviewer_user, sample_finding):
        """Reviewer attempting to resolve MUST fail with HTTP 403."""
        client = make_client(reviewer_user, db_session)

        # Attempt resolve via PATCH /status
        res = client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "RESOLVED"})
        assert res.status_code == status.HTTP_403_FORBIDDEN
        assert "Only Organization Admins are permitted to resolve findings" in res.json()["detail"]

        # Attempt resolve via POST /resolve
        res = client.post(f"/findings/{sample_finding.id}/resolve", json={"resolution_note": "Sneaky resolve"})
        assert res.status_code == status.HTTP_403_FORBIDDEN
        assert "Only Organization Admins are permitted to resolve findings" in res.json()["detail"]

    def test_3_reviewer_cannot_reopen_or_reject_backend_enforced(self, db_session, reviewer_user, sample_finding):
        """Reviewer cannot reopen or reject findings directly."""
        client = make_client(reviewer_user, db_session)

        # Reopen attempt
        res = client.post(f"/findings/{sample_finding.id}/reopen", json={"reopen_reason": "Reopen attempt"})
        assert res.status_code == status.HTTP_403_FORBIDDEN

        # Reject false positive attempt
        res = client.post(f"/findings/{sample_finding.id}/reject-false-positive", json={"rejection_reason": "Reject attempt"})
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_4_admin_full_resolution_and_reopen_flow(self, db_session, admin_user, sample_finding):
        """Admin can resolve and reopen findings."""
        client = make_client(admin_user, db_session)

        # Move to IN_REVIEW -> REMEDIATION -> ADMIN_REVIEW
        client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "IN_REVIEW"})
        client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "REMEDIATION"})
        client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "ADMIN_REVIEW"})

        # Admin resolves
        res = client.post(f"/findings/{sample_finding.id}/resolve", json={"resolution_note": "Policy updated with 24-month retention rule."})
        assert res.status_code == status.HTTP_200_OK
        assert res.json()["lifecycle_status"] == "RESOLVED"
        assert res.json()["resolution_note"] == "Policy updated with 24-month retention rule."

        # Admin reopens
        res = client.post(f"/findings/{sample_finding.id}/reopen", json={"reopen_reason": "Audit requires re-verification."})
        assert res.status_code == status.HTTP_200_OK
        assert res.json()["lifecycle_status"] == "REOPENED"
        assert res.json()["reopen_reason"] == "Audit requires re-verification."

    def test_5_false_positive_workflow(self, db_session, admin_user, reviewer_user, sample_finding):
        """Reviewer flags potential false positive -> Admin reviews & rejects."""
        rev_client = make_client(reviewer_user, db_session)
        admin_client = make_client(admin_user, db_session)

        # Start review
        rev_client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "IN_REVIEW"})

        # Reviewer marks POTENTIAL_FALSE_POSITIVE
        res = rev_client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "POTENTIAL_FALSE_POSITIVE"})
        assert res.status_code == status.HTTP_200_OK
        assert res.json()["lifecycle_status"] == "POTENTIAL_FALSE_POSITIVE"

        # Reviewer submits to ADMIN_REVIEW
        res = rev_client.post(f"/findings/{sample_finding.id}/submit-for-review", json={"submission_note": "Clause 4.2 satisfies Article 5(1)(e)."})
        assert res.status_code == status.HTTP_200_OK
        assert res.json()["lifecycle_status"] == "ADMIN_REVIEW"

        # Admin rejects as false positive
        res = admin_client.post(f"/findings/{sample_finding.id}/reject-false-positive", json={"rejection_reason": "Clause 4.2 explicitly limits storage to 2 years."})
        assert res.status_code == status.HTTP_200_OK
        assert res.json()["lifecycle_status"] == "REJECTED"

        # Verify finding was NOT deleted
        db_session.expire_all()
        f_in_db = db_session.get(ReportFinding, sample_finding.id)
        assert f_in_db is not None
        assert f_in_db.lifecycle_status == "REJECTED"

    def test_6_collaboration_threaded_comments_mentions_and_resolution(self, db_session, admin_user, reviewer_user, reviewer_2, sample_finding):
        """Threaded replies, @mentions, notifications, and discussion resolution."""
        rev_client = make_client(reviewer_user, db_session)
        admin_client = make_client(admin_user, db_session)

        # 1. Reviewer posts comment with @mention to Admin
        res = rev_client.post(
            f"/findings/{sample_finding.id}/comments",
            json={
                "content": f"@{admin_user.username} please verify if this regulation applies to updated policy.",
                "mentioned_user_ids": [str(admin_user.id)],
            },
        )
        assert res.status_code == status.HTTP_201_CREATED
        comment_id = res.json()["id"]

        # Verify Admin received FINDING_MENTIONED notification with finding_id
        notifs = db_session.query(Notification).filter(Notification.user_id == admin_user.id, Notification.type == "FINDING_MENTIONED").all()
        assert len(notifs) > 0
        assert str(notifs[0].finding_id) == str(sample_finding.id)

        # 2. Admin replies to comment
        reply_res = admin_client.post(
            f"/findings/{sample_finding.id}/comments",
            json={
                "content": "Verified. Please proceed with remediation.",
                "parent_id": comment_id,
            },
        )
        assert reply_res.status_code == status.HTTP_201_CREATED
        reply_id = reply_res.json()["id"]
        assert reply_res.json()["parent_id"] == comment_id

        # Verify Reviewer received FINDING_COMMENT_REPLIED notification
        rev_notifs = db_session.query(Notification).filter(Notification.user_id == reviewer_user.id, Notification.type == "FINDING_COMMENT_REPLIED").all()
        assert len(rev_notifs) > 0
        assert str(rev_notifs[0].finding_id) == str(sample_finding.id)

        # 3. Verify comments tree retrieval
        list_res = rev_client.get(f"/findings/{sample_finding.id}/comments")
        assert list_res.status_code == status.HTTP_200_OK
        comments_tree = list_res.json()
        assert len(comments_tree) == 1
        assert comments_tree[0]["id"] == comment_id
        assert len(comments_tree[0]["replies"]) == 1
        assert comments_tree[0]["replies"][0]["id"] == reply_id

        # 4. Reviewer resolves the comment discussion
        resolve_res = rev_client.patch(f"/findings/{sample_finding.id}/comments/{comment_id}/resolve", json={"is_resolved": True})
        assert resolve_res.status_code == status.HTTP_200_OK
        assert resolve_res.json()["is_resolved"] is True
        assert resolve_res.json()["resolved_by"] == str(reviewer_user.id)

        # Finding status must remain unchanged
        f_db = db_session.get(ReportFinding, sample_finding.id)
        assert f_db.lifecycle_status == "OPEN"

    def test_7_activity_timeline_contains_all_events(self, db_session, admin_user, reviewer_user, sample_finding):
        """Chronological activity timeline recording all events."""
        rev_client = make_client(reviewer_user, db_session)
        admin_client = make_client(admin_user, db_session)

        rev_client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "IN_REVIEW"})
        rev_client.post(f"/findings/{sample_finding.id}/comments", json={"content": "Investigating clause."})
        rev_client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "REMEDIATION"})
        rev_client.post(f"/findings/{sample_finding.id}/submit-for-review", json={"submission_note": "Ready for admin signoff."})
        admin_client.post(f"/findings/{sample_finding.id}/resolve", json={"resolution_note": "Approved."})

        res = admin_client.get(f"/findings/{sample_finding.id}/activity")
        assert res.status_code == status.HTTP_200_OK
        events = [a["event_type"] for a in res.json()]
        assert "FINDING_STATUS_CHANGED" in events
        assert "FINDING_COMMENTED" in events
        assert "FINDING_SUBMITTED_FOR_REVIEW" in events
        assert "FINDING_RESOLVED" in events

    def test_8_admin_returns_to_review_from_admin_review(self, db_session, admin_user, reviewer_user, sample_finding):
        """Admin can return finding in ADMIN_REVIEW back to IN_REVIEW."""
        rev_client = make_client(reviewer_user, db_session)
        admin_client = make_client(admin_user, db_session)

        # 1. Reviewer moves to IN_REVIEW -> REMEDIATION -> ADMIN_REVIEW
        rev_client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "IN_REVIEW"})
        rev_client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "REMEDIATION"})
        rev_client.post(f"/findings/{sample_finding.id}/submit-for-review", json={"submission_note": "Ready for approval."})

        # 2. Admin returns to IN_REVIEW
        res = admin_client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "IN_REVIEW"})
        assert res.status_code == status.HTTP_200_OK
        assert res.json()["lifecycle_status"] == "IN_REVIEW"

    def test_9_admin_returns_potential_false_positive_to_review(self, db_session, admin_user, reviewer_user, sample_finding):
        """Admin can return a POTENTIAL_FALSE_POSITIVE finding back to IN_REVIEW."""
        rev_client = make_client(reviewer_user, db_session)
        admin_client = make_client(admin_user, db_session)

        # 1. Reviewer marks POTENTIAL_FALSE_POSITIVE
        rev_client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "IN_REVIEW"})
        rev_client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "POTENTIAL_FALSE_POSITIVE"})

        # 2. Admin returns to review
        res = admin_client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "IN_REVIEW"})
        assert res.status_code == status.HTTP_200_OK
        assert res.json()["lifecycle_status"] == "IN_REVIEW"

    def test_10_cross_org_finding_mutation_rejected(self, db_session, admin_user, sample_finding):
        """User belonging to another organization cannot view, resolve, or mutate finding."""
        other_user = User(
            id=uuid.uuid4(),
            email=f"other_{uuid.uuid4().hex[:6]}@example.com",
            username=f"other_{uuid.uuid4().hex[:6]}",
            hashed_password="hashed_pwd",
            full_name="Other User",
            is_active=True,
        )
        other_org = Organization(
            id=uuid.uuid4(),
            name="Beta Org",
            created_by=other_user.id,
        )
        db_session.add_all([other_user, other_org])
        db_session.commit()

        other_client = make_client(other_user, db_session)

        # Try to view finding
        res = other_client.get(f"/findings/{sample_finding.id}")
        assert res.status_code == status.HTTP_403_FORBIDDEN

        # Try to resolve finding
        res = other_client.post(f"/findings/{sample_finding.id}/resolve", json={"resolution_note": "Cross-org resolve"})
        assert res.status_code == status.HTTP_403_FORBIDDEN

        # Try to mutate status
        res = other_client.patch(f"/findings/{sample_finding.id}/status", json={"lifecycle_status": "IN_REVIEW"})
        assert res.status_code == status.HTTP_403_FORBIDDEN
