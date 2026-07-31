"""
Unit tests for AI Legal Assistant chat service and endpoints.
"""
import unittest
import uuid
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.db.models import Organization, User
from app.schemas.chat import ChatRequest, ChatResponse, SourceCitation
from app.services.chat_service import (
    NO_EVIDENCE_MESSAGE,
    process_chat_request,
)
from app.services.retrieval_orchestrator import RetrievalContext, RetrievedClause


class ChatServiceTest(unittest.TestCase):
    def setUp(self):
        self.user_id = uuid.uuid4()
        self.org_id = uuid.uuid4()
        self.user = User(id=self.user_id, username="testuser", email="test@example.com")
        self.org = Organization(id=self.org_id, name="Test Legal Org", created_by=self.user_id)

    def test_chat_request_schema_validation(self):
        req = ChatRequest(
            question="What is the retention period?",
            organization_id=self.org_id,
            conversation_id="conv-123",
        )
        self.assertEqual(req.question, "What is the retention period?")
        self.assertEqual(req.organization_id, self.org_id)
        self.assertEqual(req.conversation_id, "conv-123")

    @patch("app.services.chat_service.log_activity")
    @patch("app.services.chat_service._resolve_reasoning")
    @patch("app.services.chat_service.retrieve_context")
    def test_process_chat_request_success(
        self,
        mock_retrieve,
        mock_resolve,
        mock_log,
    ):
        db = MagicMock()
        def _mock_get(model_cls, entity_id):
            if model_cls == Organization:
                return self.org
            return None
        db.get.side_effect = _mock_get

        clause = RetrievedClause(
            clause_id="clause-101",
            text="Data retention period is 7 years.",
            score=0.92,
            source="hybrid",
            title="Data Governance Policy",
            graph_neighbors=["Related clause text"],
        )
        mock_context = RetrievalContext(
            organization_id=str(self.org_id),
            question="What is the retention period?",
            total_clauses=1,
            clauses=[clause],
            formatted_prompt_context="Formatted context snippet",
        )
        mock_retrieve.return_value = mock_context
        mock_resolve.return_value = "According to the Data Governance Policy, the data retention period is 7 years."

        payload = ChatRequest(
            question="What is the retention period?",
            organization_id=self.org_id,
            conversation_id="conv-spec-1",
        )

        response = process_chat_request(db, self.user, payload)

        self.assertIsInstance(response, ChatResponse)
        self.assertEqual(
            response.answer,
            "According to the Data Governance Policy, the data retention period is 7 years.",
        )
        self.assertTrue(len(response.conversation_id) > 0)
        self.assertEqual(len(response.sources), 1)
        self.assertEqual(response.sources[0].document, "Data Governance Policy")
        self.assertEqual(response.sources[0].clause_number, "clause-101")
        self.assertEqual(response.sources[0].search_source, "Both")

    @patch("app.services.chat_service.log_activity")
    @patch("app.services.chat_service.retrieve_context")
    def test_process_chat_request_low_evidence_fallback(
        self,
        mock_retrieve,
        mock_log,
    ):
        db = MagicMock()
        def _mock_get(model_cls, entity_id):
            if model_cls == Organization:
                return self.org
            return None
        db.get.side_effect = _mock_get

        mock_context = RetrievalContext(
            organization_id=str(self.org_id),
            question="Unknown question?",
            total_clauses=0,
            clauses=[],
            formatted_prompt_context="No relevant legal clauses found.",
        )
        mock_retrieve.return_value = mock_context

        payload = ChatRequest(
            question="Unknown question?",
            organization_id=self.org_id,
        )

        response = process_chat_request(db, self.user, payload)

        self.assertEqual(response.answer, NO_EVIDENCE_MESSAGE)
        self.assertEqual(response.sources, [])
        self.assertTrue(len(response.conversation_id) > 0)

    def test_process_chat_request_org_not_found(self):
        db = MagicMock()
        db.get.return_value = None

        payload = ChatRequest(
            question="What is the retention period?",
            organization_id=self.org_id,
        )

        with self.assertRaises(HTTPException) as ctx:
            process_chat_request(db, self.user, payload)

        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
