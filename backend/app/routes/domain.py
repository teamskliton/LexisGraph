from asyncio import TimeoutError as AsyncTimeoutError, to_thread, wait_for
import asyncio
from datetime import datetime, timezone
from pathlib import Path
import json
import logging
import re

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse

from app.services.preprocessing import preprocess_text, split_text_into_chunks
from app.utils.file_handler import UnsupportedFileTypeError, extract_text
from app.utils.hash import generate_content_hash

router = APIRouter()
logger = logging.getLogger(__name__)

_DOMAIN_ROOT = Path("data/domain_documents")
_DOMAIN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{2,40}$")
_PROCESS_TIMEOUT_SECONDS = 300
UPLOAD_STATUS: dict[str, dict] = {}


def _set_upload_status(file_hash: str, status: str, step: str, progress: int, message: str | None = None, extra: dict | None = None) -> None:
    payload = {
        "hash": file_hash,
        "status": status,
        "step": step,
        "progress": progress,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if message:
        payload["message"] = message
    if extra:
        payload.update(extra)
    UPLOAD_STATUS[file_hash] = payload


def _normalize_domain(domain: str) -> str:
    candidate = (domain or "").strip()
    if not _DOMAIN_PATTERN.fullmatch(candidate):
        raise ValueError("Invalid domain. Use letters, numbers, underscore, or hyphen.")
    return candidate.upper()


def _domain_dirs(domain: str) -> tuple[Path, Path]:
    raw_dir = _DOMAIN_ROOT / domain / "raw"
    processed_dir = _DOMAIN_ROOT / domain / "processed"
    raw_dir.mkdir(parents=True, exist_ok=True)
    processed_dir.mkdir(parents=True, exist_ok=True)
    return raw_dir, processed_dir


def _save_raw_file(raw_dir: Path, file_hash: str, original_name: str, file_bytes: bytes) -> Path:
    safe_name = Path(original_name).name or "upload.bin"
    destination = raw_dir / f"{file_hash}_{safe_name}"
    destination.write_bytes(file_bytes)
    return destination


def _build_processed_filename(domain: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y_%m_%d_%H%M%S_%f")[:-3]
    return f"{domain}_{stamp}.json"


def _save_processed_json(processed_dir: Path, payload: dict) -> Path:
    processed_dir.mkdir(parents=True, exist_ok=True)
    file_path = processed_dir / _build_processed_filename(str(payload["domain"]))
    with file_path.open("w", encoding="utf-8") as file_obj:
        json.dump(payload, file_obj, ensure_ascii=False, indent=2)
    return file_path


def _read_basic_metadata(file_path: Path) -> dict:
    try:
        payload = json.loads(file_path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        payload = {}

    clauses = payload.get("clauses")
    clause_count = len(clauses) if isinstance(clauses, list) else 0

    return {
        "filename": file_path.name,
        "path": str(file_path),
        "title": payload.get("title", ""),
        "domain": payload.get("domain", ""),
        "created_at": payload.get("created_at", ""),
        "clauses_count": clause_count,
    }


async def _process_domain_upload(file_bytes: bytes, filename: str, normalized_domain: str, file_hash: str) -> None:
    try:
        raw_dir, processed_dir = await to_thread(_domain_dirs, normalized_domain)

        _set_upload_status(file_hash, "processing", "Saving raw file", 10)
        raw_path = await to_thread(_save_raw_file, raw_dir, file_hash, filename, file_bytes)
        _set_upload_status(file_hash, "processing", "File uploaded", 20)
        logger.info("[DOMAIN-%s] Raw file saved", normalized_domain)

        _set_upload_status(file_hash, "processing", "Extracting text", 30)
        try:
            extracted_text = await wait_for(
                to_thread(extract_text, file_bytes, filename),
                timeout=_PROCESS_TIMEOUT_SECONDS,
            )
        except AsyncTimeoutError as exc:
            raise Exception("Text extraction timed out") from exc
        except (UnsupportedFileTypeError, ValueError) as exc:
            raise Exception(str(exc)) from exc

        if not extracted_text or not extracted_text.strip():
            raise Exception("Text extraction failed")

        _set_upload_status(file_hash, "processing", "Text extracted", 35)

        warning_message = None
        if len(extracted_text) > 800000:
            warning_message = "Large file detected, processing took longer than usual"
            logger.warning("[DOMAIN-%s] %s", normalized_domain, warning_message)

        _set_upload_status(file_hash, "processing", "Creating chunks", 45)
        chunks = await to_thread(split_text_into_chunks, extracted_text)
        if not chunks:
            raise Exception("Chunk creation failed")

        _set_upload_status(
            file_hash,
            "processing",
            "Chunks created",
            50,
            extra={"chunk_count": len(chunks)},
        )

        _set_upload_status(
            file_hash,
            "processing",
            "Preprocessing started",
            60,
            extra={"chunk_count": len(chunks)},
        )
        try:
            clauses = await wait_for(
                to_thread(preprocess_text, extracted_text),
                timeout=_PROCESS_TIMEOUT_SECONDS,
            )
        except AsyncTimeoutError as exc:
            raise Exception("Preprocessing timed out") from exc
        except Exception as exc:  # noqa: BLE001
            raise Exception(f"Preprocessing error: {exc}") from exc

        _set_upload_status(
            file_hash,
            "processing",
            "Saving JSON",
            90,
            extra={"chunk_count": len(chunks)},
        )
        payload = {
            "domain": normalized_domain,
            "title": Path(filename).name,
            "clauses": clauses,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "hash": file_hash,
        }
        processed_path = await to_thread(_save_processed_json, processed_dir, payload)
        logger.info("[DOMAIN-%s] JSON saved successfully", normalized_domain)

        _set_upload_status(
            file_hash,
            "completed",
            "Completed",
            100,
            extra={
                "domain": normalized_domain,
                "title": Path(filename).name,
                "hash": file_hash,
                "clauses_count": len(clauses),
                "raw_path": str(raw_path),
                "processed_path": str(processed_path),
                "warning": warning_message,
                "chunk_count": len(chunks),
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("[DOMAIN-%s] Domain upload failed: %s", normalized_domain, exc)
        _set_upload_status(file_hash, "error", "Failed", 100, message=str(exc))


@router.post("/domain/upload")
async def upload_domain_document(
    file: UploadFile | None = File(default=None),
    domain: str | None = Query(default=None),
) -> dict:
    try:
        logger.info("Domain upload started")

        if not domain or not domain.strip():
            return JSONResponse(status_code=400, content={"status": "error", "message": "Domain is required"})

        try:
            normalized_domain = _normalize_domain(domain)
        except ValueError as exc:
            return JSONResponse(status_code=400, content={"status": "error", "message": str(exc)})

        if file is None or not file.filename:
            return JSONResponse(status_code=400, content={"status": "error", "message": "File is required"})

        file_bytes = await file.read()
        if not file_bytes:
            return JSONResponse(status_code=400, content={"status": "error", "message": "Uploaded file is empty"})

        file_hash = generate_content_hash(file_bytes)

        _set_upload_status(file_hash, "processing", "Upload started", 1)
        asyncio.create_task(_process_domain_upload(file_bytes, file.filename, normalized_domain, file_hash))

        return JSONResponse(
            status_code=202,
            content={
                "status": "processing",
                "message": "Domain upload accepted. Processing started.",
                "domain": normalized_domain,
                "title": Path(file.filename).name,
                "file_hash": file_hash,
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("[DOMAIN] Domain upload failed before processing: %s", exc)
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": str(exc),
            },
        )
    finally:
        if file is not None:
            await file.close()


@router.get("/domain/status")
async def domain_upload_status(hash: str = Query(..., min_length=8)) -> dict:
    status = UPLOAD_STATUS.get(hash)
    if not status:
        raise HTTPException(status_code=404, detail="Upload status not found")

    normalized_status = dict(status)
    normalized_status["status"] = str(normalized_status.get("status", "processing"))
    normalized_status["step"] = str(normalized_status.get("step", "Processing"))

    try:
        normalized_status["progress"] = max(0, min(100, int(normalized_status.get("progress", 0))))
    except (TypeError, ValueError):
        normalized_status["progress"] = 0

    return normalized_status


@router.get("/domain/status/latest")
async def domain_upload_status_latest() -> dict:
    if not UPLOAD_STATUS:
        raise HTTPException(status_code=404, detail="No upload status available")

    latest = max(
        UPLOAD_STATUS.values(),
        key=lambda item: str(item.get("updated_at", "")),
    )

    normalized_status = dict(latest)
    normalized_status["status"] = str(normalized_status.get("status", "processing"))
    normalized_status["step"] = str(normalized_status.get("step", "Processing"))

    try:
        normalized_status["progress"] = max(0, min(100, int(normalized_status.get("progress", 0))))
    except (TypeError, ValueError):
        normalized_status["progress"] = 0

    return normalized_status


@router.get("/domain/list")
async def list_domain_files(domain: str = Query(...)) -> dict:
    try:
        normalized_domain = _normalize_domain(domain)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _, processed_dir = await to_thread(_domain_dirs, normalized_domain)

    files = sorted(processed_dir.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    metadata = await to_thread(lambda: [_read_basic_metadata(path) for path in files])

    return {
        "domain": normalized_domain,
        "count": len(metadata),
        "files": metadata,
    }
