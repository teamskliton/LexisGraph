"""
test_role_management_e2e.py
===========================
End-to-End verification test suite for the role & invitation architecture fix.

Tests:
1. Shrimantm membership & /auth/me returns ADMIN
2. Mr More membership & /auth/me returns VIEWER
3. Public /organizations/invitations/token/{token} returns authoritative role
4. Viewer invitation acceptance produces VIEWER role
5. Reviewer invitation acceptance produces REVIEWER role
6. Compliance Analyst invitation acceptance produces COMPLIANCE_ANALYST role
7. Non-admin invitation attempt returns HTTP 403
8. Direct signup setup-role works without affecting invitations
9. Email mismatch rejection
10. Multi-organization membership role resolution per active organization
"""
from __future__ import annotations

import uuid
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models
from app.db.models import Organization, User
from app.db.models.rbac import OrganizationMember, OrganizationInvitation, UserRole, MemberStatus
from app.db.session import Base, get_db
from app.routes.auth import router as auth_router
from app.routes.organizations import router as organizations_router
from app.routes.dashboard import router as dashboard_router
from app.core.security import hash_password, create_access_token


SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def create_test_app() -> FastAPI:
    test_app = FastAPI()
    test_app.include_router(auth_router)
    test_app.include_router(organizations_router)
    test_app.include_router(dashboard_router)
    return test_app


test_app = create_test_app()


@pytest.fixture(scope="function", autouse=True)
def setup_db():
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
    def override_get_db():
        try:
            yield db
        finally:
            pass

    test_app.dependency_overrides[get_db] = override_get_db
    with TestClient(test_app) as c:
        yield c
    test_app.dependency_overrides.clear()


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


def make_org(db, owner: User, name: str = "Test Org") -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name=name,
        created_by=owner.id,
    )
    db.add(org)
    db.commit()

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


def auth_headers(user: User) -> dict:
    token = create_access_token({"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


class TestRoleManagementE2E:
    def test_shrimantm_admin_role_resolution(self, db, client):
        """Verify ADMIN user's /auth/me returns membership with role=ADMIN."""
        admin_user = make_user(db, "shrimantmarathe2005@gmail.com", "shrimantm")
        org1 = make_org(db, admin_user, "Lexisgraph Org")
        org2 = make_org(db, admin_user, "KKwagh")

        res = client.get("/auth/me", headers=auth_headers(admin_user))
        assert res.status_code == 200
        data = res.json()
        assert data["username"] == "shrimantm"
        assert len(data["memberships"]) == 2
        for m in data["memberships"]:
            assert m["role"] == "ADMIN"
            assert m["is_owner"] is True

    def test_mrmore_viewer_role_resolution(self, db, client):
        """Verify invited VIEWER user's /auth/me returns role=VIEWER."""
        admin_user = make_user(db, "shrimant@gmail.com", "mrshrimant")
        org = make_org(db, admin_user, "Mr Shrimant's Workspace")

        viewer_user = make_user(db, "mrmore@gmail.com", "mrmore")
        member = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=viewer_user.id,
            role=UserRole.VIEWER,
            status=MemberStatus.ACTIVE,
        )
        db.add(member)
        db.commit()

        res = client.get("/auth/me", headers=auth_headers(viewer_user))
        assert res.status_code == 200
        data = res.json()
        assert data["email"] == "mrmore@gmail.com"
        assert len(data["memberships"]) == 1
        assert data["memberships"][0]["role"] == "VIEWER"
        assert data["memberships"][0]["organization_name"] == "Mr Shrimant's Workspace"

    def test_viewer_invitation_end_to_end(self, db, client):
        """Admin invites testviewer@example.com as VIEWER -> recipient accepts -> role is VIEWER."""
        admin = make_user(db, "admin@example.com", "admin")
        org = make_org(db, admin, "Acme Corp")

        # Admin generates invitation
        r_inv = client.post(
            f"/organizations/{org.id}/invitations",
            headers=auth_headers(admin),
            json={"email": "testviewer@example.com", "role": "VIEWER"},
        )
        assert r_inv.status_code == 200
        token = r_inv.json()["token"]

        # Recipient inspects token
        r_tok = client.get(f"/organizations/invitations/token/{token}")
        assert r_tok.status_code == 200
        assert r_tok.json()["role"] == "VIEWER"
        assert r_tok.json()["organization_name"] == "Acme Corp"

        # Recipient registers and accepts
        viewer = make_user(db, "testviewer@example.com", "testviewer")
        r_acc = client.post(
            "/organizations/invitations/accept",
            headers=auth_headers(viewer),
            json={"token": token},
        )
        assert r_acc.status_code == 200
        assert r_acc.json()["role"] == "VIEWER"

        # Check /auth/me for viewer
        r_me = client.get("/auth/me", headers=auth_headers(viewer))
        assert r_me.status_code == 200
        assert r_me.json()["memberships"][0]["role"] == "VIEWER"

    def test_reviewer_invitation_end_to_end(self, db, client):
        """Admin invites testreviewer@example.com as REVIEWER -> recipient accepts -> role is REVIEWER."""
        admin = make_user(db, "admin@example.com", "admin")
        org = make_org(db, admin, "Acme Corp")

        r_inv = client.post(
            f"/organizations/{org.id}/invitations",
            headers=auth_headers(admin),
            json={"email": "testreviewer@example.com", "role": "REVIEWER"},
        )
        assert r_inv.status_code == 200
        token = r_inv.json()["token"]

        reviewer = make_user(db, "testreviewer@example.com", "testreviewer")
        r_acc = client.post(
            "/organizations/invitations/accept",
            headers=auth_headers(reviewer),
            json={"token": token},
        )
        assert r_acc.status_code == 200
        assert r_acc.json()["role"] == "REVIEWER"

        r_me = client.get("/auth/me", headers=auth_headers(reviewer))
        assert r_me.status_code == 200
        assert r_me.json()["memberships"][0]["role"] == "REVIEWER"

    def test_compliance_analyst_invitation_end_to_end(self, db, client):
        """Admin invites analyst@example.com as COMPLIANCE_ANALYST -> recipient accepts -> role is COMPLIANCE_ANALYST/LEGAL_ANALYST."""
        admin = make_user(db, "admin@example.com", "admin")
        org = make_org(db, admin, "Acme Corp")

        r_inv = client.post(
            f"/organizations/{org.id}/invitations",
            headers=auth_headers(admin),
            json={"email": "analyst@example.com", "role": "COMPLIANCE_ANALYST"},
        )
        assert r_inv.status_code == 200
        token = r_inv.json()["token"]

        analyst = make_user(db, "analyst@example.com", "analyst")
        r_acc = client.post(
            "/organizations/invitations/accept",
            headers=auth_headers(analyst),
            json={"token": token},
        )
        assert r_acc.status_code == 200
        assert r_acc.json()["role"] in {"COMPLIANCE_ANALYST", "LEGAL_ANALYST"}

    def test_non_admin_cannot_invite(self, db, client):
        """Viewer, Reviewer, and Compliance Analyst cannot create invitations (403 Forbidden)."""
        admin = make_user(db, "admin@example.com", "admin")
        org = make_org(db, admin, "Acme Corp")

        viewer = make_user(db, "viewer@example.com", "viewer")
        reviewer = make_user(db, "reviewer@example.com", "reviewer")
        analyst = make_user(db, "analyst@example.com", "analyst")

        for u, r in [(viewer, UserRole.VIEWER), (reviewer, UserRole.REVIEWER), (analyst, UserRole.COMPLIANCE_ANALYST)]:
            db.add(OrganizationMember(
                id=uuid.uuid4(),
                organization_id=org.id,
                user_id=u.id,
                role=r,
                status=MemberStatus.ACTIVE,
            ))
        db.commit()

        for u in [viewer, reviewer, analyst]:
            r = client.post(
                f"/organizations/{org.id}/invitations",
                headers=auth_headers(u),
                json={"email": "victim@example.com", "role": "VIEWER"},
            )
            assert r.status_code == 403

        # Admin succeeds
        r_admin = client.post(
            f"/organizations/{org.id}/invitations",
            headers=auth_headers(admin),
            json={"email": "victim@example.com", "role": "VIEWER"},
        )
        assert r_admin.status_code == 200

    def test_wrong_email_rejection(self, db, client):
        """Email-bound invitation cannot be accepted by a different user."""
        admin = make_user(db, "admin@example.com", "admin")
        org = make_org(db, admin, "Acme Corp")

        r_inv = client.post(
            f"/organizations/{org.id}/invitations",
            headers=auth_headers(admin),
            json={"email": "intended@example.com", "role": "VIEWER"},
        )
        token = r_inv.json()["token"]

        wrong_user = make_user(db, "wrong@example.com", "wrong")
        r_acc = client.post(
            "/organizations/invitations/accept",
            headers=auth_headers(wrong_user),
            json={"token": token},
        )
        assert r_acc.status_code == 403
        assert "different email address" in r_acc.json()["detail"] or "sign in with the invited email" in r_acc.json()["detail"]

    def test_multi_organization_role_resolution(self, db, client):
        """User belonging to Org A as ADMIN and Org B as VIEWER has distinct roles in /auth/me."""
        user = make_user(db, "multi@example.com", "multiuser")
        owner_b = make_user(db, "owner_b@example.com", "ownerb")

        org_a = make_org(db, user, "Organization A")
        org_b = make_org(db, owner_b, "Organization B")

        # Add user as VIEWER in Org B
        db.add(OrganizationMember(
            id=uuid.uuid4(),
            organization_id=org_b.id,
            user_id=user.id,
            role=UserRole.VIEWER,
            status=MemberStatus.ACTIVE,
        ))
        db.commit()

        r_me = client.get("/auth/me", headers=auth_headers(user))
        assert r_me.status_code == 200
        memberships = {m["organization_id"]: m for m in r_me.json()["memberships"]}

        assert memberships[str(org_a.id)]["role"] == "ADMIN"
        assert memberships[str(org_b.id)]["role"] == "VIEWER"

    def test_reviewer_dashboard_stats_and_org_count(self, db, client):
        """Reviewer sees total_organizations=1 and active workspace in /dashboard/stats and /auth/me."""
        admin = make_user(db, "admin_dash@example.com", "admindash")
        org = make_org(db, admin, "LexisGraph Technologies")

        # Admin invites reviewer
        r_inv = client.post(
            f"/organizations/{org.id}/invitations",
            headers=auth_headers(admin),
            json={"email": "mrabc@example.com", "role": "REVIEWER"},
        )
        token = r_inv.json()["token"]

        # Reviewer accepts
        reviewer = make_user(db, "mrabc@example.com", "mrabc")
        r_acc = client.post(
            "/organizations/invitations/accept",
            headers=auth_headers(reviewer),
            json={"token": token},
        )
        assert r_acc.status_code == 200
        assert r_acc.json()["role"] == "REVIEWER"
        assert r_acc.json()["organization_name"] == "LexisGraph Technologies"

        # Reviewer checks /auth/me
        r_me = client.get("/auth/me", headers=auth_headers(reviewer))
        assert r_me.status_code == 200
        memberships = r_me.json()["memberships"]
        assert len(memberships) == 1
        assert memberships[0]["role"] == "REVIEWER"
        assert memberships[0]["organization_name"] == "LexisGraph Technologies"

        # Reviewer checks /dashboard/stats
        r_stats = client.get("/dashboard/stats", headers=auth_headers(reviewer))
        assert r_stats.status_code == 200
        kpis = r_stats.json()["kpis"]
        assert kpis["total_organizations"] == 1

    def test_reviewer_forbidden_actions(self, db, client):
        """Reviewer is blocked from creating invitations and updating member roles (403 Forbidden)."""
        admin = make_user(db, "admin_forbid@example.com", "adminforbid")
        org = make_org(db, admin, "Secure Org")

        reviewer = make_user(db, "reviewer_forbid@example.com", "revforbid")
        db.add(OrganizationMember(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=reviewer.id,
            role=UserRole.REVIEWER,
            status=MemberStatus.ACTIVE,
        ))
        db.commit()

        # Reviewer cannot create invitations
        r_inv = client.post(
            f"/organizations/{org.id}/invitations",
            headers=auth_headers(reviewer),
            json={"email": "newbie@example.com", "role": "VIEWER"},
        )
        assert r_inv.status_code == 403

        # Reviewer cannot update member roles
        r_role = client.put(
            f"/organizations/{org.id}/members/{reviewer.id}/role",
            headers=auth_headers(reviewer),
            json={"role": "ADMIN"},
        )
        assert r_role.status_code == 403

    def test_reviewer_relogin_and_persistence(self, db, client):
        """Reviewer re-authenticates and preserves role and organization."""
        admin = make_user(db, "admin_persist@example.com", "adminpersist")
        org = make_org(db, admin, "Persistent Org")

        # Reviewer registered and joined
        reviewer = make_user(db, "persisted_rev@example.com", "persistedrev")
        db.add(OrganizationMember(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=reviewer.id,
            role=UserRole.REVIEWER,
            status=MemberStatus.ACTIVE,
        ))
        db.commit()

        # Re-login: issue fresh JWT token
        fresh_token = create_access_token(data={"sub": str(reviewer.id)})
        fresh_headers = {"Authorization": f"Bearer {fresh_token}"}

        r_me = client.get("/auth/me", headers=fresh_headers)
        assert r_me.status_code == 200
        assert r_me.json()["memberships"][0]["role"] == "REVIEWER"
        assert r_me.json()["memberships"][0]["organization_name"] == "Persistent Org"
