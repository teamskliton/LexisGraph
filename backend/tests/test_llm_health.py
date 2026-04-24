from fastapi.testclient import TestClient

from app import main
from app.routes import compliance as compliance_route


class _MongoClientStub:
    class _Admin:
        @staticmethod
        def command(_name: str):
            return {"ok": 1}

    admin = _Admin()


def _build_test_client(monkeypatch) -> TestClient:
    monkeypatch.setenv("PRELOAD_EMBEDDING_MODEL", "false")
    monkeypatch.setattr(main, "get_mongo_client", lambda: _MongoClientStub())
    monkeypatch.setattr(main, "test_neo4j_connection", lambda: [{"message": "ok"}])
    monkeypatch.setattr(main, "is_model_loaded", lambda: True)
    app = main.create_app()
    return TestClient(app)


def test_llm_health_healthy(monkeypatch):
    monkeypatch.setattr(compliance_route, "check_gemini_health", lambda: True)

    with _build_test_client(monkeypatch) as client:
        response = client.get("/api/v1/llm-health")

    assert response.status_code == 200
    assert response.json() == {"llm_provider": "openrouter", "status": "healthy"}


def test_llm_health_unhealthy(monkeypatch):
    monkeypatch.setattr(compliance_route, "check_gemini_health", lambda: False)

    with _build_test_client(monkeypatch) as client:
        response = client.get("/api/v1/llm-health")

    assert response.status_code == 503
