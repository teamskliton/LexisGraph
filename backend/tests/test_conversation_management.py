"""
Unit tests for Persistent Conversation Management, Pinning, Archiving, Duplication, and Export.
"""
import unittest
import uuid

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.core.dependencies import get_current_user, get_db
from app.db.models import Organization, User
from app.db.session import Base
from app.main import create_app
from app.services.memory_service import save_message_pair


class ConversationManagementTest(unittest.TestCase):
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
            email="management_user@example.com",
            username="mgmt_user",
            full_name="Management User",
            hashed_password="pw",
        )
        self.org = Organization(
            id=uuid.uuid4(),
            name="Management Org",
            created_by=self.user.id,
        )
        self.db.add_all([self.user, self.org])
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
        self.db.query(Organization).delete()
        self.db.query(User).delete()
        self.db.commit()
        self.db.close()

    def test_create_conversation_endpoint(self):
        response = self.client.post(
            "/chat/conversations",
            json={
                "title": "Custom Legal Thread",
                "organization_id": str(self.org.id),
            },
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["title"], "Custom Legal Thread")
        self.assertFalse(data["is_pinned"])
        self.assertFalse(data["is_archived"])

    def test_patch_pin_rename_archive_conversation(self):
        # Create initial thread
        create_res = self.client.post(
            "/chat/conversations",
            json={"title": "Original Title"},
        )
        conv_id = create_res.json()["id"]

        # Rename & Pin
        patch_res = self.client.patch(
            f"/chat/conversations/{conv_id}",
            json={
                "title": "Renamed Compliance Thread",
                "is_pinned": True,
            },
        )
        self.assertEqual(patch_res.status_code, 200)
        p_data = patch_res.json()
        self.assertEqual(p_data["title"], "Renamed Compliance Thread")
        self.assertTrue(p_data["is_pinned"])

        # List conversations to check search & pinned ordering
        list_res = self.client.get("/chat/conversations?search=Renamed")
        self.assertEqual(list_res.status_code, 200)
        items = list_res.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], conv_id)
        self.assertTrue(items[0]["is_pinned"])

    def test_duplicate_and_export_conversation(self):
        # Create thread and save messages
        create_res = self.client.post(
            "/chat/conversations",
            json={"title": "POSH Analysis"},
        )
        conv_id = uuid.UUID(create_res.json()["id"])
        save_message_pair(
            self.db,
            conversation_id=conv_id,
            user_message="What are POSH complaint rules?",
            assistant_message="Complaints must be filed within 3 months.",
            sources=[{"document": "POSH Act", "section": "Section 9", "clause": "Sample clause", "confidence_score": 0.9}],
        )

        # Duplicate
        dup_res = self.client.post(f"/chat/conversations/{conv_id}/duplicate")
        self.assertEqual(dup_res.status_code, 201)
        dup_data = dup_res.json()
        self.assertIn("(Copy)", dup_data["title"])
        self.assertEqual(len(dup_data["messages"]), 2)

        # Export Markdown
        export_res = self.client.get(f"/chat/conversations/{conv_id}/export?format=markdown")
        self.assertEqual(export_res.status_code, 200)
        self.assertIn("POSH Analysis", export_res.text)
        self.assertIn("Complaints must be filed", export_res.text)

    def test_soft_and_hard_delete_conversation(self):
        create_res = self.client.post(
            "/chat/conversations",
            json={"title": "To Delete Thread"},
        )
        conv_id = create_res.json()["id"]

        # Soft delete (archive)
        del_res = self.client.delete(f"/chat/conversations/{conv_id}?soft=true")
        self.assertEqual(del_res.status_code, 200)

        # Verify not listed by default
        list_res = self.client.get("/chat/conversations")
        ids = [c["id"] for c in list_res.json()]
        self.assertNotIn(conv_id, ids)

        # Listed when include_archived=true
        arch_res = self.client.get("/chat/conversations?include_archived=true")
        ids_arch = [c["id"] for c in arch_res.json()]
        self.assertIn(conv_id, ids_arch)


if __name__ == "__main__":
    unittest.main()
