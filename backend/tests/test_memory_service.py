"""
Unit tests for Persistent Conversation Memory and Chat API endpoints.
"""
import unittest
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.core.dependencies import get_current_user, get_db
from app.db.models import ConversationMessage, ConversationSession, Organization, User
from app.db.session import Base
from app.routes.chat import router as chat_router
from app.services.memory_service import (
    delete_conversation,
    generate_conversation_title,
    get_conversation_detail,
    get_or_create_session,
    get_recent_history,
    list_user_conversations,
    save_message_pair,
)


class MemoryServiceTest(unittest.TestCase):
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
        self.org = Organization(
            id=uuid.uuid4(),
            name="Test Org",
            created_by=self.user1.id,
        )
        self.db.add_all([self.user1, self.user2, self.org])
        self.db.commit()

    def tearDown(self):
        self.db.query(ConversationMessage).delete()
        self.db.query(ConversationSession).delete()
        self.db.query(Organization).delete()
        self.db.query(User).delete()
        self.db.commit()
        self.db.close()

    def test_generate_conversation_title(self):
        t1 = generate_conversation_title("What are the regulations under Code of Wages?")
        self.assertEqual(t1, "Code of Wages Discussion")

        t2 = generate_conversation_title("Explain POSH compliance guidelines")
        self.assertEqual(t2, "POSH Compliance Review")

        t3 = generate_conversation_title("What is the general standard for data retention?")
        self.assertEqual(t3, "Data Retention & Protection Review")

        t4 = generate_conversation_title("Random custom question text here")
        self.assertTrue(len(t4) > 0)

    def test_create_session_and_save_messages(self):
        session = get_or_create_session(
            self.db,
            user_id=self.user1.id,
            organization_id=self.org.id,
            conversation_id=None,
            first_question="What are Code of Wages overtime rules?",
        )
        self.assertIsNotNone(session.id)
        self.assertEqual(session.title, "Code of Wages Discussion")

        # Save 6 message pairs (12 total messages)
        for i in range(1, 7):
            save_message_pair(
                self.db,
                conversation_id=session.id,
                user_message=f"Question {i}",
                assistant_message=f"Answer {i}",
            )

        # Get recent history bounded to 10
        history = get_recent_history(self.db, session.id, limit=10)
        self.assertEqual(len(history), 10)
        # Verify chronological order (Question 2 to Answer 6)
        self.assertEqual(history[0].message, "Question 2")
        self.assertEqual(history[-1].message, "Answer 6")

        # Test listing conversations for user1
        conversations = list_user_conversations(self.db, user_id=self.user1.id)
        self.assertEqual(len(conversations), 1)
        self.assertEqual(conversations[0].title, "Code of Wages Discussion")
        self.assertEqual(conversations[0].message_count, 12)

    def test_user_isolation(self):
        session = get_or_create_session(
            self.db,
            user_id=self.user1.id,
            organization_id=self.org.id,
            first_question="User 1 private chat",
        )

        # User 2 attempting to access User 1's conversation should be blocked
        with self.assertRaises(Exception):
            get_or_create_session(
                self.db,
                user_id=self.user2.id,
                organization_id=self.org.id,
                conversation_id=str(session.id),
            )

        # User 2 list should be empty
        user2_convs = list_user_conversations(self.db, user_id=self.user2.id)
        self.assertEqual(len(user2_convs), 0)

    def test_conversation_api_endpoints(self):
        app = FastAPI()
        app.include_router(chat_router)

        def _override_db():
            yield self.db

        def _override_user():
            return self.user1

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[get_current_user] = _override_user

        session = get_or_create_session(
            self.db,
            user_id=self.user1.id,
            organization_id=self.org.id,
            first_question="POSH compliance questions",
        )
        save_message_pair(
            self.db,
            conversation_id=session.id,
            user_message="Explain POSH committee requirements",
            assistant_message="POSH requires an Internal Complaints Committee.",
            sources=[{"document": "POSH Act", "clause": "Section 4", "confidence_score": 0.95, "search_source": "Both"}],
        )

        client = TestClient(app)

        # 1. GET /chat/conversations
        res_list = client.get("/chat/conversations")
        self.assertEqual(res_list.status_code, 200)
        data_list = res_list.json()
        self.assertEqual(len(data_list), 1)
        self.assertEqual(data_list[0]["title"], "POSH Compliance Review")
        self.assertEqual(data_list[0]["message_count"], 2)

        # 2. GET /chat/conversations/{id}
        res_detail = client.get(f"/chat/conversations/{session.id}")
        self.assertEqual(res_detail.status_code, 200)
        data_detail = res_detail.json()
        self.assertEqual(len(data_detail["messages"]), 2)
        self.assertEqual(data_detail["messages"][0]["role"], "user")
        self.assertEqual(data_detail["messages"][1]["role"], "assistant")
        self.assertIsNotNone(data_detail["messages"][1]["sources"])

        # 3. DELETE /chat/conversations/{id}
        res_del = client.delete(f"/chat/conversations/{session.id}")
        self.assertEqual(res_del.status_code, 200)
        self.assertEqual(res_del.json()["status"], "success")

        # Verify list is now empty
        res_list2 = client.get("/chat/conversations")
        self.assertEqual(len(res_list2.json()), 0)


if __name__ == "__main__":
    unittest.main()
