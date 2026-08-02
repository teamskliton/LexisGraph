"""
Compliance Background Jobs API Router.
Provides status monitoring, progress updates, job listing, and cancellation endpoints.
"""
from __future__ import annotations

import asyncio
import json
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


# ---------------------------------------------------------------------------
# Real-Time Connections: WebSockets & Server-Sent Events (SSE)
# ---------------------------------------------------------------------------

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from app.core.security import verify_token, TokenInvalidError, TokenExpiredError
from app.db.session import get_session
from app.services.job_manager import job_manager


def _authenticate_ws_token(token: str | None, db: Session, job_id: uuid.UUID) -> User:
    """Helper verifying JWT token and job ownership for WebSocket & SSE connections."""
    if not token:
        raise ValueError("Missing authentication token.")
    try:
        payload = verify_token(token)
    except (TokenInvalidError, TokenExpiredError) as exc:
        raise ValueError(f"Invalid authentication token: {exc}") from exc

    sub = payload.get("sub")
    if not sub:
        raise ValueError("Token missing subject claim.")

    user = db.get(User, uuid.UUID(sub))
    if not user or not user.is_active:
        raise ValueError("User account inactive or not found.")

    job = service.crud.get_compliance_job(db, job_id)
    if not job:
        raise ValueError(f"ComplianceJob {job_id} not found.")

    if job.created_by != user.id and job.organization.created_by != user.id:
        raise ValueError("User does not own or have access to this compliance job.")

    return user


@router.websocket("/ws/{job_id}")
@router.websocket("/{job_id}/ws")
def websocket_job_endpoint_legacy(websocket: WebSocket, job_id: uuid.UUID):
    """Legacy WebSocket alias path."""
    return websocket_job_progress(websocket, job_id)


@router.websocket("/ws/jobs/{job_id}")
async def websocket_job_progress(websocket: WebSocket, job_id: uuid.UUID):
    """
    Real-time WebSocket endpoint for compliance job progress updates.
    Authenticated via JWT token in query parameter `?token=...`.
    Restricted strictly to the job owner.
    """
    token = websocket.query_params.get("token") or websocket.headers.get("sec-websocket-protocol")
    db = get_session()
    try:
        user = _authenticate_ws_token(token, db, job_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("WebSocket authentication failed for job_id=%s: %s", job_id, exc)
        await websocket.close(code=1008, reason=str(exc))
        db.close()
        return

    job = service.crud.get_compliance_job(db, job_id)
    db.close()

    if not job:
        await websocket.close(code=1008, reason="Job not found")
        return

    # Accept connection and register with JobManager
    await job_manager.connect_ws(job_id, websocket)

    # Send immediate initial state snapshot
    status_str = job.status.value if hasattr(job.status, "value") else str(job.status)
    initial_event = {
        "event": "progress_updated" if status_str == "RUNNING" else ("job_completed" if status_str == "COMPLETED" else "job_started"),
        "job_id": str(job.id),
        "status": status_str,
        "progress": job.progress,
        "current_step": job.current_step,
        "report_id": str(job.report_id) if job.report_id else None,
        "estimated_remaining_seconds": job_manager.calculate_estimated_remaining_seconds(job_id, job.progress),
        "updated_at": job.updated_at.isoformat() if hasattr(job.updated_at, "isoformat") else str(job.updated_at),
    }

    try:
        await websocket.send_json(initial_event)
        # Keep connection open until client disconnects or job finishes
        while True:
            # Receive client ping or close message
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected gracefully for job_id=%s", job_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("WebSocket error for job_id=%s: %s", job_id, exc)
    finally:
        await job_manager.disconnect_ws(job_id, websocket)


from fastapi import Request


@router.get(
    "/{job_id}/stream",
    summary="Server-Sent Events (SSE) fallback stream for job progress",
)
async def sse_job_progress(
    request: Request,
    job_id: uuid.UUID,
    token: Optional[str] = Query(None, description="JWT Bearer token for SSE authentication"),
    db: Session = Depends(get_db),
):
    """
    Server-Sent Events (SSE) fallback endpoint producing `text/event-stream` updates.
    """
    auth_header = request.headers.get("Authorization")
    effective_token = token
    if not effective_token and auth_header and auth_header.startswith("Bearer "):
        effective_token = auth_header.split(" ", 1)[1]

    try:
        user = _authenticate_ws_token(effective_token, db, job_id)
    except Exception as exc:
        logger.warning("SSE authentication failed for job_id=%s: %s", job_id, exc)
        return StreamingResponse(
            content=f"event: error\ndata: {str(exc)}\n\n",
            media_type="text/event-stream",
            status_code=401,
        )

    job = service.crud.get_compliance_job(db, job_id)
    if not job:
        return StreamingResponse(
            content="event: error\ndata: Job not found\n\n",
            media_type="text/event-stream",
            status_code=404,
        )

    queue = await job_manager.subscribe_sse(job_id)

    async def event_generator():
        try:
            # Send initial snapshot
            status_str = job.status.value if hasattr(job.status, "value") else str(job.status)
            initial = {
                "event": "progress_updated",
                "job_id": str(job.id),
                "status": status_str,
                "progress": job.progress,
                "current_step": job.current_step,
                "report_id": str(job.report_id) if job.report_id else None,
                "updated_at": job.updated_at.isoformat() if hasattr(job.updated_at, "isoformat") else str(job.updated_at),
            }
            yield f"data: {json.dumps(initial)}\n\n"
            if status_str in ("COMPLETED", "FAILED", "CANCELLED"):
                return

            while True:
                payload = await queue.get()
                yield f"data: {json.dumps(payload)}\n\n"
                if payload.get("status") in ("COMPLETED", "FAILED", "CANCELLED"):
                    break
        except asyncio.CancelledError:
            logger.info("SSE connection cancelled for job_id=%s", job_id)
        finally:
            await job_manager.unsubscribe_sse(job_id, queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
