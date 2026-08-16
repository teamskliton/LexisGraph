"""
Sprint 7.4: Remediation Management & Evidence Lifecycle Integration Tests.
"""
from datetime import datetime, timedelta, timezone
import io
import os
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
from app.db.models.notification import Notification
from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus
from app.db.models.remediation import FindingRemediation, RemediationEvidence
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
def user_analyst(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"analyst_{uuid.uuid4().hex[:6]}@example.com",
        username=f"analyst_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Carol Analyst",
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
        email=f"viewer_{uuid.uuid4().hex[:6]}@example.com",
        username=f"viewer_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Dave Viewer",
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
def org_and_setup(db_session, user_admin, user_reviewer, user_analyst, user_viewer):
    org = Organization(
        id=uuid.uuid4(),
        name="Acme Corp Test Org",
        created_by=user_admin.id,
    )
    db_session.add(org)
    db_session.flush()

    # Add memberships
    db_session.add(OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_admin.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    ))
    db_session.add(OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_reviewer.id,
        role=UserRole.REVIEWER,
        status=MemberStatus.ACTIVE,
    ))
    db_session.add(OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_analyst.id,
        role=UserRole.COMPLIANCE_ANALYST,
        status=MemberStatus.ACTIVE,
    ))
    db_session.add(OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_viewer.id,
        role=UserRole.VIEWER,
        status=MemberStatus.ACTIVE,
    ))

    # Documents & Regulations
    doc = Document(
        id=uuid.uuid4(),
        organization_id=org.id,
        original_filename="company_policy.pdf",
        stored_filename="company_policy_uuid.pdf",
        file_path="/tmp/company_policy.pdf",
        file_size=1024,
        mime_type="application/pdf",
        checksum="dummy_checksum_123",
        document_type=DocumentType.POLICY,
        uploaded_by=user_admin.id,
    )
    reg = Regulation(
        id=uuid.uuid4(),
        title="POSH Act 2013",
        act_name="POSH Act",
        original_filename="posh.pdf",
        stored_filename="posh_uuid.pdf",
        file_path="/tmp/posh.pdf",
        file_size=2048,
        mime_type="application/pdf",
        document_hash="dummy_hash_456",
        uploaded_by=user_admin.id,
    )
    db_session.add_all([doc, reg])
    db_session.flush()

    # Report
    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=org.id,
        policy_document_id=doc.id,
        regulation_id=reg.id,
        status=ComplianceReportStatus.COMPLETED,
        executive_summary="Executive Summary",
        created_by=user_admin.id,
    )
    db_session.add(report)
    db_session.flush()

    # Finding requiring remediation
    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        status="PARTIALLY_COMPLIANT",
        lifecycle_status="REMEDIATION",
        severity="HIGH",
        reasoning="Internal Committee lacks external member.",
        recommendation="Appoint an external member with legal expertise to the ICC.",
        policy_clause_id="POL-101",
        regulation_clause_id="REG-4(2)(c)",
    )
    db_session.add(finding)
    db_session.commit()
    db_session.refresh(finding)

    return {
        "org": org,
        "report": report,
        "finding": finding,
    }


def create_test_client(db_session, current_user):
    app = FastAPI()
    app.include_router(findings_router)
    app.include_router(remediations_router)

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    def override_get_current_user():
        return current_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    return TestClient(app)


def test_create_remediation_success(db_session, user_admin, org_and_setup):
    """Test 1: Admin can initialize remediation with recommendation prefill."""
    client = create_test_client(db_session, user_admin)
    finding_id = org_and_setup["finding"].id

    res = client.post(
        f"/findings/{finding_id}/remediation",
        json={
            "title": "ICC External Member Appointment",
            "priority": "CRITICAL",
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "ICC External Member Appointment"
    assert data["priority"] == "CRITICAL"
    assert data["status"] == "NOT_STARTED"
    assert "external member" in data["description"].lower()


def test_admin_assign_remediation_to_org_member(db_session, user_admin, user_reviewer, org_and_setup):
    """Test 2: Admin can assign remediation to an active organization member and trigger notification."""
    client = create_test_client(db_session, user_admin)
    finding_id = org_and_setup["finding"].id

    res = client.post(
        f"/findings/{finding_id}/remediation",
        json={
            "title": "Appoint Member",
            "assigned_to": str(user_reviewer.id),
            "priority": "HIGH",
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["assigned_to"] == str(user_reviewer.id)
    assert data["assignee"]["email"] == user_reviewer.email

    # Check notification created for reviewer
    notif = db_session.query(Notification).filter(
        Notification.user_id == user_reviewer.id,
        Notification.type == "FINDING_ASSIGNED",
    ).first()
    assert notif is not None
    assert "assigned to you" in notif.message.lower()


def test_cross_organization_assignment_rejected(db_session, user_admin, user_other_org, org_and_setup):
    """Test 3: Assigning to a user from another organization is rejected with HTTP 400."""
    client = create_test_client(db_session, user_admin)
    finding_id = org_and_setup["finding"].id

    res = client.post(
        f"/findings/{finding_id}/remediation",
        json={
            "title": "Malicious Assignment",
            "assigned_to": str(user_other_org.id),
        },
    )
    assert res.status_code == 400
    assert "not an active member of this organization" in res.json()["detail"].lower()


def test_start_remediation_transition(db_session, user_reviewer, org_and_setup):
    """Test 4: Assignee starts working on remediation (NOT_STARTED -> IN_PROGRESS)."""
    client = create_test_client(db_session, user_reviewer)
    finding_id = org_and_setup["finding"].id

    res = client.post(f"/findings/{finding_id}/remediation/start")
    assert res.status_code == 200
    assert res.json()["status"] == "IN_PROGRESS"


def test_upload_remediation_evidence(db_session, user_reviewer, org_and_setup):
    """Test 5: Upload and attach evidence document."""
    client = create_test_client(db_session, user_reviewer)
    finding_id = org_and_setup["finding"].id

    # Create dummy pdf
    pdf_content = b"%PDF-1.4 dummy evidence document content"
    files = {
        "file": ("appointment_letter.pdf", io.BytesIO(pdf_content), "application/pdf")
    }
    data = {"description": "Signed appointment letter for ICC external member"}

    res = client.post(
        f"/findings/{finding_id}/remediation/evidence",
        files=files,
        data=data,
    )
    assert res.status_code == 201
    ev_data = res.json()
    assert ev_data["original_filename"] == "appointment_letter.pdf"
    assert ev_data["description"] == "Signed appointment letter for ICC external member"
    assert ev_data["uploader"]["email"] == user_reviewer.email


def test_download_remediation_evidence_and_isolation(db_session, user_reviewer, user_other_org, org_and_setup):
    """Test 6: Evidence download is org-scoped (authorized member OK, cross-org forbidden)."""
    # Upload first
    client_reviewer = create_test_client(db_session, user_reviewer)
    finding_id = org_and_setup["finding"].id

    pdf_content = b"%PDF-1.4 dummy evidence for isolation test"
    files = {
        "file": ("evidence_doc.pdf", io.BytesIO(pdf_content), "application/pdf")
    }
    res = client_reviewer.post(f"/findings/{finding_id}/remediation/evidence", files=files)
    assert res.status_code == 201
    evidence_id = res.json()["id"]

    # Reviewer can download
    res_dl = client_reviewer.get(f"/findings/{finding_id}/remediation/evidence/{evidence_id}/download")
    assert res_dl.status_code == 200

    # Cross-org user is forbidden
    client_other = create_test_client(db_session, user_other_org)
    res_forbidden = client_other.get(f"/findings/{finding_id}/remediation/evidence/{evidence_id}/download")
    assert res_forbidden.status_code == 403


def test_delete_remediation_evidence(db_session, user_reviewer, user_viewer, org_and_setup):
    """Test 7: Uploader can delete evidence; unauthorized viewer cannot."""
    client_reviewer = create_test_client(db_session, user_reviewer)
    finding_id = org_and_setup["finding"].id

    pdf_content = b"%PDF-1.4 to be deleted"
    files = {"file": ("delete_me.pdf", io.BytesIO(pdf_content), "application/pdf")}
    res = client_reviewer.post(f"/findings/{finding_id}/remediation/evidence", files=files)
    assert res.status_code == 201
    evidence_id = res.json()["id"]

    # Viewer cannot delete
    client_viewer = create_test_client(db_session, user_viewer)
    res_v = client_viewer.delete(f"/findings/{finding_id}/remediation/evidence/{evidence_id}")
    assert res_v.status_code == 403

    # Uploader deletes successfully
    res_del = client_reviewer.delete(f"/findings/{finding_id}/remediation/evidence/{evidence_id}")
    assert res_del.status_code == 200


def test_submit_remediation_for_review(db_session, user_reviewer, org_and_setup):
    """Test 8: Transition IN_PROGRESS -> READY_FOR_REVIEW."""
    client = create_test_client(db_session, user_reviewer)
    finding_id = org_and_setup["finding"].id

    client.post(f"/findings/{finding_id}/remediation/start")
    res = client.post(f"/findings/{finding_id}/remediation/submit")
    assert res.status_code == 200
    assert res.json()["status"] == "READY_FOR_REVIEW"


def test_verify_remediation_reviewer_and_admin(db_session, user_reviewer, user_viewer, org_and_setup):
    """Test 9: Reviewer/Admin verifies remediation; Viewer cannot."""
    finding_id = org_and_setup["finding"].id

    # Create & submit
    client_rev = create_test_client(db_session, user_reviewer)
    client_rev.post(f"/findings/{finding_id}/remediation/start")
    client_rev.post(f"/findings/{finding_id}/remediation/submit")

    # Viewer attempts verify -> 403
    client_view = create_test_client(db_session, user_viewer)
    res_fail = client_view.post(f"/findings/{finding_id}/remediation/verify", json={"verification_note": "Looks good"})
    assert res_fail.status_code == 403

    # Reviewer verifies -> 200
    res_ok = client_rev.post(f"/findings/{finding_id}/remediation/verify", json={"verification_note": "Verified external member appointment"})
    assert res_ok.status_code == 200
    data = res_ok.json()
    assert data["status"] == "VERIFIED"
    assert data["verifier"]["email"] == user_reviewer.email
    assert data["verification_note"] == "Verified external member appointment"


def test_reject_remediation(db_session, user_reviewer, org_and_setup):
    """Test 10: Reviewer rejects remediation and returns to REJECTED."""
    finding_id = org_and_setup["finding"].id
    client = create_test_client(db_session, user_reviewer)

    client.post(f"/findings/{finding_id}/remediation/start")
    client.post(f"/findings/{finding_id}/remediation/submit")

    res = client.post(
        f"/findings/{finding_id}/remediation/reject",
        json={"rejection_reason": "Certificate of legal expertise not attached"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "REJECTED"
    assert "Certificate of legal expertise" in data["verification_note"]


def test_admin_approve_and_return_remediation(db_session, user_admin, user_reviewer, org_and_setup):
    """Test 11: Admin can approve or return verified remediation."""
    finding_id = org_and_setup["finding"].id
    client_rev = create_test_client(db_session, user_reviewer)
    client_admin = create_test_client(db_session, user_admin)

    # Move to VERIFIED
    client_rev.post(f"/findings/{finding_id}/remediation/start")
    client_rev.post(f"/findings/{finding_id}/remediation/submit")
    client_rev.post(f"/findings/{finding_id}/remediation/verify")

    # Reviewer cannot approve (Admin only)
    res_rev_app = client_rev.post(f"/findings/{finding_id}/remediation/approve", json={"admin_note": "Not allowed"})
    assert res_rev_app.status_code == 403

    # Admin approves -> status becomes APPROVED
    res_adm_app = client_admin.post(f"/findings/{finding_id}/remediation/approve", json={"admin_note": "Approved by board"})
    assert res_adm_app.status_code == 200
    assert res_adm_app.json()["status"] == "APPROVED"
    assert res_adm_app.json()["admin_approver"]["email"] == user_admin.email

    # Admin returns to in progress
    res_ret = client_admin.post(f"/findings/{finding_id}/remediation/return", json={"return_reason": "Board requested further verification"})
    assert res_ret.status_code == 200
    assert res_ret.json()["status"] == "IN_PROGRESS"


def test_remediation_approval_is_non_repeatable_and_idempotent(db_session, user_admin, user_reviewer, org_and_setup):
    """Test 11b: Idempotency & Repeat Protection - Repeat approvals return 409 Conflict with 0 extra notifications."""
    finding_id = org_and_setup["finding"].id
    client_rev = create_test_client(db_session, user_reviewer)
    client_admin = create_test_client(db_session, user_admin)

    # Assign to reviewer so notifications are directed to reviewer
    client_admin.patch(
        f"/findings/{finding_id}/remediation",
        json={"assigned_to": str(user_reviewer.id)},
    )
    # Clear prior notifications for clean count
    db_session.query(Notification).delete()
    db_session.commit()

    # Move to VERIFIED
    client_rev.post(f"/findings/{finding_id}/remediation/start")
    client_rev.post(f"/findings/{finding_id}/remediation/submit")
    client_rev.post(f"/findings/{finding_id}/remediation/verify")

    # Clear notifications prior to approval
    db_session.query(Notification).delete()
    db_session.commit()

    # Request 1: First Approval -> Success (200)
    res_1 = client_admin.post(f"/findings/{finding_id}/remediation/approve", json={"admin_note": "Approved initially"})
    assert res_1.status_code == 200
    assert res_1.json()["status"] == "APPROVED"

    # Exactly 1 notification exists for Reviewer
    notifs_1 = db_session.query(Notification).filter(Notification.user_id == user_reviewer.id).all()
    assert len(notifs_1) == 1
    assert "approved" in notifs_1[0].message.lower()

    # Request 2: Second Approval Attempt -> 409 Conflict
    res_2 = client_admin.post(f"/findings/{finding_id}/remediation/approve", json={"admin_note": "Approved again"})
    assert res_2.status_code == 409
    assert "already been approved" in res_2.json()["detail"].lower()

    # ZERO additional notifications
    notifs_2 = db_session.query(Notification).filter(Notification.user_id == user_reviewer.id).all()
    assert len(notifs_2) == 1

    # Request 3: Third Approval Attempt -> 409 Conflict
    res_3 = client_admin.post(f"/findings/{finding_id}/remediation/approve", json={"admin_note": "Approved a third time"})
    assert res_3.status_code == 409

    # Still ZERO additional notifications
    notifs_3 = db_session.query(Notification).filter(Notification.user_id == user_reviewer.id).all()
    assert len(notifs_3) == 1


def test_cannot_approve_unverified_remediation(db_session, user_admin, user_reviewer, org_and_setup):
    """Test 11c: Approving remediation in NOT_STARTED or IN_PROGRESS returns 409 Conflict."""
    finding_id = org_and_setup["finding"].id
    client_admin = create_test_client(db_session, user_admin)

    # Initialize remediation in NOT_STARTED
    client_admin.post(f"/findings/{finding_id}/remediation", json={"title": "Test Plan"})

    # Attempt approve -> 409
    res = client_admin.post(f"/findings/{finding_id}/remediation/approve")
    assert res.status_code == 409
    assert "must be verified before approval" in res.json()["detail"].lower()


def test_remediation_approval_does_not_auto_resolve_finding(db_session, user_admin, user_reviewer, org_and_setup):
    """Test 12: CRITICAL - Remediation approval does not automatically resolve finding."""
    finding_id = org_and_setup["finding"].id
    client_rev = create_test_client(db_session, user_reviewer)
    client_admin = create_test_client(db_session, user_admin)

    # Full remediation flow
    client_rev.post(f"/findings/{finding_id}/remediation/start")
    client_rev.post(f"/findings/{finding_id}/remediation/submit")
    client_rev.post(f"/findings/{finding_id}/remediation/verify")
    client_admin.post(f"/findings/{finding_id}/remediation/approve")

    # Finding status must still NOT be RESOLVED
    finding_db = db_session.get(ReportFinding, finding_id)
    assert finding_db.lifecycle_status != "RESOLVED"
    assert finding_db.status != "COMPLIANT"

    # Only Admin resolve finding marks it resolved
    res_res = client_admin.post(
        f"/findings/{finding_id}/resolve",
        json={"resolution_note": "Finding officially resolved after remediation approval"},
    )
    assert res_res.status_code == 200
    db_session.refresh(finding_db)
    assert finding_db.lifecycle_status == "RESOLVED"


def test_cross_org_remediation_access_forbidden(db_session, user_other_org, org_and_setup):
    """Test 13: External user from another organization cannot read or mutate remediation."""
    finding_id = org_and_setup["finding"].id
    client = create_test_client(db_session, user_other_org)

    res = client.get(f"/findings/{finding_id}/remediation")
    assert res.status_code == 403


def test_viewer_cannot_mutate_remediation(db_session, user_viewer, org_and_setup):
    """Test 14: Viewer cannot create or edit remediation records."""
    finding_id = org_and_setup["finding"].id
    client = create_test_client(db_session, user_viewer)

    res = client.post(
        f"/findings/{finding_id}/remediation",
        json={"title": "Viewer creating"},
    )
    assert res.status_code == 403


def test_remediation_overdue_computation(db_session, user_admin, org_and_setup):
    """Test 15: Overdue status is computed correctly when due_date is past."""
    finding_id = org_and_setup["finding"].id
    client = create_test_client(db_session, user_admin)

    past_date = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
    res = client.post(
        f"/findings/{finding_id}/remediation",
        json={
            "title": "Overdue Task",
            "due_date": past_date,
        },
    )
    assert res.status_code == 201
    assert res.json()["is_overdue"] is True


def test_concurrent_remediation_approvals(db_session, user_admin, user_reviewer, org_and_setup):
    """Test 16: Concurrency Protection - Two approval requests sent in rapid succession; only 1 succeeds."""
    import concurrent.futures

    finding_id = org_and_setup["finding"].id
    client_rev = create_test_client(db_session, user_reviewer)
    client_admin = create_test_client(db_session, user_admin)

    # Setup verified remediation
    client_rev.post(f"/findings/{finding_id}/remediation/start")
    client_rev.post(f"/findings/{finding_id}/remediation/submit")
    client_rev.post(f"/findings/{finding_id}/remediation/verify")

    db_session.query(Notification).delete()
    db_session.commit()

    # Rapid succession approvals: 1st must succeed (200), 2nd must return 409 Conflict
    r1 = client_admin.post(f"/findings/{finding_id}/remediation/approve", json={"admin_note": "First Approval"})
    r2 = client_admin.post(f"/findings/{finding_id}/remediation/approve", json={"admin_note": "Second Approval"})
    results = [r1, r2]

    status_codes = [r.status_code for r in results]
    assert 200 in status_codes
    assert 409 in status_codes
    assert status_codes.count(200) == 1
    assert status_codes.count(409) == 1

    # Exactly 1 notification created
    notifs = db_session.query(Notification).all()
    assert len(notifs) == 1
