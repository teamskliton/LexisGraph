from app.db.mongo import get_client
from app.db.neo4j import test_connection as test_neo4j_connection
from app.db.postgres import test_connection as test_postgres_connection
from app.db.qdrant import test_connection as test_qdrant_connection
from app.db.redis_client import test_connection as test_redis_connection
from app.services.retrieval import is_model_loaded


def get_system_health() -> dict:
    mongo_status = {"status": "ok", "message": "MongoDB reachable"}
    neo4j_status = {"status": "ok", "message": "Neo4j reachable"}
    postgres_status = {"status": "ok", "message": "PostgreSQL reachable"}
    qdrant_status = {"status": "ok", "message": "Qdrant reachable"}
    redis_status = {"status": "ok", "message": "Redis reachable"}

    # ── MongoDB (existing) ────────────────────────────────────────────────────
    try:
        get_client().admin.command("ping")
    except Exception as exc:  # noqa: BLE001
        mongo_status = {"status": "error", "message": str(exc)}

    # ── Neo4j (existing) ──────────────────────────────────────────────────────
    try:
        test_neo4j_connection()
    except Exception as exc:  # noqa: BLE001
        neo4j_status = {"status": "error", "message": str(exc)}

    # ── PostgreSQL (new) ──────────────────────────────────────────────────────
    if not test_postgres_connection():
        postgres_status = {"status": "error", "message": "PostgreSQL ping failed"}

    # ── Qdrant (new) ──────────────────────────────────────────────────────────
    if not test_qdrant_connection():
        qdrant_status = {"status": "error", "message": "Qdrant get_collections failed"}

    # ── Redis (new) ───────────────────────────────────────────────────────────
    if not test_redis_connection():
        redis_status = {"status": "error", "message": "Redis ping failed"}

    # ── Embedding model ───────────────────────────────────────────────────────
    model_loaded = is_model_loaded()
    model_status = {
        "status": "ok" if model_loaded else "warning",
        "message": "Embedding model loaded" if model_loaded else "Embedding model not preloaded",
    }

    # ── Overall status ────────────────────────────────────────────────────────
    critical_stores = [mongo_status, neo4j_status, postgres_status, qdrant_status, redis_status]
    overall_status = "degraded" if any(s["status"] == "error" for s in critical_stores) else "ok"

    return {
        "status": overall_status,
        "api": {"status": "ok", "message": "API reachable"},
        "mongo": mongo_status,
        "neo4j": neo4j_status,
        "postgres": postgres_status,
        "qdrant": qdrant_status,
        "redis": redis_status,
        "embedding_model": model_status,
    }
