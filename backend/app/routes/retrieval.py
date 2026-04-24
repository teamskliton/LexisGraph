import logging

from fastapi import APIRouter, HTTPException

from app.services.retrieval import retrieve_relevant_clauses

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/retrieve")
def retrieve(query: str) -> dict:
    try:
        result = retrieve_relevant_clauses(query)
        return {"results": result}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Retrieval failed")
        raise HTTPException(status_code=500, detail="Retrieval failed") from exc
