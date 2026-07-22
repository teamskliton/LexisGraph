from app.db.mongo import get_client
from app.db.neo4j import test_connection as test_neo4j_connection
from app.services.retrieval import is_model_loaded


def get_system_health() -> dict:
    mongo_status = {"status": "ok", "message": "MongoDB reachable"}
    neo4j_status = {"status": "ok", "message": "Neo4j reachable"}

    try:
        get_client().admin.command("ping")
    except Exception as exc:  # noqa: BLE001
        mongo_status = {"status": "error", "message": str(exc)}

    try:
        test_neo4j_connection()
    except Exception as exc:  # noqa: BLE001
        neo4j_status = {"status": "error", "message": str(exc)}

    model_loaded = is_model_loaded()
    model_status = {
        "status": "ok" if model_loaded else "warning",
        "message": "Embedding model loaded" if model_loaded else "Embedding model not preloaded",
    }

    overall_status = "ok"
    if mongo_status["status"] == "error" or neo4j_status["status"] == "error":
        overall_status = "degraded"

    return {
        "status": overall_status,
        "api": {"status": "ok", "message": "API reachable"},
        "mongo": mongo_status,
        "neo4j": neo4j_status,
        "embedding_model": model_status,
    }
