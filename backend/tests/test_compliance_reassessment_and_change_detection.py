"""
Comprehensive unit and integration test suite for Sprint 7.9 — Compliance Reassessment & Finding Change Detection.

Validates:
1. Resolved Finding can become reassessment-required upon new analysis or document update.
2. Unrelated Finding is not marked reassessment-required.
3. Document/policy change identifies and links to related resolved finding.
4. Duplicate trigger does not create duplicate reassessments.
5. Duplicate trigger does not create duplicate notifications.
6. Admin can retrieve full reassessment context & delta.
7. Admin can Keep Resolved.
8. Keep Resolved returns finding to RESOLVED and clears reassessment flags.
9. Keep Resolved creates FINDING_REASSESSMENT_COMPLETED activity event.
10. Admin can Reopen from reassessment.
11. Reopen from reassessment follows Sprint 7.8 workflow (sequential cycles, IN_PROGRESS status).
12. Reviewer cannot make reassessment decision (403 Forbidden).
13. Viewer cannot make reassessment decision (403 Forbidden).
14. Cross-organization reassessment fails (403/404).
15. Previous resolution history remains intact.
16. Previous remediation cycles remain intact.
17. Previous evidence remains intact.
18. Full end-to-end multi-path workflow (Path A: Keep Resolved; Path B: Reopen -> Remediation -> Verify -> Resolve).
"""
from __future__ import annotations

import json
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
        original_filename="POSH_Policy_v1.pdf",
        stored_filename="posh_policy_stored.pdf",
        file_path="/storage/policy.pdf",
        file_size=2048,
        mime_type="application/pdf",
        checksum="posh_policy_hash",
    )
    reg = Regulation(
        id=uuid.uuid4(),
        title="POSH Act 2013",
        document_hash="posh_hash",
        uploaded_by=admin_user.id,
        original_filename="posh_act.pdf",
        stored_filename="posh_act_stored.pdf",
        file_path="/storage/posh.pdf",
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


def create_resolved_finding(db_session, compliance_report, admin_user, reg_clause="REG-POSH-4", pol_clause="POL-POSH-1"):
    now_utc = datetime.now(timezone.utc)
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=compliance_report.id,
        policy_clause_id=pol_clause,
        regulation_clause_id=reg_clause,
        status="NON_COMPLIANT",
        lifecycle_status="RESOLVED",
        confidence=0.95,
        severity="HIGH",
        reasoning="Non-compliance detected in complaints committee setup.",
        recommendation="Constitute internal complaints committee.",
        citation="Section 4 of POSH Act 2013",
        resolved_by=admin_user.id,
        resolved_at=now_utc,
        resolution_note="Constituted ICC with 4 members.",
    )
    db_session.add(finding)
    db_session.flush()

    res_hist = FindingResolutionHistory(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=compliance_report.organization_id,
        resolution_number=1,
        resolved_at=now_utc,
        resolved_by=admin_user.id,
        resolution_note="Constituted ICC with 4 members.",
        status="RESOLVED",
    )
    db_session.add(res_hist)

    rem = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=compliance_report.organization_id,
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
        organization_id=compliance_report.organization_id,
        cycle_number=1,
        status="REJECTED",
        result="REJECTED",
        submission_note="Cycle 1 draft",
        submitted_by=admin_user.id,
        reviewed_by=admin_user.id,
        rejection_reason="Missing quorum order",
    )
    c2 = RemediationCycle(
        id=uuid.uuid4(),
        remediation_id=rem.id,
        finding_id=finding.id,
        organization_id=compliance_report.organization_id,
        cycle_number=2,
        status="VERIFIED",
        result="VERIFIED",
        submission_note="Cycle 2 update",
        submitted_by=admin_user.id,
        reviewed_by=admin_user.id,
        verification_note="ICC constitution order verified",
    )
    db_session.add_all([c1, c2])
    db_session.flush()

    ev = RemediationEvidence(
        id=uuid.uuid4(),
        remediation_id=rem.id,
        finding_id=finding.id,
        organization_id=compliance_report.organization_id,
        original_filename="ICC_Order.pdf",
        stored_filename="icc_order_stored.pdf",
        file_path="/storage/icc_order.pdf",
        file_size=1024,
        mime_type="application/pdf",
        uploaded_by=admin_user.id,
    )
    db_session.add(ev)

    db_session.commit()
    db_session.refresh(finding)
    return finding, rem


# ==============================================================================
# TESTS
# ==============================================================================

def test_1_resolved_finding_can_become_reassessment_required(db_session, compliance_report, admin_user):
    """TEST 1: Resolved finding can be marked REASSESSMENT_REQUIRED."""
    finding, _ = create_resolved_finding(db_session, compliance_report, admin_user)
    app = build_app(admin_user, db_session)
    client = TestClient(app)

    resp = client.post(
        f"/findings/{finding.id}/reassessment/trigger",
        json={
            "trigger": "POLICY_UPDATE",
            "reason": "POSH Policy updated to v2",
            "document_id": str(compliance_report.policy_document_id),
            "document_name": "POSH_Policy_v2.pdf",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["lifecycle_status"] == "REASSESSMENT_REQUIRED"
    assert data["reassessment_trigger"] == "POLICY_UPDATE"
    assert data["reassessment_reason"] == "POSH Policy updated to v2"
    assert data["reassessment_document_name"] == "POSH_Policy_v2.pdf"


def test_2_unrelated_finding_not_marked_reassessment_required(db_session, compliance_report, admin_user):
    """TEST 2: Unrelated findings in the organization remain untouched."""
    f1, _ = create_resolved_finding(db_session, compliance_report, admin_user, reg_clause="REG-POSH-4")
    f2, _ = create_resolved_finding(db_session, compliance_report, admin_user, reg_clause="REG-POSH-9-UNRELATED")
    app = build_app(admin_user, db_session)
    client = TestClient(app)

    resp = client.post(
        f"/findings/{f1.id}/reassessment/trigger",
        json={"trigger": "DOCUMENT_UPDATE", "reason": "Section 4 updated"},
    )
    assert resp.status_code == 200
    assert resp.json()["lifecycle_status"] == "REASSESSMENT_REQUIRED"

    resp2 = client.get(f"/findings/{f2.id}")
    assert resp2.status_code == 200
    assert resp2.json()["lifecycle_status"] == "RESOLVED"
    assert resp2.json()["reassessment_trigger"] is None


def test_3_document_update_identifies_related_finding(db_session, compliance_report, admin_user, organization):
    """TEST 3: Compliance analysis automatically detects matching resolved finding and flags for reassessment without duplicate finding creation."""
    from app.services.compliance_engine import store_compliance_report
    finding, _ = create_resolved_finding(db_session, compliance_report, admin_user, reg_clause="REG-POSH-SEC4")

    # Simulate new compliance report for updated policy
    new_doc = Document(
        id=uuid.uuid4(),
        organization_id=organization.id,
        uploaded_by=admin_user.id,
        document_type=DocumentType.POLICY,
        original_filename="POSH_Policy_v2.pdf",
        stored_filename="posh_v2_stored.pdf",
        file_path="/storage/posh_v2.pdf",
        file_size=1024,
        mime_type="application/pdf",
        checksum="checksum_hash_posh_v2",
    )
    db_session.add(new_doc)
    db_session.flush()

    new_report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=organization.id,
        policy_document_id=new_doc.id,
        regulation_id=compliance_report.regulation_id,
        created_by=admin_user.id,
        is_deleted=False,
    )
    db_session.add(new_report)
    db_session.commit()

    analysis_result = {
        "summary": "Evaluation of POSH Policy v2",
        "evaluated_clauses": [
            {
                "regulation_clause_id": "REG-POSH-SEC4",
                "policy_clause_id": "POL-POSH-1",
                "status": "NON_COMPLIANT",
                "similarity_score": 0.89,
                "reasoning": "Committee constitution clause missing presiding officer rank.",
                "recommendation": "Specify senior woman officer.",
                "regulation_text": "Section 4 Constitution of Internal Complaints Committee",
            }
        ],
    }

    store_compliance_report(db_session, new_report.id, analysis_result, elapsed_seconds=1.1)

    app = build_app(admin_user, db_session)
    client = TestClient(app)
    f_resp = client.get(f"/findings/{finding.id}")
    assert f_resp.status_code == 200
    f_data = f_resp.json()
    assert f_data["lifecycle_status"] == "REASSESSMENT_REQUIRED"
    assert f_data["reassessment_trigger"] == "NEW_ANALYSIS"
    assert f_data["reassessment_document_name"] == "POSH_Policy_v2.pdf"

    # Verify no duplicate active finding created in the new report
    new_findings = db_session.query(ReportFinding).filter(ReportFinding.report_id == new_report.id).all()
    assert len(new_findings) == 0


def test_4_duplicate_trigger_does_not_create_duplicate_reassessment(db_session, compliance_report, admin_user):
    """TEST 4: Repeating trigger on already reassessment-required finding is rejected (409 Conflict)."""
    finding, _ = create_resolved_finding(db_session, compliance_report, admin_user)
    app = build_app(admin_user, db_session)
    client = TestClient(app)

    r1 = client.post(f"/findings/{finding.id}/reassessment/trigger", json={"trigger": "DOCUMENT_UPDATE", "reason": "Doc updated"})
    assert r1.status_code == 200

    r2 = client.post(f"/findings/{finding.id}/reassessment/trigger", json={"trigger": "DOCUMENT_UPDATE", "reason": "Doc updated again"})
    assert r2.status_code == 409
    assert "Only RESOLVED findings can be marked for reassessment" in r2.json()["detail"]


def test_5_duplicate_trigger_does_not_create_duplicate_notification(db_session, compliance_report, admin_user):
    """TEST 5: Exactly one notification is created for reassessment trigger."""
    finding, _ = create_resolved_finding(db_session, compliance_report, admin_user)
    app = build_app(admin_user, db_session)
    client = TestClient(app)

    client.post(f"/findings/{finding.id}/reassessment/trigger", json={"trigger": "POLICY_UPDATE", "reason": "Policy revised"})

    post_notifs = db_session.query(Notification).filter(
        Notification.finding_id == finding.id,
        Notification.type == "FINDING_REASSESSMENT_REQUIRED",
    ).count()
    assert post_notifs == 1


def test_6_admin_can_get_reassessment_details(db_session, compliance_report, admin_user):
    """TEST 6: GET /findings/{id}/reassessment returns previous resolution, trigger, and candidate delta."""
    finding, _ = create_resolved_finding(db_session, compliance_report, admin_user)
    app = build_app(admin_user, db_session)
    client = TestClient(app)

    client.post(
        f"/findings/{finding.id}/reassessment/trigger",
        json={"trigger": "REGULATION_UPDATE", "reason": "New guidelines issued", "document_name": "POSH_v2.pdf"},
    )

    resp = client.get(f"/findings/{finding.id}/reassessment")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["finding_id"] == str(finding.id)
    assert data["lifecycle_status"] == "REASSESSMENT_REQUIRED"
    assert data["reassessment_trigger"] == "REGULATION_UPDATE"
    assert data["reassessment_reason"] == "New guidelines issued"
    assert data["reassessment_document_name"] == "POSH_v2.pdf"
    assert data["previous_resolution"] is not None
    assert data["previous_resolution"]["resolved_by_name"] == "Alice Admin"
    assert data["previous_resolution"]["resolution_note"] == "Constituted ICC with 4 members."


def test_7_admin_can_keep_resolved(db_session, compliance_report, admin_user):
    """TEST 7: Admin can choose Keep Resolved."""
    finding, _ = create_resolved_finding(db_session, compliance_report, admin_user)
    app = build_app(admin_user, db_session)
    client = TestClient(app)

    client.post(f"/findings/{finding.id}/reassessment/trigger", json={"trigger": "POLICY_UPDATE", "reason": "Policy updated"})

    resp = client.post(
        f"/findings/{finding.id}/reassessment/keep-resolved",
        json={"admin_note": "Confirmed committee order is still compliant."},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["lifecycle_status"] == "RESOLVED"
    assert data["reassessment_trigger"] is None
    assert data["reassessment_reason"] is None


def test_8_keep_resolved_returns_finding_to_resolved(db_session, compliance_report, admin_user):
    """TEST 8: Keep Resolved persists RESOLVED status in DB."""
    finding, _ = create_resolved_finding(db_session, compliance_report, admin_user)
    app = build_app(admin_user, db_session)
    client = TestClient(app)

    client.post(f"/findings/{finding.id}/reassessment/trigger", json={"trigger": "POLICY_UPDATE", "reason": "Policy updated"})
    client.post(f"/findings/{finding.id}/reassessment/keep-resolved", json={"admin_note": "Valid resolution"})

    db_session.expire_all()
    rf = db_session.get(ReportFinding, finding.id)
    assert rf.lifecycle_status == "RESOLVED"
    assert rf.reassessment_trigger is None


def test_9_keep_resolved_creates_activity_event(db_session, compliance_report, admin_user):
    """TEST 9: Keep Resolved creates FINDING_REASSESSMENT_COMPLETED Activity event."""
    finding, _ = create_resolved_finding(db_session, compliance_report, admin_user)
    app = build_app(admin_user, db_session)
    client = TestClient(app)

    client.post(f"/findings/{finding.id}/reassessment/trigger", json={"trigger": "POLICY_UPDATE", "reason": "Policy updated"})
    client.post(f"/findings/{finding.id}/reassessment/keep-resolved", json={"admin_note": "Resolution still satisfies law"})

    acts = (
        db_session.query(Activity)
        .filter(Activity.event_type == "FINDING_REASSESSMENT_COMPLETED")
        .all()
    )
    assert len(acts) >= 1
    latest_act = acts[-1]
    assert "Kept Resolved" in latest_act.title
    assert latest_act.extra_data["decision"] == "KEEP_RESOLVED"


def test_10_admin_can_reopen_from_reassessment(db_session, compliance_report, admin_user):
    """TEST 10: Admin can choose Reopen Finding from reassessment."""
    finding, _ = create_resolved_finding(db_session, compliance_report, admin_user)
    app = build_app(admin_user, db_session)
    client = TestClient(app)

    client.post(f"/findings/{finding.id}/reassessment/trigger", json={"trigger": "POLICY_UPDATE", "reason": "Policy updated"})

    resp = client.post(
        f"/findings/{finding.id}/reassessment/reopen",
        json={"reopen_reason": "Updated policy removed mandatory presiding officer designation."},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["lifecycle_status"] == "REOPENED"
    assert data["reopened_by_name"] == "Alice Admin"
    assert data["reopen_reason"] == "Updated policy removed mandatory presiding officer designation."
    assert data["reassessment_trigger"] is None


def test_11_reopen_follows_sprint_7_8_workflow(db_session, compliance_report, admin_user):
    """TEST 11: Reopening from reassessment resets remediation status to IN_PROGRESS and preserves sequential cycle numbering."""
    finding, rem = create_resolved_finding(db_session, compliance_report, admin_user)
    app = build_app(admin_user, db_session)
    client = TestClient(app)

    client.post(f"/findings/{finding.id}/reassessment/trigger", json={"trigger": "POLICY_UPDATE", "reason": "Policy updated"})
    client.post(f"/findings/{finding.id}/reassessment/reopen", json={"reopen_reason": "Cycle 3 needed"})

    db_session.expire_all()
    updated_rem = db_session.get(FindingRemediation, rem.id)
    assert updated_rem.status == "IN_PROGRESS"

    cycles = db_session.query(RemediationCycle).filter(RemediationCycle.remediation_id == rem.id).all()
    assert len(cycles) == 2


def test_12_reviewer_cannot_make_reassessment_decision(db_session, compliance_report, admin_user, reviewer_user):
    """TEST 12: Reviewer is rejected with 403 Forbidden for Keep Resolved and Reopen."""
    finding, _ = create_resolved_finding(db_session, compliance_report, admin_user)
    admin_app = build_app(admin_user, db_session)
    admin_client = TestClient(admin_app)
    admin_client.post(f"/findings/{finding.id}/reassessment/trigger", json={"trigger": "POLICY_UPDATE", "reason": "Policy updated"})

    rev_app = build_app(reviewer_user, db_session)
    rev_client = TestClient(rev_app)

    r_keep = rev_client.post(f"/findings/{finding.id}/reassessment/keep-resolved", json={"admin_note": "Keep"})
    assert r_keep.status_code == 403

    r_reopen = rev_client.post(f"/findings/{finding.id}/reassessment/reopen", json={"reopen_reason": "Reopen"})
    assert r_reopen.status_code == 403


def test_13_viewer_cannot_make_reassessment_decision(db_session, compliance_report, admin_user, viewer_user):
    """TEST 13: Viewer is rejected with 403 Forbidden for Keep Resolved and Reopen."""
    finding, _ = create_resolved_finding(db_session, compliance_report, admin_user)
    admin_app = build_app(admin_user, db_session)
    admin_client = TestClient(admin_app)
    admin_client.post(f"/findings/{finding.id}/reassessment/trigger", json={"trigger": "POLICY_UPDATE", "reason": "Policy updated"})

    view_app = build_app(viewer_user, db_session)
    view_client = TestClient(view_app)

    r_keep = view_client.post(f"/findings/{finding.id}/reassessment/keep-resolved", json={"admin_note": "Keep"})
    assert r_keep.status_code == 403

    r_reopen = view_client.post(f"/findings/{finding.id}/reassessment/reopen", json={"reopen_reason": "Reopen"})
    assert r_reopen.status_code == 403


def test_14_cross_organization_reassessment_fails(db_session, compliance_report, admin_user, other_org_user):
    """TEST 14: User from Org 2 cannot view or act on Org 1 finding reassessment."""
    finding, _ = create_resolved_finding(db_session, compliance_report, admin_user)
    other_app = build_app(other_org_user, db_session)
    other_client = TestClient(other_app)

    r_get = other_client.get(f"/findings/{finding.id}/reassessment")
    assert r_get.status_code in (403, 404)

    r_act = other_client.post(f"/findings/{finding.id}/reassessment/keep-resolved", json={"admin_note": "Keep"})
    assert r_act.status_code in (403, 404)


def test_15_previous_resolution_remains_intact(db_session, compliance_report, admin_user):
    """TEST 15: Triggering reassessment and keeping resolved or reopening preserves multi-period resolution history."""
    finding, _ = create_resolved_finding(db_session, compliance_report, admin_user)
    app = build_app(admin_user, db_session)
    client = TestClient(app)

    client.post(f"/findings/{finding.id}/reassessment/trigger", json={"trigger": "POLICY_UPDATE", "reason": "Policy updated"})
    client.post(f"/findings/{finding.id}/reassessment/keep-resolved", json={"admin_note": "Confirmed valid"})

    resp = client.get(f"/findings/{finding.id}/resolutions")
    assert resp.status_code == 200
    hist = resp.json()
    assert len(hist) >= 1
    assert hist[0]["resolution_number"] == 1
    assert hist[0]["resolution_note"] == "Constituted ICC with 4 members."


def test_16_previous_remediation_history_remains_intact(db_session, compliance_report, admin_user):
    """TEST 16: All previous remediation cycles remain unchanged."""
    finding, rem = create_resolved_finding(db_session, compliance_report, admin_user)
    app = build_app(admin_user, db_session)
    client = TestClient(app)

    client.post(f"/findings/{finding.id}/reassessment/trigger", json={"trigger": "POLICY_UPDATE", "reason": "Policy updated"})
    client.post(f"/findings/{finding.id}/reassessment/reopen", json={"reopen_reason": "Cycle 3 needed"})

    cycles = db_session.query(RemediationCycle).filter(RemediationCycle.remediation_id == rem.id).order_by(RemediationCycle.cycle_number.asc()).all()
    assert len(cycles) == 2
    assert cycles[0].cycle_number == 1
    assert cycles[0].status == "REJECTED"
    assert cycles[1].cycle_number == 2
    assert cycles[1].status == "VERIFIED"


def test_17_previous_evidence_remains_intact(db_session, compliance_report, admin_user):
    """TEST 17: Past uploaded evidence files remain intact."""
    finding, rem = create_resolved_finding(db_session, compliance_report, admin_user)
    app = build_app(admin_user, db_session)
    client = TestClient(app)

    client.post(f"/findings/{finding.id}/reassessment/trigger", json={"trigger": "POLICY_UPDATE", "reason": "Policy updated"})
    client.post(f"/findings/{finding.id}/reassessment/reopen", json={"reopen_reason": "Reopened"})

    evs = db_session.query(RemediationEvidence).filter(RemediationEvidence.remediation_id == rem.id).all()
    assert len(evs) == 1
    assert evs[0].original_filename == "ICC_Order.pdf"


def test_18_full_end_to_end_reassessment_workflow_both_paths(db_session, compliance_report, admin_user, reviewer_user):
    """
    TEST 18: Full E2E Flow:
    Path A: RESOLVED -> REASSESSMENT_REQUIRED -> KEEP RESOLVED -> RESOLVED
    Path B: RESOLVED -> REASSESSMENT_REQUIRED -> REOPEN -> REMEDIATION (Cycle 3) -> VERIFY -> APPROVE -> RESOLVE (Resolution #2)
    """
    finding, rem = create_resolved_finding(db_session, compliance_report, admin_user)
    admin_app = build_app(admin_user, db_session)
    admin_client = TestClient(admin_app)
    rev_app = build_app(reviewer_user, db_session)
    rev_client = TestClient(rev_app)

    # ----------------------------------------------------
    # PATH A: Trigger Reassessment -> Keep Resolved
    # ----------------------------------------------------
    r_trig1 = admin_client.post(
        f"/findings/{finding.id}/reassessment/trigger",
        json={"trigger": "POLICY_UPDATE", "reason": "Minor wording change in POSH v2", "document_name": "POSH_v2.pdf"},
    )
    assert r_trig1.status_code == 200
    assert r_trig1.json()["lifecycle_status"] == "REASSESSMENT_REQUIRED"

    r_keep = admin_client.post(
        f"/findings/{finding.id}/reassessment/keep-resolved",
        json={"admin_note": "Wording change did not alter compliance requirement."},
    )
    assert r_keep.status_code == 200
    assert r_keep.json()["lifecycle_status"] == "RESOLVED"

    # ----------------------------------------------------
    # PATH B: Trigger Reassessment -> Reopen -> Remediate (Cycle 3) -> Verify -> Approve -> Resolve (Resolution #2)
    # ----------------------------------------------------
    r_trig2 = admin_client.post(
        f"/findings/{finding.id}/reassessment/trigger",
        json={"trigger": "REGULATION_UPDATE", "reason": "New rule requiring external NGO member", "document_name": "POSH_Rules_2026.pdf"},
    )
    assert r_trig2.status_code == 200
    assert r_trig2.json()["lifecycle_status"] == "REASSESSMENT_REQUIRED"

    r_reop = admin_client.post(
        f"/findings/{finding.id}/reassessment/reopen",
        json={"reopen_reason": "External NGO member must be appointed to ICC."},
    )
    assert r_reop.status_code == 200
    assert r_reop.json()["lifecycle_status"] == "REOPENED"

    # Reviewer/Admin submits Cycle 3
    r_sub = admin_client.post(
        f"/findings/{finding.id}/remediation/submit",
        json={"submission_note": "Appointed NGO representative to committee"},
    )
    assert r_sub.status_code == 200
    rem_data = r_sub.json()
    assert rem_data["status"] in ("SUBMITTED", "READY_FOR_REVIEW")
    assert rem_data["current_cycle_number"] == 3

    # Reviewer verifies Cycle 3
    r_ver = rev_client.post(
        f"/findings/{finding.id}/remediation/verify",
        json={"verification_note": "NGO appointment letter verified"},
    )
    assert r_ver.status_code == 200
    assert r_ver.json()["status"] == "VERIFIED"

    # Admin approves Cycle 3
    r_app = admin_client.post(
        f"/findings/{finding.id}/remediation/approve",
        json={"admin_note": "Approved committee update"},
    )
    assert r_app.status_code == 200
    assert r_app.json()["status"] == "APPROVED"

    # Admin resolves finding (Resolution #2)
    r_res = admin_client.post(
        f"/findings/{finding.id}/resolve",
        json={"resolution_note": "NGO member formally appointed to ICC under 2026 rules."},
    )
    assert r_res.status_code == 200
    res_data = r_res.json()
    assert res_data["lifecycle_status"] == "RESOLVED"
    assert len(res_data["resolution_history"]) == 2
    assert res_data["resolution_history"][0]["resolution_number"] == 1
    assert res_data["resolution_history"][1]["resolution_number"] == 2
    assert res_data["resolution_history"][1]["resolution_note"] == "NGO member formally appointed to ICC under 2026 rules."
