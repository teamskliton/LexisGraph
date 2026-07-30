"""
PDF export route handlers.
Provides GET /reports/{report_id}/pdf endpoint to download compliance reports as PDF documents.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.services.activity_service import log_activity
from app.services.pdf_report_service import generate_compliance_report_pdf
from app.services.report_service import (
    ReportNotFoundError,
    ReportService,
    get_report_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["pdf"])


@router.get(
    "/reports/{report_id}/pdf",
    summary="Download PDF compliance report",
    description="Loads stored report from PostgreSQL and generates a downloadable PDF document.",
)
def download_report_pdf(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    service: ReportService = Depends(get_report_service),
    current_user: Optional[User] = Depends(get_current_user),
) -> Response:
    """
    Export an existing compliance report as an A4 PDF document.
    Does NOT rerun compliance analysis or call any LLMs.
    """
    # 1. Fetch report from PostgreSQL
    try:
        report = service.get_report(db, report_id)
    except ReportNotFoundError:
        logger.warning("PDF export requested for non-existent report_id: %s", report_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID '{report_id}' not found.",
        )
    except Exception as exc:
        logger.exception("Error fetching report from DB for ID %s: %s", report_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving report record.",
        )

    # 2. Generate PDF using stored report data
    try:
        pdf_bytes = generate_compliance_report_pdf(report)
    except Exception as exc:
        logger.exception("Failed to generate PDF for report %s: %s", report_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate PDF report document.",
        )

    # 3. Log Activity
    user_id = current_user.id if current_user else report.created_by
    log_activity(
        db,
        user_id=user_id,
        event_type="PDF_DOWNLOADED",
        title="Downloaded PDF Report",
        description=f"Exported compliance report document '{report_id}'",
        icon_type="download",
        extra_data={"report_id": str(report_id)},
    )

    # 4. Return downloadable PDF response
    filename = f"LexisGraph_Compliance_Report_{report_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "application/pdf",
        },
    )
