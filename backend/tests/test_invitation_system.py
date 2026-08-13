"""
Invitation System Tests — Sprint 6

Tests covering the complete invitation → membership flow:
- New user invitation acceptance
- Existing user invitation acceptance
- Role preservation
- Email-match enforcement (email-bound invitations)
- Expired invitation rejection
- Reused (deleted) invitation rejection
- Duplicate membership prevention
- Shareable link (no email) acceptance
- Wrong email rejection
- Organization membership returns correct org + role

Run with:
    python -m pytest tests/test_invitation_system.py -v
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

import app.db.models  # noqa: F401  — ensures all models are registered
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

# ─── In-memory SQLite test database ───────────────────────────────────────────
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ─── FastAPI test app ──────────────────────────────────────────────────────────
def create_test_app() -> FastAPI:
    test_app = FastAPI()
    test_app.include_router(auth_router)
    test_app.include_router(organizations_router)
    return test_app


test_app = create_test_app()


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="function", autouse=True)
def setup_db():
    """Create tables before each test, drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
def client(db):
    """TestClient with DB dependency override."""
    def override_get_db():
        try:
            yield db
        finally:
            pass

    test_app.dependency_overrides[get_db] = override_get_db
    with TestClient(test_app) as c:
        yield c
    test_app.dependency_overrides.clear()


# ─── Helper functions ──────────────────────────────────────────────────────────

def make_user(db, email: str, password: str = "testpass123") -> User:
    u = User(
        id=uuid.uuid4(),
        email=email,
        username=email.split("@")[0].replace(".", "_") + "_" + uuid.uuid4().hex[:4],
        hashed_password=hash_password(password),
        full_name=email.split("@")[0].replace(".", " ").title(),
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def make_org(db, owner: User, name: str = "Test Org") -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name=name,
        created_by=owner.id,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def make_invitation(
    db,
    org: Organization,
    inviter: User,
    role: UserRole = UserRole.REVIEWER,
    email: str | None = None,
    expires_in_days: int = 7,
) -> OrganizationInvitation:
    import secrets
    inv = OrganizationInvitation(
        id=uuid.uuid4(),
        organization_id=org.id,
        email=email,
        role=role,
        token=secrets.token_urlsafe(32),
        expires_at=datetime.now(timezone.utc) + timedelta(days=expires_in_days),
        invited_by=inviter.id,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


def auth_headers(user: User) -> dict:
    token = create_access_token(data={"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


# ─── Tests ────────────────────────────────────────────────────────────────────

class TestInvitationSystem(unittest.TestCase):
    """End-to-end invitation acceptance tests."""

    def _setup(self):
        """Called at start of each test method to create fresh fixtures."""
        self.db = TestingSessionLocal()

        def override_get_db():
            try:
                yield self.db
            finally:
                pass

        test_app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(test_app)

        # Create admin user and organization
        self.admin = make_user(self.db, "admin@lexisgraph.test")
        self.org = make_org(self.db, self.admin, "LexisGraph Technologies")

    def _teardown(self):
        test_app.dependency_overrides.clear()
        self.db.close()

    # --------------------------------------------------------------------------
    # Case A: New user invited as Reviewer
    # --------------------------------------------------------------------------
    def test_case_a_new_user_reviewer(self):
        """Admin invites new user as Reviewer — membership created with correct role."""
        self._setup()
        try:
            invited_email = "reviewer@example.com"
            inv = make_invitation(
                self.db, self.org, self.admin,
                role=UserRole.REVIEWER,
                email=invited_email,
            )

            # Simulate new user registering and then accepting
            new_user = make_user(self.db, invited_email)
            headers = auth_headers(new_user)

            r = self.client.post(
                "/organizations/invitations/accept",
                json={"token": inv.token},
                headers=headers,
            )
            self.assertEqual(r.status_code, 200, r.text)
            data = r.json()
            self.assertEqual(data["organization_id"], str(self.org.id))
            self.assertEqual(data["organization_name"], "LexisGraph Technologies")
            self.assertEqual(data["role"].upper(), "REVIEWER")

            # Verify membership in DB
            member = self.db.query(OrganizationMember).filter(
                OrganizationMember.user_id == new_user.id,
                OrganizationMember.organization_id == self.org.id,
            ).first()
            self.assertIsNotNone(member, "Membership must be created")
            self.assertEqual(member.role, UserRole.REVIEWER)
            self.assertEqual(member.status, MemberStatus.ACTIVE)

            # Verify invitation is consumed (deleted)
            remaining = self.db.query(OrganizationInvitation).filter(
                OrganizationInvitation.token == inv.token
            ).first()
            self.assertIsNone(remaining, "Invitation must be deleted after acceptance")
        finally:
            self._teardown()

    # --------------------------------------------------------------------------
    # Case B: New user invited as Legal Analyst
    # --------------------------------------------------------------------------
    def test_case_b_new_user_legal_analyst(self):
        """Admin invites new user as Legal Analyst — role preserved exactly."""
        self._setup()
        try:
            invited_email = "analyst@example.com"
            inv = make_invitation(
                self.db, self.org, self.admin,
                role=UserRole.LEGAL_ANALYST,
                email=invited_email,
            )
            new_user = make_user(self.db, invited_email)

            r = self.client.post(
                "/organizations/invitations/accept",
                json={"token": inv.token},
                headers=auth_headers(new_user),
            )
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(r.json()["role"].upper(), "LEGAL_ANALYST")

            member = self.db.query(OrganizationMember).filter(
                OrganizationMember.user_id == new_user.id,
                OrganizationMember.organization_id == self.org.id,
            ).first()
            self.assertEqual(member.role, UserRole.LEGAL_ANALYST)
        finally:
            self._teardown()

    # --------------------------------------------------------------------------
    # Case D: Existing user (email matches) accepts invitation
    # --------------------------------------------------------------------------
    def test_case_d_existing_user_invitation(self):
        """Existing user accepts invitation — no new account, correct membership."""
        self._setup()
        try:
            existing_email = "existing@example.com"
            existing_user = make_user(self.db, existing_email)
            inv = make_invitation(
                self.db, self.org, self.admin,
                role=UserRole.VIEWER,
                email=existing_email,
            )

            r = self.client.post(
                "/organizations/invitations/accept",
                json={"token": inv.token},
                headers=auth_headers(existing_user),
            )
            self.assertEqual(r.status_code, 200, r.text)

            members = self.db.query(OrganizationMember).filter(
                OrganizationMember.user_id == existing_user.id,
                OrganizationMember.organization_id == self.org.id,
            ).all()
            self.assertEqual(len(members), 1, "Only one membership must exist")
            self.assertEqual(members[0].role, UserRole.VIEWER)
        finally:
            self._teardown()

    # --------------------------------------------------------------------------
    # Case E: Multi-org user — existing orgs preserved, invited org added
    # --------------------------------------------------------------------------
    def test_case_e_multi_org_user(self):
        """User already in another org — invited org is added, existing org preserved."""
        self._setup()
        try:
            # Create a second org the user already belongs to
            second_admin = make_user(self.db, "second_admin@example.com")
            second_org = make_org(self.db, second_admin, "Second Org")

            user_email = "multiorg@example.com"
            user = make_user(self.db, user_email)

            # Add user to second_org as viewer
            existing_member = OrganizationMember(
                id=uuid.uuid4(),
                organization_id=second_org.id,
                user_id=user.id,
                role=UserRole.VIEWER,
                status=MemberStatus.ACTIVE,
            )
            self.db.add(existing_member)
            self.db.commit()

            # Now invite to main org as reviewer
            inv = make_invitation(
                self.db, self.org, self.admin,
                role=UserRole.REVIEWER,
                email=user_email,
            )

            r = self.client.post(
                "/organizations/invitations/accept",
                json={"token": inv.token},
                headers=auth_headers(user),
            )
            self.assertEqual(r.status_code, 200, r.text)

            # Both memberships exist
            all_memberships = self.db.query(OrganizationMember).filter(
                OrganizationMember.user_id == user.id
            ).all()
            org_ids = {str(m.organization_id) for m in all_memberships}
            self.assertIn(str(self.org.id), org_ids, "Invited org must be in memberships")
            self.assertIn(str(second_org.id), org_ids, "Pre-existing org must be preserved")
            self.assertEqual(len(all_memberships), 2)
        finally:
            self._teardown()

    # --------------------------------------------------------------------------
    # Case F: Wrong email — acceptance must be blocked
    # --------------------------------------------------------------------------
    def test_case_f_wrong_email_rejected(self):
        """Email-bound invitation cannot be accepted by user with wrong email."""
        self._setup()
        try:
            inv = make_invitation(
                self.db, self.org, self.admin,
                role=UserRole.REVIEWER,
                email="intended@example.com",
            )

            wrong_user = make_user(self.db, "wrong@example.com")
            r = self.client.post(
                "/organizations/invitations/accept",
                json={"token": inv.token},
                headers=auth_headers(wrong_user),
            )
            self.assertEqual(r.status_code, 403, r.text)
            self.assertIn("intended@example.com", r.json()["detail"])

            # No membership created
            member = self.db.query(OrganizationMember).filter(
                OrganizationMember.user_id == wrong_user.id,
            ).first()
            self.assertIsNone(member, "No membership should be created for wrong email")

            # Invitation still exists (not consumed)
            inv_still = self.db.query(OrganizationInvitation).filter(
                OrganizationInvitation.token == inv.token
            ).first()
            self.assertIsNotNone(inv_still, "Invitation must not be consumed on wrong email")
        finally:
            self._teardown()

    # --------------------------------------------------------------------------
    # Case G: Expired invitation — must be rejected
    # --------------------------------------------------------------------------
    def test_case_g_expired_invitation(self):
        """Expired invitation is rejected with appropriate error."""
        self._setup()
        try:
            inv = make_invitation(
                self.db, self.org, self.admin,
                role=UserRole.REVIEWER,
                email=None,
                expires_in_days=-1,  # already expired
            )
            user = make_user(self.db, "user@example.com")

            r = self.client.post(
                "/organizations/invitations/accept",
                json={"token": inv.token},
                headers=auth_headers(user),
            )
            self.assertEqual(r.status_code, 400, r.text)
            self.assertIn("expired", r.json()["detail"].lower())
        finally:
            self._teardown()

    # --------------------------------------------------------------------------
    # Case H: Already-used (deleted) token — second use returns 404
    # --------------------------------------------------------------------------
    def test_case_h_reused_token_rejected(self):
        """Trying to accept an already-consumed invitation returns 404."""
        self._setup()
        try:
            invited_email = "user@example.com"
            inv = make_invitation(
                self.db, self.org, self.admin,
                role=UserRole.REVIEWER,
                email=invited_email,
            )
            user = make_user(self.db, invited_email)

            # First acceptance — should succeed
            r1 = self.client.post(
                "/organizations/invitations/accept",
                json={"token": inv.token},
                headers=auth_headers(user),
            )
            self.assertEqual(r1.status_code, 200, r1.text)

            # Second acceptance — invitation was deleted, must return 404
            r2 = self.client.post(
                "/organizations/invitations/accept",
                json={"token": inv.token},
                headers=auth_headers(user),
            )
            self.assertEqual(r2.status_code, 404, r2.text)
        finally:
            self._teardown()

    # --------------------------------------------------------------------------
    # Case: Shareable link (no email) can be accepted by any user
    # --------------------------------------------------------------------------
    def test_shareable_link_any_user(self):
        """Shareable link (email=None) can be accepted by any authenticated user."""
        self._setup()
        try:
            # email=None means shareable link
            inv = make_invitation(
                self.db, self.org, self.admin,
                role=UserRole.ADMIN,
                email=None,
            )
            any_user = make_user(self.db, "anyone@example.com")

            r = self.client.post(
                "/organizations/invitations/accept",
                json={"token": inv.token},
                headers=auth_headers(any_user),
            )
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(r.json()["role"].upper(), "ADMIN")
        finally:
            self._teardown()

    # --------------------------------------------------------------------------
    # Duplicate membership prevention (idempotency)
    # --------------------------------------------------------------------------
    def test_duplicate_membership_prevention(self):
        """If user is already a member, accepting updates role but does NOT duplicate."""
        self._setup()
        try:
            invited_email = "member@example.com"
            user = make_user(self.db, invited_email)

            # Pre-create membership as VIEWER
            existing = OrganizationMember(
                id=uuid.uuid4(),
                organization_id=self.org.id,
                user_id=user.id,
                role=UserRole.VIEWER,
                status=MemberStatus.ACTIVE,
            )
            self.db.add(existing)
            self.db.commit()

            # Invite same user as REVIEWER
            inv = make_invitation(
                self.db, self.org, self.admin,
                role=UserRole.REVIEWER,
                email=invited_email,
            )

            r = self.client.post(
                "/organizations/invitations/accept",
                json={"token": inv.token},
                headers=auth_headers(user),
            )
            self.assertEqual(r.status_code, 200, r.text)

            members = self.db.query(OrganizationMember).filter(
                OrganizationMember.user_id == user.id,
                OrganizationMember.organization_id == self.org.id,
            ).all()
            self.assertEqual(len(members), 1, "Must not create duplicate membership")
            self.assertEqual(members[0].role, UserRole.REVIEWER, "Role must be updated to invited role")
        finally:
            self._teardown()

    # --------------------------------------------------------------------------
    # Token validation endpoint — get_invitation_by_token
    # --------------------------------------------------------------------------
    def test_get_invitation_details_valid_token(self):
        """Valid token returns org name, role, and is_email_bound flag."""
        self._setup()
        try:
            inv = make_invitation(
                self.db, self.org, self.admin,
                role=UserRole.REVIEWER,
                email="target@example.com",
            )

            r = self.client.get(f"/organizations/invitations/token/{inv.token}")
            self.assertEqual(r.status_code, 200, r.text)
            data = r.json()
            self.assertEqual(data["organization_name"], "LexisGraph Technologies")
            self.assertEqual(data["role"].upper(), "REVIEWER")
            self.assertEqual(data["email"], "target@example.com")
            self.assertTrue(data["is_email_bound"], "email-bound flag must be True")
            self.assertTrue(data["is_valid"])
        finally:
            self._teardown()

    def test_get_invitation_details_shareable_link(self):
        """Shareable link token has is_email_bound=False."""
        self._setup()
        try:
            inv = make_invitation(
                self.db, self.org, self.admin,
                role=UserRole.VIEWER,
                email=None,
            )
            r = self.client.get(f"/organizations/invitations/token/{inv.token}")
            self.assertEqual(r.status_code, 200, r.text)
            data = r.json()
            self.assertFalse(data["is_email_bound"])
            self.assertIsNone(data["email"])
        finally:
            self._teardown()

    def test_get_invitation_details_invalid_token(self):
        """Non-existent token returns 404."""
        self._setup()
        try:
            r = self.client.get("/organizations/invitations/token/nonexistent-token-xyz")
            self.assertEqual(r.status_code, 404, r.text)
        finally:
            self._teardown()

    def test_get_invitation_details_expired_token(self):
        """Expired token returns 400."""
        self._setup()
        try:
            inv = make_invitation(
                self.db, self.org, self.admin,
                role=UserRole.VIEWER,
                email=None,
                expires_in_days=-1,
            )
            r = self.client.get(f"/organizations/invitations/token/{inv.token}")
            self.assertEqual(r.status_code, 400, r.text)
        finally:
            self._teardown()

    # --------------------------------------------------------------------------
    # Organizations listing returns invited org after acceptance
    # --------------------------------------------------------------------------
    def test_organizations_endpoint_returns_invited_org(self):
        """After acceptance, /organizations includes the invited organization."""
        self._setup()
        try:
            invited_email = "orgcheck@example.com"
            inv = make_invitation(
                self.db, self.org, self.admin,
                role=UserRole.REVIEWER,
                email=invited_email,
            )
            new_user = make_user(self.db, invited_email)

            # Accept invitation
            self.client.post(
                "/organizations/invitations/accept",
                json={"token": inv.token},
                headers=auth_headers(new_user),
            )

            # Check organizations endpoint
            r = self.client.get("/organizations/", headers=auth_headers(new_user))
            self.assertEqual(r.status_code, 200, r.text)
            orgs = r.json()
            org_ids = [o["id"] for o in orgs]
            self.assertIn(
                str(self.org.id),
                org_ids,
                "Invited organization must appear in /organizations after acceptance",
            )
            self.assertGreaterEqual(len(orgs), 1, "Must have at least 1 organization")
        finally:
            self._teardown()


if __name__ == "__main__":
    unittest.main()
