"""
Job Manager Service — In-memory real-time event broker & connection manager.
Broadcasting job progress, completion, failure, and cancellation events over WebSockets and SSE.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Set

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class JobManager:
    """
    Singleton Manager for active WebSocket connections and SSE event streams.
    Handles user channel subscriptions, event broadcasts, and estimated remaining time calculations.
    """

    def __init__(self) -> None:
        self._ws_connections: Dict[uuid.UUID, Set[WebSocket]] = {}
        self._sse_queues: Dict[uuid.UUID, Set[asyncio.Queue[dict[str, Any]]]] = {}
        self._job_start_times: Dict[uuid.UUID, float] = {}
        self._lock = asyncio.Lock()

    # ---------------------------------------------------------------------------
    # WebSocket Connection Registration
    # ---------------------------------------------------------------------------
    async def connect_ws(self, job_id: uuid.UUID, websocket: WebSocket) -> None:
        """Register an active WebSocket connection for a job."""
        await websocket.accept()
        async with self._lock:
            if job_id not in self._ws_connections:
                self._ws_connections[job_id] = set()
            self._ws_connections[job_id].add(websocket)
        logger.info("WebSocket connected: job_id=%s active_connections=%d", job_id, len(self._ws_connections[job_id]))

    async def disconnect_ws(self, job_id: uuid.UUID, websocket: WebSocket) -> None:
        """Unregister a WebSocket connection."""
        async with self._lock:
            if job_id in self._ws_connections:
                self._ws_connections[job_id].discard(websocket)
                if not self._ws_connections[job_id]:
                    del self._ws_connections[job_id]
        logger.info("WebSocket disconnected: job_id=%s", job_id)

    # ---------------------------------------------------------------------------
    # SSE Queue Registration
    # ---------------------------------------------------------------------------
    async def subscribe_sse(self, job_id: uuid.UUID) -> asyncio.Queue[dict[str, Any]]:
        """Subscribe to Server-Sent Events stream by creating an event queue."""
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        async with self._lock:
            if job_id not in self._sse_queues:
                self._sse_queues[job_id] = set()
            self._sse_queues[job_id].add(queue)
        logger.info("SSE client subscribed: job_id=%s active_sse=%d", job_id, len(self._sse_queues[job_id]))
        return queue

    async def unsubscribe_sse(self, job_id: uuid.UUID, queue: asyncio.Queue[dict[str, Any]]) -> None:
        """Unsubscribe from SSE stream."""
        async with self._lock:
            if job_id in self._sse_queues:
                self._sse_queues[job_id].discard(queue)
                if not self._sse_queues[job_id]:
                    del self._sse_queues[job_id]
        logger.info("SSE client unsubscribed: job_id=%s", job_id)

    # ---------------------------------------------------------------------------
    # Dynamic ETA Estimation
    # ---------------------------------------------------------------------------
    def calculate_estimated_remaining_seconds(self, job_id: uuid.UUID, progress: int) -> int | None:
        """Calculate dynamic estimated remaining seconds based on elapsed time and progress."""
        if progress <= 0 or progress >= 100:
            return 0 if progress >= 100 else None

        start_time = self._job_start_times.get(job_id)
        if not start_time:
            self._job_start_times[job_id] = time.perf_counter()
            return None

        elapsed = time.perf_counter() - start_time
        if elapsed <= 0:
            return None

        total_estimated = elapsed / (progress / 100.0)
        remaining = max(0, int(round(total_estimated - elapsed)))
        return remaining

    # ---------------------------------------------------------------------------
    # Broadcast Methods
    # ---------------------------------------------------------------------------
    def broadcast_job_started(self, job_id: uuid.UUID, organization_id: uuid.UUID) -> None:
        """Broadcast job_started event."""
        self._job_start_times[job_id] = time.perf_counter()
        payload = {
            "event": "job_started",
            "job_id": str(job_id),
            "organization_id": str(organization_id),
            "status": "RUNNING",
            "progress": 5,
            "current_step": "Loading report",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.dispatch_event(job_id, payload)

    def broadcast_job_progress(
        self,
        job_id: uuid.UUID,
        status: str,
        progress: int,
        current_step: str,
        updated_at: str | None = None,
    ) -> None:
        """Broadcast progress_updated event."""
        eta = self.calculate_estimated_remaining_seconds(job_id, progress)
        payload = {
            "event": "progress_updated",
            "job_id": str(job_id),
            "status": status,
            "progress": progress,
            "current_step": current_step,
            "estimated_remaining_seconds": eta,
            "updated_at": updated_at or datetime.now(timezone.utc).isoformat(),
        }
        self.dispatch_event(job_id, payload)

    def broadcast_job_completed(
        self,
        job_id: uuid.UUID,
        report_id: uuid.UUID | str,
        processing_time_ms: float,
    ) -> None:
        """Broadcast job_completed event and clean up connections."""
        payload = {
            "event": "job_completed",
            "job_id": str(job_id),
            "status": "COMPLETED",
            "progress": 100,
            "current_step": "Completed",
            "report_id": str(report_id),
            "processing_time_ms": processing_time_ms,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.dispatch_event(job_id, payload)
        self._job_start_times.pop(job_id, None)

    def broadcast_job_failed(self, job_id: uuid.UUID, error: str) -> None:
        """Broadcast job_failed event."""
        payload = {
            "event": "job_failed",
            "job_id": str(job_id),
            "status": "FAILED",
            "error": error,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.dispatch_event(job_id, payload)
        self._job_start_times.pop(job_id, None)

    def broadcast_job_cancelled(self, job_id: uuid.UUID) -> None:
        """Broadcast job_cancelled event."""
        payload = {
            "event": "job_cancelled",
            "job_id": str(job_id),
            "status": "CANCELLED",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.dispatch_event(job_id, payload)
        self._job_start_times.pop(job_id, None)

    def dispatch_event(self, job_id: uuid.UUID, payload: dict[str, Any]) -> None:
        """Schedules non-blocking async dispatch of payload to WebSockets and SSE queues."""
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._send_broadcast(job_id, payload))
        except RuntimeError:
            # Fallback if running outside an active asyncio loop
            asyncio.run(self._send_broadcast(job_id, payload))

    async def _send_broadcast(self, job_id: uuid.UUID, payload: dict[str, Any]) -> None:
        """Send event payload to registered WebSockets and SSE queues."""
        logger.info(
            "Broadcast event: event=%s job_id=%s progress=%s%% step=%r",
            payload.get("event"),
            job_id,
            payload.get("progress"),
            payload.get("current_step"),
        )
        json_data = json.dumps(payload)

        # 1. Send to WebSockets
        ws_list = list(self._ws_connections.get(job_id, set()))
        for ws in ws_list:
            try:
                await ws.send_text(json_data)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Connection error sending WebSocket event to job_id=%s: %s", job_id, exc)
                await self.disconnect_ws(job_id, ws)

        # 2. Send to SSE Queues
        sse_list = list(self._sse_queues.get(job_id, set()))
        for q in sse_list:
            try:
                q.put_nowait(payload)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Connection error queueing SSE event for job_id=%s: %s", job_id, exc)


# Global singleton instance
job_manager = JobManager()
