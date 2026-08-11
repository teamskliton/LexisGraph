"""
Unit and integration test suite for Finding Comments & Review Collaboration (Sprint 6.8).
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
from app.compliance.models import ComplianceReport, ComplianceReportStatus, ReportFinding, FindingComment
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
        email=f"user_c1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_c1_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Shrimant Vishal Marathe",
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
        email=f"user_c2_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_c2_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Jeet Patil",
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
        email=f"user_cb1_{uuid.uuid4().hex[:6]}@example.com",
        username=f"user_cb1_{uuid.uuid4().hex[:6]}",
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
        name="LexisGraph Legal Org",
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
        document_hash="posh_hash_456",
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
        overall_score=80.0,
        risk_level="MEDIUM",
    )
    db_session.add(report)
    db_session.commit()

    finding = ReportFinding(
        id=uuid.uuid4(),
        report_id=report.id,
        policy_clause_id="POL-POSH-4",
        regulation_clause_id="REG-POSH-10",
        status="NON_COMPLIANT",
        lifecycle_status="OPEN",
        confidence=0.90,
        severity="HIGH",
        reasoning="Internal Complaints Committee composition is non-compliant",
        recommendation="Designate a female presiding officer",
        citation="Section 4 POSH Act, 2013",
    )
    db_session.add(finding)
    db_session.commit()
    db_session.refresh(report)
    return finding


class TestFindingComments:
    def test_1_get_empty_comments_list(self, db_session, report_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)
        response = client.get(f"/findings/{report_a.id}/comments")
        assert response.status_code == 200
        assert response.json() == []

    def test_2_post_valid_comment(self, db_session, report_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)
        response = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Please verify whether this clause applies to the current workforce."},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["content"] == "Please verify whether this clause applies to the current workforce."
        assert data["user_name"] == user_a1.full_name
        assert data["user_id"] == str(user_a1.id)

    def test_3_get_comments_chronological(self, db_session, report_a, user_a1, user_a2):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session

        client = TestClient(app)

        # Comment 1 by User A1
        app.dependency_overrides[get_current_user] = lambda: user_a1
        client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Please verify whether this clause applies to the current workforce."},
        )

        # Comment 2 by User A2
        app.dependency_overrides[get_current_user] = lambda: user_a2
        client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "I will verify this with HR."},
        )

        # GET comments
        response = client.get(f"/findings/{report_a.id}/comments")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 2
        assert comments[0]["user_name"] == user_a1.full_name
        assert comments[1]["user_name"] == user_a2.full_name

    def test_4_empty_comment_rejected(self, db_session, report_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)
        response = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": ""},
        )
        assert response.status_code in (400, 422)

    def test_5_whitespace_comment_rejected(self, db_session, report_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)
        response = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "     \n\t  "},
        )
        assert response.status_code == 400
        assert "cannot be empty or whitespace-only" in response.json()["detail"]

    def test_6_finding_not_found(self, db_session, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)
        rand_finding_id = str(uuid.uuid4())
        response = client.get(f"/findings/{rand_finding_id}/comments")
        assert response.status_code == 404

    def test_7_unauthorized_organization_member(self, db_session, report_a, user_b1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_b1

        client = TestClient(app)
        response = client.get(f"/findings/{report_a.id}/comments")
        assert response.status_code == 403

    def test_8_cross_organization_comment_rejected(self, db_session, report_a, user_b1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_b1

        client = TestClient(app)
        response = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Attempting cross-org comment"},
        )
        assert response.status_code == 403
        assert "You do not have access" in response.json()["detail"]

    def test_9_authentication_required(self, db_session, report_a):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session

        client = TestClient(app)
        response = client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Unauthenticated comment"},
        )
        assert response.status_code in (401, 403)

    def test_10_comment_persistence_after_reload(self, db_session, report_a, user_a1):
        app = FastAPI()
        app.include_router(findings_router)
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: user_a1

        client = TestClient(app)
        client.post(
            f"/findings/{report_a.id}/comments",
            json={"content": "Persistent comment test content."},
        )

        # Query direct from DB session
        comments = db_session.query(FindingComment).filter(FindingComment.finding_id == report_a.id).all()
        assert len(comments) == 1
        assert comments[0].content == "Persistent comment test content."
