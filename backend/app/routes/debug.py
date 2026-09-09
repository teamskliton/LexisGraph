from asyncio import to_thread
from datetime import datetime, timezone
import logging

from fastapi import APIRouter, HTTPException
from sqlalchemy import select, func

from app.db.session import get_session
from app.db.models.document import Document

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_latest_documents(limit: int = 5) -> list[dict]:
    with get_session() as session:
        docs = session.scalars(select(Document).order_by(Document.created_at.desc()).limit(limit)).all()
        return [
            {
                "id": str(doc.id),
                "title": doc.original_filename,
                "status": doc.processing_status.value if hasattr(doc.processing_status, "value") else str(doc.processing_status),
                "progress": doc.progress,
                "created_at": doc.created_at.isoformat() if doc.created_at else None,
            }
            for doc in docs
        ]


@router.get("/debug/user-documents")
async def debug_user_documents() -> dict:
    """Return latest 5 documents from PostgreSQL."""
    try:
        documents = await to_thread(_get_latest_documents, 5)
        return {"count": len(documents), "documents": documents}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to fetch user debug documents")
        raise HTTPException(status_code=500, detail="Failed to fetch user documents") from exc


@router.get("/debug/stats")
async def debug_stats() -> dict:
    """Return document counts from PostgreSQL."""
    try:
        def _fetch_counts() -> int:
            with get_session() as session:
                return session.scalar(select(func.count(Document.id))) or 0

        total_count = await to_thread(_fetch_counts)
        return {
            "total_documents": total_count,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to fetch debug stats")
        raise HTTPException(status_code=500, detail="Failed to fetch stats") from exc


@router.get("/debug/neo4j-state")
def neo4j_state() -> dict:
    """Returns exact count of all nodes and edges in Neo4j right now."""
    from app.db.neo4j import is_neo4j_available, run_query

    if not is_neo4j_available():
        return {"status": "unavailable", "message": "Neo4j not reachable"}

    def _cypher_count(cypher: str) -> int:
        rows = run_query(cypher)
        return int(rows[0]["c"]) if rows else 0

    return {
        "status": "connected",
        "counts": {
            "total_nodes": _cypher_count("MATCH (n) RETURN count(n) AS c"),
            "documents": _cypher_count("MATCH (d:Document) RETURN count(d) AS c"),
            "clauses": _cypher_count("MATCH (c:Clause) RETURN count(c) AS c"),
            "has_clause_edges": _cypher_count(
                "MATCH ()-[:HAS_CLAUSE]->() RETURN count(*) AS c",
            ),
            "similar_to_edges": _cypher_count(
                "MATCH ()-[:SIMILAR_TO]->() RETURN count(*) AS c",
            ),
        },
        "sample_documents": run_query(
            "MATCH (d:Document) RETURN d.id AS id, d.title AS title LIMIT 5",
        )
        or [],
        "sample_clauses": run_query(
            "MATCH (c:Clause) RETURN c.id AS id, c.text AS text LIMIT 3",
        )
        or [],
    }
