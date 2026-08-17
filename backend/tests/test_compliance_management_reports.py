"""
Comprehensive automated tests for Sprint 7.14: Compliance Reports & Management Summary.
Covers deterministic data aggregation, ReportLab multi-page PDF generation, RBAC,
organization isolation, 1:1 metric consistency with analytics, and large dataset handling.
"""
import io
import uuid
from datetime import datetime, timezone, timedelta
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.session import Base, get_db
from app.core.dependencies import get_current_user
from app.db.models.user import User
from app.db.models.organization import Organization
from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus, AuditLog
from app.db.models.document import Document, DocumentType
from app.db.models.regulation import Regulation
from app.db.models.activity import Activity
from app.compliance.models import ComplianceReport, ReportFinding, FindingResolutionHistory
from app.db.models.remediation import FindingRemediation, RemediationCycle, RemediationEvidence

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


def get_authenticated_client(db_session: Session, user: User) -> AuthTestClient:
    return AuthTestClient(db_session, user)


# ==============================================================================
# FIXTURES
# ==============================================================================

@pytest.fixture
def admin_user(db_session: Session) -> User:
    uid = uuid.uuid4()
    user = User(
        id=uid,
        email=f"admin_{uid.hex[:6]}@apex.com",
        username=f"admin_{uid.hex[:6]}",
        full_name="Arthur Admin",
        hashed_password="hashed_password_placeholder",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def reviewer_user(db_session: Session) -> User:
    uid = uuid.uuid4()
    user = User(
        id=uid,
        email=f"reviewer_{uid.hex[:6]}@apex.com",
        username=f"reviewer_{uid.hex[:6]}",
        full_name="Rachel Reviewer",
        hashed_password="hashed_password_placeholder",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def analyst_user(db_session: Session) -> User:
    uid = uuid.uuid4()
    user = User(
        id=uid,
        email=f"analyst_{uid.hex[:6]}@apex.com",
        username=f"analyst_{uid.hex[:6]}",
        full_name="Alex Analyst",
        hashed_password="hashed_password_placeholder",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def viewer_user(db_session: Session) -> User:
    uid = uuid.uuid4()
    user = User(
        id=uid,
        email=f"viewer_{uid.hex[:6]}@apex.com",
        username=f"viewer_{uid.hex[:6]}",
        full_name="Victor Viewer",
        hashed_password="hashed_password_placeholder",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def other_org_user(db_session: Session) -> User:
    uid = uuid.uuid4()
    user = User(
        id=uid,
        email=f"other_{uid.hex[:6]}@beta.com",
        username=f"other_{uid.hex[:6]}",
        full_name="Oscar Other",
        hashed_password="hashed_password_placeholder",
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
        name="Apex Compliance Global",
        created_by=admin_user.id,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def other_organization(db_session: Session, other_org_user: User) -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name="Isolated Corp Beta",
        created_by=other_org_user.id,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(org)

    mem = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=other_org_user.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    db_session.add(mem)

    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def setup_memberships(
    db_session: Session,
    organization: Organization,
    admin_user: User,
    reviewer_user: User,
    analyst_user: User,
    viewer_user: User,
):
    members = [
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
            user_id=reviewer_user.id,
            role=UserRole.REVIEWER,
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
            user_id=viewer_user.id,
            role=UserRole.VIEWER,
            status=MemberStatus.ACTIVE,
        ),
    ]
    for m in members:
        db_session.add(m)
    db_session.commit()


@pytest.fixture
def sample_policy_doc(db_session: Session, organization: Organization, admin_user: User) -> Document:
    doc = Document(
        id=uuid.uuid4(),
        organization_id=organization.id,
        original_filename="Information_Security_Policy_v3.pdf",
        stored_filename="stored_isp_v3.pdf",
        file_path="/documents/Information_Security_Policy_v3.pdf",
        file_size=204800,
        mime_type="application/pdf",
        checksum="checksum_isp_v3",
        document_type=DocumentType.POLICY,
        uploaded_by=admin_user.id,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)
    return doc


@pytest.fixture
def sample_regulation(db_session: Session, admin_user: User) -> Regulation:
    reg = Regulation(
        id=uuid.uuid4(),
        title="Digital Personal Data Protection Act 2023",
        document_hash="hash_dpdp_2023",
        uploaded_by=admin_user.id,
        original_filename="dpdp_act_2023.pdf",
        stored_filename="stored_dpdp.pdf",
        file_path="/regulations/dpdp.pdf",
        file_size=500000,
        mime_type="application/pdf",
    )
    db_session.add(reg)
    db_session.commit()
    db_session.refresh(reg)
    return reg


@pytest.fixture
def sample_report(
    db_session: Session,
    organization: Organization,
    sample_policy_doc: Document,
    sample_regulation: Regulation,
    admin_user: User,
) -> ComplianceReport:
    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=organization.id,
        policy_document_id=sample_policy_doc.id,
        regulation_id=sample_regulation.id,
        overall_score=78.5,
        created_by=admin_user.id,
        created_at=datetime.now(timezone.utc) - timedelta(days=5),
        is_deleted=False,
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)
    return report


@pytest.fixture
def populate_sample_findings(
    db_session: Session,
    sample_report: ComplianceReport,
    analyst_user: User,
    admin_user: User,
) -> list[ReportFinding]:
    """Populates realistic findings with varied statuses, severities, remediations, and cycles."""
    now_utc = datetime.now(timezone.utc)

    # 1. Critical Open Finding
    f1 = ReportFinding(
        id=uuid.uuid4(),
        report_id=sample_report.id,
        policy_clause_id="Sec-4.1: Encryption at Rest",
        regulation_clause_id="Section 8(5)",
        status="NON_COMPLIANT",
        lifecycle_status="OPEN",
        severity="CRITICAL",
        reasoning="Database backups stored unencrypted in public bucket.",
        recommendation="Enable AES-256 server-side encryption.",
        citation="DPDP Act Sec 8(5)",
        assigned_to=analyst_user.id,
        created_at=now_utc - timedelta(days=12),
        updated_at=now_utc - timedelta(days=1),
    )

    # 2. High Remediation Finding with Cycle 2
    f2 = ReportFinding(
        id=uuid.uuid4(),
        report_id=sample_report.id,
        policy_clause_id="Sec-5.2: Multi-Factor Authentication",
        regulation_clause_id="Section 7(2)",
        status="PARTIALLY_COMPLIANT",
        lifecycle_status="REMEDIATION",
        severity="HIGH",
        reasoning="MFA not enforced for VPN gateway.",
        recommendation="Enforce FIDO2 WebAuthn keys for all remote access.",
        citation="DPDP Act Sec 7(2)",
        assigned_to=analyst_user.id,
        created_at=now_utc - timedelta(days=8),
        updated_at=now_utc - timedelta(days=2),
    )

    # 3. Medium Resolved Finding
    f3 = ReportFinding(
        id=uuid.uuid4(),
        report_id=sample_report.id,
        policy_clause_id="Sec-6.1: Privacy Notice",
        regulation_clause_id="Section 5(1)",
        status="COMPLIANT",
        lifecycle_status="RESOLVED",
        severity="MEDIUM",
        reasoning="Privacy notice lacked multi-language translation.",
        recommendation="Publish notice in 22 scheduled languages.",
        citation="DPDP Act Sec 5(1)",
        resolved_by=admin_user.id,
        resolved_at=now_utc - timedelta(days=2),
        resolution_note="Multi-lingual consent portal deployed.",
        created_at=now_utc - timedelta(days=20),
        updated_at=now_utc - timedelta(days=2),
    )

    # 4. Low Needs Reassessment Finding
    f4 = ReportFinding(
        id=uuid.uuid4(),
        report_id=sample_report.id,
        policy_clause_id="Sec-7.3: Data Retention Period",
        regulation_clause_id="Section 9(3)",
        status="NON_COMPLIANT",
        lifecycle_status="REASSESSMENT_REQUIRED",
        severity="LOW",
        reasoning="Policy updated; requires control reassessment.",
        recommendation="Verify automated deletion job frequency.",
        citation="DPDP Act Sec 9(3)",
        reassessment_trigger="POLICY_UPDATE",
        reassessment_detected_at=now_utc - timedelta(days=1),
        created_at=now_utc - timedelta(days=15),
        updated_at=now_utc - timedelta(days=1),
    )

    # 5. High Reopened Finding
    f5 = ReportFinding(
        id=uuid.uuid4(),
        report_id=sample_report.id,
        policy_clause_id="Sec-8.1: Breach Notification SLA",
        regulation_clause_id="Section 8(6)",
        status="NON_COMPLIANT",
        lifecycle_status="REOPENED",
        severity="HIGH",
        reasoning="Breach escalation workflow failed table-top simulation.",
        recommendation="Update incident response runbook.",
        citation="DPDP Act Sec 8(6)",
        reopened_by=admin_user.id,
        reopened_at=now_utc - timedelta(days=1),
        reopen_reason="Failed automated drill.",
        created_at=now_utc - timedelta(days=25),
        updated_at=now_utc - timedelta(days=1),
    )

    findings = [f1, f2, f3, f4, f5]
    for f in findings:
        db_session.add(f)
    db_session.commit()

    # Add remediation workflow for f2 with 2 cycles
    rem2 = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=f2.id,
        organization_id=sample_report.organization_id,
        created_by=analyst_user.id,
        status="READY_FOR_REVIEW",
        assigned_to=analyst_user.id,
        created_at=now_utc - timedelta(days=7),
        updated_at=now_utc - timedelta(days=2),
    )
    db_session.add(rem2)
    db_session.commit()

    c1 = RemediationCycle(
        id=uuid.uuid4(),
        remediation_id=rem2.id,
        finding_id=f2.id,
        organization_id=sample_report.organization_id,
        cycle_number=1,
        status="REJECTED",
        submission_note="First submission",
        submitted_by=analyst_user.id,
        reviewed_by=admin_user.id,
        reviewed_at=now_utc - timedelta(days=4),
        result="REJECTED",
        rejection_reason="Incomplete MFA rollout",
        submitted_at=now_utc - timedelta(days=6),
    )
    c2 = RemediationCycle(
        id=uuid.uuid4(),
        remediation_id=rem2.id,
        finding_id=f2.id,
        organization_id=sample_report.organization_id,
        cycle_number=2,
        status="SUBMITTED",
        submission_note="Second submission with hardware keys",
        submitted_by=analyst_user.id,
        submitted_at=now_utc - timedelta(days=2),
    )
    db_session.add(c1)
    db_session.add(c2)

    # Add resolution history for f3
    res_hist = FindingResolutionHistory(
        id=uuid.uuid4(),
        finding_id=f3.id,
        organization_id=sample_report.organization_id,
        resolution_number=1,
        resolved_at=now_utc - timedelta(days=2),
        resolved_by=admin_user.id,
        resolution_note="Multi-lingual consent portal deployed.",
        status="RESOLVED",
    )
    db_session.add(res_hist)

    # Add Sprint 7.13 activity events
    act1 = Activity(
        id=uuid.uuid4(),
        user_id=admin_user.id,
        event_type="FINDING_CREATED",
        title="Finding Created",
        description="Created critical finding Sec-4.1",
        icon_type="alert",
        extra_data={"organization_id": str(sample_report.organization_id), "finding_id": str(f1.id)},
        created_at=now_utc - timedelta(days=12),
    )
    act2 = Activity(
        id=uuid.uuid4(),
        user_id=analyst_user.id,
        event_type="REMEDIATION_CYCLE_SUBMITTED",
        title="Remediation Cycle Submitted",
        description="Submitted cycle 2",
        icon_type="check",
        extra_data={"organization_id": str(sample_report.organization_id), "finding_id": str(f2.id)},
        created_at=now_utc - timedelta(days=2),
    )
    act3 = Activity(
        id=uuid.uuid4(),
        user_id=admin_user.id,
        event_type="FINDING_RESOLVED",
        title="Finding Resolved",
        description="Resolved Sec-6.1",
        icon_type="check",
        extra_data={"organization_id": str(sample_report.organization_id), "finding_id": str(f3.id)},
        created_at=now_utc - timedelta(days=2),
    )
    db_session.add(act1)
    db_session.add(act2)
    db_session.add(act3)

    db_session.commit()
    return findings


# ==============================================================================
# SPRINT 7.14 TEST CASES
# ==============================================================================

def test_generate_report_summary_json(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_report: ComplianceReport,
    populate_sample_findings,
    admin_user: User,
):
    """1. Verify GET /findings/reports/compliance/summary returns accurate structured JSON."""
    client = get_authenticated_client(db_session, admin_user)

    res = client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}&date_range=all")
    assert res.status_code == 200
    data = res.json()

    assert data["organization_id"] == str(organization.id)
    assert data["organization_name"] == organization.name
    assert "Compliance & Management Report" in data["report_title"]
    assert data["reporting_period"] == "All Time"

    # Executive Metrics
    em = data["executive_metrics"]
    assert em["total_findings"] == 5
    assert em["open_findings"] == 2  # f1 (OPEN) + f5 (REOPENED)
    assert em["critical_findings"] == 1
    assert em["high_findings"] == 2
    assert em["medium_findings"] == 1
    assert em["low_findings"] == 1
    assert em["under_remediation"] == 1
    assert em["needs_reassessment"] == 1
    assert em["resolved_findings"] == 1
    assert em["reopened_findings"] == 1
    assert em["resolution_rate_percentage"] == 20.0


def test_generate_report_pdf_binary(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_report: ComplianceReport,
    populate_sample_findings,
    admin_user: User,
):
    """2. Verify GET /findings/reports/compliance/pdf streams valid A4 PDF binary with headers."""
    client = get_authenticated_client(db_session, admin_user)

    res = client.get(f"/findings/reports/compliance/pdf?organization_id={organization.id}&date_range=30d")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert "attachment; filename=\"compliance_report_" in res.headers["content-disposition"]
    assert res.content.startswith(b"%PDF-")
    assert len(res.content) > 5000  # Valid multi-page PDF


def test_data_consistency_with_analytics(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_report: ComplianceReport,
    populate_sample_findings,
    admin_user: User,
):
    """3. Verify report metrics match GET /findings/analytics 1:1 for data consistency."""
    client = get_authenticated_client(db_session, admin_user)

    # 1. Fetch Analytics
    analytics_res = client.get(f"/findings/analytics?organization_id={organization.id}&date_range=all")
    assert analytics_res.status_code == 200
    ana = analytics_res.json()["health_summary"]

    # 2. Fetch Report Summary
    report_res = client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}&date_range=all")
    assert report_res.status_code == 200
    rep = report_res.json()["executive_metrics"]

    assert rep["total_findings"] == ana["total_findings"]
    assert rep["open_findings"] == ana["open_findings"]
    assert rep["critical_findings"] == ana["critical_count"]
    assert rep["high_findings"] == ana["high_count"]
    assert rep["medium_findings"] == ana["medium_count"]
    assert rep["low_findings"] == ana["low_count"]
    assert rep["under_remediation"] == ana["in_remediation"]
    assert rep["needs_reassessment"] == ana["reassessment_required"]
    assert rep["resolved_findings"] == ana["resolved"]
    assert rep["reopened_findings"] == ana["reopened_count"]


def test_high_risk_findings_ranking(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_report: ComplianceReport,
    populate_sample_findings,
    admin_user: User,
):
    """4. Verify high-risk unresolved findings are ranked by severity and aging."""
    client = get_authenticated_client(db_session, admin_user)

    res = client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}")
    assert res.status_code == 200
    high_risk = res.json()["high_risk_findings"]

    assert len(high_risk) == 4  # 4 unresolved out of 5
    assert high_risk[0]["severity"] == "CRITICAL"
    assert high_risk[0]["policy_clause_id"] == "Sec-4.1: Encryption at Rest"
    assert high_risk[1]["severity"] == "HIGH"
    assert high_risk[2]["severity"] == "HIGH"
    assert high_risk[2]["remediation_cycle"] == 2


def test_policy_gap_summary_accuracy(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_policy_doc: Document,
    sample_report: ComplianceReport,
    populate_sample_findings,
    admin_user: User,
):
    """5. Verify policy gap breakdown accurately calculates findings per policy document."""
    client = get_authenticated_client(db_session, admin_user)

    res = client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}")
    assert res.status_code == 200
    policy_gaps = res.json()["policy_gaps"]

    assert len(policy_gaps) == 1
    assert policy_gaps[0]["policy_document_id"] == str(sample_policy_doc.id)
    assert policy_gaps[0]["policy_name"] == sample_policy_doc.original_filename
    assert policy_gaps[0]["total_findings"] == 5
    assert policy_gaps[0]["critical_count"] == 1
    assert policy_gaps[0]["unresolved_count"] == 4
    assert policy_gaps[0]["resolved_count"] == 1


def test_regulation_gap_summary_accuracy(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_regulation: Regulation,
    sample_report: ComplianceReport,
    populate_sample_findings,
    admin_user: User,
):
    """6. Verify regulation gap breakdown accurately calculates findings per regulation."""
    client = get_authenticated_client(db_session, admin_user)

    res = client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}")
    assert res.status_code == 200
    reg_gaps = res.json()["regulation_gaps"]

    assert len(reg_gaps) == 1
    assert reg_gaps[0]["regulation_id"] == str(sample_regulation.id)
    assert reg_gaps[0]["regulation_title"] == sample_regulation.title
    assert reg_gaps[0]["total_findings"] == 5
    assert reg_gaps[0]["unresolved_count"] == 4


def test_remediation_summary_cycles(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_report: ComplianceReport,
    populate_sample_findings,
    admin_user: User,
):
    """7. Verify remediation operations summary captures cycle counts, multiple cycles, and stages."""
    client = get_authenticated_client(db_session, admin_user)

    res = client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}")
    assert res.status_code == 200
    rem = res.json()["remediation_summary"]

    assert rem["submitted_for_review_count"] == 1
    assert rem["multiple_cycles_count"] == 1
    assert rem["total_cycles_completed"] == 2


def test_reassessment_and_resolution_metrics(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_report: ComplianceReport,
    populate_sample_findings,
    admin_user: User,
):
    """8. Verify distinction between resolved in period vs currently resolved."""
    client = get_authenticated_client(db_session, admin_user)

    res = client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}&date_range=all")
    assert res.status_code == 200
    res_sum = res.json()["resolution_summary"]
    reass_sum = res.json()["reassessment_summary"]

    assert res_sum["resolved_during_period"] == 1
    assert res_sum["currently_resolved"] == 1
    assert res_sum["currently_unresolved"] == 4
    assert reass_sum["reassessment_required_count"] == 1


def test_trend_summary_and_insufficient_data(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_report: ComplianceReport,
    populate_sample_findings,
    admin_user: User,
):
    """9. Verify historical trend datapoints and insufficient history messaging."""
    client = get_authenticated_client(db_session, admin_user)

    res = client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}")
    assert res.status_code == 200
    data = res.json()

    assert data["has_sufficient_history"] is True
    assert len(data["trend_summary"]) >= 1


def test_audit_event_summary_aggregation(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_report: ComplianceReport,
    populate_sample_findings,
    admin_user: User,
):
    """10. Verify audit activity summary aggregates Sprint 7.13 events in period."""
    client = get_authenticated_client(db_session, admin_user)

    res = client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}&date_range=all")
    assert res.status_code == 200
    audit_sum = res.json()["audit_summary"]

    event_map = {item["event_type"]: item["count"] for item in audit_sum}
    assert event_map.get("FINDING_CREATED", 0) >= 1
    assert event_map.get("REMEDIATION_CYCLE_SUBMITTED", 0) >= 1
    assert event_map.get("FINDING_RESOLVED", 0) >= 1


def test_report_generation_audit_logging(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_report: ComplianceReport,
    populate_sample_findings,
    admin_user: User,
):
    """11. Verify COMPLIANCE_REPORT_GENERATED is logged in Activity and AuditLog."""
    client = get_authenticated_client(db_session, admin_user)

    res = client.get(f"/findings/reports/compliance/pdf?organization_id={organization.id}&date_range=30d")
    assert res.status_code == 200

    # Verify Activity log
    act = (
        db_session.query(Activity)
        .filter(Activity.event_type == "COMPLIANCE_REPORT_GENERATED")
        .first()
    )
    assert act is not None
    assert act.user_id == admin_user.id
    assert act.extra_data["total_findings"] == 5
    assert act.extra_data["format"] == "pdf"

    # Verify AuditLog
    aud = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "COMPLIANCE_REPORT_GENERATED")
        .first()
    )
    assert aud is not None
    assert aud.user_id == admin_user.id
    assert aud.organization_id == organization.id


def test_organization_isolation(
    db_session: Session,
    organization: Organization,
    other_org_user: User,
    populate_sample_findings,
):
    """12. Verify cross-tenant report generation is rejected with 403 Forbidden."""
    client = get_authenticated_client(db_session, other_org_user)

    # Attempt to generate report for unauthorized organization
    res = client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}")
    assert res.status_code == 403
    assert "access" in res.json()["detail"].lower()

    # Attempt PDF download
    pdf_res = client.get(f"/findings/reports/compliance/pdf?organization_id={organization.id}")
    assert pdf_res.status_code == 403


def test_rbac_role_permissions(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_report: ComplianceReport,
    populate_sample_findings,
    admin_user: User,
    reviewer_user: User,
    analyst_user: User,
    viewer_user: User,
):
    """13. Verify RBAC permissions: Admin, Reviewer, and Analyst allowed; Viewer blocked (403)."""
    admin_client = get_authenticated_client(db_session, admin_user)
    reviewer_client = get_authenticated_client(db_session, reviewer_user)
    analyst_client = get_authenticated_client(db_session, analyst_user)
    viewer_client = get_authenticated_client(db_session, viewer_user)

    # Admin: 200 OK
    assert admin_client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}").status_code == 200

    # Reviewer: 200 OK
    assert reviewer_client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}").status_code == 200

    # Analyst: 200 OK
    assert analyst_client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}").status_code == 200

    # Viewer: 403 Forbidden
    v_res = viewer_client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}")
    assert v_res.status_code == 403
    assert "permission" in v_res.json()["detail"].lower()


def test_filter_scoping_date_severity_status(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_report: ComplianceReport,
    populate_sample_findings,
    admin_user: User,
):
    """14. Verify report metrics strictly reflect applied severity and status filters."""
    client = get_authenticated_client(db_session, admin_user)

    # Severity Filter: CRITICAL
    crit_res = client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}&severity=CRITICAL")
    assert crit_res.status_code == 200
    crit_data = crit_res.json()
    assert crit_data["executive_metrics"]["total_findings"] == 1
    assert crit_data["executive_metrics"]["critical_findings"] == 1

    # Status Filter: RESOLVED
    res_res = client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}&lifecycle_status=RESOLVED")
    assert res_res.status_code == 200
    res_data = res_res.json()
    assert res_data["executive_metrics"]["total_findings"] == 1
    assert res_data["executive_metrics"]["resolved_findings"] == 1


def test_empty_organization_report(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    admin_user: User,
):
    """15. Verify valid report generation when organization has 0 findings."""
    client = get_authenticated_client(db_session, admin_user)

    res = client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}")
    assert res.status_code == 200
    data = res.json()

    assert data["executive_metrics"]["total_findings"] == 0
    assert data["executive_metrics"]["resolution_rate_percentage"] == 0.0
    assert len(data["high_risk_findings"]) == 0

    # PDF generation should succeed without error
    pdf_res = client.get(f"/findings/reports/compliance/pdf?organization_id={organization.id}")
    assert pdf_res.status_code == 200
    assert pdf_res.content.startswith(b"%PDF-")


def test_large_dataset_report_generation(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_policy_doc: Document,
    sample_regulation: Regulation,
    admin_user: User,
):
    """16. Verify PDF generation on 100+ findings without timeout, truncation, or memory issues."""
    now_utc = datetime.now(timezone.utc)
    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=organization.id,
        policy_document_id=sample_policy_doc.id,
        regulation_id=sample_regulation.id,
        overall_score=82.0,
        created_by=admin_user.id,
        is_deleted=False,
    )
    db_session.add(report)
    db_session.commit()

    severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    statuses = ["OPEN", "IN_REVIEW", "REMEDIATION", "RESOLVED", "REASSESSMENT_REQUIRED"]

    # Bulk insert 105 findings
    bulk_findings = []
    for i in range(105):
        f = ReportFinding(
            id=uuid.uuid4(),
            report_id=report.id,
            policy_clause_id=f"Clause-{i+1}.0",
            regulation_clause_id=f"RegSec-{(i%20)+1}",
            status="NON_COMPLIANT" if i % 4 != 0 else "COMPLIANT",
            lifecycle_status=statuses[i % len(statuses)],
            severity=severities[i % len(severities)],
            reasoning=f"Bulk test finding reasoning details for clause {i+1}.",
            recommendation=f"Remediation action recommendation for finding {i+1}.",
            created_at=now_utc - timedelta(days=(i % 45)),
        )
        bulk_findings.append(f)

    db_session.bulk_save_objects(bulk_findings)
    db_session.commit()

    client = get_authenticated_client(db_session, admin_user)

    # 1. Summary JSON check
    res = client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}&date_range=all")
    assert res.status_code == 200
    assert res.json()["executive_metrics"]["total_findings"] == 105

    # 2. PDF generation check
    pdf_res = client.get(f"/findings/reports/compliance/pdf?organization_id={organization.id}&date_range=all")
    assert pdf_res.status_code == 200
    assert pdf_res.content.startswith(b"%PDF-")
    assert len(pdf_res.content) > 10000


def test_duplicate_generation_protection(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_report: ComplianceReport,
    populate_sample_findings,
    admin_user: User,
):
    """17. Verify rapid repeated PDF generation requests succeed idempotently without side-effects."""
    client = get_authenticated_client(db_session, admin_user)

    responses = [
        client.get(f"/findings/reports/compliance/pdf?organization_id={organization.id}&date_range=30d")
        for _ in range(4)
    ]
    for r in responses:
        assert r.status_code == 200
        assert r.content.startswith(b"%PDF-")


def test_e2e_compliance_report_lifecycle_verification(
    db_session: Session,
    organization: Organization,
    setup_memberships,
    sample_report: ComplianceReport,
    populate_sample_findings,
    admin_user: User,
    analyst_user: User,
):
    """18. End-to-end report generation before and after finding mutation."""
    admin_client = get_authenticated_client(db_session, admin_user)
    analyst_client = get_authenticated_client(db_session, analyst_user)

    # Initial report: 1 critical, 1 resolved
    r1 = admin_client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}")
    assert r1.status_code == 200
    assert r1.json()["executive_metrics"]["critical_findings"] == 1

    # Mutate a finding: update severity of finding to CRITICAL
    target_f = populate_sample_findings[1]  # was HIGH
    analyst_client.patch(f"/findings/{target_f.id}", json={"severity": "CRITICAL"})

    # Regenerate report: critical count must now be 2
    r2 = admin_client.get(f"/findings/reports/compliance/summary?organization_id={organization.id}")
    assert r2.status_code == 200
    assert r2.json()["executive_metrics"]["critical_findings"] == 2

    # Download updated PDF
    pdf = admin_client.get(f"/findings/reports/compliance/pdf?organization_id={organization.id}")
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF-")
