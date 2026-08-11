"""
Unit and integration test suite for My Work & Finding Assignment (Sprint 6.6).
"""
from __future__ import annotations

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
from app.routes.findings import router as findings_router
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
        email=f"user_a1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_a1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="User A1 (Admin)",
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
        email=f"user_a2_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_a2_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="User A2 (Member)",
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
        email=f"user_b1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_b1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="User B1 (Org B)",
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
        name="Organization Alpha",
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


class TestFindingAssignmentAndMyWork:
    def test_1_get_my_assigned_findings(self, db_session, org_a, report_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        response = client.get(f"/findings/my-work?organization_id={org_a.id}")
        assert response.status_code == 200
        data = response.json()

        assert len(data) == 1
        assert data[0]["assigned_to"] == str(user_a1.id)
        assert data[0]["assignee"]["full_name"] == user_a1.full_name

    def test_2_user_with_zero_assignments(self, db_session, org_a, report_a, user_a2):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a2

        client = TestClient(app)

        response = client.get(f"/findings/my-work?organization_id={org_a.id}")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 0

    def test_3_assign_finding_to_organization_member(self, db_session, org_a, report_a, user_a1, user_a2):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        finding = db_session.query(ReportFinding).filter(ReportFinding.report_id == report_a.id, ReportFinding.assigned_to.is_(None)).first()

        response = client.post(
            f"/findings/{finding.id}/assign",
            json={"assignee_id": str(user_a2.id)},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["assigned_to"] == str(user_a2.id)
        assert data["assignee"]["full_name"] == user_a2.full_name

    def test_4_change_assignee(self, db_session, org_a, report_a, user_a1, user_a2):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        finding = db_session.query(ReportFinding).filter(ReportFinding.report_id == report_a.id, ReportFinding.assigned_to == user_a1.id).first()

        # Change from User A1 to User A2
        response = client.post(
            f"/findings/{finding.id}/assign",
            json={"assignee_id": str(user_a2.id)},
        )
        assert response.status_code == 200
        assert response.json()["assigned_to"] == str(user_a2.id)

    def test_5_unassign_finding(self, db_session, org_a, report_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        finding = db_session.query(ReportFinding).filter(ReportFinding.report_id == report_a.id, ReportFinding.assigned_to == user_a1.id).first()

        response = client.post(
            f"/findings/{finding.id}/assign",
            json={"assignee_id": None},
        )
        assert response.status_code == 200
        assert response.json()["assigned_to"] is None
        assert response.json()["assignee"] is None

    def test_6_unauthorized_finding_access(self, db_session, org_a, report_a, user_b1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_b1

        client = TestClient(app)

        # User B1 attempts to view Org A finding -> 403 Forbidden
        finding = db_session.query(ReportFinding).filter(ReportFinding.report_id == report_a.id).first()
        response = client.get(f"/findings/{finding.id}")
        assert response.status_code == 403

    def test_7_cross_organization_assignee(self, db_session, org_a, report_a, user_a1, user_b1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        finding = db_session.query(ReportFinding).filter(ReportFinding.report_id == report_a.id).first()

        # User A1 attempts to assign Finding from Org A to User B1 (from Org B) -> 400 Bad Request
        response = client.post(
            f"/findings/{finding.id}/assign",
            json={"assignee_id": str(user_b1.id)},
        )
        assert response.status_code == 400
        assert "Assignee is not an active member" in response.json()["detail"]

    def test_8_invalid_user_id(self, db_session, org_a, report_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        finding = db_session.query(ReportFinding).filter(ReportFinding.report_id == report_a.id).first()
        rand_user_id = str(uuid.uuid4())

        response = client.post(
            f"/findings/{finding.id}/assign",
            json={"assignee_id": rand_user_id},
        )
        assert response.status_code == 400

    def test_9_invalid_finding_id(self, db_session, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)

        rand_finding_id = str(uuid.uuid4())
        response = client.get(f"/findings/{rand_finding_id}")
        assert response.status_code == 404
