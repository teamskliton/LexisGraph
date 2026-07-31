"""
Unit tests for Explainable AI Source Citations, Document Viewer, Clause details, and Knowledge Graph APIs.
"""
import unittest
import uuid
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.core.dependencies import get_current_user, get_db
from app.db.models import Document, DocumentType, Organization, Regulation, User
from app.db.session import Base
from app.main import create_app
from app.schemas.chat import SourceCitation
from app.services.chat_service import _format_source_citations
from app.services.retrieval_orchestrator import RetrievedClause


class ExplainableCitationsTest(unittest.TestCase):
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
            email="citation_user@example.com",
            username="citation_user",
            full_name="Citation User",
            hashed_password="pw",
        )
        self.org = Organization(
            id=uuid.uuid4(),
            name="Citation Org",
            created_by=self.user.id,
        )
        self.doc = Document(
            id=uuid.uuid4(),
            organization_id=self.org.id,
            uploaded_by=self.user.id,
            original_filename="sample_policy.pdf",
            stored_filename="stored_policy.pdf",
            file_path="/tmp/sample_policy.pdf",
            file_size=1024,
            mime_type="application/pdf",
            checksum="checksum123",
            document_type=DocumentType.POLICY,
        )
        self.db.add_all([self.user, self.org, self.doc])
        self.db.commit()

        self.app = create_app()

        def _override_db():
            yield self.db

        def _override_user():
            return self.user

        self.app.dependency_overrides[get_db] = _override_db
        self.app.dependency_overrides[get_current_user] = _override_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.db.query(Document).delete()
        self.db.query(Organization).delete()
        self.db.query(User).delete()
        self.db.commit()
        self.db.close()

    def test_get_document_metadata(self):
        response = self.client.get(f"/documents/{self.doc.id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["id"], str(self.doc.id))
        self.assertEqual(data["original_filename"], "sample_policy.pdf")

    def test_get_document_viewer(self):
        response = self.client.get(f"/documents/{self.doc.id}/viewer")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["document_id"], str(self.doc.id))
        self.assertEqual(data["title"], "sample_policy.pdf")
        self.assertIn("pdf_url", data)
        self.assertIn("highlight_coordinates", data)

    def test_get_clause_detail(self):
        clause_uuid = str(uuid.uuid4())
        response = self.client.get(f"/clauses/{clause_uuid}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["clause_id"], clause_uuid)
        self.assertIn("section", data)
        self.assertIn("text", data)

    @patch("app.routes.graph.to_thread")
    def test_get_graph_clause(self, mock_to_thread):
        mock_to_thread.return_value = {
            "clause_id": "c-101",
            "neighbors": [{"id": "c-102", "label": "Minimum Wages"}],
            "entities": [{"id": "e-1", "name": "Labour Ministry", "type": "AUTHORITY"}],
        }
        response = self.client.get("/graph/clause/c-101")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["clause_id"], "c-101")
        self.assertEqual(len(data["neighbors"]), 1)

    def test_format_rich_source_citations(self):
        clause = RetrievedClause(
            clause_id="clause-555",
            text="Employees shall be granted 15 days paid annual leave.",
            score=0.94,
            source="hybrid",
            title="Leave Policy Act",
        )
        setattr(clause, "document_id", "doc-555")
        setattr(clause, "section", "Section 12")
        setattr(clause, "page_number", 14)
        setattr(clause, "document_type", "Policy")

        citations = _format_source_citations([clause])
        self.assertEqual(len(citations), 1)
        cit = citations[0]
        self.assertIsInstance(cit, SourceCitation)
        self.assertEqual(cit.document, "Leave Policy Act")
        self.assertEqual(cit.clause_id, "clause-555")
        self.assertEqual(cit.document_id, "doc-555")
        self.assertEqual(cit.section, "Section 12")
        self.assertEqual(cit.page, 14)
        self.assertEqual(cit.similarity, 0.94)
        self.assertEqual(cit.type, "Policy")
        self.assertEqual(cit.search_source, "Both")


if __name__ == "__main__":
    unittest.main()
