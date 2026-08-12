"""
Unit and integration test suite for Compliance Risk Prioritization & Workload Intelligence (Sprint 6.11).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.compliance.models import ComplianceReport, ComplianceReportStatus, ReportFinding
from app.db.models import Document, DocumentType, Organization, User, Regulation
from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus
from app.db.session import Base, get_db
from app.routes.compliance import router as compliance_router
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
def user_a1(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"user_p1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_p1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="User P1 (Leader)",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def user_a2(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"user_p2_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_p2_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="User P2 (Member)",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def user_b1(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"user_pb1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_pb1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="External User B",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def org_a(db_session, user_a1, user_a2):
    org = Organization(
        id=uuid.uuid4(),
        name="Risk Intelligence Org",
        created_by=user_a1.id,
    )
    db_session.add(org)
    db_session.commit()

    m1 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_a1.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    m2 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_a2.id,
        role=UserRole.REVIEWER,
        status=MemberStatus.ACTIVE,
    )
    db_session.add_all([m1, m2])
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def report_setup(db_session, org_a, user_a1, user_a2):
    reg = Regulation(
        id=uuid.uuid4(),
        title="POSH Act 2013",
        document_hash="posh_hash_999",
        uploaded_by=user_a1.id,
        original_filename="posh.pdf",
        stored_filename="posh_stored.pdf",
        file_path="/tmp/posh.pdf",
        file_size=1024,
        mime_type="application/pdf",
    )
    pol = Document(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        uploaded_by=user_a1.id,
        document_type=DocumentType.POLICY,
        original_filename="posh_policy.pdf",
        stored_filename="posh_policy_stored.pdf",
        file_path="/tmp/posh_policy.pdf",
        file_size=2048,
        mime_type="application/pdf",
        checksum="posh_policy_hash",
    )
    db_session.add_all([reg, pol])
    db_session.commit()

    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        regulation_id=reg.id,
        policy_document_id=pol.id,
        created_by=user_a1.id,
        status=ComplianceReportStatus.COMPLETED,
        overall_score=70.0,
        risk_level="MEDIUM",
    )
    db_session.add(report)
    db_session.commit()

    f1 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="POL-1",
        status="NON_COMPLIANT",
        lifecycle_status="OPEN",
        severity="CRITICAL",
        reasoning="Critical gap in ICC committee constitution",
        assigned_to=user_a1.id,
    )
    f2 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="POL-2",
        status="NON_COMPLIANT",
        lifecycle_status="REMEDIATION",
        severity="HIGH",
        reasoning="High gap in training requirements",
        remediation_due_date=datetime.now(timezone.utc) - timedelta(days=3),
        assigned_to=user_a2.id,
    )
    f3 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="POL-3",
        status="PARTIALLY_COMPLIANT",
        lifecycle_status="IN_REVIEW",
        severity="MEDIUM",
        reasoning="Unassigned medium gap",
        assigned_to=None,
    )
    db_session.add_all([f1, f2, f3])
    db_session.commit()
    db_session.refresh(report)
    return report


class TestRiskPrioritization:
    def test_1_overview_endpoint_returns_prioritization_data(self, db_session, org_a, report_setup, user_a1):
        app = FastAPI()
        app.include_router(compliance_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        resp = client.get(f"/compliance/overview?organization_id={org_a.id}")
        assert resp.status_code == 200

        data = resp.json()
        assert "priority_attention" in data
        assert "team_workload" in data
        assert "unassigned_findings" in data
        assert "overdue_findings" in data
        assert "report_exposure" in data

    def test_2_priority_queue_ordering(self, db_session, org_a, report_setup, user_a1):
        app = FastAPI()
        app.include_router(compliance_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        resp = client.get(f"/compliance/overview?organization_id={org_a.id}")
        assert resp.status_code == 200
        p_items = resp.json()["priority_attention"]
        assert len(p_items) >= 3

        # First priority item should be CRITICAL
        assert p_items[0]["severity"] == "CRITICAL"

    def test_3_unassigned_findings_count(self, db_session, org_a, report_setup, user_a1):
        app = FastAPI()
        app.include_router(compliance_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        resp = client.get(f"/compliance/overview?organization_id={org_a.id}")
        assert resp.status_code == 200
        summary = resp.json()["summary"]
        assert summary["unassigned_count"] == 1
        unassigned_items = resp.json()["unassigned_findings"]
        assert len(unassigned_items) == 1

    def test_4_team_workload_aggregation(self, db_session, org_a, report_setup, user_a1, user_a2):
        app = FastAPI()
        app.include_router(compliance_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        resp = client.get(f"/compliance/overview?organization_id={org_a.id}")
        assert resp.status_code == 200
        workload = resp.json()["team_workload"]
        assert len(workload) == 2

        user1_wl = next(w for w in workload if w["user_id"] == str(user_a1.id))
        user2_wl = next(w for w in workload if w["user_id"] == str(user_a2.id))

        assert user1_wl["open_count"] == 1
        assert user2_wl["remediation_count"] == 1

    def test_5_overdue_work_calculation(self, db_session, org_a, report_setup, user_a1):
        app = FastAPI()
        app.include_router(compliance_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        resp = client.get(f"/compliance/overview?organization_id={org_a.id}")
        assert resp.status_code == 200
        overdue_items = resp.json()["overdue_findings"]
        assert len(overdue_items) == 1
        assert overdue_items[0]["days_overdue"] >= 2

    def test_6_report_exposure_summary(self, db_session, org_a, report_setup, user_a1):
        app = FastAPI()
        app.include_router(compliance_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        resp = client.get(f"/compliance/overview?organization_id={org_a.id}")
        assert resp.status_code == 200
        exposure = resp.json()["report_exposure"]
        assert len(exposure) == 1
        assert exposure[0]["report_id"] == str(report_setup.id)
        assert exposure[0]["open_count"] == 3
        assert exposure[0]["high_critical_count"] == 2

    def test_7_organization_security_isolation(self, db_session, org_a, report_setup, user_b1):
        app = FastAPI()
        app.include_router(compliance_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_b1

        client = TestClient(app)

        bad_resp = client.get(f"/compliance/overview?organization_id={org_a.id}")
        assert bad_resp.status_code == 403
