"""
Sprint 7.10 — Finding Evidence, Verification & Resolution Proof Test Suite

Comprehensive test coverage for:
- Evidence retrieval and organization isolation
- Role-based access (Admin, Reviewer, Viewer)
- Remediation cycle linkage & historical preservation
- Document library linking without duplication
- Resolution proof and verification summary
- Reopening with evidence separation
- Complete End-to-End lifecycle (Finding -> Remediation -> Evidence -> Review -> Verification -> Approval -> Resolution -> Reopen -> Cycle 2 -> Evidence -> Re-Resolution)
"""
from __future__ import annotations

import io
import os
import uuid
from datetime import datetime, timezone
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.compliance.models import (
    ComplianceReport,
    ComplianceReportStatus,
    FindingResolutionHistory,
    ReportFinding,
)
from app.core.dependencies import get_current_user
from app.db.models.document import Document, DocumentType
from app.db.models.organization import Organization
from app.db.models.rbac import MemberStatus, OrganizationMember, UserRole
from app.db.models.regulation import Regulation
from app.db.models.remediation import (
    FindingRemediation,
    RemediationCycle,
    RemediationEvidence,
)
from app.db.models.user import User
from app.db.session import Base, get_db
from app.main import app

# In-memory SQLite for testing
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


@pytest.fixture(scope="function")
def admin_user(db_session: Session) -> User:
    user = User(
        id=uuid.uuid4(),
        email="admin@example.com",
        username="admin_user",
        full_name="Admin User",
        hashed_password="hashedpassword123",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def reviewer_user(db_session: Session) -> User:
    user = User(
        id=uuid.uuid4(),
        email="reviewer@example.com",
        username="reviewer_user",
        full_name="Reviewer User",
        hashed_password="hashedpassword123",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def viewer_user(db_session: Session) -> User:
    user = User(
        id=uuid.uuid4(),
        email="viewer@example.com",
        username="viewer_user",
        full_name="Viewer User",
        hashed_password="hashedpassword123",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def other_org_user(db_session: Session) -> User:
    user = User(
        id=uuid.uuid4(),
        email="other@example.com",
        username="other_user",
        full_name="Other Org User",
        hashed_password="hashedpassword123",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def organization(db_session: Session, admin_user: User, reviewer_user: User, viewer_user: User) -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name="Compliance Corp",
        created_by=admin_user.id,
    )
    db_session.add(org)
    db_session.commit()

    # Memberships
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
    m_view = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=viewer_user.id,
        role=UserRole.VIEWER,
        status=MemberStatus.ACTIVE,
    )
    db_session.add_all([m_admin, m_rev, m_view])
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def other_organization(db_session: Session, other_org_user: User) -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name="Other Org",
        created_by=other_org_user.id,
    )
    db_session.add(org)
    db_session.commit()

    m_other = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=other_org_user.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    db_session.add(m_other)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def org_document(db_session: Session, organization: Organization, admin_user: User) -> Document:
    doc = Document(
        id=uuid.uuid4(),
        organization_id=organization.id,
        original_filename="incident_response_v2.pdf",
        stored_filename="incident_response_v2_stored.pdf",
        file_path="/tmp/incident_response_v2.pdf",
        file_size=102400,
        mime_type="application/pdf",
        document_type=DocumentType.POLICY,
        checksum="doc_hash_123",
        uploaded_by=admin_user.id,
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)
    return doc


@pytest.fixture(scope="function")
def report(db_session: Session, organization: Organization, admin_user: User, org_document: Document) -> ComplianceReport:
    reg = Regulation(
        id=uuid.uuid4(),
        title="GDPR Regulation",
        document_hash="gdpr_hash",
        uploaded_by=admin_user.id,
        original_filename="gdpr.pdf",
        stored_filename="gdpr_stored.pdf",
        file_path="/storage/gdpr.pdf",
        file_size=1024,
        mime_type="application/pdf",
    )
    db_session.add(reg)
    db_session.commit()

    rep = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=organization.id,
        policy_document_id=org_document.id,
        regulation_id=reg.id,
        status=ComplianceReportStatus.COMPLETED,
        total_clauses=10,
        compliant_clauses=8,
        non_compliant_clauses=2,
        created_by=admin_user.id,
    )
    db_session.add(rep)
    db_session.commit()
    db_session.refresh(rep)
    return rep


@pytest.fixture(scope="function")
def finding(db_session: Session, report: ComplianceReport) -> ReportFinding:
    f = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        regulation_clause_id="GDPR-Art-33",
        severity="HIGH",
        status="NON_COMPLIANT",
        lifecycle_status="OPEN",
        reasoning="Data breach notification protocol lacks explicit 72-hour timeline.",
        recommendation="Update incident response plan to state mandatory 72-hour notification.",
    )
    db_session.add(f)
    db_session.commit()
    db_session.refresh(f)
    return f


def set_auth(user: User, db_session: Session):
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: user


@pytest.fixture(scope="function")
def client() -> TestClient:
    return TestClient(app)


# ==============================================================================
# TESTS
# ==============================================================================

def test_1_finding_evidence_retrieved_by_authorized_user(
    db_session: Session, admin_user: User, finding: ReportFinding, client: TestClient
):
    """TEST 1: Finding evidence can be retrieved by authorized user."""
    set_auth(admin_user, db_session)

    # 1. Upload evidence file
    file_bytes = b"%PDF-1.4 test evidence document content"
    res = client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("evidence_v1.pdf", io.BytesIO(file_bytes), "application/pdf")},
        data={"description": "Updated incident response plan"},
    )
    assert res.status_code == 201
    ev_data = res.json()
    assert ev_data["original_filename"] == "evidence_v1.pdf"
    assert ev_data["cycle_number"] == 1

    # 2. Retrieve remediation
    rem_res = client.get(f"/api/v1/findings/{finding.id}/remediation")
    assert rem_res.status_code == 200
    rem_data = rem_res.json()
    assert len(rem_data["evidence"]) == 1
    assert rem_data["evidence"][0]["original_filename"] == "evidence_v1.pdf"


def test_2_unauthorized_organization_cannot_access_evidence(
    db_session: Session, other_org_user: User, finding: ReportFinding, admin_user: User, client: TestClient
):
    """TEST 2: Unauthorized organization cannot access evidence."""
    # 1. Upload evidence as Admin
    set_auth(admin_user, db_session)
    res = client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("confidential_audit.pdf", io.BytesIO(b"secret"), "application/pdf")},
    )
    assert res.status_code == 201
    evidence_id = res.json()["id"]

    # 2. Attempt access as Other Org User
    set_auth(other_org_user, db_session)
    res_download = client.get(f"/api/v1/findings/{finding.id}/remediation/evidence/{evidence_id}/download")
    assert res_download.status_code in (403, 404)


def test_3_reviewer_can_view_allowed_evidence(
    db_session: Session, admin_user: User, reviewer_user: User, finding: ReportFinding, client: TestClient
):
    """TEST 3: Reviewer can view allowed evidence."""
    set_auth(admin_user, db_session)
    res = client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("reviewer_check.pdf", io.BytesIO(b"data"), "application/pdf")},
        data={"description": "Reviewer proof"},
    )
    assert res.status_code == 201

    set_auth(reviewer_user, db_session)
    rem_res = client.get(f"/api/v1/findings/{finding.id}/remediation")
    assert rem_res.status_code == 200
    assert len(rem_res.json()["evidence"]) == 1
    assert rem_res.json()["evidence"][0]["original_filename"] == "reviewer_check.pdf"


def test_4_viewer_can_view_allowed_evidence(
    db_session: Session, admin_user: User, viewer_user: User, finding: ReportFinding, client: TestClient
):
    """TEST 4: Viewer can view allowed evidence (read-only)."""
    set_auth(admin_user, db_session)
    res = client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("viewer_check.pdf", io.BytesIO(b"data"), "application/pdf")},
    )
    assert res.status_code == 201

    set_auth(viewer_user, db_session)
    rem_res = client.get(f"/api/v1/findings/{finding.id}/remediation")
    assert rem_res.status_code == 200
    assert len(rem_res.json()["evidence"]) == 1

    # Viewer cannot upload evidence
    up_res = client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("forbidden.pdf", io.BytesIO(b"data"), "application/pdf")},
    )
    assert up_res.status_code == 403


def test_5_previous_evidence_remains_after_new_evidence_attached(
    db_session: Session, admin_user: User, finding: ReportFinding, client: TestClient
):
    """TEST 5: Previous evidence remains after new evidence is attached."""
    set_auth(admin_user, db_session)

    # Upload first evidence
    client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("doc_v1.pdf", io.BytesIO(b"v1"), "application/pdf")},
    )
    # Upload second evidence
    client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("doc_v2.pdf", io.BytesIO(b"v2"), "application/pdf")},
    )

    rem_res = client.get(f"/api/v1/findings/{finding.id}/remediation")
    ev_list = rem_res.json()["evidence"]
    assert len(ev_list) == 2
    filenames = {e["original_filename"] for e in ev_list}
    assert "doc_v1.pdf" in filenames
    assert "doc_v2.pdf" in filenames


def test_6_evidence_associated_with_correct_remediation_cycle(
    db_session: Session, admin_user: User, reviewer_user: User, finding: ReportFinding, client: TestClient
):
    """TEST 6: Evidence remains associated with the correct remediation cycle."""
    # Cycle 1: Upload evidence 1 as Admin
    set_auth(admin_user, db_session)
    client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("cycle1_evidence.pdf", io.BytesIO(b"c1"), "application/pdf")},
    )
    # Submit Cycle 1
    client.post(f"/api/v1/findings/{finding.id}/remediation/submit", json={"submission_note": "Cycle 1 ready"})

    # Reviewer Rejects Cycle 1
    set_auth(reviewer_user, db_session)
    client.post(f"/api/v1/findings/{finding.id}/remediation/reject", json={"rejection_reason": "Needs more detail"})

    # Cycle 2: Upload evidence 2 as Admin
    set_auth(admin_user, db_session)
    client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("cycle2_evidence.pdf", io.BytesIO(b"c2"), "application/pdf")},
        data={"cycle_number": 2},
    )

    rem_res = client.get(f"/api/v1/findings/{finding.id}/remediation")
    ev_list = rem_res.json()["evidence"]
    assert len(ev_list) == 2

    c1_ev = next(e for e in ev_list if e["original_filename"] == "cycle1_evidence.pdf")
    c2_ev = next(e for e in ev_list if e["original_filename"] == "cycle2_evidence.pdf")

    assert c1_ev["cycle_number"] == 1
    assert c2_ev["cycle_number"] == 2


def test_7_resolution_preserves_evidence_history(
    db_session: Session, admin_user: User, reviewer_user: User, finding: ReportFinding, client: TestClient
):
    """TEST 7: Resolution preserves evidence history."""
    set_auth(admin_user, db_session)
    # Attach evidence
    client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("policy_fixed.pdf", io.BytesIO(b"fixed"), "application/pdf")},
    )
    # Submit
    client.post(f"/api/v1/findings/{finding.id}/remediation/submit", json={})

    # Reviewer verifies
    set_auth(reviewer_user, db_session)
    client.post(f"/api/v1/findings/{finding.id}/remediation/verify", json={"verification_note": "Verified fixed."})

    # Admin approves & resolves
    set_auth(admin_user, db_session)
    client.post(f"/api/v1/findings/{finding.id}/remediation/approve", json={"admin_note": "Approved."})

    res = client.post(
        f"/api/v1/findings/{finding.id}/resolve",
        json={"resolution_note": "Policy successfully updated."},
    )
    assert res.status_code == 200
    assert res.json()["lifecycle_status"] == "RESOLVED"

    # Check Resolution Proof
    proof_res = client.get(f"/api/v1/findings/{finding.id}/resolution-proof")
    assert proof_res.status_code == 200
    proof = proof_res.json()
    assert proof["lifecycle_status"] == "RESOLVED"
    assert proof["resolved_by_name"] == "Admin User"
    assert len(proof["supporting_evidence"]) == 1
    assert proof["supporting_evidence"][0]["original_filename"] == "policy_fixed.pdf"
    assert proof["verification"]["verification_note"] == "Verified fixed."


def test_8_reopening_preserves_previous_evidence(
    db_session: Session, admin_user: User, reviewer_user: User, finding: ReportFinding, client: TestClient
):
    """TEST 8: Reopening preserves previous evidence."""
    # Cycle 1 & Resolve
    set_auth(admin_user, db_session)
    client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("initial_evidence.pdf", io.BytesIO(b"c1"), "application/pdf")},
    )
    client.post(f"/api/v1/findings/{finding.id}/remediation/submit", json={})

    set_auth(reviewer_user, db_session)
    client.post(f"/api/v1/findings/{finding.id}/remediation/verify", json={})

    set_auth(admin_user, db_session)
    client.post(f"/api/v1/findings/{finding.id}/remediation/approve", json={})
    client.post(f"/api/v1/findings/{finding.id}/resolve", json={"resolution_note": "Resolved #1"})

    # Reopen
    reopen_res = client.post(
        f"/api/v1/findings/{finding.id}/reopen",
        json={"reopen_reason": "New compliance audit showed missing sub-clause."},
    )
    assert reopen_res.status_code == 200
    assert reopen_res.json()["lifecycle_status"] == "REOPENED"

    # Verify previous evidence is still present
    rem_res = client.get(f"/api/v1/findings/{finding.id}/remediation")
    assert len(rem_res.json()["evidence"]) == 1
    assert rem_res.json()["evidence"][0]["original_filename"] == "initial_evidence.pdf"


def test_9_new_remediation_cycle_can_have_new_evidence(
    db_session: Session, admin_user: User, reviewer_user: User, finding: ReportFinding, client: TestClient
):
    """TEST 9: New remediation cycle can have new evidence."""
    # Resolution 1
    set_auth(admin_user, db_session)
    client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("evidence_res1.pdf", io.BytesIO(b"r1"), "application/pdf")},
    )
    client.post(f"/api/v1/findings/{finding.id}/remediation/submit", json={})

    set_auth(reviewer_user, db_session)
    client.post(f"/api/v1/findings/{finding.id}/remediation/verify", json={})

    set_auth(admin_user, db_session)
    client.post(f"/api/v1/findings/{finding.id}/remediation/approve", json={})
    client.post(f"/api/v1/findings/{finding.id}/resolve", json={"resolution_note": "Res 1"})

    # Reopen -> Cycle 2
    client.post(f"/api/v1/findings/{finding.id}/reopen", json={"reopen_reason": "Reopen for Cycle 2"})

    # Attach new evidence for Cycle 2
    client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("evidence_res2.pdf", io.BytesIO(b"r2"), "application/pdf")},
        data={"cycle_number": 2},
    )

    rem_res = client.get(f"/api/v1/findings/{finding.id}/remediation")
    ev_list = rem_res.json()["evidence"]
    assert len(ev_list) == 2
    r1 = next(e for e in ev_list if e["original_filename"] == "evidence_res1.pdf")
    r2 = next(e for e in ev_list if e["original_filename"] == "evidence_res2.pdf")
    assert r1["cycle_number"] == 1
    assert r2["cycle_number"] == 2


def test_10_link_document_library_evidence_without_duplication(
    db_session: Session, admin_user: User, finding: ReportFinding, org_document: Document, client: TestClient
):
    """TEST 10: Duplicate evidence reference is not unnecessarily created when linking from document library."""
    set_auth(admin_user, db_session)

    # Link existing organization document
    res = client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence/link-document",
        json={"document_id": str(org_document.id), "description": "Existing policy attached"},
    )
    assert res.status_code == 201
    ev_data = res.json()
    assert ev_data["document_id"] == str(org_document.id)
    assert ev_data["original_filename"] == "incident_response_v2.pdf"
    assert ev_data["document_type"] in ("POLICY", "DocumentType.POLICY")

    # Attempt linking again (idempotency check)
    res_repeat = client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence/link-document",
        json={"document_id": str(org_document.id)},
    )
    assert res_repeat.status_code in (200, 201)
    assert res_repeat.json()["id"] == ev_data["id"]

    # Verify count remains 1
    rem_res = client.get(f"/api/v1/findings/{finding.id}/remediation")
    assert len(rem_res.json()["evidence"]) == 1


def test_11_resolution_proof_endpoint_returns_complete_verification_and_evidence(
    db_session: Session, admin_user: User, reviewer_user: User, finding: ReportFinding, client: TestClient
):
    """TEST 11: Resolution proof endpoint returns complete verification and evidence."""
    set_auth(admin_user, db_session)
    client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("proof_doc.pdf", io.BytesIO(b"proof"), "application/pdf")},
    )
    client.post(f"/api/v1/findings/{finding.id}/remediation/submit", json={"submission_note": "Please verify."})

    set_auth(reviewer_user, db_session)
    client.post(f"/api/v1/findings/{finding.id}/remediation/verify", json={"verification_note": "Clause 33 compliant."})

    set_auth(admin_user, db_session)
    client.post(f"/api/v1/findings/{finding.id}/remediation/approve", json={"admin_note": "All good."})
    client.post(f"/api/v1/findings/{finding.id}/resolve", json={"resolution_note": "Final resolved."})

    proof_res = client.get(f"/api/v1/findings/{finding.id}/resolution-proof")
    assert proof_res.status_code == 200
    proof = proof_res.json()

    assert proof["finding_id"] == str(finding.id)
    assert proof["lifecycle_status"] == "RESOLVED"
    assert proof["resolved_by_name"] == "Admin User"
    assert proof["approved_cycle_number"] == 1
    assert proof["verification"]["verified_by_name"] == "Reviewer User"
    assert proof["verification"]["verification_note"] == "Clause 33 compliant."
    assert len(proof["supporting_evidence"]) == 1
    assert proof["supporting_evidence"][0]["original_filename"] == "proof_doc.pdf"
    assert proof["has_supporting_evidence"] is True
    assert len(proof["historical_resolutions"]) == 1


def test_12_full_e2e_evidence_verification_resolution_reopen_resolution_flow(
    db_session: Session, admin_user: User, reviewer_user: User, finding: ReportFinding, org_document: Document, client: TestClient
):
    """
    TEST 12: Complete End-to-End lifecycle:
    Finding -> Remediation Cycle 1 -> Evidence -> Reject
    -> Cycle 2 -> Evidence -> Verify -> Approve -> Resolve
    -> Reopen -> Cycle 3 -> Evidence -> Verify -> Approve -> Resolve Again
    """
    # 1. Cycle 1: Upload evidence & Reject
    set_auth(admin_user, db_session)
    client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("c1_draft.pdf", io.BytesIO(b"c1"), "application/pdf")},
    )
    client.post(f"/api/v1/findings/{finding.id}/remediation/submit", json={"submission_note": "Draft 1"})

    set_auth(reviewer_user, db_session)
    client.post(f"/api/v1/findings/{finding.id}/remediation/reject", json={"rejection_reason": "Incomplete scope"})

    # 2. Cycle 2: Link document from library & Verify -> Approve -> Resolve
    set_auth(admin_user, db_session)
    client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence/link-document",
        json={"document_id": str(org_document.id), "cycle_number": 2},
    )
    client.post(f"/api/v1/findings/{finding.id}/remediation/submit", json={"submission_note": "Draft 2 with linked doc"})

    set_auth(reviewer_user, db_session)
    client.post(f"/api/v1/findings/{finding.id}/remediation/verify", json={"verification_note": "Scope complete."})

    set_auth(admin_user, db_session)
    client.post(f"/api/v1/findings/{finding.id}/remediation/approve", json={"admin_note": "Approved Cycle 2."})
    client.post(f"/api/v1/findings/{finding.id}/resolve", json={"resolution_note": "First resolution complete."})

    # Verify Resolution #1 proof
    proof1 = client.get(f"/api/v1/findings/{finding.id}/resolution-proof").json()
    assert proof1["lifecycle_status"] == "RESOLVED"
    assert len(proof1["historical_resolutions"]) == 1
    assert proof1["historical_resolutions"][0]["resolution_number"] == 1

    # 3. Reopen finding
    reopen_res = client.post(
        f"/api/v1/findings/{finding.id}/reopen",
        json={"reopen_reason": "External auditor requested updated escalation matrix."},
    )
    assert reopen_res.status_code == 200

    # 4. Cycle 3: Attach new evidence -> Verify -> Approve -> Resolve Again
    client.post(
        f"/api/v1/findings/{finding.id}/remediation/evidence",
        files={"file": ("escalation_matrix_v3.pdf", io.BytesIO(b"c3"), "application/pdf")},
        data={"cycle_number": 3},
    )
    client.post(f"/api/v1/findings/{finding.id}/remediation/submit", json={"submission_note": "Added escalation matrix"})

    set_auth(reviewer_user, db_session)
    client.post(f"/api/v1/findings/{finding.id}/remediation/verify", json={"verification_note": "Escalation matrix verified."})

    set_auth(admin_user, db_session)
    client.post(f"/api/v1/findings/{finding.id}/remediation/approve", json={"admin_note": "Approved Cycle 3."})
    client.post(f"/api/v1/findings/{finding.id}/resolve", json={"resolution_note": "Second resolution complete."})

    # Verify Resolution #2 proof
    proof2 = client.get(f"/api/v1/findings/{finding.id}/resolution-proof").json()
    assert proof2["lifecycle_status"] == "RESOLVED"
    assert proof2["resolution_note"] == "Second resolution complete."
    assert len(proof2["historical_resolutions"]) == 2

    # Verify resolution history contains both resolutions in chronological descending order
    res_nums = [r["resolution_number"] for r in proof2["historical_resolutions"]]
    assert res_nums == [2, 1]

    # Verify all evidence remains intact across all 3 cycles
    all_rem = client.get(f"/api/v1/findings/{finding.id}/remediation").json()
    assert len(all_rem["evidence"]) == 3
    ev_files = {e["original_filename"] for e in all_rem["evidence"]}
    assert "c1_draft.pdf" in ev_files
    assert "incident_response_v2.pdf" in ev_files
    assert "escalation_matrix_v3.pdf" in ev_files
