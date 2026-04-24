import logging

from fastapi import APIRouter, HTTPException

from app.db.neo4j import test_connection as neo4j_test_connection

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/test-neo4j")
def check_neo4j_connection() -> dict:
    """Validate Neo4j connectivity with a simple Cypher query."""
    try:
        result = neo4j_test_connection()
        return {
            "status": "success",
            "data": result,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Neo4j connection test failed")
        raise HTTPException(status_code=500, detail="Neo4j connection test failed") from exc
