from asyncio import to_thread
from datetime import datetime, timezone
import logging

from fastapi import APIRouter, HTTPException

from app.db.mongo import get_collection, get_database

router = APIRouter()
logger = logging.getLogger(__name__)


def _serialize_document(document: dict) -> dict:
    created_at = document.get("created_at")
    created_at_iso = (
        created_at.isoformat() if isinstance(created_at, datetime) else str(created_at or "")
    )

    clauses = document.get("clauses") or []

    return {
        "id": str(document.get("_id", "")),
        "source": document.get("source", ""),
        "source_type": document.get("source_type", ""),
        "title": document.get("title", ""),
        "hash": document.get("hash", ""),
        "created_at": created_at_iso,
        "clause_count": len(clauses),
    }


def _get_latest_documents(source: str, limit: int = 5) -> list[dict]:
    collection = get_collection(source)
    cursor = (
        collection.find(
            {},
            {
                "_id": 1,
                "source": 1,
                "source_type": 1,
                "title": 1,
                "hash": 1,
                "created_at": 1,
                "clauses": 1,
            },
        )
        .sort("created_at", -1)
        .limit(limit)
    )
    return [_serialize_document(doc) for doc in cursor]


@router.get("/debug/user-documents")
async def debug_user_documents() -> dict:
    """Return latest 5 user documents without raw sensitive content."""
    try:
        documents = await to_thread(_get_latest_documents, "user", 5)
        return {"count": len(documents), "documents": documents}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to fetch user debug documents")
        raise HTTPException(status_code=500, detail="Failed to fetch user documents") from exc


@router.get("/debug/external-documents")
async def debug_external_documents() -> dict:
    """Return latest 5 external documents without raw sensitive content."""
    try:
        documents = await to_thread(_get_latest_documents, "external", 5)
        return {"count": len(documents), "documents": documents}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to fetch external debug documents")
        raise HTTPException(status_code=500, detail="Failed to fetch external documents") from exc


@router.get("/debug/stats")
async def debug_stats() -> dict:
    """Return Layer 1 storage counts for user and external collections."""
    try:
        def _fetch_counts() -> tuple[int, int]:
            user_collection = get_collection("user")
            external_collection = get_collection("external")
            return user_collection.count_documents({}), external_collection.count_documents({})

        user_count, external_count = await to_thread(_fetch_counts)

        return {
            "user_documents_count": user_count,
            "external_documents_count": external_count,
            "total_documents": user_count + external_count,
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


@router.get("/test-mongo")
async def test_mongo() -> dict:
    """Insert a test document to verify MongoDB Atlas connectivity and writes."""
    try:
        def _insert_test() -> dict:
            db = get_database()
            collection = db["mongo_connection_tests"]
            test_doc = {
                "kind": "connectivity-test",
                "status": "ok",
                "created_at": datetime.now(timezone.utc),
            }
            result = collection.insert_one(test_doc)
            return {
                "inserted_id": str(result.inserted_id),
                "database": db.name,
                "collection": "mongo_connection_tests",
            }

        payload = await to_thread(_insert_test)
        return {"success": True, **payload}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Mongo test insert failed")
        raise HTTPException(status_code=500, detail="Mongo test insert failed") from exc
