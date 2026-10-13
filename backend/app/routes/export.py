from asyncio import to_thread
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.models import User, Organization
from app.db.models.document import Document
from app.db.models.regulation import Regulation
from app.db.models.rbac import OrganizationMember, MemberStatus
from app.db.session import get_db
from app.routes.reports import verify_user_organization_access
from app.services.export_service import export_to_excel, export_to_pdf

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_workspace_documents(db: Session, organization_id: uuid.UUID, limit: int = 20) -> list[dict]:
    docs = db.scalars(
        select(Document)
        .where(Document.organization_id == organization_id)
        .order_by(Document.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "title": doc.original_filename,
            "original_filename": doc.original_filename,
            "source_type": doc.document_type.value if hasattr(doc.document_type, "value") else str(doc.document_type),
            "date": doc.created_at.strftime("%Y-%m-%d") if doc.created_at else "",
            "clauses": [],
        }
        for doc in docs
    ]


def _get_external_regulations(db: Session, limit: int = 20) -> list[dict]:
    regs = db.scalars(
        select(Regulation)
        .order_by(Regulation.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "title": reg.title or reg.act_name or reg.original_filename,
            "source_type": "REGULATION",
            "date": reg.created_at.strftime("%Y-%m-%d") if reg.created_at else "",
            "clauses": [],
        }
        for reg in regs
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
async def export_user_data(
    format: str = Query("json", pattern="^(pdf|excel|json)$"),
    organization_id: Optional[uuid.UUID] = Query(None, description="Workspace Organization UUID filter"),
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-Id"),
    x_organization_id: Optional[str] = Header(None, alias="X-Organization-Id"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_org_id = organization_id
    if not target_org_id and (x_workspace_id or x_organization_id):
        try:
            target_org_id = uuid.UUID(str(x_workspace_id or x_organization_id).strip())
        except (ValueError, TypeError):
            pass

    if target_org_id:
        if not verify_user_organization_access(db, current_user.id, target_org_id):
            raise HTTPException(
                status_code=403,
                detail="You do not have access to export documents from this organization.",
            )
    else:
        target_org_id = db.scalar(
            select(OrganizationMember.organization_id).where(
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            ).order_by(OrganizationMember.joined_at.desc()).limit(1)
        )
        if not target_org_id:
            target_org_id = db.scalar(
                select(Organization.id).where(Organization.created_by == current_user.id).limit(1)
            )

    if not target_org_id:
        raise HTTPException(
            status_code=400,
            detail="An active organization workspace is required for exporting documents.",
        )

    try:
        data = await to_thread(_get_workspace_documents, db, target_org_id, 20)
        if not data:
            return JSONResponse({"message": "No workspace documents found for export.", "documents": []})
        if format == "json":
            return JSONResponse({"documents": data})
        return await to_thread(_build_export_response, data, format, f"workspace_{target_org_id}_export")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Workspace export failed")
        raise HTTPException(status_code=500, detail="Workspace export failed") from exc


@router.get("/export/external")
async def export_external_data(
    format: str = Query("json", pattern="^(pdf|excel|json)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        data = await to_thread(_get_external_regulations, db, 20)
        if not data:
            return JSONResponse({"message": "No external regulations found for export.", "documents": []})
        if format == "json":
            return JSONResponse({"documents": data})
        return await to_thread(_build_export_response, data, format, "external_regulations_export")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("External export failed")
        raise HTTPException(status_code=500, detail="External export failed") from exc
