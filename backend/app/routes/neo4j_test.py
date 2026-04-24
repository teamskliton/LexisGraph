import logging

from fastapi import APIRouter, HTTPException

from app.db.neo4j import test_connection

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/test-neo4j")
def test_neo4j() -> dict:
    """Validate Neo4j connectivity with a simple Cypher query."""
    try:
        result = test_connection()
        return {
            "status": "success",
            "data": result,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Neo4j connection test failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
