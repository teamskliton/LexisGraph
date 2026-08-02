"""
Unit and integration test suite for RBAC, Multi-Tenancy, User Management, and Audit Logs.
"""
from __future__ import annotations

import unittest
import uuid
import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.core.rbac_dependencies import get_user_org_role
from app.db.models import Organization, User
from app.db.models.rbac import OrganizationMember, OrganizationInvitation, AuditLog, UserRole, MemberStatus
from app.db.session import Base, get_db
from app.routes.organizations import router as organizations_router
from app.services import audit_service

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
def owner_user(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"owner_{uuid.uuid4().hex[:6]}@example.com",
        username=f"owner_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Org Owner User",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def invited_user(db_session):
    u = User(
        id=uuid.uuid4(),
        email=f"invited_{uuid.uuid4().hex[:6]}@example.com",
        username=f"invited_{uuid.uuid4().hex[:6]}",
        hashed_password="hashed_pwd_123",
        full_name="Invited Team Member",
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture(scope="function")
def test_org(db_session, owner_user):
    org = Organization(
        id=uuid.uuid4(),
        name="RBAC Test Organization",
        created_by=owner_user.id,
    )
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


class TestRBACAndMultiTenancy:
    """Test suite for RBAC roles, invitation acceptance, and audit logs."""

    def test_owner_role_and_member_role(self, db_session, owner_user, invited_user, test_org):
        # Owner should automatically resolve to ORGANIZATION_ADMIN
        owner_role = get_user_org_role(db_session, owner_user.id, test_org.id)
        assert owner_role == UserRole.ORGANIZATION_ADMIN

        # Member assigned MANAGER role
        member = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=invited_user.id,
            role=UserRole.MANAGER,
            status=MemberStatus.ACTIVE,
        )
        db_session.add(member)
        db_session.commit()

        member_role = get_user_org_role(db_session, invited_user.id, test_org.id)
        assert member_role == UserRole.MANAGER

    def test_invitation_creation_and_acceptance(self, db_session, owner_user, invited_user, test_org):
        app = FastAPI()
        app.include_router(organizations_router)

        def _get_db_override():
            yield db_session

        def _get_user_override():
            return owner_user

        from app.db.session import get_db
        from app.core.dependencies import get_current_user
        app.dependency_overrides[get_db] = _get_db_override
        app.dependency_overrides[get_current_user] = _get_user_override

        client = TestClient(app)

        # 1. Invite User
        invite_resp = client.post(
            f"/organizations/{test_org.id}/invitations",
            json={"email": invited_user.email, "role": "MANAGER"},
        )
        assert invite_resp.status_code == 200
        token = invite_resp.json()["token"]
        assert token is not None

        # 2. Switch context to invited_user and accept token
        app.dependency_overrides[get_current_user] = lambda: invited_user
        accept_resp = client.post(
            "/organizations/invitations/accept",
            json={"token": token},
        )
        assert accept_resp.status_code == 200
        assert accept_resp.json()["organization_id"] == str(test_org.id)

        # Verify membership created
        mem = db_session.query(OrganizationMember).filter_by(
            organization_id=test_org.id, user_id=invited_user.id
        ).first()
        assert mem is not None
        assert mem.role == UserRole.MANAGER

    def test_audit_logging(self, db_session, owner_user, test_org):
        log_entry = audit_service.log_audit_event(
            db_session,
            user_id=owner_user.id,
            action="POLICY_UPLOADED",
            organization_id=test_org.id,
            entity="Document",
            entity_id="doc_uuid_123",
        )

        assert log_entry.action == "POLICY_UPLOADED"
        assert log_entry.organization_id == test_org.id

        logs = db_session.query(AuditLog).filter_by(organization_id=test_org.id).all()
        assert len(logs) >= 1
        assert logs[0].action == "POLICY_UPLOADED"
