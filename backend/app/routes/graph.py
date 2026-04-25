from asyncio import to_thread
import logging

from fastapi import APIRouter, HTTPException

from app.services.graph_builder import build_graph, create_similarity_edges

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/build-graph")
async def build_graph_endpoint() -> dict:
    """Build deduplication-safe Document/Clause graph in Neo4j from MongoDB."""
    try:
        result = await to_thread(build_graph)
        return {
            "message": "Graph build completed successfully.",
            "result": result,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Graph build failed")
        raise HTTPException(
            status_code=500,
            detail=f"Graph build failed: {exc}",
        ) from exc


@router.post("/build-similarity")
async def build_similarity_endpoint() -> dict:
    """Create SIMILAR_TO relationships between clause nodes."""
    try:
        result = await to_thread(create_similarity_edges)
        return {
            "message": "Similarity build completed successfully.",
            "result": result,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Similarity build failed")
        raise HTTPException(status_code=500, detail="Similarity build failed") from exc
