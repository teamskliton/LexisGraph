"""
Unit and integration test suite for Sprint 7.6 — Finding Activity Timeline & Audit Trail.
Validates:
1. Activity event logging across finding lifecycle (create, assign, status changes, resolution, reopening, rejection).
2. Discussion activity events (commenting, replies, resolving discussion).
3. Remediation and cycle activity events (remediation create, assign, cycle submit, verify, reject, approve, return, evidence).
4. Category filtering (ALL, FINDING, DISCUSSION, REMEDIATION, STATUS).
5. Pagination metadata (page, limit, total, total_pages, has_more) and reverse-chronological ordering.
6. Actor role enrichment (resolving role from OrganizationMember).
7. Organization multi-tenancy access control (403 Forbidden for cross-org access).
8. Read-only idempotency (viewing activity does not alter database or create extra records).
"""
from __future__ import annotations

import uuid
import pytest
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.compliance.models import (
    ComplianceReport,
    ComplianceReportStatus,
    ReportFinding,
    FindingComment,
)
from app.db.models import Document, DocumentType, Organization, User, Regulation
from app.db.models.activity import Activity
from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus
from app.db.models.remediation import FindingRemediation, RemediationEvidence, RemediationCycle
from app.db.session import Base, get_db
from app.routes.findings import router as findings_router
from app.routes.remediations import router as remediations_router
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
def admin_user(db_session):
    u = User(
        id=uuid.uuid4(),
        email="admin@lexisgraph.io",
        username="org_admin",
        hashed_password="hashed_admin_pwd",
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
        email="reviewer@lexisgraph.io",
        username="lead_reviewer",
        hashed_password="hashed_reviewer_pwd",
        full_name="Bob Reviewer",
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
        email="analyst@lexisgraph.io",
        username="compliance_analyst",
        hashed_password="hashed_analyst_pwd",
        full_name="Charlie Analyst",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def outsider_user(db_session):
    u = User(
        id=uuid.uuid4(),
        email="outsider@otherorg.io",
        username="outsider_user",
        hashed_password="hashed_outsider_pwd",
        full_name="Eve Outsider",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def org_a(db_session, admin_user, reviewer_user, analyst_user):
    org = Organization(
        id=uuid.uuid4(),
        name="Acme Corp",
        created_by=admin_user.id,
    )
    db_session.add(org)
    db_session.flush()

    m_admin = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=admin_user.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    m_reviewer = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=reviewer_user.id,
        role=UserRole.REVIEWER,
        status=MemberStatus.ACTIVE,
    )
    m_analyst = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=analyst_user.id,
        role=UserRole.COMPLIANCE_ANALYST,
        status=MemberStatus.ACTIVE,
    )
    db_session.add_all([m_admin, m_reviewer, m_analyst])
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def org_b(db_session, outsider_user):
    org = Organization(
        id=uuid.uuid4(),
        name="Other Org",
        created_by=outsider_user.id,
    )
    db_session.add(org)
    db_session.flush()

    m_out = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=outsider_user.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    db_session.add(m_out)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def sample_finding(db_session, org_a, analyst_user):
    doc = Document(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        uploaded_by=analyst_user.id,
        document_type=DocumentType.POLICY,
        original_filename="security_policy.pdf",
        stored_filename="security_policy_stored.pdf",
        file_path="/tmp/security_policy.pdf",
        file_size=2048,
        mime_type="application/pdf",
        checksum="sec_policy_hash",
    )
    reg = Regulation(
        id=uuid.uuid4(),
        title="GDPR Article 32",
        document_hash="gdpr_hash_456",
        uploaded_by=analyst_user.id,
        original_filename="gdpr.pdf",
        stored_filename="gdpr_stored.pdf",
        file_path="/tmp/gdpr.pdf",
        file_size=1024,
        mime_type="application/pdf",
    )
    db_session.add_all([doc, reg])
    db_session.commit()

    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        regulation_id=reg.id,
        policy_document_id=doc.id,
        created_by=analyst_user.id,
        status=ComplianceReportStatus.COMPLETED,
        overall_score=85.0,
        risk_level="HIGH",
    )
    db_session.add(report)
    db_session.commit()

    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        status="NON_COMPLIANT",
        lifecycle_status="OPEN",
        severity="HIGH",
        reasoning="Access control logs not retained for required 12 months.",
        recommendation="Configure log retention policy in centralized logging server.",
    )
    db_session.add(finding)
    db_session.commit()
    db_session.refresh(finding)
    return finding


def get_test_app(db_session, current_user: User) -> TestClient:
    app = FastAPI()
    app.include_router(findings_router)
    app.include_router(remediations_router)

    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: current_user

    return TestClient(app)


# ==============================================================================
# TESTS
# ==============================================================================

def test_get_finding_activity_initial_synthetic_event(db_session, admin_user, sample_finding):
    """If no activity rows exist in DB, a synthetic initial FINDING_CREATED event is returned."""
    client = get_test_app(db_session, admin_user)

    resp = client.get(f"/findings/{sample_finding.id}/activity")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["total"] >= 1
    assert data["page"] == 1
    assert data["limit"] == 20
    assert len(data["items"]) >= 1

    first_event = data["items"][0]
    assert first_event["event_type"] == "FINDING_CREATED"
    assert first_event["category"] == "FINDING"
    assert first_event["finding_id"] == str(sample_finding.id)
    assert first_event["organization_id"] == str(sample_finding.report.organization_id)


def test_finding_assignment_activity_logging(db_session, admin_user, reviewer_user, sample_finding):
    """Assigning a finding logs FINDING_ASSIGNED with actor details."""
    client = get_test_app(db_session, admin_user)

    assign_resp = client.post(
        f"/findings/{sample_finding.id}/assign",
        json={"assignee_id": str(reviewer_user.id)},
    )
    assert assign_resp.status_code == 200, assign_resp.text

    # Fetch activity
    resp = client.get(f"/findings/{sample_finding.id}/activity")
    assert resp.status_code == 200
    data = resp.json()

    assigned_events = [it for it in data["items"] if it["event_type"] == "FINDING_ASSIGNED"]
    assert len(assigned_events) >= 1
    event = assigned_events[0]
    assert event["category"] == "FINDING"
    assert event["actor"] is not None
    assert event["actor"]["id"] == str(admin_user.id)
    assert event["actor"]["role"] == "ADMIN"
    assert "Bob Reviewer" in event["description"]


def test_finding_lifecycle_status_activity_logging(db_session, admin_user, reviewer_user, sample_finding):
    """Status changes, submit for review, resolve, reopen generate STATUS category activities."""
    client_admin = get_test_app(db_session, admin_user)
    client_reviewer = get_test_app(db_session, reviewer_user)

    # 1. Reviewer changes status to IN_REVIEW
    resp1 = client_reviewer.patch(
        f"/findings/{sample_finding.id}/status",
        json={"status": "IN_REVIEW"},
    )
    assert resp1.status_code == 200

    # 2. Reviewer submits for admin review
    resp2 = client_reviewer.post(
        f"/findings/{sample_finding.id}/submit-for-review",
        json={"submission_note": "Log servers upgraded to retention 12 months."},
    )
    assert resp2.status_code == 200

    # 3. Admin marks as RESOLVED
    resp3 = client_admin.post(
        f"/findings/{sample_finding.id}/resolve",
        json={"resolution_note": "Admin approved and verified with security audit."},
    )
    assert resp3.status_code == 200

    # 4. Admin reopens finding
    resp4 = client_admin.post(
        f"/findings/{sample_finding.id}/reopen",
        json={"reopen_reason": "Regression observed during penetration test."},
    )
    assert resp4.status_code == 200

    # Fetch activity with category=STATUS
    resp = client_admin.get(f"/findings/{sample_finding.id}/activity?category=STATUS")
    assert resp.status_code == 200
    data = resp.json()

    event_types = [it["event_type"] for it in data["items"]]
    assert "FINDING_STATUS_CHANGED" in event_types
    assert "FINDING_SUBMITTED_FOR_REVIEW" in event_types
    assert "FINDING_RESOLVED" in event_types
    assert "FINDING_REOPENED" in event_types

    for it in data["items"]:
        assert it["category"] == "STATUS"


def test_discussion_activity_logging_and_filter(db_session, admin_user, reviewer_user, sample_finding):
    """Discussion comments and resolution log DISCUSSION category activities."""
    client_reviewer = get_test_app(db_session, reviewer_user)
    client_admin = get_test_app(db_session, admin_user)

    # 1. Reviewer posts comment
    c_resp = client_reviewer.post(
        f"/findings/{sample_finding.id}/comments",
        json={"content": "Can someone clarify which backup servers are affected?"},
    )
    assert c_resp.status_code == 201
    comment_id = c_resp.json()["id"]

    # 2. Admin replies to comment
    r_resp = client_admin.post(
        f"/findings/{sample_finding.id}/comments",
        json={
            "content": "All primary and secondary backup servers in region us-east.",
            "parent_id": comment_id,
        },
    )
    assert r_resp.status_code == 201

    # 3. Admin resolves discussion
    res_resp = client_admin.patch(
        f"/findings/{sample_finding.id}/comments/{comment_id}/resolve",
        json={"is_resolved": True},
    )
    assert res_resp.status_code == 200

    # Fetch activity with category=DISCUSSION
    resp = client_reviewer.get(f"/findings/{sample_finding.id}/activity?category=DISCUSSION")
    assert resp.status_code == 200
    data = resp.json()

    event_types = [it["event_type"] for it in data["items"]]
    assert "FINDING_COMMENTED" in event_types
    assert "FINDING_COMMENT_RESOLVED" in event_types

    for it in data["items"]:
        assert it["category"] == "DISCUSSION"


def test_remediation_cycle_activity_logging_and_filter(db_session, admin_user, reviewer_user, analyst_user, sample_finding):
    """Remediation cycles submit, reject, verify, approve log REMEDIATION category activities."""
    client_admin = get_test_app(db_session, admin_user)
    client_reviewer = get_test_app(db_session, reviewer_user)
    client_analyst = get_test_app(db_session, analyst_user)

    # 1. Create remediation
    rem_resp = client_admin.post(
        f"/findings/{sample_finding.id}/remediation",
        json={
            "assigned_to": str(analyst_user.id),
            "description": "Update server config to rotate logs after 365 days.",
        },
    )
    assert rem_resp.status_code in (200, 201)

    # 2. Analyst starts remediation
    client_analyst.post(f"/findings/{sample_finding.id}/remediation/start")

    # 3. Analyst submits Cycle 1
    sub1 = client_analyst.post(
        f"/findings/{sample_finding.id}/remediation/submit",
        json={"submission_note": "Config updated in staging."},
    )
    assert sub1.status_code == 200

    # 4. Reviewer rejects Cycle 1 with reason
    rej1 = client_reviewer.post(
        f"/findings/{sample_finding.id}/remediation/reject",
        json={"rejection_reason": "Missing production deployment evidence."},
    )
    assert rej1.status_code == 200

    # 5. Analyst submits Cycle 2
    sub2 = client_analyst.post(
        f"/findings/{sample_finding.id}/remediation/submit",
        json={"submission_note": "Deployed to production with screenshot attached."},
    )
    assert sub2.status_code == 200

    # 6. Reviewer verifies Cycle 2
    ver2 = client_reviewer.post(
        f"/findings/{sample_finding.id}/remediation/verify",
        json={"verification_note": "Verified active retention policy on prod instances."},
    )
    assert ver2.status_code == 200

    # 7. Admin approves remediation
    appr = client_admin.post(
        f"/findings/{sample_finding.id}/remediation/approve",
        json={"admin_note": "Final signoff granted."},
    )
    assert appr.status_code == 200

    # Fetch activity with category=REMEDIATION
    resp = client_reviewer.get(f"/findings/{sample_finding.id}/activity?category=REMEDIATION")
    assert resp.status_code == 200
    data = resp.json()

    event_types = [it["event_type"] for it in data["items"]]
    assert "REMEDIATION_CREATED" in event_types
    assert "REMEDIATION_CYCLE_SUBMITTED" in event_types
    assert "REMEDIATION_CYCLE_REJECTED" in event_types
    assert "REMEDIATION_CYCLE_VERIFIED" in event_types
    assert "REMEDIATION_APPROVED" in event_types

    # Verify rejection reason metadata is preserved in cycle rejected activity
    rejected_events = [it for it in data["items"] if it["event_type"] == "REMEDIATION_CYCLE_REJECTED"]
    assert len(rejected_events) >= 1
    rej_event = rejected_events[0]
    assert rej_event["metadata"]["rejection_reason"] == "Missing production deployment evidence."
    assert rej_event["metadata"]["cycle_number"] == 1


def test_pagination_and_ordering(db_session, admin_user, sample_finding):
    """Activity is sorted descending by timestamp and supports limit/page pagination."""
    # Seed 5 activity records with sequential timestamps
    for i in range(1, 6):
        act = Activity(
            id=uuid.uuid4(),
            user_id=admin_user.id,
            event_type="FINDING_STATUS_CHANGED",
            title=f"Status Update #{i}",
            description=f"Sequential action #{i}",
            icon_type="clock",
            extra_data={
                "finding_id": str(sample_finding.id),
                "organization_id": str(sample_finding.report.organization_id),
                "event_type": "FINDING_STATUS_CHANGED",
                "title": f"Status Update #{i}",
            },
            created_at=datetime(2026, 8, 15, 12, i, 0, tzinfo=timezone.utc),
        )
        db_session.add(act)
    db_session.commit()

    client = get_test_app(db_session, admin_user)

    # Page 1, limit 2 with category=STATUS
    p1 = client.get(f"/findings/{sample_finding.id}/activity?category=STATUS&page=1&limit=2")
    assert p1.status_code == 200
    d1 = p1.json()
    assert d1["page"] == 1
    assert d1["limit"] == 2
    assert d1["total"] == 5
    assert d1["total_pages"] == 3
    assert d1["has_more"] is True
    assert len(d1["items"]) == 2
    assert d1["items"][0]["description"] == "Sequential action #5"
    assert d1["items"][1]["description"] == "Sequential action #4"

    # Page 3, limit 2 with category=STATUS
    p3 = client.get(f"/findings/{sample_finding.id}/activity?category=STATUS&page=3&limit=2")
    assert p3.status_code == 200
    d3 = p3.json()
    assert d3["page"] == 3
    assert d3["has_more"] is False
    assert len(d3["items"]) == 1
    assert d3["items"][0]["description"] == "Sequential action #1"


def test_cross_org_access_forbidden(db_session, outsider_user, sample_finding):
    """User not in the finding's organization is denied access with 403 Forbidden."""
    client_outsider = get_test_app(db_session, outsider_user)

    resp = client_outsider.get(f"/findings/{sample_finding.id}/activity")
    assert resp.status_code == 403, resp.text


def test_activity_read_is_idempotent_and_non_mutating(db_session, admin_user, sample_finding):
    """Calling GET activity does not mutate the database or append audit logs."""
    client = get_test_app(db_session, admin_user)

    count_before = db_session.query(Activity).count()
    resp1 = client.get(f"/findings/{sample_finding.id}/activity")
    assert resp1.status_code == 200

    resp2 = client.get(f"/findings/{sample_finding.id}/activity")
    assert resp2.status_code == 200

    count_after = db_session.query(Activity).count()
    assert count_before == count_after
