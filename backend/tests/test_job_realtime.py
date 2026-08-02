"""
Unit and integration tests for Real-Time Job Progress updates (JobManager, WebSockets, SSE streams).
"""
from __future__ import annotations

import json
import unittest
import unittest.mock
import uuid
import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.compliance.models import ComplianceJob, ComplianceJobStatus
from app.compliance import crud
from app.core.security import create_access_token
from app.db.models import Document, DocumentType, Organization, User
from app.db.session import Base, get_db
from app.routes.jobs import router as jobs_router
from app.services.job_manager import JobManager, job_manager
from app.services.job_worker import update_job_progress

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
        email=f"realtime_{uuid.uuid4().hex[:6]}@example.com",
        username=f"realtime_user_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Realtime User",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def test_data(db_session, test_user):
    org = Organization(
        id=uuid.uuid4(),
        name="Realtime Test Org",
        created_by=test_user.id,
    )
    db_session.add(org)

    reg_doc = Document(
        id=uuid.uuid4(),
        organization_id=org.id,
        uploaded_by=test_user.id,
        original_filename="reg_realtime.pdf",
        stored_filename="reg_realtime_stored.pdf",
        file_path="/tmp/reg_realtime.pdf",
        file_size=1024,
        mime_type="application/pdf",
        document_type=DocumentType.REGULATION,
        checksum="reg_hash_rt_123",
    )
    db_session.add(reg_doc)

    policy_doc = Document(
        id=uuid.uuid4(),
        organization_id=org.id,
        uploaded_by=test_user.id,
        original_filename="policy_realtime.pdf",
        stored_filename="policy_realtime_stored.pdf",
        file_path="/tmp/policy_realtime.pdf",
        file_size=1024,
        mime_type="application/pdf",
        document_type=DocumentType.POLICY,
        checksum="policy_hash_rt_456",
    )
    db_session.add(policy_doc)

    db_session.commit()
    return {"org": org, "reg_doc": reg_doc, "policy_doc": policy_doc}


class TestRealTimeJobProgress:
    """Test suite for JobManager, WebSockets, and SSE endpoints."""

    def test_job_manager_eta_calculation(self):
        jm = JobManager()
        job_id = uuid.uuid4()
        
        # Initial 0 progress
        eta = jm.calculate_estimated_remaining_seconds(job_id, 0)
        assert eta is None

        # 50% progress
        jm.broadcast_job_started(job_id, uuid.uuid4())
        eta = jm.calculate_estimated_remaining_seconds(job_id, 50)
        assert eta is not None
        assert isinstance(eta, int)
        assert eta >= 0

        # 100% progress
        eta = jm.calculate_estimated_remaining_seconds(job_id, 100)
        assert eta == 0

    def test_websocket_progress_stream(self, db_session, test_user, test_data):
        org = test_data["org"]
        job = crud.create_compliance_job(
            db_session,
            organization_id=org.id,
            regulation_id=test_data["reg_doc"].id,
            policy_document_id=test_data["policy_doc"].id,
            user_id=test_user.id,
        )

        app = FastAPI()
        app.include_router(jobs_router)

        def _get_db_override():
            yield db_session

        from app.db.session import get_db
        app.dependency_overrides[get_db] = _get_db_override

        with unittest.mock.patch("app.routes.jobs.get_session", return_value=db_session):
            token = create_access_token({"sub": str(test_user.id)})
            client = TestClient(app)

            with client.websocket_connect(f"/jobs/ws/jobs/{job.id}?token={token}") as ws:
                data = ws.receive_json()
                assert data["job_id"] == str(job.id)
                assert data["status"] == "QUEUED"

                # Update progress
                update_job_progress(db_session, job.id, 45, "Hybrid retrieval", status=ComplianceJobStatus.RUNNING)
                
                # Check WebSocket received progress update
                data2 = ws.receive_json()
                assert data2["job_id"] == str(job.id)
                assert data2["status"] == "RUNNING"
                assert data2["progress"] == 45
                assert data2["current_step"] == "Hybrid retrieval"

    def test_sse_progress_stream(self, db_session, test_user, test_data):
        org = test_data["org"]
        job = crud.create_compliance_job(
            db_session,
            organization_id=org.id,
            regulation_id=test_data["reg_doc"].id,
            policy_document_id=test_data["policy_doc"].id,
            user_id=test_user.id,
        )

        app = FastAPI()
        app.include_router(jobs_router)

        def _get_db_override():
            yield db_session

        from app.db.session import get_db
        app.dependency_overrides[get_db] = _get_db_override

        # Set job status to COMPLETED so SSE generator yields snapshot and closes stream cleanly
        job.status = ComplianceJobStatus.COMPLETED
        db_session.commit()

        token = create_access_token({"sub": str(test_user.id)})
        client = TestClient(app)

        resp = client.get(f"/jobs/{job.id}/stream?token={token}")
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        assert f'"job_id": "{str(job.id)}"' in resp.text
