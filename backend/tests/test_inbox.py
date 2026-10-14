"""
Comprehensive tests for LexisGraph Action Inbox & Preferences.
"""
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.core.dependencies import get_current_user
from app.db.session import Base, get_db
from app.db.models import User, Organization
from app.db.models.inbox import InboxItem
from app.db.models.rbac import OrganizationMember, MemberStatus, UserRole
from app.main import create_app
from app.services.inbox_service import (
    create_or_update_inbox_item,
    reassign_inbox_task,
    resolve_inbox_items_for_entity,
)

TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session(setup_db):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def test_inbox_lifecycle_and_multitenancy(db_session):
    # Setup two users and two organizations
    user_a = User(id=uuid.uuid4(), email="user_a@technova.com", username="rahul", full_name="Rahul Mehta", hashed_password="pw")
    user_b = User(id=uuid.uuid4(), email="user_b@technova.com", username="priya", full_name="Priya Nair", hashed_password="pw")
    org_1 = Organization(id=uuid.uuid4(), name="TechNova", created_by=user_a.id)
    org_2 = Organization(id=uuid.uuid4(), name="ABC Corp", created_by=user_b.id)

    db_session.add_all([user_a, user_b, org_1, org_2])
    db_session.flush()

    mem_a1 = OrganizationMember(
        id=uuid.uuid4(), organization_id=org_1.id, user_id=user_a.id, role=UserRole.ADMIN, status=MemberStatus.ACTIVE
    )
    mem_b1 = OrganizationMember(
        id=uuid.uuid4(), organization_id=org_1.id, user_id=user_b.id, role=UserRole.REVIEWER, status=MemberStatus.ACTIVE
    )
    mem_b2 = OrganizationMember(
        id=uuid.uuid4(), organization_id=org_2.id, user_id=user_b.id, role=UserRole.ADMIN, status=MemberStatus.ACTIVE
    )
    db_session.add_all([mem_a1, mem_b1, mem_b2])
    db_session.commit()

    finding_id = uuid.uuid4()

    # 1. Create an actionable item for user_b in org_1
    item = create_or_update_inbox_item(
        db_session,
        organization_id=org_1.id,
        recipient_id=user_b.id,
        entity_type="FINDING",
        entity_id=finding_id,
        action_type="REMEDIATION_REQUIRED",
        priority="HIGH",
        title="Remediate Safety Finding",
        description="Assigned by Rahul",
    )
    db_session.commit()

    assert item is not None
    assert item.status == "PENDING"
    assert item.is_read is False

    # 2. Test reassigning to user_a: user_b's pending item is dismissed, user_a gets a new task
    new_task = reassign_inbox_task(
        db_session,
        organization_id=org_1.id,
        entity_id=finding_id,
        old_assignee_id=user_b.id,
        new_assignee_id=user_a.id,
        action_type="REMEDIATION_REQUIRED",
        priority="HIGH",
        title="Remediate Safety Finding",
        description="Reassigned to Rahul",
    )
    db_session.commit()

    # Verify old item dismissed
    db_session.refresh(item)
    assert item.status == "DISMISSED"
    assert new_task.recipient_user_id == user_a.id
    assert new_task.status == "PENDING"

    # 3. Test resolution of finding closes pending tasks
    resolved_count = resolve_inbox_items_for_entity(
        db_session,
        organization_id=org_1.id,
        entity_id=finding_id,
    )
    db_session.commit()
    assert resolved_count >= 1

    db_session.refresh(new_task)
    assert new_task.status == "COMPLETED"


def test_inbox_api_routes(db_session):
    app = create_app()

    user = User(id=uuid.uuid4(), email="architect@lexisgraph.ai", username="architect", full_name="Compliance Architect", hashed_password="pw")
    org = Organization(id=uuid.uuid4(), name="LexisCorp", created_by=user.id)
    db_session.add_all([user, org])
    db_session.commit()

    mem = OrganizationMember(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id, role=UserRole.ADMIN, status=MemberStatus.ACTIVE
    )
    db_session.add(mem)
    db_session.commit()

    # Override get_current_user and get_db
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db_session

    client = TestClient(app)

    # Create task
    task = InboxItem(
        id=uuid.uuid4(),
        organization_id=org.id,
        recipient_user_id=user.id,
        entity_type="FINDING",
        entity_id=uuid.uuid4(),
        action_type="REVIEW_REQUESTED",
        priority="CRITICAL",
        status="PENDING",
        title="Approve Data Retention Review",
        description="Reviewer requested administrator approval",
        is_read=False,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(task)
    db_session.commit()

    # 1. Test GET /inbox
    res = client.get(f"/inbox?organization_id={org.id}&tab=needs_action")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    assert data[0]["title"] == "Approve Data Retention Review"

    # 2. Test GET /inbox/counts
    res_count = client.get(f"/inbox/counts?organization_id={org.id}")
    assert res_count.status_code == 200
    counts = res_count.json()
    assert counts["action_required_count"] >= 1
    assert counts["total_pending_count"] >= 1

    # 3. Test PATCH /inbox/{id}/complete
    res_comp = client.patch(f"/inbox/{task.id}/complete")
    assert res_comp.status_code == 200
    assert res_comp.json()["status"] == "COMPLETED"

    # 4. Test GET & PUT /inbox/preferences
    res_pref = client.get(f"/inbox/preferences?organization_id={org.id}")
    assert res_pref.status_code == 200
    pref_data = res_pref.json()
    assert pref_data["finding_assignments_in_app"] is True

    res_put = client.put(
        f"/inbox/preferences?organization_id={org.id}",
        json={"finding_assignments_email": False, "analysis_results_email": True},
    )
    assert res_put.status_code == 200
    assert res_put.json()["finding_assignments_email"] is False
    assert res_put.json()["analysis_results_email"] is True
