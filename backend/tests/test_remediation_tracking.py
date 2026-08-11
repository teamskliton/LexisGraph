"""
Unit and integration test suite for Remediation Tracking & Due Dates (Sprint 6.10).
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
from app.routes.findings import router as findings_router
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
        email=f"user_rem1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_rem1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="User R1 (Admin)",
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
        email=f"user_remb1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_remb1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="External User B",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def org_a(db_session, user_a1):
    org = Organization(
        id=uuid.uuid4(),
        name="Remediation Org Alpha",
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
    db_session.add(m1)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def finding_a(db_session, org_a, user_a1):
    reg = Regulation(
        id=uuid.uuid4(),
        title="GDPR Article 32",
        document_hash="gdpr_hash_123",
        uploaded_by=user_a1.id,
        original_filename="gdpr.pdf",
        stored_filename="gdpr_stored.pdf",
        file_path="/tmp/gdpr.pdf",
        file_size=1024,
        mime_type="application/pdf",
    )
    pol = Document(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        uploaded_by=user_a1.id,
        document_type=DocumentType.POLICY,
        original_filename="sec_policy.pdf",
        stored_filename="sec_policy_stored.pdf",
        file_path="/tmp/sec_policy.pdf",
        file_size=2048,
        mime_type="application/pdf",
        checksum="sec_policy_hash",
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
        overall_score=75.0,
        risk_level="HIGH",
    )
    db_session.add(report)
    db_session.commit()

    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="SEC-POL-1",
        regulation_clause_id="GDPR-ART-32",
        status="NON_COMPLIANT",
        lifecycle_status="REMEDIATION",
        confidence=0.95,
        severity="HIGH",
        reasoning="Data encryption at rest is missing.",
        recommendation="Implement AES-256 encryption on S3 buckets.",
        citation="GDPR Article 32(1)(a)",
        assigned_to=user_a1.id,
    )
    db_session.add(finding)
    db_session.commit()
    db_session.refresh(finding)
    return finding


class TestRemediationTracking:
    def test_1_set_due_date(self, db_session, finding_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        future_due = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()
        resp = client.patch(f"/findings/{finding_a.id}/remediation", json={"due_date": future_due})
        assert resp.status_code == 200

        data = resp.json()
        assert data["remediation_due_date"] is not None
        assert data["is_overdue"] is False

    def test_2_change_due_date(self, db_session, finding_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        future_1 = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
        future_2 = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat()

        client.patch(f"/findings/{finding_a.id}/remediation", json={"due_date": future_1})
        resp2 = client.patch(f"/findings/{finding_a.id}/remediation", json={"due_date": future_2})

        assert resp2.status_code == 200
        assert resp2.json()["is_overdue"] is False

    def test_3_clear_due_date(self, db_session, finding_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        future_due = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
        client.patch(f"/findings/{finding_a.id}/remediation", json={"due_date": future_due})

        clear_resp = client.patch(f"/findings/{finding_a.id}/remediation", json={"due_date": None})
        assert clear_resp.status_code == 200
        assert clear_resp.json()["remediation_due_date"] is None
        assert clear_resp.json()["is_overdue"] is False

    def test_4_invalid_date_format(self, db_session, finding_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        bad_resp = client.patch(f"/findings/{finding_a.id}/remediation", json={"due_date": "Next Friday"})
        assert bad_resp.status_code == 422

    def test_5_unauthorized_organization(self, db_session, finding_a, user_b1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_b1

        client = TestClient(app)

        future_due = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
        bad_resp = client.patch(f"/findings/{finding_a.id}/remediation", json={"due_date": future_due})
        assert bad_resp.status_code == 403

    def test_6_finding_not_found(self, db_session, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        rand_id = uuid.uuid4()
        future_due = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
        resp = client.patch(f"/findings/{rand_id}/remediation", json={"due_date": future_due})
        assert resp.status_code == 404

    def test_7_resolved_finding_is_not_overdue(self, db_session, finding_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        # Set past due date
        past_due = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        client.patch(f"/findings/{finding_a.id}/remediation", json={"due_date": past_due})

        # Transition finding to RESOLVED
        res_resp = client.patch(f"/findings/{finding_a.id}/status", json={"lifecycle_status": "RESOLVED"})
        assert res_resp.status_code == 200

        data = res_resp.json()
        assert data["lifecycle_status"] == "RESOLVED"
        assert data["is_overdue"] is False

    def test_8_active_finding_with_past_due_date_is_overdue(self, db_session, finding_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        past_due = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        patch_resp = client.patch(f"/findings/{finding_a.id}/remediation", json={"due_date": past_due})
        assert patch_resp.status_code == 200

        data = patch_resp.json()
        assert data["lifecycle_status"] == "REMEDIATION"
        assert data["is_overdue"] is True

    def test_9_future_due_date_is_not_overdue(self, db_session, finding_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        future_due = (datetime.now(timezone.utc) + timedelta(days=15)).isoformat()
        patch_resp = client.patch(f"/findings/{finding_a.id}/remediation", json={"due_date": future_due})

        assert patch_resp.status_code == 200
        assert patch_resp.json()["is_overdue"] is False

    def test_10_persistence_after_reload(self, db_session, finding_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        due_time = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()
        client.patch(f"/findings/{finding_a.id}/remediation", json={"due_date": due_time})

        get_resp = client.get(f"/findings/{finding_a.id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["remediation_due_date"] is not None
