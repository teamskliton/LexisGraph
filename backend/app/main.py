from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import os
from apscheduler.schedulers.background import BackgroundScheduler

from app.db.mongo import get_client as get_mongo_client
from app.db.mongo import close_client as close_mongo_client
from app.db.neo4j import test_connection as test_neo4j_connection
from app.db.neo4j import close_driver as close_neo4j_driver
from app.routes.compliance import router as compliance_router
from app.routes.debug import router as debug_router
from app.routes.domain import router as domain_router
from app.routes.export import router as export_router
from app.routes.fetch import router as fetch_router
from app.routes.graph import router as graph_router
from app.routes.neo4j_test import router as neo4j_test_router
from app.routes.retrieval import router as retrieval_router
from app.routes.upload import router as upload_router
from app.services.retrieval import is_model_loaded, preload_model
from app.services.scraper import fetch_and_process_external_data


logger = logging.getLogger(__name__)
_scheduler: BackgroundScheduler | None = None


def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_cors_origins() -> list[str]:
    configured = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]
    return ["http://localhost:3000", "http://127.0.0.1:3000", "null"]


def configure_logging() -> None:
    """Configure application-wide logging."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )



def start_scheduler() -> BackgroundScheduler:
    """Create and start scheduler for periodic external data ingestion."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        fetch_and_process_external_data,
        trigger="interval",
        hours=6,
        id="external_ingestion_job",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    scheduler.start()
    logger.info("Scheduler started with 6-hour external ingestion job")
    _scheduler = scheduler
    return scheduler


def shutdown_scheduler() -> None:
    """Shutdown scheduler gracefully on app exit."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler shutdown complete")
    _scheduler = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Manage application startup and shutdown resources."""
    preload_embedding_model = _env_flag("PRELOAD_EMBEDDING_MODEL", True)

    try:
        get_mongo_client().admin.command("ping")
        logger.info("Startup check: MongoDB connectivity OK")
    except Exception:  # noqa: BLE001
        logger.exception("Startup check: MongoDB connectivity FAILED")

    try:
        test_neo4j_connection()
        logger.info("Startup check: Neo4j connectivity OK")
    except Exception:  # noqa: BLE001
        logger.exception("Startup check: Neo4j connectivity FAILED")

    try:
        if preload_embedding_model:
            preload_model()
        logger.info("Startup check: embedding model loaded=%s", is_model_loaded())
    except Exception:  # noqa: BLE001
        logger.exception("Startup check: embedding model initialization FAILED")

    try:
        start_scheduler()
    except Exception:  # noqa: BLE001
        logger.exception("Failed to start scheduler")

    yield

    try:
        shutdown_scheduler()
    except Exception:  # noqa: BLE001
        logger.exception("Failed to shutdown scheduler")

    try:
        close_neo4j_driver()
    except Exception:  # noqa: BLE001
        logger.exception("Failed to close Neo4j driver")

    try:
        close_mongo_client()
    except Exception:  # noqa: BLE001
        logger.exception("Failed to close MongoDB client")


def create_app() -> FastAPI:
    """Application factory for FastAPI app."""
    configure_logging()

    app = FastAPI(
        title="LexisGraph Backend",
        version="0.1.0",
        description="Production-ready backend foundation for LexisGraph.",
        lifespan=lifespan,
    )

    cors_allow_origins = _parse_cors_origins()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_allow_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    app.include_router(upload_router, prefix="/api/v1", tags=["upload"])
    app.include_router(fetch_router, prefix="/api/v1", tags=["fetch"])
    app.include_router(debug_router, prefix="/api/v1", tags=["debug"])
    app.include_router(export_router, prefix="/api/v1", tags=["export"])
    app.include_router(domain_router, prefix="/api/v1", tags=["domain"])
    app.include_router(graph_router, prefix="/api/v1", tags=["graph"])
    app.include_router(compliance_router, prefix="/api/v1", tags=["compliance"])
    app.include_router(retrieval_router, prefix="/api/v1", tags=["retrieval"])
    app.include_router(neo4j_test_router, prefix="/api/v1", tags=["neo4j"])

    @app.get("/health", tags=["system"])
    async def health_check() -> dict:
        mongo_ok = False
        neo4j_ok = False

        try:
            get_mongo_client().admin.command("ping")
            mongo_ok = True
        except Exception:  # noqa: BLE001
            logger.exception("Health check failed for MongoDB")

        try:
            test_neo4j_connection()
            neo4j_ok = True
        except Exception:  # noqa: BLE001
            logger.exception("Health check failed for Neo4j")

        model_loaded = is_model_loaded()
        overall = "ok" if (mongo_ok and neo4j_ok and model_loaded) else "degraded"
        return {
            "status": overall,
            "checks": {
                "mongo": "ok" if mongo_ok else "error",
                "neo4j": "ok" if neo4j_ok else "error",
                "embedding_model": "ok" if model_loaded else "error",
            },
        }

    return app


app = create_app()
