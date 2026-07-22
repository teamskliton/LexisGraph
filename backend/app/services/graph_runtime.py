from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4

_JOBS: dict[str, dict] = {}
_LATEST_BY_KIND: dict[str, str] = {}
_LOCK = Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def start_job(kind: str, metadata: dict | None = None) -> dict:
    job_id = uuid4().hex
    payload = {
        "job_id": job_id,
        "kind": kind,
        "status": "running",
        "step": "Queued",
        "progress": 5,
        "started_at": _now_iso(),
        "updated_at": _now_iso(),
        "metadata": metadata or {},
    }
    with _LOCK:
        _JOBS[job_id] = payload
        _LATEST_BY_KIND[kind] = job_id
    return dict(payload)


def update_job(job_id: str, step: str, progress: int, extra: dict | None = None) -> dict | None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return None
        job["step"] = step
        job["progress"] = max(0, min(100, int(progress)))
        job["updated_at"] = _now_iso()
        if extra:
            job.update(extra)
        return dict(job)


def complete_job(job_id: str, result: dict | None = None) -> dict | None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return None
        job["status"] = "completed"
        job["step"] = "Completed"
        job["progress"] = 100
        job["updated_at"] = _now_iso()
        job["completed_at"] = _now_iso()
        if result is not None:
            job["result"] = result
        return dict(job)


def fail_job(job_id: str, message: str) -> dict | None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return None
        job["status"] = "error"
        job["step"] = "Failed"
        job["progress"] = 100
        job["updated_at"] = _now_iso()
        job["message"] = message
        return dict(job)


def get_job(job_id: str) -> dict | None:
    with _LOCK:
        job = _JOBS.get(job_id)
        return dict(job) if job else None


def get_latest_job(kind: str | None = None) -> dict | None:
    with _LOCK:
        if kind:
            job_id = _LATEST_BY_KIND.get(kind)
            job = _JOBS.get(job_id) if job_id else None
            return dict(job) if job else None

        if not _JOBS:
            return None

        latest = max(_JOBS.values(), key=lambda item: str(item.get("updated_at", "")))
        return dict(latest)
