"""
Unit and integration test suite for Compliance Deadlines & Calendar View (Sprint 6.12).
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
def user_c1(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"user_cal1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_cal1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Calendar Lead User",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def user_c2(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"user_cal2_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_cal2_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Calendar Member User",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def user_other(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"user_other_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_other_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="External User",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def org_cal(db_session, user_c1, user_c2):
    org = Organization(
        id=uuid.uuid4(),
        name="Compliance Calendar Org",
        created_by=user_c1.id,
    )
    db_session.add(org)
    db_session.commit()

    m1 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_c1.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    m2 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_c2.id,
        role=UserRole.REVIEWER,
        status=MemberStatus.ACTIVE,
    )
    db_session.add_all([m1, m2])
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def calendar_findings_setup(db_session, org_cal, user_c1, user_c2):
    reg = Regulation(
        id=uuid.uuid4(),
        title="Wage Act 2026",
        document_hash="wage_hash_111",
        uploaded_by=user_c1.id,
        original_filename="wage_act.pdf",
        stored_filename="wage_act_stored.pdf",
        file_path="/tmp/wage_act.pdf",
        file_size=1024,
        mime_type="application/pdf",
    )
    pol = Document(
        id=uuid.uuid4(),
        organization_id=org_cal.id,
        uploaded_by=user_c1.id,
        document_type=DocumentType.POLICY,
        original_filename="wage_policy.pdf",
        stored_filename="wage_policy_stored.pdf",
        file_path="/tmp/wage_policy.pdf",
        file_size=2048,
        mime_type="application/pdf",
        checksum="wage_policy_hash",
    )
    db_session.add_all([reg, pol])
    db_session.commit()

    report = ComplianceReport(
        id=uuid.uuid4(),
        organization_id=org_cal.id,
        regulation_id=reg.id,
        policy_document_id=pol.id,
        created_by=user_c1.id,
        status=ComplianceReportStatus.COMPLETED,
        overall_score=80.0,
        risk_level="MEDIUM",
    )
    db_session.add(report)
    db_session.commit()

    now_utc = datetime.now(timezone.utc)

    # 1. Overdue finding assigned to user_c1
    f_overdue = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="POL-O1",
        status="NON_COMPLIANT",
        lifecycle_status="REMEDIATION",
        severity="CRITICAL",
        reasoning="Overdue critical remediation clause",
        remediation_due_date=now_utc - timedelta(days=5),
        assigned_to=user_c1.id,
    )

    # 2. Upcoming finding due this week assigned to user_c1
    f_this_week = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="POL-W1",
        status="NON_COMPLIANT",
        lifecycle_status="IN_REVIEW",
        severity="HIGH",
        reasoning="Upcoming review clause due this week",
        remediation_due_date=now_utc + timedelta(days=3),
        assigned_to=user_c1.id,
    )

    # 3. Upcoming finding due in 20 days assigned to user_c2
    f_next_30 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="POL-M1",
        status="PARTIALLY_COMPLIANT",
        lifecycle_status="OPEN",
        severity="MEDIUM",
        reasoning="Upcoming medium clause due next 30 days",
        remediation_due_date=now_utc + timedelta(days=20),
        assigned_to=user_c2.id,
    )

    # 4. Resolved finding (MUST BE EXCLUDED from active calendar)
    f_resolved = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="POL-R1",
        status="COMPLIANT",
        lifecycle_status="RESOLVED",
        severity="LOW",
        reasoning="Resolved finding clause",
        remediation_due_date=now_utc - timedelta(days=10),
        assigned_to=user_c1.id,
    )

    db_session.add_all([f_overdue, f_this_week, f_next_30, f_resolved])
    db_session.commit()
    db_session.refresh(report)
    return report


class TestComplianceCalendar:
    def test_1_get_calendar_organization_scoped(self, db_session, org_cal, calendar_findings_setup, user_c1):
        app = FastAPI()
        app.include_router(compliance_router, prefix="/compliance")
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_c1

        client = TestClient(app)
        resp = client.get(f"/compliance/calendar?organization_id={org_cal.id}")
        assert resp.status_code == 200

        data = resp.json()
        assert data["organization_id"] == str(org_cal.id)
        assert len(data["deadlines"]) == 3  # Resolved excluded

    def test_2_summary_metrics(self, db_session, org_cal, calendar_findings_setup, user_c1):
        app = FastAPI()
        app.include_router(compliance_router, prefix="/compliance")
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_c1

        client = TestClient(app)
        resp = client.get(f"/compliance/calendar?organization_id={org_cal.id}")
        assert resp.status_code == 200

        summary = resp.json()["summary"]
        assert summary["overdue_count"] == 1
        assert summary["this_week_count"] == 1
        assert summary["next_30_days_count"] == 2  # this_week + next_30

    def test_3_assigned_to_me_filter(self, db_session, org_cal, calendar_findings_setup, user_c1, user_c2):
        app = FastAPI()
        app.include_router(compliance_router, prefix="/compliance")
        app.dependency_overrides[get_db] = lambda: db_session

        # User C1 has 2 active findings (1 overdue, 1 this week)
        app.dependency_overrides[get_current_user] = lambda: user_c1
        client1 = TestClient(app)
        resp1 = client1.get(f"/compliance/calendar?organization_id={org_cal.id}&assigned_to_me=true")
        assert resp1.status_code == 200
        items1 = resp1.json()["deadlines"]
        assert len(items1) == 2

        # User C2 has 1 active finding (due in 20 days)
        app.dependency_overrides[get_current_user] = lambda: user_c2
        client2 = TestClient(app)
        resp2 = client2.get(f"/compliance/calendar?organization_id={org_cal.id}&assigned_to_me=true")
        assert resp2.status_code == 200
        items2 = resp2.json()["deadlines"]
        assert len(items2) == 1
        assert items2[0]["assigned_to"] == str(user_c2.id)

    def test_4_overdue_only_filter(self, db_session, org_cal, calendar_findings_setup, user_c1):
        app = FastAPI()
        app.include_router(compliance_router, prefix="/compliance")
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_c1

        client = TestClient(app)
        resp = client.get(f"/compliance/calendar?organization_id={org_cal.id}&overdue_only=true")
        assert resp.status_code == 200

        items = resp.json()["deadlines"]
        assert len(items) == 1
        assert items[0]["is_overdue"] is True
        assert items[0]["days_overdue"] >= 4

    def test_5_date_range_filter(self, db_session, org_cal, calendar_findings_setup, user_c1):
        app = FastAPI()
        app.include_router(compliance_router, prefix="/compliance")
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_c1

        client = TestClient(app)
        now_utc = datetime.now(timezone.utc)
        start_str = (now_utc + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        end_str = (now_utc + timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%SZ")

        resp = client.get(f"/compliance/calendar?organization_id={org_cal.id}&start_date={start_str}&end_date={end_str}")
        assert resp.status_code == 200

        items = resp.json()["deadlines"]
        assert len(items) == 1
        assert items[0]["policy_clause_id"] == "POL-W1"

    def test_6_unauthorized_organization_access(self, db_session, org_cal, calendar_findings_setup, user_other):
        app = FastAPI()
        app.include_router(compliance_router, prefix="/compliance")
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_other

        client = TestClient(app)
        resp = client.get(f"/compliance/calendar?organization_id={org_cal.id}")
        assert resp.status_code == 403

    def test_7_empty_organization_returns_empty_calendar(self, db_session, user_c1):
        empty_org = Organization(
            id=uuid.uuid4(),
            name="Empty Calendar Org",
            created_by=user_c1.id,
        )
        db_session.add(empty_org)
        db_session.commit()

        app = FastAPI()
        app.include_router(compliance_router, prefix="/compliance")
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_c1

        client = TestClient(app)
        resp = client.get(f"/compliance/calendar?organization_id={empty_org.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["deadlines"] == []
        assert data["summary"]["overdue_count"] == 0
