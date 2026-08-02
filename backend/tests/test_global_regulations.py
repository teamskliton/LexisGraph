"""
Unit and integration tests for Global Regulation Repository & Multi-Strategy Deduplication Engine.
"""
from __future__ import annotations

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
from app.core.security import create_access_token
from app.db.models import Document, DocumentType, Organization, User
from app.db.models.regulation import Regulation, OrganizationRegulation, ProcessingStatus
from app.db.session import Base, get_db
from app.routes.regulations import router as regulations_router
from app.services import regulation_service
from app.services.regulation_service import RegulationDeduplicationEngine

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
        email=f"globalreg_{uuid.uuid4().hex[:6]}@example.com",
        username=f"globalreg_user_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Global Reg User",
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
        name="Global Reg Test Org",
        created_by=test_user.id,
    )
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


class TestGlobalRegulations:
    """Test suite for Global Regulation Repository & Deduplication."""

    def test_deduplication_engine_sha256(self, db_session, test_user):
        hash_val = "sha256_hash_code_of_wages_2019"
        reg = regulation_service.create_global_regulation(
            db_session,
            title="Code of Wages 2019",
            original_filename="code_wages_2019.pdf",
            stored_filename="code_wages_stored.pdf",
            file_path="/tmp/code_wages.pdf",
            file_size=2048,
            mime_type="application/pdf",
            document_hash=hash_val,
            uploaded_by=test_user.id,
            version="2019",
        )

        dup, strategy = RegulationDeduplicationEngine.check_duplicate(
            db_session,
            file_path=None,
            filename="code_wages_2019.pdf",
            checksum=hash_val,
            file_size=2048,
        )

        assert dup is not None
        assert dup.id == reg.id
        assert strategy == "SHA-256"

    def test_deduplication_engine_title_match(self, db_session, test_user):
        hash_val_1 = "sha256_hash_factories_act_1"
        reg = regulation_service.create_global_regulation(
            db_session,
            title="Factories Act 1948",
            original_filename="Factories_Act_1948.pdf",
            stored_filename="factories_stored.pdf",
            file_path="/tmp/factories.pdf",
            file_size=5000,
            mime_type="application/pdf",
            document_hash=hash_val_1,
            uploaded_by=test_user.id,
            version="1948",
        )

        dup, strategy = RegulationDeduplicationEngine.check_duplicate(
            db_session,
            file_path=None,
            filename="factories_act_1948.pdf",
            checksum="different_checksum_hash_2",
            file_size=5000,
        )

        assert dup is not None
        assert dup.id == reg.id
        assert strategy in ("TITLE_MATCH", "TITLE_YEAR_MATCH")

    def test_link_and_unlink_regulation(self, db_session, test_user, test_org):
        reg = regulation_service.create_global_regulation(
            db_session,
            title="DPDP Act 2023",
            original_filename="dpdp_2023.pdf",
            stored_filename="dpdp_stored.pdf",
            file_path="/tmp/dpdp.pdf",
            file_size=1024,
            mime_type="application/pdf",
            document_hash="dpdp_hash_123",
            uploaded_by=test_user.id,
        )

        # Link to Org
        link = regulation_service.link_regulation_to_organization(db_session, test_org.id, reg.id)
        assert link.organization_id == test_org.id
        assert link.regulation_id == reg.id
        assert link.enabled is True

        # List global regulations for org
        regs = regulation_service.list_global_regulations(db_session, organization_id=test_org.id)
        assert len(regs) >= 1
        matched = next(r for r in regs if r["id"] == reg.id)
        assert matched["is_linked"] is True

        # Unlink
        unlinked = regulation_service.unlink_regulation_from_organization(db_session, test_org.id, reg.id)
        assert unlinked is True

        # Regulation should still exist globally
        reg_db = db_session.get(Regulation, reg.id)
        assert reg_db is not None

    def test_regulations_api_endpoints(self, db_session, test_user, test_org):
        app = FastAPI()
        app.include_router(regulations_router)

        def _get_db_override():
            yield db_session

        def _get_user_override():
            return test_user

        from app.db.session import get_db
        from app.core.dependencies import get_current_user
        app.dependency_overrides[get_db] = _get_db_override
        app.dependency_overrides[get_current_user] = _get_user_override

        reg = regulation_service.create_global_regulation(
            db_session,
            title="POSH Act 2013",
            original_filename="posh_2013.pdf",
            stored_filename="posh_stored.pdf",
            file_path="/tmp/posh.pdf",
            file_size=3000,
            mime_type="application/pdf",
            document_hash="posh_hash_789",
            uploaded_by=test_user.id,
        )

        client = TestClient(app)

        # GET /regulations
        resp = client.get(f"/regulations?organization_id={test_org.id}")
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) >= 1

        # POST /regulations/link
        link_resp = client.post("/regulations/link", json={
            "organization_id": str(test_org.id),
            "regulation_id": str(reg.id),
        })
        assert link_resp.status_code == 200
        assert link_resp.json()["message"] == "Regulation linked successfully"

        # DELETE /regulations/unlink
        unlink_resp = client.request("DELETE", "/regulations/unlink", json={
            "organization_id": str(test_org.id),
            "regulation_id": str(reg.id),
        })
        assert unlink_resp.status_code == 200
        assert unlink_resp.json()["message"] == "Regulation unlinked successfully"
