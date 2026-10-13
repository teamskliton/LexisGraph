import unittest
import uuid
from unittest.mock import MagicMock, patch
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user, get_db, get_optional_current_user
from app.db.models import User
from app.routes.compliance import router as compliance_router
from app.routes.graph import router as graph_router
from app.routes.retrieval import router as retrieval_router
from app.routes.upload import router as upload_router


def _create_authenticated_app(router, prefix="/api/v1"):
    app = FastAPI()
    app.include_router(router, prefix=prefix)

    mock_user = MagicMock(spec=User)
    mock_user.id = uuid.uuid4()
    mock_user.is_superuser = True
    mock_user.role = "ADMIN"

    mock_db = MagicMock()
    mock_org = MagicMock(id=uuid.uuid4(), created_by=mock_user.id)
    mock_db.scalars.return_value.all.return_value = [mock_org.id]
    mock_db.query.return_value.filter.return_value.first.return_value = mock_org
    mock_db.get.return_value = mock_org

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_optional_current_user] = lambda: mock_user
    app.dependency_overrides[get_db] = lambda: mock_db
    return app, mock_user, mock_org


class ApiContractsTest(unittest.TestCase):
    def test_compliance_contract_uses_results_key(self):
        app, _, _ = _create_authenticated_app(compliance_router, prefix="/api/v1")

        with patch("app.routes.compliance.detect_compliance_gaps", return_value=[{"status": "gap"}]):
            with TestClient(app) as client:
                response = client.get("/api/v1/compliance-check")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"results": [{"status": "gap"}]})

    def test_retrieval_contract_returns_results_array(self):
        app, _, mock_org = _create_authenticated_app(retrieval_router, prefix="/api/v1")
        payload = [{"query_match": "Retention policy", "similarity_score": 0.91, "related_clauses": ["Keep records"]}]

        with patch("app.routes.retrieval.retrieve_relevant_clauses", return_value=payload), \
             patch("app.routes.retrieval.verify_user_workspace_membership"):
            with TestClient(app) as client:
                response = client.get("/api/v1/retrieve", params={"query": "retention", "organization_id": str(mock_org.id)})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"results": payload})

    def test_graph_view_returns_real_snapshot_shape(self):
        app, _, mock_org = _create_authenticated_app(graph_router, prefix="/api/v1")
        snapshot = {
            "status": "ok",
            "nodes": [{"id": "doc-1", "kind": "document", "label": "Policy"}],
            "edges": [{"id": "edge-1", "kind": "HAS_CLAUSE", "source": "doc-1", "target": "clause-1"}],
            "meta": {"documents": 1, "clauses": 1, "has_clause_edges": 1, "similarity_edges": 0},
        }

        with patch("app.routes.graph.get_graph_snapshot", return_value=snapshot), \
             patch("app.routes.graph._validate_org_access"):
            with TestClient(app) as client:
                response = client.get(f"/api/v1/graph-view?organization_id={mock_org.id}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), snapshot)

    def test_knowledge_graph_build_contract(self):
        app, _, _ = _create_authenticated_app(graph_router, prefix="/api/v1")
        result = {"status": "success", "nodes": 12, "relationships": 18}

        with patch("app.routes.graph.build_knowledge_graph", return_value=result):
            with TestClient(app) as client:
                response = client.post(
                    "/api/v1/build-knowledge-graph",
                    json={"user_document_id": "policy-1", "domain_document_ids": ["domain-1"]},
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), result)

    def test_graph_root_contract(self):
        app, _, _ = _create_authenticated_app(graph_router, prefix="/api/v1")
        payload = {"status": "ok", "nodes": [{"id": "user-1"}], "edges": [], "metadata": {"build_id": "kg-1"}}

        with patch("app.routes.graph.get_graph_root", return_value=payload):
            with TestClient(app) as client:
                response = client.get("/api/v1/graph/root")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)

    def test_graph_document_view_contract(self):
        app, _, _ = _create_authenticated_app(graph_router, prefix="/api/v1")
        payload = {"status": "ok", "nodes": [{"id": "policy-1"}], "edges": [{"id": "edge-1"}], "metadata": {"build_id": "kg-1"}}

        with patch("app.routes.graph.get_document_view", return_value=payload), \
             patch("app.routes.graph._validate_org_access"):
            with TestClient(app) as client:
                response = client.get("/api/v1/graph/document/user-1")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)

    def test_graph_clause_view_contract(self):
        app, _, _ = _create_authenticated_app(graph_router, prefix="/api/v1")
        payload = {"status": "ok", "nodes": [{"id": "reg-1"}], "edges": [{"id": "edge-1"}], "details": {"clause_id": "policy-1"}, "metadata": {"build_id": "kg-1"}}

        with patch("app.routes.graph.get_clause_view", return_value=payload), \
             patch("app.routes.graph._validate_org_access"):
            with TestClient(app) as client:
                response = client.get("/api/v1/graph/clause/policy-1")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)

    def test_graph_regulation_view_contract(self):
        app, _, _ = _create_authenticated_app(graph_router, prefix="/api/v1")
        payload = {"status": "ok", "nodes": [{"id": "entity-1"}], "edges": [{"id": "edge-1"}], "details": {"regulation_clause_id": "reg-1"}, "metadata": {"build_id": "kg-1"}}

        with patch("app.routes.graph.get_regulation_view", return_value=payload):
            with TestClient(app) as client:
                response = client.get("/api/v1/graph/regulation/reg-1")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)

    def test_knowledge_graph_reset_contract(self):
        app, _, _ = _create_authenticated_app(graph_router, prefix="/api/v1")
        result = {"status": "success", "deleted": True, "nodes": 12, "relationships": 18}

        with patch("app.routes.graph.clear_active_knowledge_graph", return_value=result):
            with TestClient(app) as client:
                response = client.post("/api/v1/reset-knowledge-graph")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), result)

    def test_graph_history_contract(self):
        app, _, _ = _create_authenticated_app(graph_router, prefix="/api/v1")
        payload = {"builds": [{"build_id": "kg-1", "active": True}]}

        with patch("app.routes.graph.list_knowledge_graph_history", return_value=payload):
            with TestClient(app) as client:
                response = client.get("/api/v1/graph-history")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)

    def test_graph_history_activate_contract(self):
        app, _, _ = _create_authenticated_app(graph_router, prefix="/api/v1")
        payload = {"status": "success", "build_id": "kg-1"}

        with patch("app.routes.graph.activate_knowledge_graph", return_value=payload):
            with TestClient(app) as client:
                response = client.post("/api/v1/graph-history/kg-1/activate")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)

    def test_graph_history_delete_contract(self):
        app, _, _ = _create_authenticated_app(graph_router, prefix="/api/v1")
        payload = {"status": "success", "deleted": True, "build_id": "kg-1", "nodes": 9, "relationships": 12}

        with patch("app.routes.graph.delete_knowledge_graph", return_value=payload):
            with TestClient(app) as client:
                response = client.delete("/api/v1/graph-history/kg-1")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)

    def test_graph_documents_contract(self):
        app, _, _ = _create_authenticated_app(graph_router, prefix="/api/v1")
        payload = {"user_documents": [{"id": "policy-1"}], "domain_documents": [{"id": "domain-1"}]}

        with patch("app.routes.graph.list_graph_documents", return_value=payload):
            with TestClient(app) as client:
                response = client.get("/api/v1/graph-documents")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)

    def test_upload_route_returns_processed_payload(self):
        app, _, mock_org = _create_authenticated_app(upload_router, prefix="/api/v1")
        raw_path = Path("data/raw/user/hash-123_policy.pdf")

        def _save_raw_file(*_args, **_kwargs):
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            raw_path.write_bytes(b"raw")
            return str(raw_path)

        with patch("app.routes.upload.generate_content_hash", return_value="hash-123"), \
             patch("app.routes.upload.file_exists_with_hash", return_value=False), \
             patch("app.routes.upload.save_raw_file", side_effect=_save_raw_file), \
             patch("app.routes.upload.verify_user_organization_access", return_value=True), \
             patch("app.routes.upload._run_pipeline"):
            with TestClient(app) as client:
                response = client.post(
                    "/api/v1/upload",
                    headers={"X-Workspace-Id": str(mock_org.id)},
                    files={"file": ("policy.pdf", b"sample policy text", "application/pdf")},
                )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(
            response.json(),
            {
                "message": "File accepted. Processing has been started in the background.",
                "processing_status": "accepted",
                "path": str(raw_path),
                "hash": "hash-123",
                "filename": "policy.pdf",
            },
        )



if __name__ == "__main__":
    unittest.main()
