"""
Unit and integration test suite for Compliance Operations Overview (Sprint 6.5).
"""
from __future__ import annotations

import unittest
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
        email=f"usera1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"usera1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="User A1 (Admin)",
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
        email=f"userb1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"userb1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="User B1 (Org B)",
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
        name="Organization Alpha Overview",
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
def org_b(db_session, user_b1):
    org = Organization(
        id=uuid.uuid4(),
        name="Organization Beta",
        created_by=user_b1.id,
    )
    db_session.add(org)
    db_session.commit()

    mb = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user_b1.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    db_session.add(mb)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def report_a(db_session, org_a, user_a1):
    reg = Regulation(
        id=uuid.uuid4(),
        title="POSH Act 2013",
        document_hash="posh_hash_123",
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
        overall_score=75.0,
        risk_level="MEDIUM",
    )
    db_session.add(report)
    db_session.commit()

    finding1 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="POL-POSH-1",
        regulation_clause_id="REG-POSH-4",
        status="NON_COMPLIANT",
        lifecycle_status="OPEN",
        confidence=0.92,
        severity="HIGH",
        reasoning="ICC presiding officer must be a senior female employee",
        recommendation="Amend POSH policy clause 4",
        citation="Section 4(2)(a) POSH Act, 2013",
        assigned_to=user_a1.id,
    )

    finding2 = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="POL-POSH-2",
        regulation_clause_id="REG-POSH-11",
        status="PARTIALLY_COMPLIANT",
        lifecycle_status="REMEDIATION",
        confidence=0.85,
        severity="MEDIUM",
        reasoning="Annual report submission timeline omitted",
        recommendation="Include mandatory calendar year timeline",
        citation="Section 21 POSH Act, 2013",
    )

    db_session.add_all([finding1, finding2])
    db_session.commit()
    db_session.refresh(report)
    return report


class TestComplianceOverviewAPI:
    def test_get_compliance_overview_success(self, db_session, org_a, report_a, user_a1):
        app = FastAPI()
        app.include_router(compliance_router)

        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        response = client.get(f"/compliance/overview?organization_id={org_a.id}")
        assert response.status_code == 200
        data = response.json()

        assert data["organization_id"] == str(org_a.id)
        assert data["organization_name"] == org_a.name

        summary = data["summary"]
        assert summary["total_findings"] == 2
        assert summary["open_findings"] == 1
        assert summary["remediation"] == 1
        assert summary["high_count"] == 1
        assert summary["compliance_score"] == 75.0
        assert summary["compliance_status"] == "MEDIUM_RISK"

        # Attention required
        assert len(data["attention_required"]) >= 1
        assert data["attention_required"][0]["severity"] == "HIGH"

        # My Work (assigned to User A1)
        assert len(data["my_work"]) == 1
        assert data["my_work"][0]["assigned_to"] == str(user_a1.id)

        # Recent Reports
        assert len(data["recent_reports"]) == 1
        assert data["recent_reports"][0]["id"] == str(report_a.id)

    def test_multi_tenant_authorization_isolation(self, db_session, org_a, user_b1):
        app = FastAPI()
        app.include_router(compliance_router)

        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_b1

        client = TestClient(app)

        # User B1 attempts to view Org A overview -> 403 Forbidden
        response = client.get(f"/compliance/overview?organization_id={org_a.id}")
        assert response.status_code == 403
        assert "You do not have access" in response.json()["detail"]
