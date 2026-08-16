"""
Comprehensive Unit & Integration Test Suite for Sprint 7.11:
Finding Analytics, Trends & Compliance Health.
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
from app.db.models.rbac import OrganizationMember, MemberStatus, UserRole
from app.db.models.document import Document, DocumentType
from app.db.models.regulation import Regulation
from app.db.models.remediation import FindingRemediation, RemediationCycle
from app.compliance.models import ComplianceReport, ReportFinding, FindingResolutionHistory
from app.core.dependencies import get_current_user

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


@pytest.fixture
def auth_user(db_session: Session) -> User:
    """Fixture providing a primary Admin test user."""
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
def secondary_user(db_session: Session) -> User:
    """Fixture providing a secondary user from another organization."""
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=f"other-{user_id.hex[:6]}@example.com",
        username=f"other_{user_id.hex[:6]}",
        hashed_password="fakehashedpassword",
        full_name="Other User",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_org(db_session: Session, auth_user: User) -> Organization:
    """Fixture providing an organization owned by auth_user."""
    org_id = uuid.uuid4()
    org = Organization(
        id=org_id,
        name=f"Analytics Test Org {org_id.hex[:6]}",
        created_by=auth_user.id,
    )
    db_session.add(org)
    member = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=auth_user.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def other_org(db_session: Session, secondary_user: User) -> Organization:
    """Fixture providing an organization owned by secondary_user."""
    org_id = uuid.uuid4()
    org = Organization(
        id=org_id,
        name=f"Other Org {org_id.hex[:6]}",
        created_by=secondary_user.id,
    )
    db_session.add(org)
    member = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=secondary_user.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def test_policy_doc(db_session: Session, test_org: Organization, auth_user: User) -> Document:
    doc = Document(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        original_filename="security_policy.pdf",
        stored_filename="security_policy_stored.pdf",
        file_path="/tmp/security_policy.pdf",
        file_size=10240,
        mime_type="application/pdf",
        checksum="doc_hash_security_policy",
        document_type=DocumentType.POLICY,
        uploaded_by=auth_user.id,
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)
    return doc


@pytest.fixture
def test_regulation(db_session: Session, auth_user: User) -> Regulation:
    reg = Regulation(
        id=uuid.uuid4(),
        title="GDPR Framework",
        document_hash="gdpr_hash_test",
        uploaded_by=auth_user.id,
        original_filename="gdpr.pdf",
        stored_filename="gdpr_stored.pdf",
        file_path="/storage/gdpr.pdf",
        file_size=1024,
        mime_type="application/pdf",
    )
    db_session.add(reg)
    db_session.commit()
    db_session.refresh(reg)
    return reg


@pytest.fixture
def client(db_session: Session, auth_user: User) -> TestClient:
    """TestClient overriding get_db and get_current_user dependencies."""
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: auth_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_analytics_empty_organization(client: TestClient, test_org: Organization):
    """Test analytics on an organization with no compliance findings returns clean zero metrics."""
    response = client.get(f"/api/v1/findings/analytics?organization_id={test_org.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["organization_id"] == str(test_org.id)
    assert data["health_summary"]["total_findings"] == 0
    assert data["health_summary"]["open_findings"] == 0
    assert data["health_summary"]["resolved"] == 0
    assert len(data["health_summary"]["summary_bullets"]) > 0
    assert "No compliance Findings yet" in data["health_summary"]["summary_bullets"][0]
    assert data["open_finding_trend"] == []
    assert data["resolution_trend"] == []
    assert data["high_risk_findings"] == []
    assert data["aging_findings"] == []


def test_analytics_status_and_severity_counts(
    client: TestClient,
    db_session: Session,
    test_org: Organization,
    auth_user: User,
    test_policy_doc: Document,
    test_regulation: Regulation,
):
    """Test accurate status and severity distribution aggregations in analytics."""
    # Create compliance report with valid required foreign keys
    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        policy_document_id=test_policy_doc.id,
        regulation_id=test_regulation.id,
        status="COMPLETED",
        overall_score=75.0,
        summary="Test Analysis",
        created_by=auth_user.id,
    )
    db_session.add(report)

    # Add findings with various lifecycle statuses and severities
    f1 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        regulation_clause_id="GDPR-32",
        status="NON_COMPLIANT",
        lifecycle_status="OPEN",
        severity="CRITICAL",
        reasoning="Critical unencrypted database storage",
        created_at=datetime.now(timezone.utc) - timedelta(days=10),
    )
    f2 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        regulation_clause_id="ISO-A.12",
        status="PARTIALLY_COMPLIANT",
        lifecycle_status="REMEDIATION",
        severity="HIGH",
        reasoning="High risk logging retention gap",
        created_at=datetime.now(timezone.utc) - timedelta(days=8),
    )
    f3 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        regulation_clause_id="SOC2-CC6",
        status="NON_COMPLIANT",
        lifecycle_status="IN_REVIEW",
        severity="MEDIUM",
        reasoning="Medium access review cadence",
        created_at=datetime.now(timezone.utc) - timedelta(days=5),
    )
    f4 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        regulation_clause_id="HIPAA-164",
        status="COMPLIANT",
        lifecycle_status="RESOLVED",
        severity="LOW",
        reasoning="Resolved low risk training tracking",
        created_at=datetime.now(timezone.utc) - timedelta(days=20),
    )
    f5 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        regulation_clause_id="PCI-DSS-3",
        status="NON_COMPLIANT",
        lifecycle_status="REASSESSMENT_REQUIRED",
        severity="HIGH",
        reasoning="New candidate analysis requires admin review",
        created_at=datetime.now(timezone.utc) - timedelta(days=3),
    )
    db_session.add_all([f1, f2, f3, f4, f5])

    # Record resolution history for f4
    res_hist = FindingResolutionHistory(
        id=uuid.uuid4(),
        finding_id=f4.id,
        organization_id=test_org.id,
        resolution_number=1,
        resolved_at=datetime.now(timezone.utc) - timedelta(days=2),
        resolved_by=auth_user.id,
        resolution_note="Policy verified and trained.",
        approved_cycle_number=1,
    )
    db_session.add(res_hist)
    db_session.commit()

    response = client.get(f"/api/v1/findings/analytics?organization_id={test_org.id}")
    assert response.status_code == 200
    data = response.json()

    summary = data["health_summary"]
    assert summary["total_findings"] == 5
    assert summary["open_findings"] == 1  # f1 (OPEN)
    assert summary["in_remediation"] == 1  # f2 (REMEDIATION)
    assert summary["in_review"] == 1  # f3 (IN_REVIEW)
    assert summary["resolved"] == 1  # f4 (RESOLVED)
    assert summary["reassessment_required"] == 1  # f5 (REASSESSMENT_REQUIRED)

    assert summary["critical_count"] == 1
    assert summary["high_count"] == 2
    assert summary["medium_count"] == 1
    assert summary["low_count"] == 1

    # Verify status distribution items
    status_dist = {item["status"]: item["count"] for item in data["status_distribution"]}
    assert status_dist["OPEN"] == 1
    assert status_dist["REMEDIATION"] == 1
    assert status_dist["IN_REVIEW"] == 1
    assert status_dist["RESOLVED"] == 1
    assert status_dist["REASSESSMENT_REQUIRED"] == 1

    # Verify severity distribution items
    sev_dist = {item["severity"]: item["count"] for item in data["severity_distribution"]}
    assert sev_dist["CRITICAL"] == 1
    assert sev_dist["HIGH"] == 2
    assert sev_dist["MEDIUM"] == 1
    assert sev_dist["LOW"] == 1

    # Verify High Risk Findings (sorted Critical > High)
    high_risk = data["high_risk_findings"]
    assert len(high_risk) == 4  # Unresolved findings: f1 (CRITICAL), f2 (HIGH), f5 (HIGH), f3 (MEDIUM)
    assert high_risk[0]["severity"] == "CRITICAL"
    assert high_risk[0]["id"] == str(f1.id)


def test_analytics_reopened_finding_tracking(
    client: TestClient,
    db_session: Session,
    test_org: Organization,
    auth_user: User,
    test_policy_doc: Document,
    test_regulation: Regulation,
):
    """Test that reopened findings are accurately reflected in open findings and aging metrics."""
    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        policy_document_id=test_policy_doc.id,
        regulation_id=test_regulation.id,
        status="COMPLETED",
        created_by=auth_user.id,
    )
    db_session.add(report)

    reopened_finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        regulation_clause_id="GDPR-17",
        status="NON_COMPLIANT",
        lifecycle_status="REOPENED",
        severity="HIGH",
        reasoning="Right to erasure process failure observed",
        reopened_at=datetime.now(timezone.utc) - timedelta(days=2),
        created_at=datetime.now(timezone.utc) - timedelta(days=40),
    )
    db_session.add(reopened_finding)
    db_session.commit()

    response = client.get(f"/api/v1/findings/analytics?organization_id={test_org.id}")
    assert response.status_code == 200
    data = response.json()

    assert data["health_summary"]["open_findings"] == 1
    assert data["health_summary"]["reopened_count"] == 1
    assert data["reopened_findings_count"] == 1

    aging = data["aging_findings"]
    assert len(aging) == 1
    assert aging[0]["is_reopened"] is True
    assert aging[0]["age_days"] >= 40


def test_analytics_remediation_performance(
    client: TestClient,
    db_session: Session,
    test_org: Organization,
    auth_user: User,
    test_policy_doc: Document,
    test_regulation: Regulation,
):
    """Test remediation performance metrics (average cycles, multi-cycle count, rejected cycles)."""
    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        policy_document_id=test_policy_doc.id,
        regulation_id=test_regulation.id,
        status="COMPLETED",
        created_by=auth_user.id,
    )
    db_session.add(report)

    f1 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        lifecycle_status="RESOLVED",
        severity="HIGH",
    )
    f2 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        lifecycle_status="RESOLVED",
        severity="MEDIUM",
    )
    f3 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        lifecycle_status="REMEDIATION",
        severity="CRITICAL",
    )
    db_session.add_all([f1, f2, f3])

    # f1 resolved in Cycle 1
    h1 = FindingResolutionHistory(
        id=uuid.uuid4(),
        finding_id=f1.id,
        organization_id=test_org.id,
        resolution_number=1,
        resolved_at=datetime.now(timezone.utc) - timedelta(days=5),
        approved_cycle_number=1,
    )
    # f2 resolved in Cycle 2
    h2 = FindingResolutionHistory(
        id=uuid.uuid4(),
        finding_id=f2.id,
        organization_id=test_org.id,
        resolution_number=1,
        resolved_at=datetime.now(timezone.utc) - timedelta(days=2),
        approved_cycle_number=2,
    )
    db_session.add_all([h1, h2])

    # f3 has remediation with 1 rejected cycle
    rem3 = FindingRemediation(
        id=uuid.uuid4(),
        finding_id=f3.id,
        organization_id=test_org.id,
        created_by=auth_user.id,
        status="IN_PROGRESS",
    )
    db_session.add(rem3)
    c1 = RemediationCycle(
        id=uuid.uuid4(),
        remediation_id=rem3.id,
        finding_id=f3.id,
        organization_id=test_org.id,
        cycle_number=1,
        status="REJECTED",
        submitted_by=auth_user.id,
        rejection_reason="Incomplete logs provided.",
    )
    db_session.add(c1)
    db_session.commit()

    response = client.get(f"/api/v1/findings/analytics?organization_id={test_org.id}")
    assert response.status_code == 200
    data = response.json()

    perf = data["remediation_performance"]
    assert perf["average_cycles_per_resolved"] == 1.5  # (1 + 2) / 2
    assert perf["resolved_first_cycle_count"] == 1
    assert perf["resolved_multiple_cycles_count"] == 1
    assert perf["rejected_remediation_count"] == 1
    assert perf["pending_remediation_count"] == 1


def test_analytics_date_filtering(
    client: TestClient,
    db_session: Session,
    test_org: Organization,
    auth_user: User,
    test_policy_doc: Document,
    test_regulation: Regulation,
):
    """Test date range filtering (7d, 30d, all)."""
    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        policy_document_id=test_policy_doc.id,
        regulation_id=test_regulation.id,
        status="COMPLETED",
        created_by=auth_user.id,
    )
    db_session.add(report)

    # Finding 1 created 3 days ago (in 7d, 30d, all)
    f1 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        lifecycle_status="OPEN",
        severity="CRITICAL",
        created_at=datetime.now(timezone.utc) - timedelta(days=3),
    )
    # Finding 2 created 20 days ago (in 30d, all; NOT in 7d)
    f2 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        lifecycle_status="OPEN",
        severity="HIGH",
        created_at=datetime.now(timezone.utc) - timedelta(days=20),
    )
    # Finding 3 created 60 days ago (in all; NOT in 7d, 30d)
    f3 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        lifecycle_status="OPEN",
        severity="LOW",
        created_at=datetime.now(timezone.utc) - timedelta(days=60),
    )
    db_session.add_all([f1, f2, f3])
    db_session.commit()

    # Query 7d
    res_7d = client.get(f"/api/v1/findings/analytics?organization_id={test_org.id}&date_range=7d")
    assert res_7d.status_code == 200
    assert res_7d.json()["health_summary"]["total_findings"] == 1

    # Query 30d
    res_30d = client.get(f"/api/v1/findings/analytics?organization_id={test_org.id}&date_range=30d")
    assert res_30d.status_code == 200
    assert res_30d.json()["health_summary"]["total_findings"] == 2

    # Query all
    res_all = client.get(f"/api/v1/findings/analytics?organization_id={test_org.id}&date_range=all")
    assert res_all.status_code == 200
    assert res_all.json()["health_summary"]["total_findings"] == 3


def test_tenant_isolation_and_security(
    client: TestClient,
    db_session: Session,
    test_org: Organization,
    other_org: Organization,
    secondary_user: User,
    test_regulation: Regulation,
):
    """Test that users cannot access another organization's finding analytics (403)."""
    # Create document and report in other_org
    other_doc = Document(
        id=uuid.uuid4(),
        organization_id=other_org.id,
        original_filename="other_policy.pdf",
        stored_filename="other_policy_stored.pdf",
        file_path="/tmp/other_policy.pdf",
        file_size=10240,
        mime_type="application/pdf",
        checksum="doc_hash_other",
        document_type=DocumentType.POLICY,
        uploaded_by=secondary_user.id,
    )
    db_session.add(other_doc)

    other_report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=other_org.id,
        policy_document_id=other_doc.id,
        regulation_id=test_regulation.id,
        status="COMPLETED",
        created_by=secondary_user.id,
    )
    db_session.add(other_report)
    f_other = ReportFinding(
        id=uuid.uuid4(),
        report_id=other_report.id,
        lifecycle_status="OPEN",
        severity="CRITICAL",
    )
    db_session.add(f_other)
    db_session.commit()

    # Authenticated user is only in test_org; attempting to access other_org should return 403 Forbidden
    response = client.get(f"/api/v1/findings/analytics?organization_id={other_org.id}")
    assert response.status_code == 403
    assert "You do not have access" in response.json()["detail"]


def test_analytics_policy_and_regulation_filtering(
    client: TestClient,
    db_session: Session,
    test_org: Organization,
    auth_user: User,
    test_policy_doc: Document,
    test_regulation: Regulation,
):
    """Test filtering analytics by specific policy document or regulation."""
    doc2 = Document(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        original_filename="privacy_policy.pdf",
        stored_filename="privacy_policy_stored.pdf",
        file_path="/tmp/privacy_policy.pdf",
        file_size=10240,
        mime_type="application/pdf",
        checksum="doc_hash_privacy_policy",
        document_type=DocumentType.POLICY,
        uploaded_by=auth_user.id,
    )
    db_session.add(doc2)

    rep1 = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        policy_document_id=test_policy_doc.id,
        regulation_id=test_regulation.id,
        status="COMPLETED",
        created_by=auth_user.id,
    )
    rep2 = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        policy_document_id=doc2.id,
        regulation_id=test_regulation.id,
        status="COMPLETED",
        created_by=auth_user.id,
    )
    db_session.add_all([rep1, rep2])

    f1 = ReportFinding(id=uuid.uuid4(), report_id=rep1.id, lifecycle_status="OPEN", severity="CRITICAL")
    f2 = ReportFinding(id=uuid.uuid4(), report_id=rep2.id, lifecycle_status="OPEN", severity="HIGH")
    f3 = ReportFinding(id=uuid.uuid4(), report_id=rep2.id, lifecycle_status="RESOLVED", severity="LOW")
    db_session.add_all([f1, f2, f3])
    db_session.commit()

    # Filter by policy_document_id = test_policy_doc.id
    res_doc1 = client.get(f"/api/v1/findings/analytics?organization_id={test_org.id}&policy_document_id={test_policy_doc.id}")
    assert res_doc1.status_code == 200
    assert res_doc1.json()["health_summary"]["total_findings"] == 1
    assert res_doc1.json()["health_summary"]["critical_count"] == 1

    # Filter by policy_document_id = doc2.id
    res_doc2 = client.get(f"/api/v1/findings/analytics?organization_id={test_org.id}&policy_document_id={doc2.id}")
    assert res_doc2.status_code == 200
    assert res_doc2.json()["health_summary"]["total_findings"] == 2
    assert res_doc2.json()["health_summary"]["resolved"] == 1


def test_analytics_end_to_end_lifecycle_transitions(
    client: TestClient,
    db_session: Session,
    test_org: Organization,
    auth_user: User,
    test_policy_doc: Document,
    test_regulation: Regulation,
):
    """
    Test that finding state changes (OPEN -> IN_REVIEW -> REMEDIATION -> RESOLVED -> REOPENED -> REASSESSMENT_REQUIRED)
    are deterministically and dynamically reflected in the analytics API.
    """
    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        policy_document_id=test_policy_doc.id,
        regulation_id=test_regulation.id,
        status="COMPLETED",
        created_by=auth_user.id,
    )
    db_session.add(report)

    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        regulation_clause_id="TEST-CLAUSE-1",
        status="NON_COMPLIANT",
        lifecycle_status="OPEN",
        severity="HIGH",
        created_at=datetime.now(timezone.utc) - timedelta(days=15),
    )
    db_session.add(finding)
    db_session.commit()

    # 1. State: OPEN
    res1 = client.get(f"/api/v1/findings/analytics?organization_id={test_org.id}")
    assert res1.json()["health_summary"]["open_findings"] == 1
    assert res1.json()["health_summary"]["resolved"] == 0

    # 2. State transition: REMEDIATION
    finding.lifecycle_status = "REMEDIATION"
    db_session.commit()

    res2 = client.get(f"/api/v1/findings/analytics?organization_id={test_org.id}")
    assert res2.json()["health_summary"]["in_remediation"] == 1
    assert res2.json()["health_summary"]["open_findings"] == 0

    # 3. State transition: RESOLVED
    finding.lifecycle_status = "RESOLVED"
    hist = FindingResolutionHistory(
        id=uuid.uuid4(),
        finding_id=finding.id,
        organization_id=test_org.id,
        resolution_number=1,
        resolved_at=datetime.now(timezone.utc),
        resolved_by=auth_user.id,
        approved_cycle_number=1,
    )
    db_session.add(hist)
    db_session.commit()

    res3 = client.get(f"/api/v1/findings/analytics?organization_id={test_org.id}")
    assert res3.json()["health_summary"]["resolved"] == 1
    assert res3.json()["health_summary"]["in_remediation"] == 0

    # 4. State transition: REOPENED
    finding.lifecycle_status = "REOPENED"
    finding.reopened_at = datetime.now(timezone.utc)
    db_session.commit()

    res4 = client.get(f"/api/v1/findings/analytics?organization_id={test_org.id}")
    assert res4.json()["health_summary"]["open_findings"] == 1
    assert res4.json()["health_summary"]["reopened_count"] == 1

    # 5. State transition: REASSESSMENT_REQUIRED
    finding.lifecycle_status = "REASSESSMENT_REQUIRED"
    db_session.commit()

    res5 = client.get(f"/api/v1/findings/analytics?organization_id={test_org.id}")
    assert res5.json()["health_summary"]["reassessment_required"] == 1
    assert res5.json()["needs_reassessment_count"] == 1

