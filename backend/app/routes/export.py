from asyncio import to_thread
import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse

from sqlalchemy import select
from app.db.session import get_session
from app.db.models.document import Document
from app.services.export_service import export_to_excel, export_to_pdf

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_latest_documents(source: str, limit: int = 20) -> list[dict]:
    with get_session() as session:
        docs = session.scalars(select(Document).order_by(Document.created_at.desc()).limit(limit)).all()
        return [
            {
                "title": doc.original_filename,
                "source_type": doc.document_type.value if hasattr(doc.document_type, "value") else str(doc.document_type),
                "date": doc.created_at.strftime("%Y-%m-%d") if doc.created_at else "",
                "clauses": [],
            }
            for doc in docs
        ]


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
