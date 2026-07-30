"""
Unit tests for Activity Service and Dashboard integration.
"""
from __future__ import annotations

import unittest
import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.core.dependencies import get_current_user
from app.db.models import User, Activity
from app.db.session import Base, get_db
from app.routes.dashboard import router as dashboard_router
from app.services.activity_service import get_user_activities, log_activity


class ActivityServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.SessionLocal()
        self.user1 = User(
            id=uuid.uuid4(),
            email="user1@example.com",
            username="user1",
            full_name="User One",
            hashed_password="pw",
        )
        self.user2 = User(
            id=uuid.uuid4(),
            email="user2@example.com",
            username="user2",
            full_name="User Two",
            hashed_password="pw",
        )
        self.db.add_all([self.user1, self.user2])
        self.db.commit()

    def tearDown(self):
        self.db.query(Activity).delete()
        self.db.query(User).delete()
        self.db.commit()
        self.db.close()

    def test_log_and_get_user_activities(self):
        # Log activities for user1
        act1 = log_activity(
            self.db,
            user_id=self.user1.id,
            event_type="ORGANIZATION_CREATED",
            title="Created Org",
            description="Org 1",
            icon_type="building",
        )
        act2 = log_activity(
            self.db,
            user_id=self.user1.id,
            event_type="POLICY_UPLOADED",
            title="Uploaded Policy",
            description="Policy 1",
            icon_type="file",
        )
        # Log activity for user2
        log_activity(
            self.db,
            user_id=self.user2.id,
            event_type="AI_CHAT_STARTED",
            title="Chat",
            description="Chat query",
            icon_type="chat",
        )

        self.assertIsNotNone(act1)
        self.assertIsNotNone(act2)

        # Get activities for user1
        user1_activities = get_user_activities(self.db, self.user1.id, limit=20)
        self.assertEqual(len(user1_activities), 2)
        # Newest first
        self.assertEqual(user1_activities[0].event_type, "POLICY_UPLOADED")
        self.assertEqual(user1_activities[1].event_type, "ORGANIZATION_CREATED")

        # Get activities for user2
        user2_activities = get_user_activities(self.db, self.user2.id, limit=20)
        self.assertEqual(len(user2_activities), 1)
        self.assertEqual(user2_activities[0].event_type, "AI_CHAT_STARTED")

    def test_dashboard_stats_returns_activities(self):
        log_activity(
            self.db,
            user_id=self.user1.id,
            event_type="COMPLIANCE_STARTED",
            title="Compliance Check",
            description="Started check",
            icon_type="report",
        )

        app = FastAPI()
        app.include_router(dashboard_router)

        def _override_db():
            yield self.db

        def _override_user():
            return self.user1

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[get_current_user] = _override_user

        client = TestClient(app)
        res = client.get("/dashboard/stats")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("recent_activity", data)
        self.assertEqual(len(data["recent_activity"]), 1)
        self.assertEqual(data["recent_activity"][0]["type"], "COMPLIANCE_STARTED")
        self.assertIn("recent_reports", data)
        self.assertIn("org_scores", data)
        self.assertIn("score_distribution", data)
        self.assertIn("risk_breakdown", data)
        self.assertIn("reports_over_time", data)


if __name__ == "__main__":
    unittest.main()
