from asyncio import to_thread
from datetime import datetime
import logging

from fastapi import APIRouter, HTTPException

from app.db.mongo import get_collection

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
