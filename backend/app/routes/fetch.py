from asyncio import to_thread
from fastapi import APIRouter, HTTPException, Query
import logging

from app.services.scraper import (
    fetch_barandbench_data,
    fetch_and_process_external_data,
    fetch_gazette_data,
    fetch_livelaw_data,
    fetch_news_data,
    ingest_external_records,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/fetch")
async def fetch_data(
    source: str = Query("all", pattern="^(gazette|news|livelaw|barandbench|all)$"),
    max_items: int = Query(10, ge=1, le=25),
) -> dict:
    """Fetch external legal updates, preprocess, and store in MongoDB."""
    try:
        response: dict[str, dict] = {}

        if source in {"gazette", "all"}:
            gazette_records = await to_thread(fetch_gazette_data, max_items)
            response["gazette"] = await to_thread(ingest_external_records, gazette_records, "gazette")

        if source in {"news", "all"}:
            news_records = await to_thread(fetch_news_data, max_items)
            response["news"] = await to_thread(ingest_external_records, news_records, "news")

        if source in {"livelaw", "all"}:
            livelaw_records = await to_thread(fetch_livelaw_data, max_items)
            response["livelaw"] = await to_thread(ingest_external_records, livelaw_records, "livelaw")

        if source in {"barandbench", "all"}:
            barandbench_records = await to_thread(fetch_barandbench_data, max_items)
            response["barandbench"] = await to_thread(ingest_external_records, barandbench_records, "barandbench")

        logger.info("External fetch completed for source=%s", source)
        return {
            "message": "External data fetched, preprocessed, and stored.",
            "source": source,
            "results": response,
        }
    except ValueError as exc:
        logger.warning("Fetch validation error: %s", str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Fetch failed for source=%s", source)
        raise HTTPException(status_code=500, detail="Fetch failed") from exc


@router.get("/fetch-now")
async def fetch_now(max_items: int = Query(10, ge=1, le=25)) -> dict:
    """Manually trigger full external ingestion pipeline."""
    try:
        result = await to_thread(fetch_and_process_external_data, max_items)
        return {
            "message": "Manual external ingestion triggered successfully.",
            "result": result,
        }
    except ValueError as exc:
        logger.warning("Manual fetch validation error: %s", str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Manual fetch-now failed")
        raise HTTPException(status_code=500, detail="Manual ingestion failed") from exc
