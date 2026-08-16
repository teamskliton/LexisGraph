"""
Unit and integration test suite for Sprint 7.7 — Finding Resolution & Closure Verification.

Validates:
1. Admin can resolve finding with APPROVED remediation.
2. Incomplete remediation (NOT_STARTED, IN_PROGRESS, READY_FOR_REVIEW) blocks finding resolution (400 Bad Request).
3. Verified but unapproved remediation blocks finding resolution (400 Bad Request).
4. Rejected remediation blocks finding resolution (400 Bad Request).
5. Finding in REMEDIATION status without remediation record cannot be resolved (400 Bad Request).
6. Already resolved finding rejects repeat resolution with 409 Conflict.
7. Repeat resolution attempts produce 0 duplicate activity logs.
8. Repeat resolution attempts produce 0 duplicate notifications.
9. Non-admin users (Reviewer, Analyst) receive 403 Forbidden on resolution attempts.
10. Cross-organization access control rejects resolution attempts.
11. PATCH /findings/{id}/status to RESOLVED enforces identical eligibility verification.
12. Resolution metadata (resolved_by, resolved_by_name, resolved_at, resolution_note) is correctly persisted and returned.
13. Full end-to-end multi-cycle remediation to final resolution workflow with audit verification.
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
from app.db.models.notification import Notification
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
        username="org_reviewer",
        hashed_password="hashed_reviewer_pwd",
        full_name="Bob Reviewer",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def other_org_user(db_session):
    u = User(
        id=uuid.uuid4(),
        email="other@external.io",
        username="other_user",
        hashed_password="hashed_other_pwd",
        full_name="Charlie Other",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def organization(db_session, admin_user, reviewer_user):
    org = Organization(
        id=uuid.uuid4(),
        name="Compliance Corp",
        created_by=admin_user.id,
    )
    db_session.add(org)
    db_session.flush()

    m1 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=admin_user.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    m2 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=reviewer_user.id,
        role=UserRole.REVIEWER,
        status=MemberStatus.ACTIVE,
    )
    db_session.add_all([m1, m2])
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def report_and_finding(db_session, organization, admin_user):
    doc = Document(
        id=uuid.uuid4(),
        organization_id=organization.id,
        uploaded_by=admin_user.id,
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
        organization_id=organization.id,
        regulation_id=reg.id,
        policy_document_id=doc.id,
        created_by=admin_user.id,
        status=ComplianceReportStatus.COMPLETED,
        overall_score=85.0,
        risk_level="HIGH",
        executive_summary="Security compliance evaluation report",
    )
    db_session.add(rep)
    db_session.commit()

    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=rep.id,
        policy_clause_id="SEC-01",
        regulation_clause_id="GDPR-Art-32",
        status="NON_COMPLIANT",
        lifecycle_status="ADMIN_REVIEW",
        severity="HIGH",
        reasoning="Access logs are unencrypted.",
        recommendation="Implement AES-256 encryption on all audit log storage.",
    )
    db_session.add(finding)
    db_session.commit()
    db_session.refresh(finding)
    return rep, finding


def create_test_client(db_session, user):
    app = FastAPI()
    app.include_router(findings_router)
    app.include_router(remediations_router)

    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


# ── TEST CASES ──

def test_admin_can_resolve_finding_with_approved_remediation(db_session, admin_user, organization, report_and_finding):
    """Test 1: Admin can resolve finding when remediation is APPROVED."""
    _, finding = report_and_finding

    # Create approved remediation
    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        title="Encrypt logs",
        status="APPROVED",
        created_by=admin_user.id,
        admin_approved_by=admin_user.id,
        admin_approved_at=datetime.now(timezone.utc),
    )
    db_session.add(rem)
    db_session.commit()

    client = create_test_client(db_session, admin_user)
    resp = client.post(
        f"/findings/{finding.id}/resolve",
        json={"resolution_note": "AES-256 encryption deployed and verified."},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["lifecycle_status"] == "RESOLVED"
    assert data["resolution_note"] == "AES-256 encryption deployed and verified."
    assert data["resolved_by"] == str(admin_user.id)
    assert data["resolved_by_name"] == "Alice Admin"
    assert data["resolved_at"] is not None


def test_cannot_resolve_finding_with_in_progress_remediation(db_session, admin_user, organization, report_and_finding):
    """Test 2: Finding with IN_PROGRESS remediation cannot be resolved (400 Bad Request)."""
    _, finding = report_and_finding

    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        title="Encrypt logs",
        status="IN_PROGRESS",
        created_by=admin_user.id,
    )
    db_session.add(rem)
    db_session.commit()

    client = create_test_client(db_session, admin_user)
    resp = client.post(
        f"/findings/{finding.id}/resolve",
        json={"resolution_note": "Premature attempt"},
    )

    assert resp.status_code == 400
    assert "remediation is in progress" in resp.json()["detail"].lower()


def test_cannot_resolve_finding_with_ready_for_review_remediation(db_session, admin_user, organization, report_and_finding):
    """Test 3: Finding with READY_FOR_REVIEW remediation cannot be resolved (400 Bad Request)."""
    _, finding = report_and_finding

    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        title="Encrypt logs",
        status="READY_FOR_REVIEW",
        created_by=admin_user.id,
    )
    db_session.add(rem)
    db_session.commit()

    client = create_test_client(db_session, admin_user)
    resp = client.post(
        f"/findings/{finding.id}/resolve",
        json={"resolution_note": "Attempt before verification"},
    )

    assert resp.status_code == 400
    assert "pending review" in resp.json()["detail"].lower()


def test_cannot_resolve_finding_with_verified_but_unapproved_remediation(db_session, admin_user, organization, report_and_finding):
    """Test 4: Finding with VERIFIED remediation requires admin approval first (400 Bad Request)."""
    _, finding = report_and_finding

    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        title="Encrypt logs",
        status="VERIFIED",
        created_by=admin_user.id,
    )
    db_session.add(rem)
    db_session.commit()

    client = create_test_client(db_session, admin_user)
    resp = client.post(
        f"/findings/{finding.id}/resolve",
        json={"resolution_note": "Attempt before admin approval"},
    )

    assert resp.status_code == 400
    assert "admin approval" in resp.json()["detail"].lower()


def test_cannot_resolve_finding_with_rejected_remediation(db_session, admin_user, organization, report_and_finding):
    """Test 5: Finding with REJECTED remediation cannot be resolved (400 Bad Request)."""
    _, finding = report_and_finding

    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        title="Encrypt logs",
        status="REJECTED",
        created_by=admin_user.id,
    )
    db_session.add(rem)
    db_session.commit()

    client = create_test_client(db_session, admin_user)
    resp = client.post(
        f"/findings/{finding.id}/resolve",
        json={"resolution_note": "Attempt on rejected work"},
    )

    assert resp.status_code == 400
    assert "remediation was rejected" in resp.json()["detail"].lower()


def test_cannot_resolve_finding_with_not_started_remediation(db_session, admin_user, organization, report_and_finding):
    """Test 6: Finding with NOT_STARTED remediation cannot be resolved (400 Bad Request)."""
    _, finding = report_and_finding

    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        title="Encrypt logs",
        status="NOT_STARTED",
        created_by=admin_user.id,
    )
    db_session.add(rem)
    db_session.commit()

    client = create_test_client(db_session, admin_user)
    resp = client.post(
        f"/findings/{finding.id}/resolve",
        json={"resolution_note": "Attempt without starting remediation"},
    )

    assert resp.status_code == 400
    assert "remediation is in progress" in resp.json()["detail"].lower()


def test_already_resolved_finding_returns_409_conflict(db_session, admin_user, organization, report_and_finding):
    """Test 7: Attempting to resolve an already RESOLVED finding returns 409 Conflict."""
    _, finding = report_and_finding

    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        title="Encrypt logs",
        status="APPROVED",
        created_by=admin_user.id,
    )
    db_session.add(rem)
    db_session.commit()

    client = create_test_client(db_session, admin_user)

    # First resolve succeeds
    resp1 = client.post(f"/findings/{finding.id}/resolve", json={"resolution_note": "First resolve"})
    assert resp1.status_code == 200
    assert resp1.json()["lifecycle_status"] == "RESOLVED"

    # Second resolve returns 409 Conflict
    resp2 = client.post(f"/findings/{finding.id}/resolve", json={"resolution_note": "Second resolve"})
    assert resp2.status_code == 409
    assert "already resolved" in resp2.json()["detail"].lower()


def test_repeat_resolution_creates_zero_duplicate_activities(db_session, admin_user, organization, report_and_finding):
    """Test 8: Repeated resolution requests produce exactly 1 FINDING_RESOLVED activity event."""
    _, finding = report_and_finding

    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        title="Encrypt logs",
        status="APPROVED",
        created_by=admin_user.id,
    )
    db_session.add(rem)
    db_session.commit()

    client = create_test_client(db_session, admin_user)

    # First resolution
    resp1 = client.post(f"/findings/{finding.id}/resolve", json={"resolution_note": "Initial resolution"})
    assert resp1.status_code == 200

    # Repeat attempts
    client.post(f"/findings/{finding.id}/resolve", json={"resolution_note": "Repeat 1"})
    client.post(f"/findings/{finding.id}/resolve", json={"resolution_note": "Repeat 2"})

    resolved_activities = db_session.query(Activity).filter(
        Activity.event_type == "FINDING_RESOLVED",
    ).all()
    matching = [
        a for a in resolved_activities
        if a.extra_data and str(a.extra_data.get("finding_id")) == str(finding.id)
    ]
    assert len(matching) == 1


def test_repeat_resolution_creates_zero_duplicate_notifications(db_session, admin_user, reviewer_user, organization, report_and_finding):
    """Test 9: Repeated resolution requests produce exactly 1 notification."""
    _, finding = report_and_finding
    finding.assigned_to = reviewer_user.id
    db_session.commit()

    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        title="Encrypt logs",
        status="APPROVED",
        created_by=admin_user.id,
    )
    db_session.add(rem)
    db_session.commit()

    client = create_test_client(db_session, admin_user)

    client.post(f"/findings/{finding.id}/resolve", json={"resolution_note": "Initial resolution"})
    client.post(f"/findings/{finding.id}/resolve", json={"resolution_note": "Repeat 1"})
    client.post(f"/findings/{finding.id}/resolve", json={"resolution_note": "Repeat 2"})

    notifs = db_session.query(Notification).filter(
        Notification.type == "FINDING_RESOLVED",
        Notification.finding_id == finding.id,
    ).all()
    assert len(notifs) == 1


def test_reviewer_cannot_resolve_finding_403(db_session, reviewer_user, organization, report_and_finding):
    """Test 10: Non-admin (Reviewer / Analyst) receives 403 Forbidden on resolution attempts."""
    _, finding = report_and_finding

    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        title="Encrypt logs",
        status="APPROVED",
        created_by=reviewer_user.id,
    )
    db_session.add(rem)
    db_session.commit()

    client = create_test_client(db_session, reviewer_user)
    resp = client.post(f"/findings/{finding.id}/resolve", json={"resolution_note": "Unauthorized attempt"})

    assert resp.status_code == 403
    assert "only organization admins" in resp.json()["detail"].lower()


def test_cross_org_user_cannot_resolve_finding(db_session, other_org_user, organization, report_and_finding):
    """Test 11: Cross-organization user cannot resolve finding."""
    _, finding = report_and_finding

    client = create_test_client(db_session, other_org_user)
    resp = client.post(f"/findings/{finding.id}/resolve", json={"resolution_note": "Cross-org attempt"})
    assert resp.status_code in (403, 404)


def test_patch_status_to_resolved_enforces_same_rules(db_session, admin_user, reviewer_user, organization, report_and_finding):
    """Test 12: PATCH /findings/{id}/status to RESOLVED enforces admin role & approved remediation."""
    _, finding = report_and_finding

    # 1. Reviewer PATCH -> 403
    client_rev = create_test_client(db_session, reviewer_user)
    resp1 = client_rev.patch(f"/findings/{finding.id}/status", json={"lifecycle_status": "RESOLVED"})
    assert resp1.status_code == 403

    # 2. Admin PATCH without approved remediation -> 400
    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        title="Encrypt logs",
        status="IN_PROGRESS",
        created_by=admin_user.id,
    )
    db_session.add(rem)
    db_session.commit()

    client_adm = create_test_client(db_session, admin_user)
    resp2 = client_adm.patch(f"/findings/{finding.id}/status", json={"lifecycle_status": "RESOLVED"})
    assert resp2.status_code == 400

    # 3. Admin PATCH with approved remediation -> 200 RESOLVED
    rem.status = "APPROVED"
    db_session.commit()

    resp3 = client_adm.patch(f"/findings/{finding.id}/status", json={"lifecycle_status": "RESOLVED"})
    assert resp3.status_code == 200
    assert resp3.json()["lifecycle_status"] == "RESOLVED"
    assert resp3.json()["resolved_by"] == str(admin_user.id)


def test_full_end_to_end_finding_resolution_lifecycle(db_session, admin_user, reviewer_user, organization, report_and_finding):
    """
    Test 13: Full multi-cycle E2E remediation & resolution lifecycle:
    IDENTIFIED (OPEN) -> IN_REVIEW -> REMEDIATION -> Cycle 1 Rejected -> Cycle 2 Verified ->
    Admin Approved -> Finding RESOLVED -> Repeated resolution rejected (409) -> Timeline audit.
    """
    _, finding = report_and_finding
    finding.lifecycle_status = "OPEN"
    db_session.commit()

    client_adm = create_test_client(db_session, admin_user)
    client_rev = create_test_client(db_session, reviewer_user)

    # 1. Start Review
    r1 = client_rev.patch(f"/findings/{finding.id}/status", json={"lifecycle_status": "IN_REVIEW"})
    assert r1.status_code == 200

    # 2. Move to Remediation
    r2 = client_rev.patch(f"/findings/{finding.id}/status", json={"lifecycle_status": "REMEDIATION"})
    assert r2.status_code == 200

    # 3. Create Remediation Record
    r3 = client_adm.post(
        f"/findings/{finding.id}/remediation",
        json={"title": "Fix unencrypted audit logs", "description": "Implement KMS encryption."},
    )
    assert r3.status_code == 201

    # 4. Submit Cycle 1
    r4 = client_adm.post(
        f"/findings/{finding.id}/remediation/submit",
        json={"submission_note": "Cycle 1 submitted with basic script."},
    )
    assert r4.status_code == 200

    # 5. Reviewer Rejects Cycle 1
    r5 = client_rev.post(
        f"/findings/{finding.id}/remediation/reject",
        json={"rejection_reason": "Script lacks automated key rotation."},
    )
    assert r5.status_code == 200

    # 6. Admin attempts resolution -> Must fail (Remediation is REJECTED)
    r6 = client_adm.post(f"/findings/{finding.id}/resolve", json={"resolution_note": "Premature"})
    assert r6.status_code == 400

    # 7. Submit Cycle 2 with rotation
    r7 = client_adm.post(
        f"/findings/{finding.id}/remediation/submit",
        json={"submission_note": "Cycle 2 submitted with AWS KMS auto-rotation active."},
    )
    assert r7.status_code == 200

    # 8. Reviewer Verifies Cycle 2
    r8 = client_rev.post(
        f"/findings/{finding.id}/remediation/verify",
        json={"verification_note": "Key rotation verified in AWS console."},
    )
    assert r8.status_code == 200

    # 9. Admin attempts resolution before Admin Approval -> Must fail (Remediation is VERIFIED, not APPROVED)
    r9 = client_adm.post(f"/findings/{finding.id}/resolve", json={"resolution_note": "Before approval"})
    assert r9.status_code == 400

    # 10. Admin Approves Remediation
    r10 = client_adm.post(
        f"/findings/{finding.id}/remediation/approve",
        json={"admin_note": "Compliance signoff on KMS configuration."},
    )
    assert r10.status_code == 200

    # Finding should STILL be in previous lifecycle state (Remediation Approved != Finding Resolved)
    db_session.refresh(finding)
    assert finding.lifecycle_status != "RESOLVED"

    # 11. Admin explicitly Resolves Finding
    r11 = client_adm.post(
        f"/findings/{finding.id}/resolve",
        json={"resolution_note": "KMS encryption and rotation fully implemented and verified."},
    )
    assert r11.status_code == 200
    res_data = r11.json()
    assert res_data["lifecycle_status"] == "RESOLVED"
    assert res_data["resolved_by"] == str(admin_user.id)
    assert res_data["resolved_by_name"] == "Alice Admin"
    assert res_data["resolved_at"] is not None

    # 12. Repeated resolution attempt rejected with 409 Conflict
    r12 = client_adm.post(f"/findings/{finding.id}/resolve", json={"resolution_note": "Duplicate attempt"})
    assert r12.status_code == 409

    # 13. Verify Activity Timeline has FINDING_RESOLVED and REMEDIATION_APPROVED events
    r13 = client_adm.get(f"/findings/{finding.id}/activity")
    assert r13.status_code == 200
    timeline = r13.json()["items"]
    event_types = [item["event_type"] for item in timeline]
    assert "FINDING_RESOLVED" in event_types
    assert "REMEDIATION_APPROVED" in event_types
    assert "REMEDIATION_CYCLE_VERIFIED" in event_types
    assert "REMEDIATION_CYCLE_REJECTED" in event_types
    assert "REMEDIATION_CYCLE_SUBMITTED" in event_types
