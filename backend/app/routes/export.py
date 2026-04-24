from asyncio import to_thread
import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse

from app.db.mongo import get_collection
from app.services.export_service import export_to_excel, export_to_pdf

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_latest_documents(source: str, limit: int = 20) -> list[dict]:
    collection = get_collection(source)
    cursor = (
        collection.find(
            {},
            {
                "title": 1,
                "source_type": 1,
                "date": 1,
                "clauses": 1,
            },
        )
        .sort("created_at", -1)
        .limit(limit)
    )
    return list(cursor)


def _build_export_response(data: list[dict], export_format: str, file_name: str) -> StreamingResponse:
    if export_format == "excel":
        content = export_to_excel(data)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        file_name = f"{file_name}.xlsx"
    elif export_format == "pdf":
        content = export_to_pdf(data)
        media_type = "application/pdf"
        file_name = f"{file_name}.pdf"
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Use pdf or excel.")

    return StreamingResponse(
        content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={file_name}"},
    )


@router.get("/export/user")
async def export_user_data(format: str = Query(..., pattern="^(pdf|excel)$")):
    try:
        data = await to_thread(_get_latest_documents, "user", 20)
        if not data:
            return JSONResponse({"message": "No user documents found for export."})
        return await to_thread(_build_export_response, data, format, "user_export")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("User export failed")
        raise HTTPException(status_code=500, detail="User export failed") from exc


@router.get("/export/external")
async def export_external_data(format: str = Query(..., pattern="^(pdf|excel)$")):
    try:
        data = await to_thread(_get_latest_documents, "external", 20)
        if not data:
            return JSONResponse({"message": "No external documents found for export."})
        return await to_thread(_build_export_response, data, format, "external_export")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("External export failed")
        raise HTTPException(status_code=500, detail="External export failed") from exc
