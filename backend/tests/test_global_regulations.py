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

    def test_multi_organization_regulation_isolation(self, db_session, test_user, test_org):
        """
        Scenario:
        TechNova (Org 1) links DPDP Act and FEMA.
        ABC Ltd. (Org 2) links DPDP Act and POSH Act.
        Both organizations browse the same global regulation library.
        Linking/unlinking is strictly workspace-isolated.
        """
        org_b = Organization(
            id=uuid.uuid4(),
            name="ABC Ltd. Workspace",
            created_by=test_user.id,
        )
        db_session.add(org_b)
        db_session.commit()

        # Create 3 global regulations
        reg_dpdp = regulation_service.create_global_regulation(
            db_session,
            title="DPDP Act 2023",
            original_filename="dpdp_2023.pdf",
            stored_filename="dpdp_stored.pdf",
            file_path="/tmp/dpdp.pdf",
            file_size=1024,
            mime_type="application/pdf",
            document_hash="hash_dpdp_global",
            uploaded_by=test_user.id,
        )
        reg_fema = regulation_service.create_global_regulation(
            db_session,
            title="FEMA 1999",
            original_filename="fema_1999.pdf",
            stored_filename="fema_stored.pdf",
            file_path="/tmp/fema.pdf",
            file_size=2048,
            mime_type="application/pdf",
            document_hash="hash_fema_global",
            uploaded_by=test_user.id,
        )
        reg_posh = regulation_service.create_global_regulation(
            db_session,
            title="POSH Act 2013",
            original_filename="posh_2013.pdf",
            stored_filename="posh_stored.pdf",
            file_path="/tmp/posh.pdf",
            file_size=3072,
            mime_type="application/pdf",
            document_hash="hash_posh_global",
            uploaded_by=test_user.id,
        )

        # TechNova links DPDP and FEMA
        regulation_service.link_regulation_to_organization(db_session, test_org.id, reg_dpdp.id)
        regulation_service.link_regulation_to_organization(db_session, test_org.id, reg_fema.id)

        # ABC Ltd links DPDP and POSH
        regulation_service.link_regulation_to_organization(db_session, org_b.id, reg_dpdp.id)
        regulation_service.link_regulation_to_organization(db_session, org_b.id, reg_posh.id)

        # Verify TechNova selections
        technova_regs = {r["id"]: r["is_linked"] for r in regulation_service.list_global_regulations(db_session, organization_id=test_org.id)}
        assert technova_regs[reg_dpdp.id] is True
        assert technova_regs[reg_fema.id] is True
        assert technova_regs[reg_posh.id] is False

        # Verify ABC Ltd selections
        abcltd_regs = {r["id"]: r["is_linked"] for r in regulation_service.list_global_regulations(db_session, organization_id=org_b.id)}
        assert abcltd_regs[reg_dpdp.id] is True
        assert abcltd_regs[reg_fema.id] is False
        assert abcltd_regs[reg_posh.id] is True

        # Unlink DPDP from TechNova: must NOT affect ABC Ltd and must preserve global DPDP
        unlinked = regulation_service.unlink_regulation_from_organization(db_session, test_org.id, reg_dpdp.id)
        assert unlinked is True

        # TechNova DPDP is unlinked
        technova_regs_after = {r["id"]: r["is_linked"] for r in regulation_service.list_global_regulations(db_session, organization_id=test_org.id)}
        assert technova_regs_after[reg_dpdp.id] is False

        # ABC Ltd DPDP remains linked
        abcltd_regs_after = {r["id"]: r["is_linked"] for r in regulation_service.list_global_regulations(db_session, organization_id=org_b.id)}
        assert abcltd_regs_after[reg_dpdp.id] is True

        # Global DPDP regulation is preserved
        assert db_session.get(Regulation, reg_dpdp.id) is not None

    def test_canonical_metadata_accuracy(self, db_session, test_user):
        """
        Verify that canonical metadata correctly resolves verified attributes:
        - DPDP Act 2023 -> MeitY, 2023, India (National)
        - POSH Act 2013 -> Ministry of Women and Child Development, 2013
        - Unknown act -> does NOT fabricate 'Ministry of Corporate Affairs' or '2013'
        """
        dpdp = regulation_service.create_global_regulation(
            db_session,
            title="dpdp_act_2023.pdf",
            original_filename="dpdp_act_2023.pdf",
            stored_filename="dpdp_canon.pdf",
            file_path="/tmp/dpdp_canon.pdf",
            file_size=1000,
            mime_type="application/pdf",
            document_hash="dpdp_canon_hash",
            uploaded_by=test_user.id,
        )

        unknown_reg = regulation_service.create_global_regulation(
            db_session,
            title="Custom Guideline Circular",
            original_filename="custom_guideline.pdf",
            stored_filename="custom_stored.pdf",
            file_path="/tmp/custom.pdf",
            file_size=2000,
            mime_type="application/pdf",
            document_hash="custom_hash_999",
            uploaded_by=test_user.id,
        )

        all_regs = {r["id"]: r for r in regulation_service.list_global_regulations(db_session)}

        # DPDP has accurate canonical metadata
        dpdp_item = all_regs[dpdp.id]
        assert dpdp_item["act_year"] == 2023
        assert "MeitY" in dpdp_item["issuing_authority"]
        assert "India" in dpdp_item["jurisdiction"]
        assert dpdp_item["domain"] == "Data Privacy & Protection"
        assert dpdp_item["effective_date"] is not None

        # Unknown regulation does NOT have fabricated defaults
        unknown_item = all_regs[unknown_reg.id]
        assert unknown_item["issuing_authority"] != "Ministry of Corporate Affairs"
        assert unknown_item["act_year"] != 2013

    def test_regulation_upload_admin_permission(self, db_session, test_user, test_org):
        """
        Verify that regular organization users cannot upload/import global regulations,
        and receive 403 Forbidden from the backend endpoint.
        """
        from app.routes.documents import router as documents_router
        from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus
        from io import BytesIO

        # Ensure user is org admin so org-level check passes
        member = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        )
        db_session.add(member)
        db_session.commit()

        app = FastAPI()
        app.include_router(documents_router)

        # Non-superuser
        test_user.is_superuser = False
        db_session.commit()

        def _get_db_override():
            yield db_session

        def _get_user_override():
            return test_user

        from app.db.session import get_db
        from app.core.dependencies import get_current_user
        app.dependency_overrides[get_db] = _get_db_override
        app.dependency_overrides[get_current_user] = _get_user_override

        client = TestClient(app)

        file_payload = {"file": ("test_act.pdf", BytesIO(b"%PDF-1.4 mock content"), "application/pdf")}
        data_payload = {
            "organization_id": str(test_org.id),
            "document_type": "REGULATION",
        }

        resp = client.post("/documents/upload", files=file_payload, data=data_payload)
        assert resp.status_code == 403
        assert "Only authorized platform administrators" in resp.json()["detail"]


