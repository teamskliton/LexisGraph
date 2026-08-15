"""
Backend Authorization & Privilege Escalation Security Tests

Tests enforcing:
1. Only ADMIN can create, view, or cancel invitations (403 for Analyst, Reviewer, Viewer).
2. Only ADMIN can change member roles or remove members (403 for non-admins).
3. ADMIN role cannot be assigned via invitation links (400 Bad Request).
4. Direct signup setup-role only accepts ADMIN and LEGAL_ANALYST (403 for Reviewer/Viewer).
5. Membership-based backend authorization is authoritative, ignoring frontend parameters.
"""
from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.db.models import Organization, User
from app.db.models.rbac import (
    MemberStatus,
    OrganizationInvitation,
    OrganizationMember,
    UserRole,
)
from app.db.session import Base, get_db
from app.routes.auth import router as auth_router
from app.routes.organizations import router as organizations_router
from app.core.security import hash_password, create_access_token

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def create_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(organizations_router)
    return app


app = create_test_app()


@pytest.fixture(scope="function", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def make_user(db, email: str, username: str | None = None) -> User:
    u = User(
        id=uuid.uuid4(),
        email=email,
        username=username or (email.split("@")[0] + "_" + uuid.uuid4().hex[:4]),
        hashed_password=hash_password("password123"),
        full_name=email.split("@")[0].title(),
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def make_org(db, owner: User) -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name=f"{owner.full_name}'s Org",
        created_by=owner.id,
    )
    db.add(org)
    db.commit()

    # Add owner as ADMIN member
    member = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=owner.id,
        role=UserRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    db.add(member)
    db.commit()
    db.refresh(org)
    return org


def add_member(db, org: Organization, user: User, role: UserRole) -> OrganizationMember:
    member = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        role=role,
        status=MemberStatus.ACTIVE,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def auth_headers(user: User) -> dict:
    token = create_access_token(data={"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


class TestInvitationAuthorization(unittest.TestCase):
    def setUp(self):
        self.db = TestingSessionLocal()

        def override_get_db():
            try:
                yield self.db
            finally:
                pass

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

        # Setup org with Admin, Analyst, Reviewer, Viewer
        self.admin = make_user(self.db, "admin_authz@example.com")
        self.org = make_org(self.db, self.admin)

        self.analyst = make_user(self.db, "analyst_authz@example.com")
        add_member(self.db, self.org, self.analyst, UserRole.LEGAL_ANALYST)

        self.reviewer = make_user(self.db, "reviewer_authz@example.com")
        add_member(self.db, self.org, self.reviewer, UserRole.REVIEWER)

        self.viewer = make_user(self.db, "viewer_authz@example.com")
        add_member(self.db, self.org, self.viewer, UserRole.VIEWER)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()

    # --------------------------------------------------------------------------
    # 1. Non-Admins blocked from POST /invitations
    # --------------------------------------------------------------------------
    def test_analyst_cannot_create_invitation(self):
        r = self.client.post(
            f"/organizations/{self.org.id}/invitations",
            json={"email": "target@example.com", "role": "REVIEWER"},
            headers=auth_headers(self.analyst),
        )
        self.assertEqual(r.status_code, 403, r.text)

    def test_reviewer_cannot_create_invitation(self):
        r = self.client.post(
            f"/organizations/{self.org.id}/invitations",
            json={"email": "target@example.com", "role": "REVIEWER"},
            headers=auth_headers(self.reviewer),
        )
        self.assertEqual(r.status_code, 403, r.text)

    def test_viewer_cannot_create_invitation(self):
        r = self.client.post(
            f"/organizations/{self.org.id}/invitations",
            json={"email": "target@example.com", "role": "REVIEWER"},
            headers=auth_headers(self.viewer),
        )
        self.assertEqual(r.status_code, 403, r.text)

    def test_admin_can_create_invitation(self):
        r = self.client.post(
            f"/organizations/{self.org.id}/invitations",
            json={"email": "target@example.com", "role": "REVIEWER"},
            headers=auth_headers(self.admin),
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn("token", r.json())

    # --------------------------------------------------------------------------
    # 2. Cannot invite with ADMIN role
    # --------------------------------------------------------------------------
    def test_admin_cannot_invite_as_admin_role(self):
        """Admin cannot create an invitation with ADMIN role."""
        r = self.client.post(
            f"/organizations/{self.org.id}/invitations",
            json={"email": "admin_target@example.com", "role": "ADMIN"},
            headers=auth_headers(self.admin),
        )
        self.assertEqual(r.status_code, 400, r.text)
        self.assertIn("cannot be assigned via invitation", r.json()["detail"])

    # --------------------------------------------------------------------------
    # 3. Non-Admins blocked from listing / cancelling invitations
    # --------------------------------------------------------------------------
    def test_analyst_cannot_list_invitations(self):
        r = self.client.get(
            f"/organizations/{self.org.id}/invitations",
            headers=auth_headers(self.analyst),
        )
        self.assertEqual(r.status_code, 403, r.text)

    def test_analyst_cannot_cancel_invitation(self):
        dummy_id = uuid.uuid4()
        r = self.client.delete(
            f"/organizations/{self.org.id}/invitations/{dummy_id}",
            headers=auth_headers(self.analyst),
        )
        self.assertEqual(r.status_code, 403, r.text)

    # --------------------------------------------------------------------------
    # 4. Non-Admins blocked from updating roles / removing members
    # --------------------------------------------------------------------------
    def test_analyst_cannot_update_member_role(self):
        r = self.client.put(
            f"/organizations/{self.org.id}/members/{self.viewer.id}/role",
            json={"role": "ADMIN"},
            headers=auth_headers(self.analyst),
        )
        self.assertEqual(r.status_code, 403, r.text)

    def test_analyst_cannot_remove_member(self):
        r = self.client.delete(
            f"/organizations/{self.org.id}/members/{self.viewer.id}",
            headers=auth_headers(self.analyst),
        )
        self.assertEqual(r.status_code, 403, r.text)

    def test_admin_can_update_member_role(self):
        r = self.client.put(
            f"/organizations/{self.org.id}/members/{self.viewer.id}/role",
            json={"role": "REVIEWER"},
            headers=auth_headers(self.admin),
        )
        self.assertEqual(r.status_code, 200, r.text)

    # --------------------------------------------------------------------------
    # 5. Direct signup setup-role endpoint validation
    # --------------------------------------------------------------------------
    def test_setup_role_admin_success(self):
        new_user = make_user(self.db, "new_admin@example.com")
        r = self.client.post(
            "/auth/setup-role",
            json={"role": "ADMIN"},
            headers=auth_headers(new_user),
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["role"], "ADMIN")

    def test_setup_role_legal_analyst_success(self):
        new_user = make_user(self.db, "new_analyst@example.com")
        r = self.client.post(
            "/auth/setup-role",
            json={"role": "LEGAL_ANALYST"},
            headers=auth_headers(new_user),
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["role"], "LEGAL_ANALYST")

    def test_setup_role_reviewer_rejected(self):
        new_user = make_user(self.db, "new_reviewer@example.com")
        r = self.client.post(
            "/auth/setup-role",
            json={"role": "REVIEWER"},
            headers=auth_headers(new_user),
        )
        self.assertEqual(r.status_code, 403, r.text)
        self.assertIn("Only ADMIN or LEGAL_ANALYST", r.json()["detail"])


if __name__ == "__main__":
    unittest.main()
