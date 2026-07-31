"""
Unit tests for Real-Time Streaming AI Assistant endpoint (POST /chat/stream).
"""
import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.core.dependencies import get_current_user, get_db
from app.db.models import Organization, User
from app.db.session import Base
from app.routes.chat import router as chat_router
from app.services.retrieval_orchestrator import RetrievalContext, RetrievedClause


class ChatStreamTest(unittest.TestCase):
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
        self.user = User(
            id=uuid.uuid4(),
            email="streamer@example.com",
            username="streamer",
            full_name="Stream User",
            hashed_password="pw",
        )
        self.org = Organization(
            id=uuid.uuid4(),
            name="Stream Org",
            created_by=self.user.id,
        )
        self.db.add_all([self.user, self.org])
        self.db.commit()

        self.app = FastAPI()
        self.app.include_router(chat_router)

        def _override_db():
            yield self.db

        def _override_user():
            return self.user

        self.app.dependency_overrides[get_db] = _override_db
        self.app.dependency_overrides[get_current_user] = _override_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.db.query(Organization).delete()
        self.db.query(User).delete()
        self.db.commit()
        self.db.close()

    @patch("app.services.chat_service.log_activity")
    @patch("app.services.chat_service._stream_resolve_reasoning")
    @patch("app.services.chat_service.retrieve_context")
    def test_chat_stream_success(self, mock_retrieve, mock_stream_resolve, mock_log):
        clause = RetrievedClause(
            clause_id="clause-202",
            text="Overtime pay rate is 2x basic wage.",
            score=0.91,
            source="hybrid",
            title="Code of Wages Act",
        )
        mock_context = RetrievalContext(
            organization_id=str(self.org.id),
            question="What is the overtime rate?",
            total_clauses=1,
            clauses=[clause],
            formatted_prompt_context="Code of Wages clause info",
        )
        mock_retrieve.return_value = mock_context
        mock_stream_resolve.return_value = ["Overtime ", "pay ", "rate ", "is ", "2x."]

        response = self.client.post(
            "/chat/stream",
            json={
                "question": "What is the overtime rate?",
                "organization_id": str(self.org.id),
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("text/event-stream", response.headers["content-type"])
        body = response.text

        self.assertIn("event: token", body)
        self.assertIn("event: sources", body)
        self.assertIn("event: done", body)
        self.assertIn("Overtime ", body)
        self.assertIn("Code of Wages Act", body)

    @patch("app.services.chat_service.log_activity")
    @patch("app.services.chat_service.retrieve_context")
    def test_chat_stream_low_evidence(self, mock_retrieve, mock_log):
        mock_context = RetrievalContext(
            organization_id=str(self.org.id),
            question="Unrelated text?",
            total_clauses=0,
            clauses=[],
            formatted_prompt_context="No clauses",
        )
        mock_retrieve.return_value = mock_context

        response = self.client.post(
            "/chat/stream",
            json={
                "question": "Unrelated text?",
                "organization_id": str(self.org.id),
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.text
        self.assertIn("event: token", body)
        self.assertIn("I couldn't find sufficient evidence", body)
        self.assertIn("event: done", body)


if __name__ == "__main__":
    unittest.main()
