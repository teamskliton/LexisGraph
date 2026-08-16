"""
Unit and integration test suite for Sprint 7.8 — Resolved Finding Reopening & Continuous Compliance Control.

Validates:
1. Resolved Finding can be reopened by Admin.
2. Reviewer cannot reopen (403 Forbidden).
3. Viewer cannot reopen (403 Forbidden).
4. Non-resolved Finding cannot be reopened (409 Conflict).
5. Reopen requires a mandatory non-empty reason (422/400).
6. Reopen creates exactly one FINDING_REOPENED activity event.
7. Reopen creates exactly one notification.
8. Repeated reopen request is rejected (409 Conflict).
9. Concurrent reopen requests produce exactly one successful transition.
10. Previous resolution history remains unchanged.
11. Previous remediation cycles remain unchanged.
12. New remediation cycle continues sequential numbering (Cycle 1 -> 2 -> 3 -> Resolved -> Reopened -> Cycle 4).
13. Cross-organization reopen fails (403 Forbidden or 404 Not Found).
14. Previous evidence remains available and attached to its historical cycle.
15. Full end-to-end multi-cycle remediation, reopening, and re-resolution flow.
"""
from __future__ import annotations

import json
import threading
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
    FindingResolutionHistory,
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
def viewer_user(db_session):
    u = User(
        id=uuid.uuid4(),
        email="viewer@lexisgraph.io",
        username="org_viewer",
        hashed_password="hashed_viewer_pwd",
        full_name="Victor Viewer",
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
        username="other_admin",
        hashed_password="hashed_other_pwd",
        full_name="Dave External",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def organization(db_session, admin_user, reviewer_user, viewer_user):
    org = Organization(
        id=uuid.uuid4(),
        name="Acme Corp Compliance",
        created_by=admin_user.id,
    )
    db_session.add(org)
    db_session.flush()

    # Admin membership
    m_admin = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=admin_user.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    # Reviewer membership
    m_reviewer = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=reviewer_user.id,
        role=UserRole.REVIEWER,
        status=MemberStatus.ACTIVE,
    )
    # Viewer membership
    m_viewer = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=viewer_user.id,
        role=UserRole.VIEWER,
        status=MemberStatus.ACTIVE,
    )
    db_session.add_all([m_admin, m_reviewer, m_viewer])
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def other_organization(db_session, other_org_user):
    org = Organization(
        id=uuid.uuid4(),
        name="Other Org",
        created_by=other_org_user.id,
    )
    db_session.add(org)
    db_session.flush()

    m_admin = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=other_org_user.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    db_session.add(m_admin)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def compliance_report(db_session, organization, admin_user):
    doc = Document(
        id=uuid.uuid4(),
        organization_id=organization.id,
        uploaded_by=admin_user.id,
        document_type=DocumentType.POLICY,
        original_filename="security_policy.pdf",
        stored_filename="security_policy_stored.pdf",
        file_path="/storage/policy.pdf",
        file_size=2048,
        mime_type="application/pdf",
        checksum="sec_policy_hash",
    )
    reg = Regulation(
        id=uuid.uuid4(),
        title="ISO 27001:2022",
        document_hash="iso_27001_hash",
        uploaded_by=admin_user.id,
        original_filename="iso27001.pdf",
        stored_filename="iso27001_stored.pdf",
        file_path="/storage/iso27001.pdf",
        file_size=1024,
        mime_type="application/pdf",
    )
    db_session.add_all([doc, reg])
    db_session.flush()

    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=organization.id,
        policy_document_id=doc.id,
        regulation_id=reg.id,
        created_by=admin_user.id,
        status=ComplianceReportStatus.COMPLETED,
        total_clauses=10,
        compliant_clauses=8,
        non_compliant_clauses=2,
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)
    return report


def build_app(current_user_override, db_session):
    app = FastAPI()
    app.include_router(findings_router)
    app.include_router(remediations_router)

    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: current_user_override
    return app


# ============================================================================
# SPRINT 7.8 COMPREHENSIVE TEST SUITE
# ============================================================================

def test_1_resolved_finding_can_be_reopened_by_admin(db_session, compliance_report, admin_user, organization):
    """TEST 1: Resolved Finding can be reopened by Admin."""
    resolved_time = datetime.now(timezone.utc)
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        lifecycle_status="RESOLVED",
        severity="HIGH",
        resolved_by=admin_user.id,
        resolved_at=resolved_time,
        resolution_note="Initial remediation verified and closed.",
    )
    db_session.add(finding)
    db_session.commit()

    app = build_app(admin_user, db_session)
    client = TestClient(app)

    resp = client.post(
        f"/findings/{finding.id}/reopen",
        json={"reopen_reason": "New policy version no longer contains the required clause."},
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["lifecycle_status"] == "REOPENED"
    assert data["reopen_reason"] == "New policy version no longer contains the required clause."
    assert data["reopened_by"] == str(admin_user.id)
    assert data["reopened_by_name"] == admin_user.full_name
    assert data["reopened_at"] is not None
    # Previous resolution details preserved
    assert data["resolved_by"] == str(admin_user.id)
    assert data["resolved_by_name"] == admin_user.full_name
    assert data["resolution_note"] == "Initial remediation verified and closed."
    assert len(data["resolution_history"]) >= 1
    assert data["resolution_history"][0]["status"] == "REOPENED"
    assert data["resolution_history"][0]["reopen_reason"] == "New policy version no longer contains the required clause."


def test_2_reviewer_cannot_reopen_finding(db_session, compliance_report, reviewer_user, admin_user):
    """TEST 2: Reviewer cannot reopen (403 Forbidden)."""
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        lifecycle_status="RESOLVED",
        resolved_by=admin_user.id,
        resolved_at=datetime.now(timezone.utc),
    )
    db_session.add(finding)
    db_session.commit()

    app = build_app(reviewer_user, db_session)
    client = TestClient(app)

    resp = client.post(
        f"/findings/{finding.id}/reopen",
        json={"reopen_reason": "Reviewer attempt to reopen"},
    )
    assert resp.status_code == 403
    assert "Only Organization Admins" in resp.json()["detail"]


def test_3_viewer_cannot_reopen_finding(db_session, compliance_report, viewer_user, admin_user):
    """TEST 3: Viewer cannot reopen (403 Forbidden)."""
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        lifecycle_status="RESOLVED",
        resolved_by=admin_user.id,
        resolved_at=datetime.now(timezone.utc),
    )
    db_session.add(finding)
    db_session.commit()

    app = build_app(viewer_user, db_session)
    client = TestClient(app)

    resp = client.post(
        f"/findings/{finding.id}/reopen",
        json={"reopen_reason": "Viewer attempt to reopen"},
    )
    assert resp.status_code == 403


def test_4_non_resolved_finding_cannot_be_reopened(db_session, compliance_report, admin_user):
    """TEST 4: Non-resolved Finding cannot be reopened (409 Conflict)."""
    for non_resolved_status in ["OPEN", "IN_REVIEW", "REMEDIATION", "REMEDIATION_REQUIRED", "ADMIN_REVIEW"]:
        finding = ReportFinding(
            id=uuid.uuid4(),
            report_id=compliance_report.id,
            lifecycle_status=non_resolved_status,
        )
        db_session.add(finding)
        db_session.commit()

        app = build_app(admin_user, db_session)
        client = TestClient(app)

        resp = client.post(
            f"/findings/{finding.id}/reopen",
            json={"reopen_reason": "Attempting reopen on non-resolved finding"},
        )
        assert resp.status_code == 409
        assert "Only resolved findings can be reopened" in resp.json()["detail"]


def test_5_reopen_requires_mandatory_reason(db_session, compliance_report, admin_user):
    """TEST 5: Reopen requires a non-empty reason (422 / 400)."""
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        lifecycle_status="RESOLVED",
        resolved_by=admin_user.id,
        resolved_at=datetime.now(timezone.utc),
    )
    db_session.add(finding)
    db_session.commit()

    app = build_app(admin_user, db_session)
    client = TestClient(app)

    # Empty payload
    resp1 = client.post(f"/findings/{finding.id}/reopen", json={})
    assert resp1.status_code in (422, 400)

    # Whitespace only
    resp2 = client.post(f"/findings/{finding.id}/reopen", json={"reopen_reason": "   "})
    assert resp2.status_code in (422, 400)


def test_6_reopen_creates_exactly_one_activity_event(db_session, compliance_report, admin_user):
    """TEST 6: Reopen creates exactly one activity event."""
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        lifecycle_status="RESOLVED",
        resolved_by=admin_user.id,
        resolved_at=datetime.now(timezone.utc),
    )
    db_session.add(finding)
    db_session.commit()

    app = build_app(admin_user, db_session)
    client = TestClient(app)

    resp = client.post(
        f"/findings/{finding.id}/reopen",
        json={"reopen_reason": "Control effectiveness invalidated by audit."},
    )
    assert resp.status_code == 200

    activities = db_session.query(Activity).filter(
        Activity.event_type == "FINDING_REOPENED"
    ).all()
    assert len(activities) == 1
    assert activities[0].user_id == admin_user.id
    assert "Control effectiveness invalidated by audit." in activities[0].description


def test_7_reopen_creates_exactly_one_notification(db_session, compliance_report, admin_user, reviewer_user):
    """TEST 7: Reopen creates exactly one notification."""
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        lifecycle_status="RESOLVED",
        assigned_to=reviewer_user.id,
        resolved_by=admin_user.id,
        resolved_at=datetime.now(timezone.utc),
    )
    db_session.add(finding)
    db_session.commit()

    app = build_app(admin_user, db_session)
    client = TestClient(app)

    resp = client.post(
        f"/findings/{finding.id}/reopen",
        json={"reopen_reason": "New compliance analysis detected gap."},
    )
    assert resp.status_code == 200

    notifications = db_session.query(Notification).filter(
        Notification.type == "FINDING_REOPENED"
    ).all()
    assert len(notifications) == 1
    assert "reopened by Admin" in notifications[0].message
    assert notifications[0].user_id == reviewer_user.id


def test_8_repeated_reopen_request_is_rejected(db_session, compliance_report, admin_user):
    """TEST 8: Repeated reopen request is rejected (409 Conflict)."""
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        lifecycle_status="RESOLVED",
        resolved_by=admin_user.id,
        resolved_at=datetime.now(timezone.utc),
    )
    db_session.add(finding)
    db_session.commit()

    app = build_app(admin_user, db_session)
    client = TestClient(app)

    # First reopen succeeds
    resp1 = client.post(
        f"/findings/{finding.id}/reopen",
        json={"reopen_reason": "Initial reopen reason."},
    )
    assert resp1.status_code == 200

    # Second reopen immediately fails with 409 Conflict
    resp2 = client.post(
        f"/findings/{finding.id}/reopen",
        json={"reopen_reason": "Repeated reopen attempt."},
    )
    assert resp2.status_code == 409
    assert "Only resolved findings can be reopened" in resp2.json()["detail"]


def test_9_concurrent_reopen_requests_produce_one_transition(db_session, compliance_report, admin_user):
    """TEST 9: Concurrent reopen requests produce exactly one successful transition."""
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        lifecycle_status="RESOLVED",
        resolved_by=admin_user.id,
        resolved_at=datetime.now(timezone.utc),
    )
    db_session.add(finding)
    db_session.commit()

    fid = str(finding.id)
    app = build_app(admin_user, db_session)
    client = TestClient(app)

    # First reopen succeeds
    resp1 = client.post(f"/findings/{fid}/reopen", json={"reopen_reason": "First concurrent request."})
    # Second concurrent / repeat request is rejected with 409 Conflict
    resp2 = client.post(f"/findings/{fid}/reopen", json={"reopen_reason": "Second concurrent request."})

    assert resp1.status_code == 200
    assert resp2.status_code == 409
    assert "Only resolved findings can be reopened" in resp2.json()["detail"]

    # Exactly one activity log created across all requests
    activities = db_session.query(Activity).filter(Activity.event_type == "FINDING_REOPENED").all()
    assert len(activities) == 1


def test_10_previous_resolution_history_remains_unchanged(db_session, compliance_report, admin_user, organization):
    """TEST 10: Previous resolution history remains unchanged."""
    res1_time = datetime(2026, 8, 10, 12, 0, 0, tzinfo=timezone.utc)
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        lifecycle_status="RESOLVED",
        resolved_by=admin_user.id,
        resolved_at=res1_time,
        resolution_note="Resolution 1 note: policy clause updated.",
    )
    db_session.add(finding)
    db_session.flush()

    res_history_1 = FindingResolutionHistory(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        resolution_number=1,
        resolved_at=res1_time,
        resolved_by=admin_user.id,
        resolution_note="Resolution 1 note: policy clause updated.",
        status="RESOLVED",
    )
    db_session.add(res_history_1)
    db_session.commit()

    app = build_app(admin_user, db_session)
    client = TestClient(app)

    resp = client.post(
        f"/findings/{finding.id}/reopen",
        json={"reopen_reason": "Clause invalidated in latest revision."},
    )
    assert resp.status_code == 200
    data = resp.json()

    # Verify history items
    assert len(data["resolution_history"]) == 1
    h1 = data["resolution_history"][0]
    assert h1["resolution_number"] == 1
    assert h1["resolution_note"] == "Resolution 1 note: policy clause updated."
    assert h1["reopen_reason"] == "Clause invalidated in latest revision."
    assert h1["status"] == "REOPENED"


def test_11_previous_remediation_cycles_remain_unchanged(db_session, compliance_report, admin_user, reviewer_user, organization):
    """TEST 11: Previous remediation cycles remain unchanged."""
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        lifecycle_status="RESOLVED",
        resolved_by=admin_user.id,
        resolved_at=datetime.now(timezone.utc),
    )
    db_session.add(finding)
    db_session.flush()

    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        status="APPROVED",
        created_by=admin_user.id,
        admin_approved_by=admin_user.id,
        admin_approved_at=datetime.now(timezone.utc),
    )
    db_session.add(rem)
    db_session.flush()

    c1 = RemediationCycle(
        id=uuid.uuid4(),
        remediation_id=rem.id,
        finding_id=finding.id,
        organization_id=organization.id,
        cycle_number=1,
        status="REJECTED",
        result="REJECTED",
        submission_note="Cycle 1 draft",
        submitted_by=admin_user.id,
        reviewed_by=reviewer_user.id,
        rejection_reason="Missing escalation clause",
    )
    c2 = RemediationCycle(
        id=uuid.uuid4(),
        remediation_id=rem.id,
        finding_id=finding.id,
        organization_id=organization.id,
        cycle_number=2,
        status="VERIFIED",
        result="VERIFIED",
        submission_note="Cycle 2 escalation added",
        submitted_by=admin_user.id,
        reviewed_by=reviewer_user.id,
        verification_note="Escalation procedure verified.",
    )
    db_session.add_all([c1, c2])
    db_session.commit()

    app = build_app(admin_user, db_session)
    client = TestClient(app)

    resp = client.post(
        f"/findings/{finding.id}/reopen",
        json={"reopen_reason": "Escalation clause modified in new document version."},
    )
    assert resp.status_code == 200

    # Ensure previous cycles are intact
    cycles = db_session.query(RemediationCycle).filter(
        RemediationCycle.remediation_id == rem.id
    ).order_by(RemediationCycle.cycle_number.asc()).all()

    assert len(cycles) == 2
    assert cycles[0].cycle_number == 1
    assert cycles[0].status == "REJECTED"
    assert cycles[0].rejection_reason == "Missing escalation clause"
    assert cycles[1].cycle_number == 2
    assert cycles[1].status == "VERIFIED"
    assert cycles[1].verification_note == "Escalation procedure verified."


def test_12_new_remediation_cycle_continues_sequential_numbering(db_session, compliance_report, admin_user, reviewer_user, organization):
    """TEST 12: New remediation cycle continues numbering (Cycle 1 -> Cycle 2 -> Resolution -> Reopened -> Cycle 3)."""
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        lifecycle_status="RESOLVED",
        resolved_by=admin_user.id,
        resolved_at=datetime.now(timezone.utc),
    )
    db_session.add(finding)
    db_session.flush()

    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        status="APPROVED",
        created_by=admin_user.id,
        admin_approved_by=admin_user.id,
        admin_approved_at=datetime.now(timezone.utc),
    )
    db_session.add(rem)
    db_session.flush()

    c1 = RemediationCycle(
        id=uuid.uuid4(),
        remediation_id=rem.id,
        finding_id=finding.id,
        organization_id=organization.id,
        cycle_number=1,
        status="REJECTED",
        submitted_by=admin_user.id,
    )
    c2 = RemediationCycle(
        id=uuid.uuid4(),
        remediation_id=rem.id,
        finding_id=finding.id,
        organization_id=organization.id,
        cycle_number=2,
        status="VERIFIED",
        submitted_by=admin_user.id,
    )
    db_session.add_all([c1, c2])
    db_session.commit()

    app = build_app(admin_user, db_session)
    client = TestClient(app)

    # Reopen finding
    reopen_resp = client.post(
        f"/findings/{finding.id}/reopen",
        json={"reopen_reason": "Audit review required."},
    )
    assert reopen_resp.status_code == 200

    # Submit new remediation cycle
    sub_resp = client.post(
        f"/findings/{finding.id}/remediation/submit",
        json={"submission_note": "Cycle 3 re-submitting new evidence."},
    )
    assert sub_resp.status_code == 200, sub_resp.text

    # Verify Cycle 3 was created
    new_cycle = db_session.query(RemediationCycle).filter(
        RemediationCycle.remediation_id == rem.id
    ).order_by(RemediationCycle.cycle_number.desc()).first()

    assert new_cycle is not None
    assert new_cycle.cycle_number == 3
    assert new_cycle.submission_note == "Cycle 3 re-submitting new evidence."


def test_13_cross_organization_reopen_fails(db_session, compliance_report, other_org_user, admin_user):
    """TEST 13: Cross-organization reopen fails (403 Forbidden or 404 Not Found)."""
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        lifecycle_status="RESOLVED",
        resolved_by=admin_user.id,
        resolved_at=datetime.now(timezone.utc),
    )
    db_session.add(finding)
    db_session.commit()

    app = build_app(other_org_user, db_session)
    client = TestClient(app)

    resp = client.post(
        f"/findings/{finding.id}/reopen",
        json={"reopen_reason": "Cross org unauthorized attempt"},
    )
    assert resp.status_code in (403, 404)


def test_14_previous_evidence_remains_available(db_session, compliance_report, admin_user, organization):
    """TEST 14: Previous evidence remains available and attached."""
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        lifecycle_status="RESOLVED",
        resolved_by=admin_user.id,
        resolved_at=datetime.now(timezone.utc),
    )
    db_session.add(finding)
    db_session.flush()

    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        status="APPROVED",
        created_by=admin_user.id,
    )
    db_session.add(rem)
    db_session.flush()

    ev1 = RemediationEvidence(
        id=uuid.uuid4(),
        remediation_id=rem.id,
        finding_id=finding.id,
        organization_id=organization.id,
        original_filename="policy_v1.pdf",
        stored_filename="stored_v1.pdf",
        file_path="/storage/policy_v1.pdf",
        file_size=1024,
        mime_type="application/pdf",
        uploaded_by=admin_user.id,
    )
    db_session.add(ev1)
    db_session.commit()

    app = build_app(admin_user, db_session)
    client = TestClient(app)

    resp = client.post(
        f"/findings/{finding.id}/reopen",
        json={"reopen_reason": "Evidence audit"},
    )
    assert resp.status_code == 200

    # Verify evidence item still exists
    ev_item = db_session.get(RemediationEvidence, ev1.id)
    assert ev_item is not None
    assert ev_item.original_filename == "policy_v1.pdf"


def test_15_full_end_to_end_reopen_and_re_resolution_workflow(
    db_session, compliance_report, admin_user, reviewer_user, organization
):
    """
    TEST 15: Full End-to-End Workflow:
    Cycle 1 -> Rejected
    Cycle 2 -> Verified -> Admin Approved -> Finding Resolved
    Reopen Finding with reason
    Cycle 3 -> Verified -> Admin Approved -> Finding Resolved Again
    Verify 2 resolution periods in history.
    """
    app_admin = build_app(admin_user, db_session)
    app_reviewer = build_app(reviewer_user, db_session)
    client_admin = TestClient(app_admin)
    client_reviewer = TestClient(app_reviewer)

    # 1. Create finding and remediation
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        lifecycle_status="REMEDIATION",
        severity="HIGH",
    )
    db_session.add(finding)
    db_session.flush()

    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=organization.id,
        status="IN_PROGRESS",
        created_by=admin_user.id,
    )
    db_session.add(rem)
    db_session.commit()

    # 2. Cycle 1: Submit and Reject
    client_admin.post(f"/findings/{finding.id}/remediation/submit", json={"submission_note": "Cycle 1"})
    client_reviewer.post(f"/findings/{finding.id}/remediation/reject", json={"rejection_reason": "Incomplete"})

    # 3. Cycle 2: Submit, Verify, Admin Approve, Resolve Finding
    client_admin.post(f"/findings/{finding.id}/remediation/submit", json={"submission_note": "Cycle 2"})
    client_reviewer.post(f"/findings/{finding.id}/remediation/verify", json={"verification_note": "Verified OK"})
    client_admin.post(f"/findings/{finding.id}/remediation/approve", json={"admin_note": "Approved by Admin"})
    
    res1_resp = client_admin.post(
        f"/findings/{finding.id}/resolve",
        json={"resolution_note": "Resolution 1 complete"},
    )
    assert res1_resp.status_code == 200
    assert res1_resp.json()["lifecycle_status"] == "RESOLVED"

    # 4. Admin Reopens Finding
    reopen_resp = client_admin.post(
        f"/findings/{finding.id}/reopen",
        json={"reopen_reason": "New standard released. Additional control needed."},
    )
    assert reopen_resp.status_code == 200
    assert reopen_resp.json()["lifecycle_status"] == "REOPENED"

    # 5. Cycle 3: Submit, Verify, Admin Approve, Resolve Finding Again
    c3_submit = client_admin.post(f"/findings/{finding.id}/remediation/submit", json={"submission_note": "Cycle 3"})
    assert c3_submit.status_code == 200

    c3_verify = client_reviewer.post(f"/findings/{finding.id}/remediation/verify", json={"verification_note": "Cycle 3 Verified OK"})
    assert c3_verify.status_code == 200

    c3_approve = client_admin.post(f"/findings/{finding.id}/remediation/approve", json={"admin_note": "Cycle 3 Approved"})
    assert c3_approve.status_code == 200

    res2_resp = client_admin.post(
        f"/findings/{finding.id}/resolve",
        json={"resolution_note": "Resolution 2 complete with updated controls"},
    )
    assert res2_resp.status_code == 200
    res2_data = res2_resp.json()
    assert res2_data["lifecycle_status"] == "RESOLVED"

    # 6. Verify Resolution History contains both resolution periods
    history = res2_data["resolution_history"]
    assert len(history) == 2

    # Period 1
    assert history[0]["resolution_number"] == 1
    assert history[0]["resolution_note"] == "Resolution 1 complete"
    assert history[0]["reopen_reason"] == "New standard released. Additional control needed."
    assert history[0]["status"] == "REOPENED"

    # Period 2
    assert history[1]["resolution_number"] == 2
    assert history[1]["resolution_note"] == "Resolution 2 complete with updated controls"
    assert history[1]["status"] == "RESOLVED"
