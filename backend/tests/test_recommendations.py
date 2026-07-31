"""
Unit tests for Contextual Follow-up Questions, Recommended Legal Actions, and Related Documents.
"""
import unittest
import uuid
from unittest.mock import MagicMock, patch

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
from app.schemas.chat import ChatResponse, RecommendedAction, RelatedDocument
from app.services.chat_service import _extract_recommendations_and_clean_answer
from app.services.retrieval_orchestrator import RetrievalContext, RetrievedClause


class RecommendationsTest(unittest.TestCase):
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
            email="recommender@example.com",
            username="recommender",
            full_name="Recommender User",
            hashed_password="pw",
        )
        self.org = Organization(
            id=uuid.uuid4(),
            name="Recommendation Org",
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

    def test_extract_recommendations_and_clean_answer(self):
        raw_output = (
            "Employers must pay wages on time within 7 days.\n\n"
            "--- RECOMMENDATIONS_JSON ---\n"
            '{\n  "follow_up_questions": ["What penalties apply?", "Show related labour regulations?", "Compare with our Wage Policy"],\n'
            '  "recommended_actions": [{"type": "compare_policy", "title": "Run Compliance Check", "description": "Compare policy."}]\n}'
        )
        clause = RetrievedClause(
            clause_id="clause-100",
            text="Wage payment deadline clause.",
            score=0.92,
            source="hybrid",
            title="Code of Wages Act 2019",
        )
        setattr(clause, "document_id", "doc-100")

        clean_ans, follow_ups, actions, related_docs = _extract_recommendations_and_clean_answer(
            raw_output, [clause], None
        )

        self.assertEqual(clean_ans, "Employers must pay wages on time within 7 days.")
        self.assertEqual(len(follow_ups), 3)
        self.assertEqual(follow_ups[0], "What penalties apply?")
        self.assertEqual(len(actions), 1)
        self.assertEqual(actions[0].type, "compare_policy")
        self.assertEqual(len(related_docs), 1)
        self.assertEqual(related_docs[0].title, "Code of Wages Act 2019")

    @patch("app.services.chat_service.log_activity")
    @patch("app.services.chat_service._stream_resolve_reasoning")
    @patch("app.services.chat_service.retrieve_context")
    def test_chat_stream_emits_recommendations_event(
        self, mock_retrieve, mock_stream_resolve, mock_log
    ):
        clause = RetrievedClause(
            clause_id="clause-200",
            text="Minimum wage requirements.",
            score=0.95,
            source="hybrid",
            title="Minimum Wages Act",
        )
        setattr(clause, "document_id", "doc-200")
        mock_context = RetrievalContext(
            organization_id=str(self.org.id),
            question="What is minimum wage?",
            total_clauses=1,
            clauses=[clause],
            formatted_prompt_context="Minimum wage info",
        )
        mock_retrieve.return_value = mock_context
        mock_stream_resolve.return_value = [
            "Minimum wage is 500 per day.\n\n",
            "--- RECOMMENDATIONS_JSON ---\n",
            '{"follow_up_questions": ["What are overtime rules?"], "recommended_actions": []}',
        ]

        response = self.client.post(
            "/chat/stream",
            json={
                "question": "What is minimum wage?",
                "organization_id": str(self.org.id),
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.text
        self.assertIn("event: token", body)
        self.assertIn("event: recommendations", body)
        self.assertIn("event: done", body)
        self.assertIn("What are overtime rules?", body)


if __name__ == "__main__":
    unittest.main()
