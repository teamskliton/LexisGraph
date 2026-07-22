from asyncio import to_thread
import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.graph_builder import build_graph, create_similarity_edges
from app.services.graph_explorer import (
    get_clause_view,
    get_document_view,
    get_graph_root,
    get_regulation_view,
)
from app.services.graph_runtime import complete_job, fail_job, get_job, get_latest_job, start_job, update_job
from app.services.graph_view import get_graph_snapshot
from app.services.knowledge_graph import (
    activate_knowledge_graph,
    build_knowledge_graph,
    clear_active_knowledge_graph,
    delete_knowledge_graph,
    list_graph_documents,
    list_knowledge_graph_history,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class KnowledgeGraphRequest(BaseModel):
    user_document_id: str = Field(min_length=1)
    domain_document_ids: list[str] = Field(min_length=1)


@router.get("/graph/root")
async def graph_root(build_id: str | None = Query(default=None)) -> dict:
    try:
        return await to_thread(get_graph_root, build_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Could not load graph root")
        raise HTTPException(status_code=500, detail="Could not load graph root") from exc


@router.get("/graph/document/{document_id}")
async def graph_document(document_id: str, build_id: str | None = Query(default=None), limit: int = Query(30, ge=1, le=30)) -> dict:
    try:
        return await to_thread(get_document_view, document_id, build_id, limit)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Could not load graph document view")
        raise HTTPException(status_code=500, detail="Could not load graph document view") from exc


@router.get("/graph/clause/{clause_id}")
async def graph_clause(clause_id: str, build_id: str | None = Query(default=None), limit: int = Query(3, ge=1, le=3)) -> dict:
    try:
        return await to_thread(get_clause_view, clause_id, build_id, limit)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Could not load graph clause view")
        raise HTTPException(status_code=500, detail="Could not load graph clause view") from exc


@router.get("/graph/regulation/{regulation_id}")
async def graph_regulation(regulation_id: str, build_id: str | None = Query(default=None), limit: int = Query(5, ge=1, le=5)) -> dict:
    try:
        return await to_thread(get_regulation_view, regulation_id, build_id, limit)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Could not load graph regulation view")
        raise HTTPException(status_code=500, detail="Could not load graph regulation view") from exc


@router.get("/graph-documents")
async def graph_documents() -> dict:
    try:
        return await to_thread(list_graph_documents)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Could not list graph documents")
        raise HTTPException(status_code=500, detail="Could not list graph documents") from exc


@router.post("/build-knowledge-graph")
async def build_knowledge_graph_endpoint(payload: KnowledgeGraphRequest) -> dict:
    job = start_job("build-knowledge-graph")
    try:
        update_job(job["job_id"], "Loading selected documents", 15)
        result = await to_thread(build_knowledge_graph, payload.user_document_id, payload.domain_document_ids)
        complete_job(job["job_id"], result)
        return result
    except ValueError as exc:
        fail_job(job["job_id"], str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        fail_job(job["job_id"], str(exc))
        logger.exception("Knowledge graph build failed")
        raise HTTPException(status_code=500, detail=f"Knowledge graph build failed: {exc}") from exc


@router.post("/reset-knowledge-graph")
async def reset_knowledge_graph_endpoint() -> dict:
    try:
        return await to_thread(clear_active_knowledge_graph)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Knowledge graph reset failed")
        raise HTTPException(status_code=500, detail="Knowledge graph reset failed") from exc


@router.get("/graph-history")
async def graph_history() -> dict:
    try:
        return await to_thread(list_knowledge_graph_history)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Could not load graph history")
        raise HTTPException(status_code=500, detail="Could not load graph history") from exc


@router.post("/graph-history/{build_id}/activate")
async def activate_graph_history(build_id: str) -> dict:
    try:
        return await to_thread(activate_knowledge_graph, build_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Could not activate graph build")
        raise HTTPException(status_code=500, detail="Could not activate graph build") from exc


@router.delete("/graph-history/{build_id}")
async def delete_graph_history(build_id: str) -> dict:
    try:
        return await to_thread(delete_knowledge_graph, build_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Could not delete graph build")
        raise HTTPException(status_code=500, detail="Could not delete graph build") from exc


@router.post("/build-graph")
async def build_graph_endpoint() -> dict:
    """Build deduplication-safe Document/Clause graph in Neo4j from MongoDB."""
    job = start_job("build-graph")
    try:
        update_job(job["job_id"], "Building graph", 35)
        result = await to_thread(build_graph)
        complete_job(job["job_id"], result)
        return {
            "message": "Graph build completed successfully.",
            "job": get_job(job["job_id"]),
            "result": result,
        }
    except Exception as exc:  # noqa: BLE001
        fail_job(job["job_id"], str(exc))
        logger.exception("Graph build failed")
        raise HTTPException(
            status_code=500,
            detail=f"Graph build failed: {exc}",
        ) from exc


@router.post("/build-similarity")
async def build_similarity_endpoint() -> dict:
    """Create SIMILAR_TO relationships between clause nodes."""
    job = start_job("build-similarity")
    try:
        update_job(job["job_id"], "Creating similarity edges", 35)
        result = await to_thread(create_similarity_edges)
        complete_job(job["job_id"], result)
        return {
            "message": "Similarity build completed successfully.",
            "job": get_job(job["job_id"]),
            "result": result,
        }
    except Exception as exc:  # noqa: BLE001
        fail_job(job["job_id"], str(exc))
        logger.exception("Similarity build failed")
        raise HTTPException(status_code=500, detail="Similarity build failed") from exc


@router.get("/graph-view")
async def graph_view(
    max_documents: int = Query(12, ge=1, le=50),
    max_clauses: int = Query(120, ge=1, le=500),
    max_similarity_edges: int = Query(180, ge=0, le=1000),
    knowledge_graph_only: bool = Query(False),
    build_id: str | None = Query(default=None),
) -> dict:
    try:
        return await to_thread(get_graph_snapshot, max_documents, max_clauses, max_similarity_edges, knowledge_graph_only, build_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Graph view failed")
        raise HTTPException(status_code=500, detail="Graph view failed") from exc


@router.get("/graph-jobs/latest")
def graph_jobs_latest(kind: str | None = Query(default=None, pattern="^(build-graph|build-similarity|build-knowledge-graph)?$")) -> dict:
    job = get_latest_job(kind)
    if not job:
        return {"status": "idle", "job": None}
    return {"status": "ok", "job": job}
