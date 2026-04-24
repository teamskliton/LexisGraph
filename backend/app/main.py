from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from apscheduler.schedulers.background import BackgroundScheduler

from app.routes.debug import router as debug_router
from app.routes.domain import router as domain_router
from app.routes.export import router as export_router
from app.routes.fetch import router as fetch_router
from app.routes.upload import router as upload_router
from app.services.scraper import fetch_and_process_external_data


logger = logging.getLogger(__name__)
_scheduler: BackgroundScheduler | None = None


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
    try:
        start_scheduler()
    except Exception:  # noqa: BLE001
        logger.exception("Failed to start scheduler")

    yield

    try:
        shutdown_scheduler()
    except Exception:  # noqa: BLE001
        logger.exception("Failed to shutdown scheduler")


def create_app() -> FastAPI:
    """Application factory for FastAPI app."""
    configure_logging()

    app = FastAPI(
        title="LexisGraph Backend",
        version="0.1.0",
        description="Production-ready backend foundation for LexisGraph.",
        lifespan=lifespan,
    )

    # Allow browser clients (including local file:// frontend) to call APIs.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(upload_router, prefix="/api/v1", tags=["upload"])
    app.include_router(fetch_router, prefix="/api/v1", tags=["fetch"])
    app.include_router(debug_router, prefix="/api/v1", tags=["debug"])
    app.include_router(export_router, prefix="/api/v1", tags=["export"])
    app.include_router(domain_router, prefix="/api/v1", tags=["domain"])

    @app.get("/health", tags=["system"])
    async def health_check() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
