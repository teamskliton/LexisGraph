"""
Unit and integration test suite for Compliance Report persistent history and comparison engine.
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
from app.db.session import Base, get_db
from app.routes.reports import router as reports_router
from app.services.report_service import ReportService

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
def test_user(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"reporthistory_{uuid.uuid4().hex[:6]}@example.com",
        username=f"reporthistory_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Report History User",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def test_org(db_session, test_user):
    org = Organization(
        id=uuid.uuid4(),
        name="Report History Test Org",
        created_by=test_user.id,
    )
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture(scope="function")
def test_reg(db_session, test_user):
    reg = Regulation(
        id=uuid.uuid4(),
        title="Code of Wages 2019",
        document_hash="reporthash_reg_123",
        uploaded_by=test_user.id,
        original_filename="code_wages_2019.pdf",
        stored_filename="code_wages_stored.pdf",
        file_path="/tmp/code_wages.pdf",
        file_size=1024,
        mime_type="application/pdf",
    )
    db_session.add(reg)
    db_session.commit()
    db_session.refresh(reg)
    return reg


@pytest.fixture(scope="function")
def test_policy(db_session, test_org, test_user):
    pol = Document(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        uploaded_by=test_user.id,
        document_type=DocumentType.POLICY,
        original_filename="company_policy_v1.pdf",
        stored_filename="company_policy_stored.pdf",
        file_path="/tmp/company_policy.pdf",
        file_size=2048,
        mime_type="application/pdf",
        checksum="policy_hash_checksum_123",
    )
    db_session.add(pol)
    db_session.commit()
    db_session.refresh(pol)
    return pol


class TestReportHistoryAndComparison:
    """Test suite for Report Persistence, Findings, and Comparison."""

    def test_report_findings_persistence(self, db_session, test_org, test_reg, test_policy, test_user):
        report = ComplianceReport(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            regulation_id=test_reg.id,
            policy_document_id=test_policy.id,
            created_by=test_user.id,
            status=ComplianceReportStatus.COMPLETED,
            overall_score=75.0,
            risk_level="MEDIUM",
            summary="Test audit report with findings",
            version=1,
        )
        db_session.add(report)
        db_session.commit()

        finding1 = ReportFinding(
            id=uuid.uuid4(),
            report_id=report.id,
            policy_clause_id="POL-001",
            regulation_clause_id="REG-010",
            status="NON_COMPLIANT",
            confidence=0.92,
            severity="HIGH",
            reasoning="Overtime compensation rate is below legal minimum",
            recommendation="Increase overtime pay rate to 200%",
            citation="Section 14(1) Code of Wages",
        )

        finding2 = ReportFinding(
            id=uuid.uuid4(),
            report_id=report.id,
            policy_clause_id="POL-002",
            regulation_clause_id="REG-015",
            status="COMPLIANT",
            confidence=0.98,
            severity="LOW",
            reasoning="Wage calculation period aligns with statutory limit",
            citation="Section 16 Code of Wages",
        )

        db_session.add_all([finding1, finding2])
        db_session.commit()

        # Query report findings from DB
        findings = db_session.query(ReportFinding).filter_by(report_id=report.id).all()
        assert len(findings) == 2
        non_comp = next(f for f in findings if f.status == "NON_COMPLIANT")
        assert non_comp.policy_clause_id == "POL-001"
        assert non_comp.severity == "HIGH"

    def test_report_comparison_logic(self, db_session, test_org, test_reg, test_policy, test_user):
        service = ReportService()

        # Report Version 1 (Score: 60%)
        r1 = ComplianceReport(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            regulation_id=test_reg.id,
            policy_document_id=test_policy.id,
            created_by=test_user.id,
            status=ComplianceReportStatus.COMPLETED,
            overall_score=60.0,
            risk_level="HIGH",
            version=1,
        )
        db_session.add(r1)
        db_session.commit()

        f1_1 = ReportFinding(
            id=uuid.uuid4(),
            report_id=r1.id,
            policy_clause_id="POL-001",
            status="NON_COMPLIANT",
            severity="HIGH",
            reasoning="Non-compliant overtime rate",
        )
        f1_2 = ReportFinding(
            id=uuid.uuid4(),
            report_id=r1.id,
            policy_clause_id="POL-002",
            status="COMPLIANT",
            severity="LOW",
        )
        db_session.add_all([f1_1, f1_2])
        db_session.commit()

        # Report Version 2 (Score: 85%) - POL-001 resolved to COMPLIANT!
        r2 = ComplianceReport(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            regulation_id=test_reg.id,
            policy_document_id=test_policy.id,
            created_by=test_user.id,
            status=ComplianceReportStatus.COMPLETED,
            overall_score=85.0,
            risk_level="LOW",
            version=2,
        )
        db_session.add(r2)
        db_session.commit()

        f2_1 = ReportFinding(
            id=uuid.uuid4(),
            report_id=r2.id,
            policy_clause_id="POL-001",
            status="COMPLIANT",
            severity="LOW",
            reasoning="Updated policy now complies with statutory overtime",
        )
        f2_2 = ReportFinding(
            id=uuid.uuid4(),
            report_id=r2.id,
            policy_clause_id="POL-002",
            status="COMPLIANT",
            severity="LOW",
        )
        db_session.add_all([f2_1, f2_2])
        db_session.commit()

        # Execute Comparison
        comp = service.compare_reports(db_session, r1.id, r2.id)

        assert comp["score_diff"] == 25.0
        assert len(comp["resolved_findings"]) == 1
        assert comp["resolved_findings"][0]["clause_id"] == "POL-001"
        assert comp["resolved_findings"][0]["previous_status"] == "NON_COMPLIANT"
        assert comp["resolved_findings"][0]["current_status"] == "COMPLIANT"
        assert len(comp["regression_findings"]) == 0

    def test_reports_api_compare_and_findings(self, db_session, test_org, test_reg, test_policy, test_user):
        app = FastAPI()
        app.include_router(reports_router)

        def _get_db_override():
            yield db_session

        def _get_user_override():
            return test_user

        from app.db.session import get_db
        from app.core.dependencies import get_current_user
        app.dependency_overrides[get_db] = _get_db_override
        app.dependency_overrides[get_current_user] = _get_user_override

        report = ComplianceReport(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            regulation_id=test_reg.id,
            policy_document_id=test_policy.id,
            created_by=test_user.id,
            status=ComplianceReportStatus.COMPLETED,
            overall_score=90.0,
            risk_level="LOW",
        )
        db_session.add(report)
        db_session.commit()

        finding = ReportFinding(
            id=uuid.uuid4(),
            report_id=report.id,
            policy_clause_id="POL-100",
            status="COMPLIANT",
            confidence=0.95,
            severity="LOW",
            reasoning="Full compliance verified",
        )
        db_session.add(finding)
        db_session.commit()

        client = TestClient(app)

        # GET /reports/{id}/findings
        findings_resp = client.get(f"/reports/{report.id}/findings")
        assert findings_resp.status_code == 200
        items = findings_resp.json()
        assert len(items) == 1
        assert items[0]["policy_clause_id"] == "POL-100"

        # GET /reports/{id}
        rep_resp = client.get(f"/reports/{report.id}")
        assert rep_resp.status_code == 200
        assert rep_resp.json()["id"] == str(report.id)
