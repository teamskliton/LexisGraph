from pathlib import Path

from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

import os
from contextlib import asynccontextmanager
import logging
import sys
import time

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.db.mongo import close_client as close_mongo_client
from app.db.mongo import get_client as get_mongo_client
from app.db.neo4j import close_driver as close_neo4j_driver
from app.db.neo4j import test_connection as test_neo4j_connection
from app.db.postgres import close_engine as close_postgres_engine
from app.db.postgres import test_connection as test_postgres_connection
from app.db.qdrant import close_client as close_qdrant_client
from app.db.qdrant import test_connection as test_qdrant_connection
from app.db.redis_client import close_client as close_redis_client
from app.db.redis_client import test_connection as test_redis_connection
from app.routes.auth import router as auth_router
from app.routes.compliance import router as compliance_router
from app.routes.debug import router as debug_router
from app.routes.domain import router as domain_router
from app.routes.export import router as export_router
from app.routes.fetch import router as fetch_router
from app.routes.graph import router as graph_router
from app.routes.neo4j_test import router as neo4j_test_router
from app.routes.retrieval import router as retrieval_router
from app.routes.upload import router as upload_router
from app.services.health import get_system_health
from app.services.retrieval import is_model_loaded, preload_model
from app.services.scraper import fetch_and_process_external_data

logger = logging.getLogger(__name__)
_scheduler: BackgroundScheduler | None = None


def _print_env_diagnostic() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    neo_uri = os.getenv("NEO4J_URI", "NOT SET")
    neo_uri_disp = (neo_uri[:35] + "...") if len(neo_uri) > 35 else neo_uri
    mongo_uri = os.getenv("MONGO_URI", "NOT SET")
    mongo_disp = (mongo_uri[:30] + "...") if len(mongo_uri) > 30 else mongo_uri
    print(f"[DIAG] Looking for .env at: {env_path}")
    print(f"[DIAG] .env exists: {env_path.exists()}")
    print(f"[DIAG] NEO4J_URI = {neo_uri_disp}")
    print(f"[DIAG] NEO4J_USER = {os.getenv('NEO4J_USER', 'NOT SET')}")
    print(f"[DIAG] NEO4J_DATABASE = {os.getenv('NEO4J_DATABASE', 'NOT SET')}")
    print(f"[DIAG] MONGO_URI = {mongo_disp}")


def configure_logging() -> None:
    root = logging.getLogger()
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)
    formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(name)s | %(message)s")
    handler.setFormatter(formatter)
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True
        uvicorn_logger.setLevel(logging.INFO)

    logging.getLogger("app").setLevel(logging.INFO)


def _resolve_cors_origins() -> list[str]:
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    configured = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
    if configured:
        return [item.strip() for item in configured.split(",") if item.strip()]
    if app_env == "production":
        return ["http://localhost:5173", "http://127.0.0.1:5173"]
    return ["*"]


def start_scheduler() -> BackgroundScheduler:
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
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler shutdown complete")
    _scheduler = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    _print_env_diagnostic()

    # ── MongoDB (existing) ────────────────────────────────────────────────────
    try:
        get_mongo_client().admin.command("ping")
        logger.info("Startup check: MongoDB connectivity OK")
    except Exception:  # noqa: BLE001
        logger.exception("Startup check: MongoDB connectivity FAILED")

    # ── Neo4j (existing) ──────────────────────────────────────────────────────
    try:
        test_neo4j_connection()
        logger.info("Startup check: Neo4j connectivity OK")
    except Exception:  # noqa: BLE001
        logger.exception("Startup check: Neo4j connectivity FAILED")

    # ── PostgreSQL (new) ──────────────────────────────────────────────────────
    try:
        if test_postgres_connection():
            logger.info("Startup check: PostgreSQL connectivity OK")
        else:
            logger.warning("Startup check: PostgreSQL connectivity FAILED")
    except Exception:  # noqa: BLE001
        logger.exception("Startup check: PostgreSQL connectivity FAILED")

    # ── Qdrant (new) ──────────────────────────────────────────────────────────
    try:
        if test_qdrant_connection():
            logger.info("Startup check: Qdrant connectivity OK")
        else:
            logger.warning("Startup check: Qdrant connectivity FAILED")
    except Exception:  # noqa: BLE001
        logger.exception("Startup check: Qdrant connectivity FAILED")

    # ── Redis (new) ───────────────────────────────────────────────────────────
    try:
        if test_redis_connection():
            logger.info("Startup check: Redis connectivity OK")
        else:
            logger.warning("Startup check: Redis connectivity FAILED")
    except Exception:  # noqa: BLE001
        logger.exception("Startup check: Redis connectivity FAILED")

    # ── Embedding model ───────────────────────────────────────────────────────
    try:
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

    try:
        close_postgres_engine()
    except Exception:  # noqa: BLE001
        logger.exception("Failed to dispose PostgreSQL engine")

    try:
        close_qdrant_client()
    except Exception:  # noqa: BLE001
        logger.exception("Failed to close Qdrant client")

    try:
        close_redis_client()
    except Exception:  # noqa: BLE001
        logger.exception("Failed to close Redis client")


def create_app() -> FastAPI:
    configure_logging()
    logger.info("[SYSTEM] Global logging configured at INFO level")
    logger.info("[SYSTEM] Terminal logging is active - all pipeline steps will be visible")

    app = FastAPI(
        title="LexisGraph Backend",
        version="0.1.0",
        description="Production-ready backend foundation for LexisGraph.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_resolve_cors_origins(),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        started = time.perf_counter()
        logger.info("[REQUEST] Started %s %s", request.method, request.url.path)
        response = await call_next(request)
        duration_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "[REQUEST] Completed %s %s status=%s duration_ms=%.2f",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response

    app.include_router(auth_router, tags=["auth"])
    app.include_router(upload_router, prefix="/api/v1", tags=["upload"])
    app.include_router(fetch_router, prefix="/api/v1", tags=["fetch"])
    app.include_router(debug_router, prefix="/api/v1", tags=["debug"])
    app.include_router(export_router, prefix="/api/v1", tags=["export"])
    app.include_router(domain_router, prefix="/api/v1", tags=["domain"])
    app.include_router(graph_router, prefix="/api/v1", tags=["graph"])
    app.include_router(compliance_router, prefix="/api/v1", tags=["compliance"])
    app.include_router(retrieval_router, prefix="/api/v1", tags=["retrieval"])
    app.include_router(neo4j_test_router, prefix="/api/v1", tags=["neo4j"])

    @app.get("/", tags=["system"])
    async def root():
        return {
        "name": "LexisGraph Backend",
        "version": "0.1.0",
        "status": "running",
        "docs": "/docs",
        "health": "/health",
        "api": "/api/v1"
    }

    @app.get("/health", tags=["system"])
    async def health_check() -> dict:
        return get_system_health()

    return app


app = create_app()
