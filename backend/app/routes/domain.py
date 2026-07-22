from asyncio import TimeoutError as AsyncTimeoutError, to_thread, wait_for
from datetime import datetime, timezone
from pathlib import Path
import json
import logging
import re

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse

from app.db.mongo import store_document
from app.services.graph_builder import build_graph
from app.services.preprocessing import build_processed_document
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
        logger.info("[DOMAIN-%s] STEP 1: Processing started hash=%s", normalized_domain, file_hash)

        raw_dir, processed_dir = await to_thread(_domain_dirs, normalized_domain)

        _set_upload_status(file_hash, "processing", "Saving raw file", 10)
        raw_path = await to_thread(_save_raw_file, raw_dir, file_hash, filename, file_bytes)
        _set_upload_status(file_hash, "processing", "File uploaded", 20)
        logger.info("[DOMAIN-%s] STEP 2: Raw file saved path=%s", normalized_domain, raw_path)

        _set_upload_status(file_hash, "processing", "Extracting text", 30)
        logger.info("[DOMAIN-%s] STEP 3: Text extraction started", normalized_domain)
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
        logger.info("[DOMAIN-%s] STEP 3: Text extraction completed", normalized_domain)

        warning_message = None
        if len(extracted_text) > 800000:
            warning_message = "Large file detected, processing took longer than usual"
            logger.warning("[DOMAIN-%s] %s", normalized_domain, warning_message)

        _set_upload_status(
            file_hash,
            "processing",
            "Preprocessing started",
            60,
        )
        try:
            payload = await wait_for(
                to_thread(
                    build_processed_document,
                    Path(filename).name,
                    extracted_text,
                    normalized_domain,
                ),
                timeout=_PROCESS_TIMEOUT_SECONDS,
            )
        except AsyncTimeoutError as exc:
            raise Exception("Preprocessing timed out") from exc
        except Exception as exc:  # noqa: BLE001
            raise Exception(f"Preprocessing error: {exc}") from exc
        clauses = payload["clauses"]
        mongo_doc_payload = {
            "source": "domain",
            "source_type": "domain",
            "domain": normalized_domain,
            "title": Path(filename).name,
            "clauses": clauses,
            "hash": file_hash,
        }
        logger.info("Saving to MongoDB...")
        logger.info("Clauses count: %s", len(clauses))
        try:
            stored_doc_id = await to_thread(store_document, mongo_doc_payload, "domain")
        except Exception:  # noqa: BLE001
            logger.exception("Mongo Insert Failed")
            raise

        if stored_doc_id:
            logger.info("[DOMAIN-%s] STEP 4A: Building graph for document_id=%s", normalized_domain, stored_doc_id)
            await to_thread(build_graph, stored_doc_id)
        else:
            logger.info("[DOMAIN-%s] STEP 4A: Skipping graph build for duplicate hash=%s", normalized_domain, file_hash)

        _set_upload_status(
            file_hash,
            "processing",
            "Saving JSON",
            90,
        )
        processed_path = await to_thread(_save_processed_json, processed_dir, payload)
        logger.info("[DOMAIN-%s] STEP 5: JSON saved path=%s", normalized_domain, processed_path)

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
                "stored_in_db": bool(stored_doc_id),
                "document_id": stored_doc_id or "",
            },
        )
        logger.info("[DOMAIN-%s] STEP 6: Process completed hash=%s clauses=%s", normalized_domain, file_hash, len(clauses))
    except Exception as exc:  # noqa: BLE001
        logger.exception("[DOMAIN-%s] Domain upload failed: %s", normalized_domain, exc)
        _set_upload_status(file_hash, "error", "Failed", 100, message=str(exc))


@router.post("/domain/upload")
async def upload_domain_document(
    file: UploadFile | None = File(default=None),
    domain: str | None = Query(default=None),
) -> dict:
    try:
        logger.info("[DOMAIN] Upload API hit")
        logger.info("[DOMAIN] STEP 1: Upload request received")


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
        logger.info("[DOMAIN] STEP 2: Starting synchronous processing hash=%s", file_hash)

        # Synchronous processing so logs appear in terminal during request
        await _process_domain_upload(file_bytes, file.filename, normalized_domain, file_hash)

        status = UPLOAD_STATUS.get(file_hash, {})
        if status.get("status") == "error":
            return JSONResponse(
                status_code=500,
                content={
                    "status": "error",
                    "message": status.get("message", "Domain upload failed"),
                    "file_hash": file_hash,
                },
            )

        extra = status

        return JSONResponse(
            status_code=200,
            content={
                "status": "completed",
                "message": "Domain upload processed successfully.",
                "domain": normalized_domain,
                "title": Path(file.filename).name,
                "file_hash": file_hash,
                "clauses_count": extra.get("clauses_count", 0),
                "raw_path": extra.get("raw_path", ""),
                "processed_path": extra.get("processed_path", ""),
                "stored_in_db": bool(extra.get("stored_in_db", False)),
                "document_id": extra.get("document_id", ""),
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
