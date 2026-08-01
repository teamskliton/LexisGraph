"""
Compliance Background Jobs API Router.
Provides status monitoring, progress updates, job listing, and cancellation endpoints.
"""
from __future__ import annotations

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.compliance import service
from app.compliance.models import ComplianceJobStatus
from app.compliance.schemas import ComplianceJobResponse
from app.core.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get(
    "/{job_id}",
    response_model=ComplianceJobResponse,
    summary="Get job status and progress",
)
def get_job_status(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComplianceJobResponse:
    """
    Return status, progress (0-100), current_step, and report_id (when COMPLETED) for a compliance job.
    """
    job = service.get_compliance_job_by_id(db, job_id, current_user.id)
    return ComplianceJobResponse.model_validate(job)


@router.get(
    "",
    response_model=List[ComplianceJobResponse],
    summary="List active compliance jobs for user",
)
@router.get(
    "/",
    response_model=List[ComplianceJobResponse],
    summary="List active compliance jobs for user (alias)",
    include_in_schema=False,
)
def list_jobs(
    organization_id: Optional[uuid.UUID] = Query(None, description="Filter by Organization ID"),
    status: Optional[ComplianceJobStatus] = Query(None, description="Filter by Job Status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ComplianceJobResponse]:
    """
    Return current user's compliance jobs ordered newest first.
    """
    jobs = service.list_compliance_jobs(
        db,
        user_id=current_user.id,
        organization_id=organization_id,
        status_filter=status,
        skip=skip,
        limit=limit,
    )
    return [ComplianceJobResponse.model_validate(job) for job in jobs]


@router.delete(
    "/{job_id}",
    response_model=ComplianceJobResponse,
    summary="Cancel a queued or running compliance job",
)
def cancel_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComplianceJobResponse:
    """
    Cancel a queued or running compliance job.
    """
    job = service.cancel_compliance_job_by_id(db, job_id, current_user.id)
    return ComplianceJobResponse.model_validate(job)
