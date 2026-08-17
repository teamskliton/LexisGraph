"""
Comprehensive Unit & Integration Test Suite for Sprint 7.12:
Finding Export & Compliance Audit Reports.
"""
from __future__ import annotations

import csv
import io
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
def secondary_org_user(db_session: Session) -> User:
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=f"other-{user_id.hex[:6]}@example.com",
        username=f"other_{user_id.hex[:6]}",
        hashed_password="fakehashedpassword",
        full_name="Other Org Admin User",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_org(
    db_session: Session,
    admin_user: User,
    analyst_user: User,
    reviewer_user: User,
    viewer_user: User,
) -> Organization:
    org_id = uuid.uuid4()
    org = Organization(
        id=org_id,
        name=f"Export Test Org {org_id.hex[:6]}",
        created_by=admin_user.id,
    )
    db_session.add(org)

    # Admin membership
    db_session.add(
        OrganizationMember(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=admin_user.id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        )
    )
    # Analyst membership
    db_session.add(
        OrganizationMember(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=analyst_user.id,
            role=UserRole.COMPLIANCE_ANALYST,
            status=MemberStatus.ACTIVE,
        )
    )
    # Reviewer membership
    db_session.add(
        OrganizationMember(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=reviewer_user.id,
            role=UserRole.REVIEWER,
            status=MemberStatus.ACTIVE,
        )
    )
    # Viewer membership
    db_session.add(
        OrganizationMember(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=viewer_user.id,
            role=UserRole.VIEWER,
            status=MemberStatus.ACTIVE,
        )
    )
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def secondary_org(db_session: Session, secondary_org_user: User) -> Organization:
    org_id = uuid.uuid4()
    org = Organization(
        id=org_id,
        name=f"Secondary Org {org_id.hex[:6]}",
        created_by=secondary_org_user.id,
    )
    db_session.add(org)
    db_session.add(
        OrganizationMember(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=secondary_org_user.id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        )
    )
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def sample_dataset(
    db_session: Session,
    test_org: Organization,
    admin_user: User,
    reviewer_user: User,
    secondary_org: Organization,
    secondary_org_user: User,
):
    """Seed comprehensive test dataset spanning all finding lifecycle states."""
    # Policy document
    policy_doc = Document(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        original_filename="infosec_policy_v2.pdf",
        stored_filename="stored_infosec_v2.pdf",
        file_path="/documents/infosec_policy_v2.pdf",
        file_size=10240,
        mime_type="application/pdf",
        checksum="infosec_policy_v2_hash",
        document_type=DocumentType.POLICY,
        uploaded_by=admin_user.id,
    )
    db_session.add(policy_doc)

    # Regulation
    regulation = Regulation(
        id=uuid.uuid4(),
        title="Digital Personal Data Protection Act 2023",
        document_hash="dpdpa_2023_hash",
        uploaded_by=admin_user.id,
        original_filename="dpdpa_2023.pdf",
        stored_filename="stored_dpdpa_2023.pdf",
        file_path="/regulations/dpdpa_2023.pdf",
        file_size=20480,
        mime_type="application/pdf",
    )
    db_session.add(regulation)

    # Compliance Report for Primary Org
    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        regulation_id=regulation.id,
        policy_document_id=policy_doc.id,
        created_by=admin_user.id,
    )
    db_session.add(report)

    # Finding 1: Open Critical Finding with Formula characters in title/reasoning
    f1 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="SEC-04.1",
        regulation_clause_id="DPDPA-SEC-8",
        status="NON_COMPLIANT",
        severity="CRITICAL",
        reasoning="=1+1 Formula Injection Attempt in reasoning text.",
        recommendation="+2+2 Implement data encryption controls.",
        citation="Section 8(1) DPDPA",
        lifecycle_status="OPEN",
        assigned_to=reviewer_user.id,
        remediation_due_date=datetime.now(timezone.utc) - timedelta(days=2),
        created_at=datetime.now(timezone.utc) - timedelta(days=10),
    )
    db_session.add(f1)

    # Finding 2: Resolved Finding with full remediation, verification, and resolution note
    f2 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="PRIV-01.2",
        regulation_clause_id="DPDPA-SEC-6",
        status="NON_COMPLIANT",
        severity="HIGH",
        reasoning="Consent notice lacks specific purpose specification.",
        recommendation="Update notice with explicit consent forms.",
        citation="Section 6(1) DPDPA",
        lifecycle_status="RESOLVED",
        assigned_to=reviewer_user.id,
        resolved_by=admin_user.id,
        resolved_at=datetime.now(timezone.utc) - timedelta(days=1),
        resolution_note="Updated consent mechanism and verified proof.",
        created_at=datetime.now(timezone.utc) - timedelta(days=8),
    )
    db_session.add(f2)

    # Remediation for Finding 2
    rem2 = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=f2.id,
        organization_id=test_org.id,
        title="Consent Mechanism Remediation",
        priority="HIGH",
        status="APPROVED",
        created_by=reviewer_user.id,
        verified_by=admin_user.id,
        verified_at=datetime.now(timezone.utc) - timedelta(days=1),
        verification_note="Consent forms updated and approved.",
    )
    db_session.add(rem2)

    # Cycles for Finding 2
    c1 = RemediationCycle(
        id=uuid.uuid4(),
        remediation_id=rem2.id,
        finding_id=f2.id,
        organization_id=test_org.id,
        cycle_number=1,
        status="REJECTED",
        submission_note="First draft submitted.",
        submitted_by=reviewer_user.id,
        reviewed_by=admin_user.id,
        result="REJECTED",
        rejection_reason="Missing multilingual consent.",
    )
    c2 = RemediationCycle(
        id=uuid.uuid4(),
        remediation_id=rem2.id,
        finding_id=f2.id,
        organization_id=test_org.id,
        cycle_number=2,
        status="APPROVED",
        submission_note="Multilingual consent added.",
        submitted_by=reviewer_user.id,
        reviewed_by=admin_user.id,
        result="APPROVED",
        verification_note="Fully verified.",
    )
    db_session.add_all([c1, c2])

    # Evidence for Finding 2
    ev2 = RemediationEvidence(
        id=uuid.uuid4(),
        remediation_id=rem2.id,
        finding_id=f2.id,
        organization_id=test_org.id,
        original_filename="consent_form_v2.pdf",
        stored_filename="stored_consent_form_v2.pdf",
        file_path="/evidence/consent_form_v2.pdf",
        file_size=5120,
        mime_type="application/pdf",
        uploaded_by=reviewer_user.id,
    )
    db_session.add(ev2)

    # Finding 3: Reopened Finding
    f3 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="DATA-03.5",
        regulation_clause_id="DPDPA-SEC-12",
        status="NON_COMPLIANT",
        severity="MEDIUM",
        reasoning="Grievance officer contact not published.",
        recommendation="Publish officer contact in privacy policy.",
        citation="Section 12 DPDPA",
        lifecycle_status="REOPENED",
        assigned_to=reviewer_user.id,
        resolved_by=admin_user.id,
        resolved_at=datetime.now(timezone.utc) - timedelta(days=5),
        resolution_note="Officer appointed.",
        reopened_by=admin_user.id,
        reopened_at=datetime.now(timezone.utc) - timedelta(days=2),
        reopen_reason="Appointed officer resigned, contact outdated.",
        created_at=datetime.now(timezone.utc) - timedelta(days=6),
    )
    db_session.add(f3)

    # Finding 4: Reassessment Required Finding
    f4 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="SEC-09.1",
        regulation_clause_id="DPDPA-SEC-15",
        status="NON_COMPLIANT",
        severity="LOW",
        reasoning="Breach notification timeline requirement.",
        recommendation="Update SLA for reporting to CERT-In / Data Protection Board.",
        citation="Section 15 DPDPA",
        lifecycle_status="REASSESSMENT_REQUIRED",
        reassessment_trigger="NEW_ANALYSIS",
        reassessment_reason="Policy updated with new incident response clauses.",
        reassessment_detected_at=datetime.now(timezone.utc) - timedelta(hours=12),
        created_at=datetime.now(timezone.utc) - timedelta(days=4),
    )
    db_session.add(f4)

    # Secondary Org Data (To test tenant isolation)
    sec_policy = Document(
        id=uuid.uuid4(),
        organization_id=secondary_org.id,
        original_filename="secret_org_b_policy.pdf",
        stored_filename="stored_secret_org_b.pdf",
        file_path="/documents/secret_org_b.pdf",
        file_size=2048,
        mime_type="application/pdf",
        checksum="secret_org_b_policy_hash",
        document_type=DocumentType.POLICY,
        uploaded_by=secondary_org_user.id,
    )
    db_session.add(sec_policy)

    sec_report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=secondary_org.id,
        regulation_id=regulation.id,
        policy_document_id=sec_policy.id,
        created_by=secondary_org_user.id,
    )
    db_session.add(sec_report)

    sec_finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=sec_report.id,
        policy_clause_id="ORG-B-01",
        regulation_clause_id="DPDPA-SEC-99",
        status="NON_COMPLIANT",
        severity="CRITICAL",
        reasoning="Confidential Organization B Violation.",
        recommendation="Fix Org B only.",
        citation="Org B Confidential Citation",
        lifecycle_status="OPEN",
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(sec_finding)

    db_session.commit()
    return {
        "report": report,
        "f1": f1,
        "f2": f2,
        "f3": f3,
        "f4": f4,
        "sec_finding": sec_finding,
    }


def parse_csv_response(response_text: str) -> tuple[list[str], list[dict[str, str]]]:
    """Parse CSV text into headers and list of row dictionaries."""
    reader = csv.DictReader(io.StringIO(response_text))
    rows = list(reader)
    return reader.fieldnames or [], rows


class TestFindingExportAndComplianceReports:
    """Test Suite for Sprint 7.12: Finding Export & Compliance Audit Reports."""

    def test_1_export_returns_valid_csv(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 1: Export returns HTTP 200, valid text/csv and correct attachment header."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        res = client.get(f"/findings/export?organization_id={test_org.id}")

        assert res.status_code == 200
        assert "text/csv" in res.headers.get("content-type", "")
        assert "attachment; filename=" in res.headers.get("content-disposition", "")
        assert int(res.headers.get("x-exported-count", 0)) == 4

        headers, rows = parse_csv_response(res.text)
        assert len(rows) == 4
        assert "Finding ID" in headers
        assert "Severity" in headers
        assert "Lifecycle Status" in headers

    def test_2_csv_headers_and_columns_accurate(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 2: Verify all required CSV columns exist and match expected structure."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        res = client.get(f"/findings/export?organization_id={test_org.id}")
        assert res.status_code == 200

        headers, _ = parse_csv_response(res.text)
        expected_columns = [
            "Finding ID",
            "Title",
            "Description",
            "Severity",
            "Compliance Status",
            "Lifecycle Status",
            "Organization",
            "Policy Document",
            "Policy ID",
            "Policy Clause",
            "Regulation",
            "Regulation ID",
            "Regulation Clause",
            "Citation",
            "Assignee",
            "Current Remediation Cycle",
            "Remediation Status",
            "Remediation Priority",
            "Remediation Due Date",
            "Remediation Cycle Summary",
            "Verification Status",
            "Verified By",
            "Verified At",
            "Verification Note",
            "Evidence",
            "Resolved",
            "Resolved By",
            "Resolved At",
            "Resolution Note",
            "Reopened",
            "Reopened By",
            "Reopened At",
            "Reopen Reason",
            "Reassessment Required",
            "Reassessment Trigger",
            "Reassessment Reason",
            "Reassessment Detected At",
            "Activity Summary",
            "Created At",
            "Updated At",
        ]
        assert headers == expected_columns

    def test_3_finding_count_matches_filters(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 3: Exported count strictly respects applied filters."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        # Filter by severity = CRITICAL (only f1)
        res = client.get(f"/findings/export?organization_id={test_org.id}&severity=CRITICAL")
        assert res.status_code == 200
        _, rows = parse_csv_response(res.text)
        assert len(rows) == 1
        assert rows[0]["Severity"] == "CRITICAL"

        # Filter by lifecycle_status = RESOLVED (only f2)
        res = client.get(f"/findings/export?organization_id={test_org.id}&lifecycle_status=RESOLVED")
        assert res.status_code == 200
        _, rows = parse_csv_response(res.text)
        assert len(rows) == 1
        assert rows[0]["Lifecycle Status"] == "RESOLVED"

    def test_4_organization_isolation(
        self, db_session: Session, admin_user: User, secondary_org_user: User, test_org: Organization, secondary_org: Organization, sample_dataset
    ):
        """TEST 4: Organization isolation prevents cross-tenant data export and leakage."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        # Admin of test_org attempts to export secondary_org findings
        res = client.get(f"/findings/export?organization_id={secondary_org.id}")
        assert res.status_code == 403
        assert "You do not have access" in res.json()["detail"]

        # Export test_org findings and ensure no Org B finding or document leaked
        res_org_a = client.get(f"/findings/export?organization_id={test_org.id}")
        assert res_org_a.status_code == 200
        assert "Org B" not in res_org_a.text
        assert "secret_org_b_policy.pdf" not in res_org_a.text

    def test_5_status_filter_works(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 5: Compliance status filter works properly."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        res = client.get(f"/findings/export?organization_id={test_org.id}&status=NON_COMPLIANT")
        assert res.status_code == 200
        _, rows = parse_csv_response(res.text)
        assert len(rows) == 4
        for row in rows:
            assert row["Compliance Status"] == "NON_COMPLIANT"

    def test_6_severity_filter_works(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 6: Severity filter works properly."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        res = client.get(f"/findings/export?organization_id={test_org.id}&severity=HIGH")
        assert res.status_code == 200
        _, rows = parse_csv_response(res.text)
        assert len(rows) == 1
        assert rows[0]["Severity"] == "HIGH"

    def test_7_date_and_overdue_filter_works(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 7: Overdue filter and date range filters work properly."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        # f1 is overdue (due 2 days ago, status OPEN), f2 was resolved so not overdue
        res = client.get(f"/findings/export?organization_id={test_org.id}&overdue_only=true")
        assert res.status_code == 200
        _, rows = parse_csv_response(res.text)
        assert len(rows) == 1
        assert rows[0]["Finding ID"] == str(sample_dataset["f1"].id)

    def test_8_related_policy_data_accuracy(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 8: Related policy document and clause information accurately represented."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        res = client.get(f"/findings/export?organization_id={test_org.id}")
        assert res.status_code == 200
        _, rows = parse_csv_response(res.text)

        row_f1 = next(r for r in rows if r["Finding ID"] == str(sample_dataset["f1"].id))
        assert row_f1["Policy Document"] == "infosec_policy_v2.pdf"
        assert row_f1["Policy Clause"] == "SEC-04.1"
        assert row_f1["Policy ID"] != ""

    def test_9_related_regulation_data_accuracy(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 9: Related regulation name, ID, and clause accurately represented."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        res = client.get(f"/findings/export?organization_id={test_org.id}")
        assert res.status_code == 200
        _, rows = parse_csv_response(res.text)

        row_f1 = next(r for r in rows if r["Finding ID"] == str(sample_dataset["f1"].id))
        assert row_f1["Regulation"] == "Digital Personal Data Protection Act 2023"
        assert row_f1["Regulation Clause"] == "DPDPA-SEC-8"
        assert row_f1["Citation"] == "Section 8(1) DPDPA"

    def test_10_remediation_and_cycle_data_accuracy(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 10: Multi-cycle remediation history accurately exported."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        res = client.get(f"/findings/export?organization_id={test_org.id}")
        assert res.status_code == 200
        _, rows = parse_csv_response(res.text)

        row_f2 = next(r for r in rows if r["Finding ID"] == str(sample_dataset["f2"].id))
        assert row_f2["Current Remediation Cycle"] == "2"
        assert row_f2["Remediation Status"] == "APPROVED"
        assert "Cycle 1: REJECTED; Cycle 2: APPROVED" in row_f2["Remediation Cycle Summary"]
        assert row_f2["Verification Status"] == "VERIFIED"
        assert row_f2["Verified By"] == "Admin Test User"
        assert row_f2["Verification Note"] == "Consent forms updated and approved."

    def test_11_evidence_references_accuracy(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 11: Evidence file references accurately included without embedding binary blobs."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        res = client.get(f"/findings/export?organization_id={test_org.id}")
        assert res.status_code == 200
        _, rows = parse_csv_response(res.text)

        row_f2 = next(r for r in rows if r["Finding ID"] == str(sample_dataset["f2"].id))
        assert "consent_form_v2.pdf" in row_f2["Evidence"]

    def test_12_resolution_data_accuracy(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 12: Resolution fields populated for resolved findings and empty for unresolved."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        res = client.get(f"/findings/export?organization_id={test_org.id}")
        assert res.status_code == 200
        _, rows = parse_csv_response(res.text)

        row_f2 = next(r for r in rows if r["Finding ID"] == str(sample_dataset["f2"].id))
        assert row_f2["Resolved"] == "true"
        assert row_f2["Resolved By"] == "Admin Test User"
        assert row_f2["Resolution Note"] == "Updated consent mechanism and verified proof."
        assert row_f2["Resolved At"] != ""

        # Unresolved finding (f1)
        row_f1 = next(r for r in rows if r["Finding ID"] == str(sample_dataset["f1"].id))
        assert row_f1["Resolved"] == "false"
        assert row_f1["Resolved By"] == ""
        assert row_f1["Resolved At"] == ""
        assert row_f1["Resolution Note"] == ""

    def test_13_reassessment_data_accuracy(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 13: Reassessment required fields populated accurately."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        res = client.get(f"/findings/export?organization_id={test_org.id}")
        assert res.status_code == 200
        _, rows = parse_csv_response(res.text)

        row_f4 = next(r for r in rows if r["Finding ID"] == str(sample_dataset["f4"].id))
        assert row_f4["Reassessment Required"] == "true"
        assert row_f4["Reassessment Trigger"] == "NEW_ANALYSIS"
        assert "Policy updated with new incident response clauses." in row_f4["Reassessment Reason"]
        assert row_f4["Reassessment Detected At"] != ""

    def test_14_reopening_data_accuracy(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 14: Reopening history accurately recorded."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        res = client.get(f"/findings/export?organization_id={test_org.id}")
        assert res.status_code == 200
        _, rows = parse_csv_response(res.text)

        row_f3 = next(r for r in rows if r["Finding ID"] == str(sample_dataset["f3"].id))
        assert row_f3["Reopened"] == "true"
        assert row_f3["Reopened By"] == "Admin Test User"
        assert "Appointed officer resigned" in row_f3["Reopen Reason"]
        assert row_f3["Reopened At"] != ""

    def test_15_activity_summary_and_audit_event_logged(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 15: Export activity event is created in Activity and AuditLog."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        res = client.get(f"/findings/export?organization_id={test_org.id}&severity=CRITICAL")
        assert res.status_code == 200

        # Check Activity log
        activity = (
            db_session.query(Activity)
            .filter(Activity.event_type == "FINDINGS_EXPORTED", Activity.user_id == admin_user.id)
            .first()
        )
        assert activity is not None
        assert activity.title == "Findings Exported"
        assert activity.extra_data["count"] == 1
        assert activity.extra_data["filters"]["severity"] == "CRITICAL"

        # Check AuditLog
        audit_log = (
            db_session.query(AuditLog)
            .filter(AuditLog.action == "FINDINGS_EXPORTED", AuditLog.organization_id == test_org.id)
            .first()
        )
        assert audit_log is not None

    def test_16_csv_formula_injection_prevention(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 16: Leading formula characters (=, +, -, @) are sanitized with a leading quote."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        client = TestClient(app)
        res = client.get(f"/findings/export?organization_id={test_org.id}&severity=CRITICAL")
        assert res.status_code == 200
        _, rows = parse_csv_response(res.text)

        row_f1 = rows[0]
        # In f1, reasoning starts with '=1+1' -> sanitized to "'=1+1"
        assert row_f1["Description"].startswith("'=1+1")

    def test_17_role_permissions_rbac(
        self, db_session: Session, admin_user: User, analyst_user: User, reviewer_user: User, viewer_user: User, test_org: Organization, sample_dataset
    ):
        """TEST 17: Admin, Analyst, Reviewer can export; Viewer cannot export (403 Forbidden)."""
        app.dependency_overrides[get_db] = lambda: db_session

        # 1. Admin -> OK (200)
        app.dependency_overrides[get_current_user] = lambda: admin_user
        client = TestClient(app)
        res_admin = client.get(f"/findings/export?organization_id={test_org.id}")
        assert res_admin.status_code == 200

        # 2. Compliance Analyst -> OK (200)
        app.dependency_overrides[get_current_user] = lambda: analyst_user
        res_analyst = client.get(f"/findings/export?organization_id={test_org.id}")
        assert res_analyst.status_code == 200

        # 3. Reviewer -> OK (200)
        app.dependency_overrides[get_current_user] = lambda: reviewer_user
        res_reviewer = client.get(f"/findings/export?organization_id={test_org.id}")
        assert res_reviewer.status_code == 200

        # 4. Viewer -> Forbidden (403)
        app.dependency_overrides[get_current_user] = lambda: viewer_user
        res_viewer = client.get(f"/findings/export?organization_id={test_org.id}")
        assert res_viewer.status_code == 403
        assert "Requires Reviewer role or higher" in res_viewer.json()["detail"]

    def test_18_large_dataset_export_100_plus_findings(self, db_session: Session, admin_user: User, test_org: Organization, sample_dataset):
        """TEST 18: Export 100+ findings stress test: verifies streaming, row completeness, zero corruption."""
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: admin_user

        report = sample_dataset["report"]
        # Add 120 findings
        bulk_findings = []
        for i in range(120):
            bf = ReportFinding(
                id=uuid.uuid4(),
                report_id=report.id,
                policy_clause_id=f"CLAUSE-BULK-{i:03d}",
                regulation_clause_id=f"REG-BULK-{i:03d}",
                status="NON_COMPLIANT" if i % 2 == 0 else "PARTIALLY_COMPLIANT",
                severity="HIGH" if i % 3 == 0 else "MEDIUM",
                reasoning=f"Bulk evaluation stress test finding index {i}",
                recommendation=f"Remediation action {i}",
                citation=f"Citation reference {i}",
                lifecycle_status="OPEN" if i % 2 == 0 else "IN_REVIEW",
                created_at=datetime.now(timezone.utc) - timedelta(hours=i),
            )
            bulk_findings.append(bf)
        db_session.add_all(bulk_findings)
        db_session.commit()

        client = TestClient(app)
        res = client.get(f"/findings/export?organization_id={test_org.id}")
        assert res.status_code == 200
        assert int(res.headers.get("x-exported-count", 0)) == 124  # 4 initial + 120 bulk

        headers, rows = parse_csv_response(res.text)
        assert len(rows) == 124
        assert len(headers) == 40
        # Verify no duplicate finding IDs
        finding_ids = [r["Finding ID"] for r in rows]
        assert len(finding_ids) == len(set(finding_ids))
