import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.db.models.user import User
from app.db.neo4j import test_connection

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/test-neo4j")
def test_neo4j(
    current_user: User = Depends(get_current_user),
) -> dict:
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
