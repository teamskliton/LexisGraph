"""
Automated Security Test Suite: AI Assistant Multi-Tenant Data Isolation (P0 Fix).

Validates complete zero-trust tenant isolation across Qdrant, Neo4j, PostgreSQL,
FastAPI routes, conversation memory, caching, and server-side authorization gates.

Includes Mandatory Security Tests:
- Test A: Cross-workspace retrieval isolation (unique secret phrases)
- Test B: Same user, different workspaces
- Test C: Document authorization verification
- Test D: Citation authorization gate
- Test E: Memory & response cache isolation
- Test F: Neo4j multi-hop graph traversal isolation
- Test G: Fallback retrieval isolation
- Test H: Revoked workspace membership access denial
- Test I: Conversation ID manipulation prevention
- Test J: Missing / untrusted ownership metadata quarantine
- Test K: Deterministic no-evidence response without metadata leakage
- Test L: Concurrent workspace switching isolation
"""
from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from fastapi import FastAPI, status
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models  # noqa: F401
from app.core.dependencies import get_current_user, get_optional_current_user
from app.core.workspace_context import (
    WorkspaceContext,
    get_active_workspace_context,
    verify_user_workspace_membership,
)
from app.db.models import (
    ConversationMessage,
    ConversationSession,
    Document,
    DocumentType,
    Organization,
    ProcessingStatus,
    Regulation,
    User,
)
from app.db.models.rbac import MemberStatus, OrganizationMember, UserRole
from app.db.session import Base, get_db
from app.routes.chat import router as chat_router
from app.routes.retrieval import router as retrieval_router
from app.schemas.chat import ChatRequest, RelatedDocument, SourceCitation
from app.services.chat_service import NO_EVIDENCE_MESSAGE, process_chat_request
from app.services.hybrid_retriever import HybridRetriever, HybridSearchResultItem
from app.services.retrieval import _collect_clauses, retrieve_relevant_clauses
from app.services.retrieval_guard import (
    authorize_citations,
    filter_related_documents,
    validate_retrieval_candidates,
)
from app.services.retrieval_orchestrator import RetrievalContext, RetrievedClause


class AIAssistantDataIsolationTestSuite(unittest.TestCase):
    """End-to-end security verification of AI Assistant multi-tenant data isolation."""

    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine, expire_on_commit=False)

        db = cls.SessionLocal()

        # 1. Create User A (Tenant A)
        cls.user_a_id = uuid.uuid4()
        cls.user_a = User(
            id=cls.user_a_id,
            email="ananya.sharma@corp-a.com",
            username="ananya_sharma",
            full_name="Ananya Sharma",
            hashed_password="pw_hash_a",
            is_active=True,
        )
        # 2. Create User B (Tenant B)
        cls.user_b_id = uuid.uuid4()
        cls.user_b = User(
            id=cls.user_b_id,
            email="vikram.patel@corp-b.com",
            username="vikram_patel",
            full_name="Vikram Patel",
            hashed_password="pw_hash_b",
            is_active=True,
        )
        # 3. Create Multi-Workspace User M (Belongs to both A and B)
        cls.user_m_id = uuid.uuid4()
        cls.user_m = User(
            id=cls.user_m_id,
            email="rohit.mehra@consulting.com",
            username="rohit_mehra",
            full_name="Rohit Mehra",
            hashed_password="pw_hash_m",
            is_active=True,
        )
        db.add_all([cls.user_a, cls.user_b, cls.user_m])
        db.commit()

        # 4. Create Workspace A
        cls.org_a_id = uuid.uuid4()
        cls.org_a = Organization(
            id=cls.org_a_id,
            name="Ananya Sharma's Workspace A",
            created_by=cls.user_a_id,
        )
        # 5. Create Workspace B
        cls.org_b_id = uuid.uuid4()
        cls.org_b = Organization(
            id=cls.org_b_id,
            name="Vikram Patel's Workspace B",
            created_by=cls.user_b_id,
        )
        db.add_all([cls.org_a, cls.org_b])
        db.commit()

        # 6. Add Memberships
        cls.mem_a = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_a_id,
            user_id=cls.user_a_id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        )
        cls.mem_b = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_b_id,
            user_id=cls.user_b_id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        )
        cls.mem_m_a = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_a_id,
            user_id=cls.user_m_id,
            role=UserRole.COMPLIANCE_ANALYST,
            status=MemberStatus.ACTIVE,
        )
        cls.mem_m_b = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=cls.org_b_id,
            user_id=cls.user_m_id,
            role=UserRole.COMPLIANCE_ANALYST,
            status=MemberStatus.ACTIVE,
        )
        db.add_all([cls.mem_a, cls.mem_b, cls.mem_m_a, cls.mem_m_b])
        db.commit()

        # 7. Add Policies with unique synthetic secret phrases
        cls.secret_phrase_a = "SECRET_ALPHA_TOKEN_9981_EXCLUSIVE"
        cls.doc_a = Document(
            id=uuid.uuid4(),
            organization_id=cls.org_a_id,
            uploaded_by=cls.user_a_id,
            original_filename="Confidential_Policy_A.pdf",
            stored_filename="policy_a.pdf",
            file_path="/storage/policy_a.pdf",
            file_size=1024,
            mime_type="application/pdf",
            checksum="hash_policy_a",
            document_type=DocumentType.POLICY,
            processing_status=ProcessingStatus.PROCESSED,
        )

        cls.secret_phrase_b = "SECRET_BETA_TOKEN_4412_EXCLUSIVE"
        cls.doc_b = Document(
            id=uuid.uuid4(),
            organization_id=cls.org_b_id,
            uploaded_by=cls.user_b_id,
            original_filename="Restricted_Policy_B.pdf",
            stored_filename="policy_b.pdf",
            file_path="/storage/policy_b.pdf",
            file_size=2048,
            mime_type="application/pdf",
            checksum="hash_policy_b",
            document_type=DocumentType.POLICY,
            processing_status=ProcessingStatus.PROCESSED,
        )

        # 8. Add Global Regulation (Statutory — shared)
        cls.global_reg = Regulation(
            id=uuid.uuid4(),
            uploaded_by=cls.user_a_id,
            act_name="Digital Personal Data Protection Act 2023",
            title="DPDP Act 2023",
            jurisdiction="India",
            is_global=True,
            original_filename="dpdp2023.pdf",
            stored_filename="dpdp2023.pdf",
            file_path="/storage/dpdp2023.pdf",
            file_size=3000,
            mime_type="application/pdf",
            document_hash="hash_dpdp_2023",
            processing_status=ProcessingStatus.PROCESSED,
        )
        db.add_all([cls.doc_a, cls.doc_b, cls.global_reg])
        db.commit()
        db.close()

    def setUp(self):
        self.db = self.SessionLocal()
        self.mock_user = self.user_a

        self.app = FastAPI()
        self.app.include_router(chat_router)
        self.app.include_router(retrieval_router)

        def override_get_db():
            try:
                yield self.db
            finally:
                pass

        def override_get_current_user():
            return self.mock_user

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = override_get_current_user
        self.app.dependency_overrides[get_optional_current_user] = override_get_current_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    # -------------------------------------------------------------------------
    # TEST A: Cross-Workspace Retrieval Isolation
    # -------------------------------------------------------------------------
    @patch("app.services.chat_service._resolve_reasoning")
    @patch("app.services.chat_service.retrieve_context")
    def test_a_cross_workspace_retrieval(self, mock_retrieve, mock_llm):
        """User A in Workspace A cannot retrieve or cite User B's private policy from Workspace B."""
        # Setup mock retrieval for Workspace A query
        clause_b_leak = RetrievedClause(
            clause_id=str(uuid.uuid4()),
            document_id=str(self.doc_b.id),  # Belongs to Workspace B!
            text=f"The retention secret is {self.secret_phrase_b}.",
            score=0.92,
            source="vector",
            title=self.doc_b.original_filename,
        )
        mock_retrieve.return_value = RetrievalContext(
            organization_id=str(self.org_a_id),
            question="What is the retention rule?",
            total_clauses=1,
            clauses=[clause_b_leak],
            formatted_prompt_context=clause_b_leak.text,
        )
        mock_llm.return_value = f"The secret is {self.secret_phrase_b}."

        self.mock_user = self.user_a
        response = self.client.post(
            "/chat",
            json={
                "question": "What is the retention rule?",
                "organization_id": str(self.org_a_id),
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()

        # The server-side authorization gate MUST have stripped clause_b_leak
        self.assertEqual(data["answer"], NO_EVIDENCE_MESSAGE)
        self.assertEqual(len(data["sources"]), 0)
        self.assertNotIn(self.secret_phrase_b, str(data))
        self.assertNotIn("Restricted_Policy_B.pdf", str(data))

    # -------------------------------------------------------------------------
    # TEST B: Same User, Different Workspaces
    # -------------------------------------------------------------------------
    @patch("app.services.chat_service._resolve_reasoning")
    @patch("app.services.chat_service.retrieve_context")
    def test_b_same_user_different_workspaces(self, mock_retrieve, mock_llm):
        """User M belonging to both A and B cannot retrieve Workspace A's private policy while in Workspace B."""
        clause_a = RetrievedClause(
            clause_id=str(uuid.uuid4()),
            document_id=str(self.doc_a.id),  # Workspace A document
            text=f"Confidential: {self.secret_phrase_a}",
            score=0.95,
            source="vector",
            title=self.doc_a.original_filename,
        )
        mock_retrieve.return_value = RetrievalContext(
            organization_id=str(self.org_b_id),
            question="Query in B",
            total_clauses=1,
            clauses=[clause_a],
            formatted_prompt_context=clause_a.text,
        )
        mock_llm.return_value = "Answer with secret."

        self.mock_user = self.user_m  # User belongs to both workspaces
        response = self.client.post(
            "/chat",
            json={
                "question": "Query in B",
                "organization_id": str(self.org_b_id),  # In Workspace B
            },
            headers={"X-Workspace-Id": str(self.org_b_id)},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()

        # Document from Workspace A must NOT be accessible in Workspace B
        self.assertEqual(data["answer"], NO_EVIDENCE_MESSAGE)
        self.assertEqual(len(data["sources"]), 0)
        self.assertNotIn(self.secret_phrase_a, str(data))

    # -------------------------------------------------------------------------
    # TEST C: Same Workspace, Document Authorization Verification
    # -------------------------------------------------------------------------
    def test_c_document_authorization_verification(self):
        """Verify that Retrieval Guard verifies policy documents and global regulations strictly."""
        candidate_clauses = [
            {"document_id": str(self.doc_a.id), "clause_id": "c1", "text": "Valid A clause"},
            {"document_id": str(self.doc_b.id), "clause_id": "c2", "text": "Foreign B clause"},
            {"document_id": str(self.global_reg.id), "clause_id": "c3", "text": "Global regulation clause"},
            {"document_id": str(uuid.uuid4()), "clause_id": "c4", "text": "Non-existent doc"},
            {"document_id": None, "clause_id": "c5", "text": "Unattributed clause"},
        ]

        # Validating for Workspace A
        validated = validate_retrieval_candidates(self.db, self.org_a_id, candidate_clauses)
        valid_doc_ids = {str(item["document_id"]) for item in validated}

        # Only doc_a and global_reg must be allowed
        self.assertIn(str(self.doc_a.id), valid_doc_ids)
        self.assertIn(str(self.global_reg.id), valid_doc_ids)
        self.assertNotIn(str(self.doc_b.id), valid_doc_ids)
        self.assertEqual(len(validated), 2)

    # -------------------------------------------------------------------------
    # TEST D: Citation Authorization Gate
    # -------------------------------------------------------------------------
    def test_d_citation_authorization(self):
        """Attempt to inject unauthorized document IDs into citations; backend rejects them."""
        citations = [
            SourceCitation(
                document_id=str(self.doc_a.id),
                clause_id=str(uuid.uuid4()),
                document="Confidential_Policy_A.pdf",
                section="Section 1",
                clause="Valid clause text",
                similarity=0.9,
                confidence_score=0.9,
            ),
            SourceCitation(
                document_id=str(self.doc_b.id),  # Foreign workspace doc
                clause_id=str(uuid.uuid4()),
                document="Restricted_Policy_B.pdf",
                section="Section 2",
                clause="Foreign clause text",
                similarity=0.95,
                confidence_score=0.95,
            ),
            SourceCitation(
                document_id=str(uuid.uuid4()),  # Injected fake doc ID
                clause_id=str(uuid.uuid4()),
                document="Attacker_Injected.pdf",
                section="Exploit",
                clause="Exploit text",
                similarity=0.99,
                confidence_score=0.99,
            ),
        ]

        verified =  authorize_citations(self.db, self.org_a_id, citations)
        self.assertEqual(len(verified), 1)
        self.assertEqual(verified[0].document_id, str(self.doc_a.id))

    # -------------------------------------------------------------------------
    # TEST E: Memory & Response Cache Isolation
    # -------------------------------------------------------------------------
    def test_e_cache_isolation(self):
        """Conversations and memory are strictly isolated by user and workspace."""
        # Create conversation in Workspace A for User A
        session_a = ConversationSession(
            id=uuid.uuid4(),
            user_id=self.user_a_id,
            organization_id=self.org_a_id,
            title="User A Private Session",
        )
        self.db.add(session_a)
        msg_a = ConversationMessage(
            id=uuid.uuid4(),
            conversation_id=session_a.id,
            role="user",
            message=f"Confidential data: {self.secret_phrase_a}",
        )
        self.db.add(msg_a)
        self.db.commit()

        # User B queries their conversations
        self.mock_user = self.user_b
        res = self.client.get(
            "/chat/conversations",
            headers={"X-Workspace-Id": str(self.org_b_id)},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        returned_ids = [c["id"] for c in data]
        self.assertNotIn(str(session_a.id), returned_ids)

    # -------------------------------------------------------------------------
    # TEST F: Graph Traversal Isolation
    # -------------------------------------------------------------------------
    def test_f_graph_traversal_isolation(self):
        """Neo4j graph expansion rejects foreign tenant target nodes."""
        retriever = HybridRetriever()

        # Construct path where seed is in Org A, but target node is in Org B
        mock_path_record = {
            "seed_id": "seed_1",
            "target_id": "clause_b_hop",
            "target_labels": ["Clause", "PolicyClause"],
            "target_text": f"Leaked via graph hop: {self.secret_phrase_b}",
            "target_title": "Policy B",
            "target_org_id": str(self.org_b_id),  # Foreign tenant!
            "dist": 2,
            "rel_types": ["SIMILAR_TO"],
        }

        with patch("app.services.hybrid_retriever.run_query", return_value=[mock_path_record]):
            expanded = retriever._expand_neo4j_graph(
                clause_ids=["seed_1"],
                organization_id=str(self.org_a_id),
            )
            # The foreign node must be rejected and discarded
            self.assertEqual(len(expanded), 0)

    # -------------------------------------------------------------------------
    # TEST G: Fallback Retrieval Isolation
    # -------------------------------------------------------------------------
    def test_g_fallback_retrieval_isolation(self):
        """Fallback retrieval enforces organization filter and returns empty when unscoped."""
        # 1. Unscoped call must return []
        unscoped_clauses = _collect_clauses(organization_id=None)
        self.assertEqual(unscoped_clauses, [])

        unscoped_results = retrieve_relevant_clauses("test query", organization_id=None)
        self.assertEqual(unscoped_results, [])

        # 2. In /retrieve route, missing membership or unauthorized workspace is blocked
        self.mock_user = self.user_a
        # User A attempts to retrieve in Workspace B
        res = self.client.get(
            "/retrieve",
            params={"query": "test query", "organization_id": str(self.org_b_id)},
        )
        self.assertEqual(res.status_code, 403)

    # -------------------------------------------------------------------------
    # TEST H: Revoked Membership Access Denial
    # -------------------------------------------------------------------------
    def test_h_revoked_access_denial(self):
        """Revoking user's workspace membership immediately blocks chat and retrieval."""
        # Revoke User A's membership in Workspace A
        self.mem_a.status = MemberStatus.INACTIVE
        self.db.add(self.mem_a)
        self.db.commit()

        self.mock_user = self.user_a
        response = self.client.post(
            "/chat",
            json={
                "question": "What is our policy?",
                "organization_id": str(self.org_a_id),
            },
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("revoked or deactivated", response.json()["detail"])

        # Restore membership for subsequent tests
        self.mem_a.status = MemberStatus.ACTIVE
        self.db.add(self.mem_a)
        self.db.commit()

    # -------------------------------------------------------------------------
    # TEST I: Conversation ID Manipulation Prevention
    # -------------------------------------------------------------------------
    def test_i_conversation_id_manipulation(self):
        """User B cannot access User A's conversation by supplying its UUID directly."""
        session_a = ConversationSession(
            id=uuid.uuid4(),
            user_id=self.user_a_id,
            organization_id=self.org_a_id,
            title="User A Secret Thread",
        )
        self.db.add(session_a)
        self.db.commit()

        # User B attempts direct lookup
        self.mock_user = self.user_b
        res = self.client.get(f"/chat/conversations/{session_a.id}")
        self.assertEqual(res.status_code, 404)

        # User B attempts to duplicate User A's conversation
        res_dup = self.client.post(f"/chat/conversations/{session_a.id}/duplicate")
        self.assertEqual(res_dup.status_code, 404)

        # User B attempts to export User A's conversation
        res_exp = self.client.get(f"/chat/conversations/{session_a.id}/export")
        self.assertEqual(res_exp.status_code, 404)

        # User B attempts to delete User A's conversation
        res_del = self.client.delete(f"/chat/conversations/{session_a.id}")
        self.assertEqual(res_del.status_code, 404)

    # -------------------------------------------------------------------------
    # TEST J: Missing Ownership Metadata Quarantine
    # -------------------------------------------------------------------------
    def test_j_missing_ownership_metadata_quarantine(self):
        """Records with missing or invalid ownership metadata are quarantined and excluded."""
        unattributed_candidates = [
            {"clause_id": "c_null_doc", "document_id": None, "text": "Unattributed text"},
            {"clause_id": "c_empty_doc", "document_id": "", "text": "Empty doc text"},
            {"clause_id": "c_invalid_doc", "document_id": "not-a-uuid", "text": "Invalid doc text"},
        ]

        validated = validate_retrieval_candidates(self.db, self.org_a_id, unattributed_candidates)
        # All invalid/unattributed candidates must be excluded
        self.assertEqual(len(validated), 0)

    # -------------------------------------------------------------------------
    # TEST K: Deterministic No-Evidence Response Without Leakage
    # -------------------------------------------------------------------------
    @patch("app.services.chat_service._resolve_reasoning")
    @patch("app.services.chat_service.retrieve_context")
    def test_k_no_evidence_behavior(self, mock_retrieve, mock_llm):
        """When queried about content existing only in another workspace, returns NO_EVIDENCE_MESSAGE without metadata leakage."""
        # Retrieval yields 0 matching clauses for Workspace A
        mock_retrieve.return_value = RetrievalContext(
            organization_id=str(self.org_a_id),
            question="What is Vikram Patel's private policy title?",
            total_clauses=0,
            clauses=[],
            formatted_prompt_context="",
        )

        self.mock_user = self.user_a
        response = self.client.post(
            "/chat",
            json={
                "question": "What is Vikram Patel's private policy title?",
                "organization_id": str(self.org_a_id),
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["answer"], NO_EVIDENCE_MESSAGE)
        self.assertEqual(data["sources"], [])
        self.assertEqual(data["related_documents"], [])
        # Ensure Workspace B details are absent
        self.assertNotIn("Vikram", data["answer"])
        self.assertNotIn("Restricted_Policy_B", str(data))

    # -------------------------------------------------------------------------
    # TEST L: Concurrent Workspace Switching Context Isolation
    # -------------------------------------------------------------------------
    @patch("app.services.chat_service._resolve_reasoning")
    @patch("app.services.chat_service.retrieve_context")
    def test_l_concurrent_workspace_switching(self, mock_retrieve, mock_llm):
        """Simulate rapid alternating requests across workspaces for multi-workspace user."""
        self.mock_user = self.user_m

        clause_a = RetrievedClause(
            clause_id=str(uuid.uuid4()),
            document_id=str(self.doc_a.id),
            text="Legitimate policy A content",
            score=0.91,
            source="vector",
            title=self.doc_a.original_filename,
        )
        clause_b = RetrievedClause(
            clause_id=str(uuid.uuid4()),
            document_id=str(self.doc_b.id),
            text="Legitimate policy B content",
            score=0.93,
            source="vector",
            title=self.doc_b.original_filename,
        )

        # 1. Request in Workspace A
        mock_retrieve.return_value = RetrievalContext(
            organization_id=str(self.org_a_id),
            question="Question for Workspace A",
            total_clauses=1,
            clauses=[clause_a],
            formatted_prompt_context=clause_a.text,
        )
        mock_llm.return_value = "Answer for Workspace A."

        res_a = self.client.post(
            "/chat",
            json={
                "question": "Question for Workspace A",
                "organization_id": str(self.org_a_id),
            },
            headers={"X-Workspace-Id": str(self.org_a_id)},
        )
        self.assertEqual(res_a.status_code, 200)
        data_a = res_a.json()
        self.assertEqual(len(data_a["sources"]), 1)
        self.assertEqual(data_a["sources"][0]["document_id"], str(self.doc_a.id))

        # 2. Immediately switch to Workspace B
        mock_retrieve.return_value = RetrievalContext(
            organization_id=str(self.org_b_id),
            question="Question for Workspace B",
            total_clauses=1,
            clauses=[clause_b],
            formatted_prompt_context=clause_b.text,
        )
        mock_llm.return_value = "Answer for Workspace B."

        res_b = self.client.post(
            "/chat",
            json={
                "question": "Question for Workspace B",
                "organization_id": str(self.org_b_id),
            },
            headers={"X-Workspace-Id": str(self.org_b_id)},
        )
        self.assertEqual(res_b.status_code, 200)
        data_b = res_b.json()
        self.assertEqual(len(data_b["sources"]), 1)
        self.assertEqual(data_b["sources"][0]["document_id"], str(self.doc_b.id))

        # Assert no cross-contamination of conversation IDs
        self.assertNotEqual(data_a["conversation_id"], data_b["conversation_id"])


if __name__ == "__main__":
    unittest.main()
