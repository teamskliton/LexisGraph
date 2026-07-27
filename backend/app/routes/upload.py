"""
Legacy upload route — non-blocking background processing.

POST /api/v1/upload
    Accepts a raw file upload (no auth, no org context).
    Steps that must complete before the response is returned:
        1. Read + validate the file bytes.
        2. Reject duplicates (hash check).
        3. Save the raw file to disk.
        4. Return 202 Accepted immediately.
    Steps deferred to a FastAPI BackgroundTask (never block the caller):
        5. Text extraction (PDF → plain text)
        6. Preprocessing + clause extraction + embedding
        7. Validate pipeline output
        8. Store embeddings in Qdrant
        9. Build Neo4j graph
    All pipeline failures are caught and logged; the HTTP response has
    already been sent, so errors are surfaced only in server logs.
"""
from asyncio import to_thread
import logging
import traceback
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile

from app.services.graph_builder import build_graph
from app.services.preprocessing import build_processed_document, validate_pipeline_output
from app.services.vector_store import store_clauses_in_qdrant
from app.utils.file_handler import (
    UnsupportedFileTypeError,
    extract_text,
    file_exists_with_hash,
    save_processed_json,
    save_raw_file,
)
from app.utils.hash import generate_content_hash

router = APIRouter()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Background pipeline
# ---------------------------------------------------------------------------

def _run_pipeline(
    *,
    file_bytes: bytes,
    filename: str,
    file_hash: str,
    saved_path: str,
) -> None:
    """Execute the full processing pipeline synchronously inside a worker thread.

    Called exclusively via BackgroundTasks so it never blocks the HTTP
    response. All exceptions are caught here — failures are logged with a
    full traceback and the function returns without re-raising so FastAPI's
    background-task runner stays healthy.

    Pipeline stages
    ---------------
    1. Text extraction  (PDF → plain text)
    2. Preprocessing    (clause splitting + embedding)
    3. JSON persist     (data/processed/user/<hash>.json)
    4. Pipeline validation
    5. Store embeddings (Qdrant)
    6. Graph build      (Neo4j nodes + edges)
    """
    logger.info(
        "[PIPELINE] Started: filename=%s hash=%s path=%s",
        filename, file_hash, saved_path,
    )
    try:
        # ── Stage 1: text extraction ─────────────────────────────────────────
        logger.info("[PIPELINE] Stage 1/5: Extracting text filename=%s", filename)
        extracted_text = extract_text(file_bytes, filename)

        # ── Stage 2: preprocessing + embedding ──────────────────────────────
        logger.info("[PIPELINE] Stage 2/5: Preprocessing hash=%s", file_hash)
        processed_document = build_processed_document(
            Path(filename).name,
            extracted_text,
            "IT",
        )
        clauses = processed_document.get("clauses") or []
        logger.info(
            "[PIPELINE] Stage 2/5 complete: clauses=%s hash=%s",
            len(clauses), file_hash,
        )

        # ── Stage 3: persist processed JSON ─────────────────────────────────
        logger.info("[PIPELINE] Stage 3/5: Saving processed JSON hash=%s", file_hash)
        processed_path = save_processed_json(processed_document, file_hash, "user")
        processed_path_obj = Path(processed_path)
        if not processed_path_obj.exists() or processed_path_obj.parent != Path("data/processed/user"):
            raise RuntimeError(
                f"Processed file validation failed: path={processed_path}"
            )
        logger.info("[PIPELINE] Stage 3/5 complete: processed_path=%s", processed_path)

        # ── Stage 4: validate pipeline output ───────────────────────────────
        is_valid = validate_pipeline_output(processed_document)
        if not is_valid:
            logger.warning(
                "[PIPELINE] Stage 4/5: Validation failed — skipping DB store: "
                "filename=%s hash=%s clauses=%s",
                filename, file_hash, len(clauses),
            )
            return

        # ── Stage 5: store embeddings in Qdrant ─────────────────────────────
        clauses = processed_document.get("clauses") or []
        logger.info(
            "[PIPELINE] Stage 5/6: Storing %s clause embeddings in Qdrant hash=%s",
            len(clauses), file_hash,
        )
        upserted = store_clauses_in_qdrant(
            clauses,
            document_id=file_hash,  # legacy route has no PG UUID — use hash
            title=processed_document.get("title", filename),
            domain=processed_document.get("domain", "IT"),
        )
        logger.info(
            "[PIPELINE] Stage 5/6 complete: qdrant_points=%s hash=%s",
            upserted, file_hash,
        )

        # ── Stage 6: graph build ─────────────────────────────────────────────
        logger.info(
            "[PIPELINE] Stage 6/6: Building Neo4j graph hash=%s", file_hash,
        )
        graph_result = build_graph(
            processed_document,
            pg_document_id=file_hash,
            source_type="user",
        )
        logger.info(
            "[PIPELINE] Stage 6/6 complete: graph=%s", graph_result,
        )

        logger.info(
            "[PIPELINE] Finished: filename=%s hash=%s processed_path=%s",
            filename, file_hash, processed_path,
        )

    except Exception:  # noqa: BLE001
        logger.error(
            "[PIPELINE] FAILED: filename=%s hash=%s\n%s",
            filename, file_hash, traceback.format_exc(),
        )


# ---------------------------------------------------------------------------
# Upload endpoint
# ---------------------------------------------------------------------------

@router.post("/upload", status_code=202)
async def upload_document(
    file: UploadFile,
    background_tasks: BackgroundTasks,
) -> dict:
    """Upload a user document and immediately accept the request.

    The HTTP response is returned as soon as the raw file is saved to disk
    and a duplicate check passes. All heavy processing (text extraction,
    clause embedding, MongoDB storage, graph build) is deferred to a
    background task and never blocks the caller.

    Returns
    -------
    202 Accepted
        ``processing_status`` is ``"accepted"`` — the pipeline has been
        enqueued and will run asynchronously. Monitor server logs for
        progress and failure details.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    try:
        # ── Step 1: read & validate ──────────────────────────────────────────
        logger.info("[UPLOAD] Started: filename=%s", file.filename)
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        # ── Step 2: duplicate check ──────────────────────────────────────────
        file_hash = generate_content_hash(file_bytes)
        is_duplicate = await to_thread(file_exists_with_hash, file_hash, "user")
        if is_duplicate:
            raise HTTPException(status_code=409, detail="Duplicate file detected")

        # ── Step 3: persist raw file ─────────────────────────────────────────
        saved_path = await to_thread(
            save_raw_file,
            file_bytes,
            file.filename,
            "user",
            file_hash,
        )
        logger.info(
            "[UPLOAD] Raw file saved: path=%s hash=%s", saved_path, file_hash,
        )

        saved_path_obj = Path(saved_path)
        if not saved_path_obj.exists() or saved_path_obj.parent != Path("data/raw/user"):
            raise RuntimeError("Raw file validation failed")

        # ── Step 4: enqueue background pipeline & return immediately ─────────
        background_tasks.add_task(
            _run_pipeline,
            file_bytes=file_bytes,
            filename=file.filename,
            file_hash=file_hash,
            saved_path=saved_path,
        )
        logger.info(
            "[UPLOAD] Pipeline enqueued: filename=%s hash=%s", file.filename, file_hash,
        )

        return {
            "message": "File accepted. Processing has been started in the background.",
            "processing_status": "accepted",
            "path": saved_path,
            "hash": file_hash,
            "filename": file.filename,
        }

    except UnsupportedFileTypeError as exc:
        logger.warning("[UPLOAD] Unsupported file type: %s", file.filename)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        logger.warning("[UPLOAD] Value error for file=%s: %s", file.filename, exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("[UPLOAD] Upload failed for file=%s", file.filename)
        raise HTTPException(status_code=500, detail="Upload failed") from exc
    finally:
        await file.close()
