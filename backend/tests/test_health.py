from fastapi.testclient import TestClient

from app import main


class _MongoClientStub:
    class _Admin:
        @staticmethod
        def command(_name: str):
            return {"ok": 1}

    admin = _Admin()


def test_health_ok(monkeypatch):
    monkeypatch.setenv("PRELOAD_EMBEDDING_MODEL", "false")
    monkeypatch.setattr(main, "get_mongo_client", lambda: _MongoClientStub())
    monkeypatch.setattr(main, "test_neo4j_connection", lambda: [{"message": "ok"}])
    monkeypatch.setattr(main, "is_model_loaded", lambda: True)

    app = main.create_app()
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["checks"]["mongo"] == "ok"
    assert payload["checks"]["neo4j"] == "ok"
    assert payload["checks"]["embedding_model"] == "ok"


def test_health_degraded_when_model_unloaded(monkeypatch):
    monkeypatch.setenv("PRELOAD_EMBEDDING_MODEL", "false")
    monkeypatch.setattr(main, "get_mongo_client", lambda: _MongoClientStub())
    monkeypatch.setattr(main, "test_neo4j_connection", lambda: [{"message": "ok"}])
    monkeypatch.setattr(main, "is_model_loaded", lambda: False)

    app = main.create_app()
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "degraded"
    assert payload["checks"]["embedding_model"] == "error"
