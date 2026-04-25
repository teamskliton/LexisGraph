from asyncio import to_thread
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile
import logging

from app.db.mongo import store_document
from app.services.graph_builder import build_graph
from app.services.preprocessing import build_processed_document, validate_pipeline_output
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


@router.post("/upload")
async def upload_document(file: UploadFile) -> dict:
    """Upload user document, preprocess clauses, and store outputs."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    try:
        logger.info("[UPLOAD] STEP 1: Upload started filename=%s", file.filename)
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        file_hash = generate_content_hash(file_bytes)

        is_duplicate = await to_thread(file_exists_with_hash, file_hash, "user")
        if is_duplicate:
            raise HTTPException(status_code=409, detail="Duplicate file detected")

        saved_path = await to_thread(
            save_raw_file,
            file_bytes,
            file.filename,
            "user",
            file_hash,
        )
        logger.info("[UPLOAD] STEP 2: Raw file saved path=%s hash=%s", saved_path, file_hash)

        saved_path_obj = Path(saved_path)
        if not saved_path_obj.exists() or saved_path_obj.parent != Path("data/raw/user"):
            raise RuntimeError("Raw file validation failed")

        logger.info("[UPLOAD] STEP 3: Extracting text filename=%s", file.filename)
        extracted_text = await to_thread(extract_text, file_bytes, file.filename)
        logger.info("[UPLOAD] STEP 4: Preprocessing started hash=%s", file_hash)
        processed_document = await to_thread(
            build_processed_document,
            Path(file.filename).name,
            extracted_text,
            "IT",
        )
        clauses = processed_document["clauses"]

        document_payload = {
            "source": "user",
            "source_type": "user",
            "domain": processed_document["domain"],
            "title": processed_document["title"],
            "clauses": clauses,
            "hash": file_hash,
        }

        processed_path = await to_thread(save_processed_json, processed_document, file_hash, "user")
        logger.info("[UPLOAD] STEP 5: JSON saved path=%s", processed_path)
        processed_path_obj = Path(processed_path)
        if not processed_path_obj.exists() or processed_path_obj.parent != Path("data/processed/user"):
            raise RuntimeError("Processed file validation failed")

        is_valid = validate_pipeline_output(processed_document)
        doc_id = ""
        stored_in_db = False
        if is_valid:
            logger.info("Saving to MongoDB...")
            logger.info("Clauses count: %s", len(document_payload.get("clauses", [])))
            try:
                doc_id = await to_thread(store_document, document_payload, "user")
                stored_in_db = bool(doc_id)
            except Exception:  # noqa: BLE001
                logger.exception("Mongo Insert Failed")
                raise

            if not stored_in_db:
                logger.info("Skipping duplicate user document in MongoDB for hash=%s", file_hash)
            else:
                logger.info("[UPLOAD] STEP 6A: Building graph for document_id=%s", doc_id)
                await to_thread(build_graph, doc_id)
        else:
            logger.warning(
                "Pipeline validation failed for file=%s hash=%s; skipping DB store; clauses_count=%s",
                file.filename,
                file_hash,
                len(processed_document.get("clauses", [])),
            )

        logger.info(
            "[UPLOAD] STEP 6: Process completed raw_path=%s processed_path=%s hash=%s clauses=%s stored_in_db=%s",
            saved_path,
            processed_path,
            file_hash,
            len(clauses),
            stored_in_db,
        )

        return {
            "message": "File uploaded and processed." if stored_in_db else "File uploaded and processed; DB store skipped.",
            "path": saved_path,
            "processed_path": processed_path,
            "document_id": doc_id,
            "stored_in_db": stored_in_db,
            "hash": file_hash,
            "clauses_count": len(clauses),
            "domain": processed_document["domain"],
            "title": processed_document["title"],
        }
    except UnsupportedFileTypeError as exc:
        logger.warning("Unsupported file type: %s", file.filename)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        logger.warning("Text extraction failed for file=%s", file.filename)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Upload failed")
        raise HTTPException(status_code=500, detail="Upload failed") from exc
    finally:
        await file.close()
