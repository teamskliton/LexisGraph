"""
Tests for Sprint 10 Step 10.2: Asynchronous Compliance Job Engine.
"""

import uuid
import unittest.mock
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.compliance import crud
from app.compliance.models import ComplianceJob, ComplianceJobStatus, ComplianceReport, ComplianceReportStatus
from app.core.dependencies import get_current_user
from app.db.models import Document, DocumentType, Organization, User
from app.db.session import Base, get_db
from app.main import create_app
from app.services.job_worker import execute_compliance_job, update_job_progress

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
    u_hex = uuid.uuid4().hex[:6]
    user = User(
        id=uuid.uuid4(),
        email=f"jobuser_{u_hex}@example.com",
        username=f"jobuser_{u_hex}",
        full_name="Job Test User",
        hashed_password="hashed_pw_123",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def test_data(db_session, test_user):
    org = Organization(
        id=uuid.uuid4(),
        name="Job Test Org",
        created_by=test_user.id,
    )
    db_session.add(org)

    reg_doc = Document(
        id=uuid.uuid4(),
        organization_id=org.id,
        uploaded_by=test_user.id,
        original_filename="reg_job.pdf",
        stored_filename="reg_job_stored.pdf",
        file_path="/tmp/reg_job.pdf",
        file_size=1024,
        mime_type="application/pdf",
        document_type=DocumentType.REGULATION,
        checksum="reg_job_hash_123",
    )
    db_session.add(reg_doc)

    policy_doc = Document(
        id=uuid.uuid4(),
        organization_id=org.id,
        uploaded_by=test_user.id,
        original_filename="policy_job.pdf",
        stored_filename="policy_job_stored.pdf",
        file_path="/tmp/policy_job.pdf",
        file_size=1024,
        mime_type="application/pdf",
        document_type=DocumentType.POLICY,
        checksum="policy_job_hash_456",
    )
    db_session.add(policy_doc)

    db_session.commit()
    return {"org": org, "reg_doc": reg_doc, "policy_doc": policy_doc}


@pytest.fixture(scope="function")
def client(db_session, test_user):
    from fastapi import FastAPI
    from app.compliance.routes import router as compliance_router
    from app.routes.jobs import router as jobs_router

    app = FastAPI()
    app.include_router(compliance_router)
    app.include_router(jobs_router)

    def _get_db_override():
        yield db_session

    def _get_current_user_override():
        return test_user

    app.dependency_overrides[get_db] = _get_db_override
    app.dependency_overrides[get_current_user] = _get_current_user_override

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


class TestComplianceJobs:
    """Test suite for ComplianceJob model, worker progress updates, and API endpoints."""

    def test_create_and_update_job_progress(self, db_session, test_user, test_data):
        org = test_data["org"]
        reg_doc = test_data["reg_doc"]
        policy_doc = test_data["policy_doc"]

        # Create job
        job = crud.create_compliance_job(
            db_session,
            organization_id=org.id,
            regulation_id=reg_doc.id,
            policy_document_id=policy_doc.id,
            user_id=test_user.id,
        )
        assert job.status == ComplianceJobStatus.QUEUED
        assert job.progress == 0
        assert job.current_step == "QUEUED"

        # Update progress stage 1
        updated = update_job_progress(db_session, job.id, 15, "Fetching regulation clauses", status=ComplianceJobStatus.RUNNING)
        assert updated.progress == 15
        assert updated.current_step == "Fetching regulation clauses"
        assert updated.status == ComplianceJobStatus.RUNNING

        # Update progress stage 2 (30%)
        updated = update_job_progress(db_session, job.id, 30, "Vector retrieval")
        assert updated.progress == 30

    def test_post_compliance_returns_job_queued_immediately(self, client, test_data):
        payload = {
            "organization_id": str(test_data["org"].id),
            "regulation_id": str(test_data["reg_doc"].id),
            "policy_document_id": str(test_data["policy_doc"].id),
        }

        with unittest.mock.patch("app.compliance.service.execute_compliance_job"):
            resp = client.post("/compliance/analyze", json=payload)
            assert resp.status_code == 202
            body = resp.json()
            assert "job_id" in body
            assert body["status"] == "QUEUED"
            assert body["existing_report"] is False

    def test_get_job_status_and_list_jobs(self, client, db_session, test_user, test_data):
        org = test_data["org"]
        job = crud.create_compliance_job(
            db_session,
            organization_id=org.id,
            regulation_id=test_data["reg_doc"].id,
            policy_document_id=test_data["policy_doc"].id,
            user_id=test_user.id,
        )
        update_job_progress(db_session, job.id, 45, "Knowledge graph retrieval", status=ComplianceJobStatus.RUNNING)

        # GET /jobs/{job_id}
        resp = client.get(f"/jobs/{job.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == str(job.id)
        assert body["status"] == "RUNNING"
        assert body["progress"] == 45
        assert body["current_step"] == "Knowledge graph retrieval"

        # GET /jobs
        resp_list = client.get("/jobs")
        assert resp_list.status_code == 200
        items = resp_list.json()
        assert len(items) >= 1
        assert items[0]["id"] == str(job.id)

    def test_cancel_job(self, client, db_session, test_user, test_data):
        job = crud.create_compliance_job(
            db_session,
            organization_id=test_data["org"].id,
            regulation_id=test_data["reg_doc"].id,
            policy_document_id=test_data["policy_doc"].id,
            user_id=test_user.id,
        )

        resp = client.delete(f"/jobs/{job.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "CANCELLED"
