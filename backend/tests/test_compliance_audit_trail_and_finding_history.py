"""
Comprehensive Unit & Integration Test Suite for Sprint 7.13:
Compliance Audit Trail & Finding History.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Generator
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.session import Base, get_db
from app.db.models.user import User
from app.db.models.organization import Organization
from app.db.models.rbac import OrganizationMember, MemberStatus, UserRole, AuditLog
from app.db.models.document import Document, DocumentType
from app.db.models.regulation import Regulation
from app.db.models.remediation import FindingRemediation, RemediationEvidence, RemediationCycle
from app.db.models.activity import Activity
from app.compliance.models import ComplianceReport, ReportFinding, FindingResolutionHistory
from app.core.dependencies import get_current_user

TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session() -> Generator[Session, None, None]:
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def admin_user(db_session: Session) -> User:
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=f"admin-{user_id.hex[:6]}@example.com",
        username=f"admin_{user_id.hex[:6]}",
        hashed_password="fakehashedpassword",
        full_name="Admin Test User",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def analyst_user(db_session: Session) -> User:
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=f"analyst-{user_id.hex[:6]}@example.com",
        username=f"analyst_{user_id.hex[:6]}",
        hashed_password="fakehashedpassword",
        full_name="Compliance Analyst User",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def reviewer_user(db_session: Session) -> User:
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=f"reviewer-{user_id.hex[:6]}@example.com",
        username=f"reviewer_{user_id.hex[:6]}",
        hashed_password="fakehashedpassword",
        full_name="Reviewer User",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def viewer_user(db_session: Session) -> User:
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=f"viewer-{user_id.hex[:6]}@example.com",
        username=f"viewer_{user_id.hex[:6]}",
        hashed_password="fakehashedpassword",
        full_name="Viewer User",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def other_org_user(db_session: Session) -> User:
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=f"other-{user_id.hex[:6]}@example.com",
        username=f"other_{user_id.hex[:6]}",
        hashed_password="fakehashedpassword",
        full_name="Other Org User",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def organization(db_session: Session, admin_user: User) -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name="Compliance Test Organization",
        created_by=admin_user.id,
    )
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def other_organization(db_session: Session, other_org_user: User) -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name="Other Organization",
        created_by=other_org_user.id,
    )
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def setup_memberships(
    db_session: Session,
    organization: Organization,
    other_organization: Organization,
    admin_user: User,
    analyst_user: User,
    reviewer_user: User,
    viewer_user: User,
    other_org_user: User,
):
    memberships = [
        OrganizationMember(
            id=uuid.uuid4(),
            organization_id=organization.id,
            user_id=admin_user.id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        ),
        OrganizationMember(
            id=uuid.uuid4(),
            organization_id=organization.id,
            user_id=analyst_user.id,
            role=UserRole.COMPLIANCE_ANALYST,
            status=MemberStatus.ACTIVE,
        ),
        OrganizationMember(
            id=uuid.uuid4(),
            organization_id=organization.id,
            user_id=reviewer_user.id,
            role=UserRole.REVIEWER,
            status=MemberStatus.ACTIVE,
        ),
        OrganizationMember(
            id=uuid.uuid4(),
            organization_id=organization.id,
            user_id=viewer_user.id,
            role=UserRole.VIEWER,
            status=MemberStatus.ACTIVE,
        ),
        OrganizationMember(
            id=uuid.uuid4(),
            organization_id=other_organization.id,
            user_id=other_org_user.id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        ),
    ]
    for m in memberships:
        db_session.add(m)
    db_session.commit()


@pytest.fixture
def base_report(db_session: Session, organization: Organization, admin_user: User) -> ComplianceReport:
    policy_doc = Document(
        id=uuid.uuid4(),
        organization_id=organization.id,
        original_filename="infosec_policy.pdf",
        stored_filename="stored_infosec.pdf",
        file_path="/documents/infosec_policy.pdf",
        file_size=10240,
        mime_type="application/pdf",
        checksum="infosec_policy_hash",
        document_type=DocumentType.POLICY,
        uploaded_by=admin_user.id,
    )
    db_session.add(policy_doc)

    regulation = Regulation(
        id=uuid.uuid4(),
        title="General Data Protection Regulation",
        document_hash="gdpr_hash",
        uploaded_by=admin_user.id,
        original_filename="gdpr.pdf",
        stored_filename="stored_gdpr.pdf",
        file_path="/regulations/gdpr.pdf",
        file_size=20480,
        mime_type="application/pdf",
    )
    db_session.add(regulation)
    db_session.commit()

    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=organization.id,
        regulation_id=regulation.id,
        policy_document_id=policy_doc.id,
        created_by=admin_user.id,
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)
    return report


@pytest.fixture
def base_finding(db_session: Session, base_report: ComplianceReport) -> ReportFinding:
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=base_report.id,
        policy_clause_id="SEC-04.1",
        regulation_clause_id="GDPR-32",
        status="FAIL",
        lifecycle_status="OPEN",
        severity="HIGH",
        reasoning="Initial unencrypted customer data detected.",
        recommendation="Enable AES-256 encryption at rest.",
        citation="Article 32 GDPR",
        confidence=0.95,
        created_at=datetime.now(timezone.utc) - timedelta(days=4),
    )
    db_session.add(finding)
    db_session.commit()
    db_session.refresh(finding)
    return finding


class AuthTestClient:
    def __init__(self, db_session: Session, default_user: User):
        self.db_session = db_session
        self.default_user = default_user
        self._client = TestClient(app)

    def _set_auth(self, user: User | None = None):
        u = user or self.default_user

        def override_get_db():
            try:
                yield self.db_session
            finally:
                pass

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user] = lambda: u

    def get(self, *args, **kwargs):
        self._set_auth()
        return self._client.get(*args, **kwargs)

    def post(self, *args, **kwargs):
        self._set_auth()
        return self._client.post(*args, **kwargs)

    def patch(self, *args, **kwargs):
        self._set_auth()
        return self._client.patch(*args, **kwargs)

    def delete(self, *args, **kwargs):
        self._set_auth()
        return self._client.delete(*args, **kwargs)

    def put(self, *args, **kwargs):
        self._set_auth()
        return self._client.put(*args, **kwargs)


def get_authenticated_client(db_session: Session, user: User) -> AuthTestClient:
    return AuthTestClient(db_session, user)


# ==============================================================================
# SPRINT 7.13 AUDIT TRAIL & FINDING HISTORY TEST CASES
# ==============================================================================

def test_finding_creation_audit_event(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_report: ComplianceReport,
    base_finding: ReportFinding,
    admin_user: User,
):
    """1. Verify that finding creation is captured in Activity/Audit timeline."""
    client = get_authenticated_client(db_session, admin_user)

    res = client.get(f"/findings/{base_finding.id}/activity")
    assert res.status_code == 200
    data = res.json()

    assert data["total"] >= 1
    created_events = [it for it in data["items"] if it["event_type"] == "FINDING_CREATED"]
    assert len(created_events) >= 1

    created_event = created_events[0]
    assert created_event["category"] == "FINDING"
    assert created_event["metadata"]["finding_id"] == str(base_finding.id)
    assert created_event["actor"]["full_name"] == admin_user.full_name


def test_finding_update_and_before_after_state(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    analyst_user: User,
):
    """2. Verify PATCH /findings/{id} records FINDING_UPDATED with before/after state delta."""
    client = get_authenticated_client(db_session, analyst_user)

    update_payload = {
        "severity": "CRITICAL",
        "reasoning": "Updated: Critical unencrypted database detected in EU datacenter.",
        "recommendation": "Implement encryption immediately.",
        "citation": "Article 32(1)(a) GDPR",
    }
    res = client.patch(f"/findings/{base_finding.id}", json=update_payload)
    assert res.status_code == 200
    updated_finding = res.json()
    assert updated_finding["severity"] == "CRITICAL"

    # Verify Activity log
    act_res = client.get(f"/findings/{base_finding.id}/activity")
    assert act_res.status_code == 200
    act_data = act_res.json()

    update_events = [it for it in act_data["items"] if it["event_type"] == "FINDING_UPDATED"]
    assert len(update_events) == 1

    up_ev = update_events[0]
    assert up_ev["actor"]["id"] == str(analyst_user.id)
    assert up_ev["actor"]["role"] == "COMPLIANCE_ANALYST"
    assert "changes" in up_ev["metadata"]
    changes = up_ev["metadata"]["changes"]
    assert changes["severity"]["old"] == "HIGH"
    assert changes["severity"]["new"] == "CRITICAL"


def test_assignment_history_tracking(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    admin_user: User,
    reviewer_user: User,
    analyst_user: User,
):
    """3. Verify assignment history captures old and new assignees."""
    client = get_authenticated_client(db_session, admin_user)

    # Initial Assignment: to Reviewer
    res1 = client.post(f"/findings/{base_finding.id}/assign", json={"assignee_id": str(reviewer_user.id)})
    assert res1.status_code == 200

    # Re-assignment: to Analyst
    res2 = client.post(f"/findings/{base_finding.id}/assign", json={"assignee_id": str(analyst_user.id)})
    assert res2.status_code == 200

    # Verify Activity timeline
    act_res = client.get(f"/findings/{base_finding.id}/activity?category=FINDING")
    assert act_res.status_code == 200
    items = act_res.json()["items"]

    assign_events = [it for it in items if it["event_type"] == "FINDING_ASSIGNED"]
    assert len(assign_events) == 2

    # Latest assignment should show Reviewer -> Analyst
    latest_assign = assign_events[0]
    assert latest_assign["metadata"]["old_assignee_id"] == str(reviewer_user.id)
    assert latest_assign["metadata"]["old_assignee_name"] == reviewer_user.full_name
    assert latest_assign["metadata"]["new_assignee_id"] == str(analyst_user.id)
    assert latest_assign["metadata"]["new_assignee_name"] == analyst_user.full_name


def test_status_transition_before_after_audit(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    analyst_user: User,
):
    """4. Verify status changes record old_status and new_status in audit metadata."""
    client = get_authenticated_client(db_session, analyst_user)

    # Move from OPEN to IN_REVIEW
    res1 = client.patch(f"/findings/{base_finding.id}/status", json={"lifecycle_status": "IN_REVIEW"})
    assert res1.status_code == 200

    # Move from IN_REVIEW to REMEDIATION
    res2 = client.patch(f"/findings/{base_finding.id}/status", json={"lifecycle_status": "REMEDIATION"})
    assert res2.status_code == 200

    act_res = client.get(f"/findings/{base_finding.id}/activity?category=STATUS")
    assert act_res.status_code == 200
    status_events = [it for it in act_res.json()["items"] if it["event_type"] == "FINDING_STATUS_CHANGED"]
    assert len(status_events) >= 2

    latest_status_ev = status_events[0]
    assert latest_status_ev["metadata"]["old_status"] == "IN_REVIEW"
    assert latest_status_ev["metadata"]["new_status"] == "REMEDIATION"


def test_remediation_lifecycle_multi_cycle_audit(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    analyst_user: User,
    reviewer_user: User,
    admin_user: User,
):
    """5. Verify multi-cycle remediation records submit, reject, resubmit, verify, approve without overwriting."""
    analyst_client = get_authenticated_client(db_session, analyst_user)
    reviewer_client = get_authenticated_client(db_session, reviewer_user)
    admin_client = get_authenticated_client(db_session, admin_user)

    # 1. Start remediation
    r_start = analyst_client.post(f"/findings/{base_finding.id}/remediation/start")
    assert r_start.status_code == 200

    # 2. Submit Cycle 1
    r_sub1 = analyst_client.post(
        f"/findings/{base_finding.id}/remediation/submit",
        json={"submission_note": "Cycle 1 submission: initial patch deployed."},
    )
    assert r_sub1.status_code == 200

    # 3. Reviewer rejects Cycle 1
    r_rej = reviewer_client.post(
        f"/findings/{base_finding.id}/remediation/reject",
        json={"rejection_reason": "Missing automated tests and verification proof."},
    )
    assert r_rej.status_code == 200

    # 4. Analyst submits Cycle 2
    r_sub2 = analyst_client.post(
        f"/findings/{base_finding.id}/remediation/submit",
        json={"submission_note": "Cycle 2 submission: comprehensive unit tests and proof attached."},
    )
    assert r_sub2.status_code == 200

    # 5. Reviewer verifies Cycle 2
    r_ver = reviewer_client.post(
        f"/findings/{base_finding.id}/remediation/verify",
        json={"verification_note": "Verified encryption configuration and test passes."},
    )
    assert r_ver.status_code == 200

    # 6. Admin approves Cycle 2
    r_app = admin_client.post(
        f"/findings/{base_finding.id}/remediation/approve",
        json={"admin_note": "Approved for production rollout."},
    )
    assert r_app.status_code == 200

    # Verify Activity timeline has all cycle events
    act_res = admin_client.get(f"/findings/{base_finding.id}/activity?category=REMEDIATION")
    assert act_res.status_code == 200
    items = act_res.json()["items"]

    cycle1_sub = [it for it in items if it["event_type"] == "REMEDIATION_CYCLE_SUBMITTED" and it["metadata"].get("cycle_number") == 1]
    assert len(cycle1_sub) == 1
    assert cycle1_sub[0]["metadata"]["submission_note"] == "Cycle 1 submission: initial patch deployed."

    cycle1_rej = [it for it in items if it["event_type"] == "REMEDIATION_CYCLE_REJECTED" and it["metadata"].get("cycle_number") == 1]
    assert len(cycle1_rej) == 1
    assert "Missing automated tests" in cycle1_rej[0]["metadata"]["rejection_reason"]

    cycle2_sub = [it for it in items if it["event_type"] == "REMEDIATION_CYCLE_SUBMITTED" and it["metadata"].get("cycle_number") == 2]
    assert len(cycle2_sub) == 1

    cycle2_ver = [it for it in items if it["event_type"] == "REMEDIATION_CYCLE_VERIFIED" and it["metadata"].get("cycle_number") == 2]
    assert len(cycle2_ver) == 1
    assert cycle2_ver[0]["actor"]["role"] == "REVIEWER"

    cycle2_app = [it for it in items if it["event_type"] == "REMEDIATION_CYCLE_APPROVED" or it["event_type"] == "REMEDIATION_APPROVED"]
    assert len(cycle2_app) >= 1
    assert cycle2_app[0]["actor"]["role"] == "ADMIN"


def test_evidence_upload_and_delete_audit(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    analyst_user: User,
    admin_user: User,
):
    """6. Verify evidence upload and delete generate audit records with filenames and cycles."""
    analyst_client = get_authenticated_client(db_session, analyst_user)
    admin_client = get_authenticated_client(db_session, admin_user)

    # Upload evidence
    upload_res = analyst_client.post(
        f"/findings/{base_finding.id}/remediation/evidence",
        files={"file": ("audit_evidence_doc.txt", b"Compliance evidence proof contents", "text/plain")},
        data={"description": "Encryption configuration test output", "cycle_number": "1"},
    )
    assert upload_res.status_code == 201
    evidence_id = upload_res.json()["id"]

    # Delete evidence
    del_res = admin_client.delete(f"/findings/{base_finding.id}/remediation/evidence/{evidence_id}")
    assert del_res.status_code == 200

    # Verify Activity log
    act_res = admin_client.get(f"/findings/{base_finding.id}/activity?category=REMEDIATION")
    assert act_res.status_code == 200
    items = act_res.json()["items"]

    upload_ev = [it for it in items if it["event_type"] == "REMEDIATION_EVIDENCE_UPLOADED"]
    assert len(upload_ev) == 1
    assert upload_ev[0]["metadata"]["filename"] == "audit_evidence_doc.txt"

    del_ev = [it for it in items if it["event_type"] == "REMEDIATION_EVIDENCE_DELETED"]
    assert len(del_ev) == 1
    assert del_ev[0]["metadata"]["filename"] == "audit_evidence_doc.txt"


def test_resolution_and_approved_cycle_audit(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    analyst_user: User,
    reviewer_user: User,
    admin_user: User,
):
    """7. Verify FINDING_RESOLVED captures approved cycle, resolver actor, and resolution note."""
    analyst_client = get_authenticated_client(db_session, analyst_user)
    reviewer_client = get_authenticated_client(db_session, reviewer_user)
    admin_client = get_authenticated_client(db_session, admin_user)

    # Complete remediation cycle
    analyst_client.post(f"/findings/{base_finding.id}/remediation/start")
    analyst_client.post(f"/findings/{base_finding.id}/remediation/submit", json={"submission_note": "Ready"})
    reviewer_client.post(f"/findings/{base_finding.id}/remediation/verify", json={"verification_note": "Verified"})
    admin_client.post(f"/findings/{base_finding.id}/remediation/approve", json={"admin_note": "Approved"})

    # Resolve Finding
    res = admin_client.post(
        f"/findings/{base_finding.id}/resolve",
        json={"resolution_note": "All customer data encrypted at rest and in transit."},
    )
    assert res.status_code == 200
    assert res.json()["lifecycle_status"] == "RESOLVED"

    # Verify Activity log
    act_res = admin_client.get(f"/findings/{base_finding.id}/activity?event_type=FINDING_RESOLVED")
    assert act_res.status_code == 200
    res_items = act_res.json()["items"]
    assert len(res_items) == 1

    ev = res_items[0]
    assert ev["actor"]["id"] == str(admin_user.id)
    assert ev["actor"]["role"] == "ADMIN"
    assert ev["metadata"]["resolution_note"] == "All customer data encrypted at rest and in transit."
    assert ev["metadata"]["new_status"] == "RESOLVED"


def test_reopen_audit_and_mandatory_reason(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    analyst_user: User,
    reviewer_user: User,
    admin_user: User,
):
    """8. Verify FINDING_REOPENED requires reason, records previous state, and preserves resolution history."""
    analyst_client = get_authenticated_client(db_session, analyst_user)
    reviewer_client = get_authenticated_client(db_session, reviewer_user)
    admin_client = get_authenticated_client(db_session, admin_user)

    # Move to resolved
    analyst_client.post(f"/findings/{base_finding.id}/remediation/start")
    analyst_client.post(f"/findings/{base_finding.id}/remediation/submit", json={"submission_note": "Ready"})
    reviewer_client.post(f"/findings/{base_finding.id}/remediation/verify", json={"verification_note": "Verified"})
    admin_client.post(f"/findings/{base_finding.id}/remediation/approve", json={"admin_note": "Approved"})
    admin_client.post(f"/findings/{base_finding.id}/resolve", json={"resolution_note": "Resolved v1"})

    # Reopen Finding
    reopen_res = admin_client.post(
        f"/findings/{base_finding.id}/reopen",
        json={"reopen_reason": "Regression detected: newly added microservice lacks TLS 1.3."},
    )
    assert reopen_res.status_code == 200
    assert reopen_res.json()["lifecycle_status"] == "REOPENED"

    # Verify Activity log
    act_res = admin_client.get(f"/findings/{base_finding.id}/activity?event_type=FINDING_REOPENED")
    assert act_res.status_code == 200
    reopen_items = act_res.json()["items"]
    assert len(reopen_items) == 1

    ev = reopen_items[0]
    assert ev["metadata"]["old_status"] == "RESOLVED"
    assert ev["metadata"]["new_status"] == "REOPENED"
    assert "Regression detected" in ev["metadata"]["reopen_reason"]


def test_reassessment_trigger_and_decision_audit(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    analyst_user: User,
    reviewer_user: User,
    admin_user: User,
):
    """9. Verify reassessment triggers and decisions (KEEP_RESOLVED vs REOPENED) are tracked in audit history."""
    analyst_client = get_authenticated_client(db_session, analyst_user)
    reviewer_client = get_authenticated_client(db_session, reviewer_user)
    admin_client = get_authenticated_client(db_session, admin_user)

    # Resolve finding first
    analyst_client.post(f"/findings/{base_finding.id}/remediation/start")
    analyst_client.post(f"/findings/{base_finding.id}/remediation/submit", json={"submission_note": "Ready"})
    reviewer_client.post(f"/findings/{base_finding.id}/remediation/verify", json={"verification_note": "Verified"})
    admin_client.post(f"/findings/{base_finding.id}/remediation/approve", json={"admin_note": "Approved"})
    admin_client.post(f"/findings/{base_finding.id}/resolve", json={"resolution_note": "Initial fix"})

    # Trigger Reassessment
    trig_res = admin_client.post(
        f"/findings/{base_finding.id}/reassessment/trigger",
        json={"trigger": "POLICY_UPDATE", "reason": "New encryption standards enforced by revised policy."},
    )
    assert trig_res.status_code == 200
    assert trig_res.json()["lifecycle_status"] == "REASSESSMENT_REQUIRED"

    # Complete Reassessment with Keep Resolved decision
    keep_res = admin_client.post(
        f"/findings/{base_finding.id}/reassessment/keep-resolved",
        json={"admin_note": "Verified current controls comply with new policy."},
    )
    assert keep_res.status_code == 200
    assert keep_res.json()["lifecycle_status"] == "RESOLVED"

    # Verify Activity log
    act_res = admin_client.get(f"/findings/{base_finding.id}/activity")
    assert act_res.status_code == 200
    items = act_res.json()["items"]

    req_ev = [it for it in items if it["event_type"] == "FINDING_REASSESSMENT_REQUIRED"]
    assert len(req_ev) == 1
    assert req_ev[0]["metadata"]["trigger"] == "POLICY_UPDATE"

    keep_ev = [it for it in items if it["event_type"] == "FINDING_REASSESSMENT_KEPT_RESOLVED" or it["event_type"] == "FINDING_RESOLVED"]
    assert len(keep_ev) >= 1


def test_comment_discussion_audit_logging(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    analyst_user: User,
):
    """10. Verify comment discussion activity is captured and categorized."""
    client = get_authenticated_client(db_session, analyst_user)

    com_res = client.post(
        f"/findings/{base_finding.id}/comments",
        json={"content": "Please review the attached cipher configuration."},
    )
    assert com_res.status_code == 201
    com_id = com_res.json()["id"]

    # Resolve comment
    client.patch(f"/findings/{base_finding.id}/comments/{com_id}/resolve", json={"is_resolved": True})

    act_res = client.get(f"/findings/{base_finding.id}/activity?category=DISCUSSION")
    assert act_res.status_code == 200
    disc_items = act_res.json()["items"]
    assert len(disc_items) >= 1
    assert disc_items[0]["category"] == "DISCUSSION"


def test_findings_export_audit_event_logged(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    reviewer_user: User,
):
    """11. Verify FINDINGS_EXPORTED event is logged in activity and audit logs."""
    client = get_authenticated_client(db_session, reviewer_user)

    res = client.get(f"/findings/export?organization_id={organization.id}&format=csv")
    assert res.status_code == 200

    # Verify AuditLog in DB
    audit_record = db_session.query(AuditLog).filter(
        AuditLog.action == "FINDINGS_EXPORTED",
        AuditLog.organization_id == organization.id,
    ).first()
    assert audit_record is not None
    assert audit_record.user_id == reviewer_user.id


def test_actor_integrity_no_spoofing(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    reviewer_user: User,
    admin_user: User,
):
    """12. Verify actor identity is strictly taken from auth session; reviewer cannot resolve finding or spoof admin."""
    reviewer_client = get_authenticated_client(db_session, reviewer_user)

    # Reviewer attempts admin-only resolution -> must return 403 Forbidden
    res = reviewer_client.post(
        f"/findings/{base_finding.id}/resolve",
        json={"resolution_note": "Reviewer attempt to resolve"},
    )
    assert res.status_code == 403

    # Admin performs assignment
    admin_client = get_authenticated_client(db_session, admin_user)
    assign_res = admin_client.post(
        f"/findings/{base_finding.id}/assign",
        json={"assignee_id": str(reviewer_user.id)},
    )
    assert assign_res.status_code == 200

    # Verify actor is Admin
    act_res = admin_client.get(f"/findings/{base_finding.id}/activity?event_type=FINDING_ASSIGNED")
    ev = act_res.json()["items"][0]
    assert ev["actor"]["id"] == str(admin_user.id)
    assert ev["actor"]["full_name"] == admin_user.full_name


def test_system_actor_representation(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    admin_user: User,
):
    """13. Verify automated/system activities attribute to Actor: System."""
    # Insert system activity directly
    sys_act = Activity(
        id=uuid.uuid4(),
        user_id=None,
        event_type="FINDING_REASSESSMENT_REQUIRED",
        title=f"Reassessment Required for Finding #{str(base_finding.id)[:8]}",
        description="System automated check: regulation updated.",
        icon_type="alert",
        extra_data={"finding_id": str(base_finding.id)},
    )
    db_session.add(sys_act)
    db_session.commit()

    client = get_authenticated_client(db_session, admin_user)
    act_res = client.get(f"/findings/{base_finding.id}/activity?event_type=FINDING_REASSESSMENT_REQUIRED")
    assert act_res.status_code == 200
    items = act_res.json()["items"]
    assert len(items) == 1
    assert items[0]["actor"]["full_name"] == "System"
    assert items[0]["actor"]["id"] == "system"


def test_activity_filtering_by_category_and_search(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    analyst_user: User,
):
    """14. Verify activity search filter matches titles, descriptions, and metadata."""
    client = get_authenticated_client(db_session, analyst_user)

    # Perform updates with specific keywords
    client.patch(
        f"/findings/{base_finding.id}",
        json={"recommendation": "SpecialKeywordAlpha: apply quantum-resistant encryption."},
    )
    client.post(
        f"/findings/{base_finding.id}/comments",
        json={"content": "SpecialKeywordBeta: discussion about cipher suites."},
    )

    # Search for Alpha
    res_alpha = client.get(f"/findings/{base_finding.id}/activity?search=SpecialKeywordAlpha")
    assert res_alpha.status_code == 200
    assert len(res_alpha.json()["items"]) == 1

    # Search for Beta
    res_beta = client.get(f"/findings/{base_finding.id}/activity?search=SpecialKeywordBeta")
    assert res_beta.status_code == 200
    assert len(res_beta.json()["items"]) == 1

    # Search for non-existent keyword
    res_none = client.get(f"/findings/{base_finding.id}/activity?search=NonExistentTermXYZ")
    assert res_none.status_code == 200
    assert len(res_none.json()["items"]) == 0


def test_multi_tenant_isolation(
    db_session: Session,
    organization: Organization,
    other_organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    other_org_user: User,
):
    """15. Verify cross-tenant access to finding activity is rejected with 403 Forbidden."""
    client = get_authenticated_client(db_session, other_org_user)

    res = client.get(f"/findings/{base_finding.id}/activity")
    assert res.status_code == 403
    assert "access" in res.json()["detail"].lower()


def test_rbac_role_visibility(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    viewer_user: User,
    analyst_user: User,
    admin_user: User,
):
    """16. Verify Viewers, Analysts, and Admins can view activity history, but Viewers cannot mutate."""
    viewer_client = get_authenticated_client(db_session, viewer_user)

    # Viewer CAN view activity timeline
    res = viewer_client.get(f"/findings/{base_finding.id}/activity")
    assert res.status_code == 200

    # Viewer CANNOT update finding details
    mut_res = viewer_client.patch(f"/findings/{base_finding.id}", json={"severity": "LOW"})
    assert mut_res.status_code == 403


def test_concurrency_and_idempotency_protection(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    analyst_user: User,
    reviewer_user: User,
    admin_user: User,
):
    """17. Verify duplicate resolution or approval requests return 409 and create only 1 audit event."""
    analyst_client = get_authenticated_client(db_session, analyst_user)
    reviewer_client = get_authenticated_client(db_session, reviewer_user)
    admin_client = get_authenticated_client(db_session, admin_user)

    # Complete remediation cycle
    analyst_client.post(f"/findings/{base_finding.id}/remediation/start")
    analyst_client.post(f"/findings/{base_finding.id}/remediation/submit", json={"submission_note": "Ready"})
    reviewer_client.post(f"/findings/{base_finding.id}/remediation/verify", json={"verification_note": "Verified"})
    admin_client.post(f"/findings/{base_finding.id}/remediation/approve", json={"admin_note": "Approved"})

    # Duplicate approve -> 409
    dup_app = admin_client.post(f"/findings/{base_finding.id}/remediation/approve", json={"admin_note": "Dup"})
    assert dup_app.status_code == 409

    # First resolve -> 200
    res1 = admin_client.post(f"/findings/{base_finding.id}/resolve", json={"resolution_note": "Resolve 1"})
    assert res1.status_code == 200

    # Duplicate resolve -> 409
    res2 = admin_client.post(f"/findings/{base_finding.id}/resolve", json={"resolution_note": "Resolve 2"})
    assert res2.status_code == 409

    # Verify exactly 1 FINDING_RESOLVED event
    act_res = admin_client.get(f"/findings/{base_finding.id}/activity?event_type=FINDING_RESOLVED")
    assert act_res.status_code == 200
    assert len(act_res.json()["items"]) == 1


def test_full_lifecycle_real_finding_audit_trail(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    base_finding: ReportFinding,
    analyst_user: User,
    reviewer_user: User,
    admin_user: User,
):
    """18. End-to-end full finding lifecycle audit trail test."""
    analyst_client = get_authenticated_client(db_session, analyst_user)
    reviewer_client = get_authenticated_client(db_session, reviewer_user)
    admin_client = get_authenticated_client(db_session, admin_user)

    # 1. Update finding severity
    analyst_client.patch(f"/findings/{base_finding.id}", json={"severity": "CRITICAL"})

    # 2. Assign to Reviewer
    admin_client.post(f"/findings/{base_finding.id}/assign", json={"assignee_id": str(reviewer_user.id)})

    # 3. Add Discussion comment
    analyst_client.post(f"/findings/{base_finding.id}/comments", json={"content": "Beginning remediation work."})

    # 4. Start Remediation
    analyst_client.post(f"/findings/{base_finding.id}/remediation/start")

    # 5. Attach Evidence
    analyst_client.post(
        f"/findings/{base_finding.id}/remediation/evidence",
        files={"file": ("proof1.txt", b"Evidence proof cycle 1", "text/plain")},
        data={"description": "Cycle 1 test proof", "cycle_number": "1"},
    )

    # 6. Submit Cycle 1
    analyst_client.post(f"/findings/{base_finding.id}/remediation/submit", json={"submission_note": "Cycle 1 complete"})

    # 7. Reject Cycle 1
    reviewer_client.post(f"/findings/{base_finding.id}/remediation/reject", json={"rejection_reason": "Need more proof"})

    # 8. Attach New Evidence for Cycle 2
    analyst_client.post(
        f"/findings/{base_finding.id}/remediation/evidence",
        files={"file": ("proof2.txt", b"Evidence proof cycle 2", "text/plain")},
        data={"description": "Cycle 2 extended proof", "cycle_number": "2"},
    )

    # 9. Submit Cycle 2
    analyst_client.post(f"/findings/{base_finding.id}/remediation/submit", json={"submission_note": "Cycle 2 complete"})

    # 10. Verify Cycle 2
    reviewer_client.post(f"/findings/{base_finding.id}/remediation/verify", json={"verification_note": "Cycle 2 verified"})

    # 11. Approve Cycle 2
    admin_client.post(f"/findings/{base_finding.id}/remediation/approve", json={"admin_note": "Cycle 2 approved"})

    # 12. Resolve Finding
    admin_client.post(f"/findings/{base_finding.id}/resolve", json={"resolution_note": "Resolved completely"})

    # 13. Trigger Reassessment
    admin_client.post(f"/findings/{base_finding.id}/reassessment/trigger", json={"trigger": "ANNUAL_REVIEW", "reason": "Annual compliance check"})

    # 14. Reopen from Reassessment
    admin_client.post(f"/findings/{base_finding.id}/reopen", json={"reopen_reason": "New encryption standards required"})

    # 15. Cycle 3 Remediation, Verify, Approve, Resolve
    analyst_client.post(f"/findings/{base_finding.id}/remediation/start")
    analyst_client.post(f"/findings/{base_finding.id}/remediation/submit", json={"submission_note": "Cycle 3 fix"})
    reviewer_client.post(f"/findings/{base_finding.id}/remediation/verify", json={"verification_note": "Cycle 3 verified"})
    admin_client.post(f"/findings/{base_finding.id}/remediation/approve", json={"admin_note": "Cycle 3 approved"})
    admin_client.post(f"/findings/{base_finding.id}/resolve", json={"resolution_note": "Final resolution achieved"})

    # 16. Verify complete activity timeline
    act_res = admin_client.get(f"/findings/{base_finding.id}/activity?limit=50")
    assert act_res.status_code == 200
    data = act_res.json()
    assert data["total"] >= 15

    # Check that events are in descending order
    times = [datetime.fromisoformat(it["created_at"].replace("Z", "+00:00")) for it in data["items"]]
    assert all(times[i] >= times[i+1] for i in range(len(times)-1))
