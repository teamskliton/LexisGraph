from asyncio import to_thread
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile
import logging

from app.db.mongo import store_document
from app.services.preprocessing import preprocess_text, validate_pipeline_output
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

        saved_path_obj = Path(saved_path)
        if not saved_path_obj.exists() or saved_path_obj.parent != Path("data/raw/user"):
            raise RuntimeError("Raw file validation failed")

        extracted_text = await to_thread(extract_text, file_bytes, file.filename)
        clauses = await to_thread(preprocess_text, extracted_text)

        document_payload = {
            "source": "user",
            "source_type": "user",
            "title": Path(file.filename).name,
            "url": "",
            "date": "",
            "raw_text": extracted_text,
            "clauses": clauses,
            "hash": file_hash,
        }

        processed_path = await to_thread(save_processed_json, document_payload, file_hash, "user")
        processed_path_obj = Path(processed_path)
        if not processed_path_obj.exists() or processed_path_obj.parent != Path("data/processed/user"):
            raise RuntimeError("Processed file validation failed")

        is_valid = validate_pipeline_output({"text": extracted_text, "clauses": clauses})
        doc_id = ""
        stored_in_db = False
        if is_valid:
            doc_id = await to_thread(store_document, document_payload, "user")
            stored_in_db = bool(doc_id)
            if not stored_in_db:
                logger.info("Skipping duplicate user document in MongoDB for hash=%s", file_hash)
        else:
            logger.warning("Pipeline validation failed for file=%s hash=%s; skipping DB store", file.filename, file_hash)

        logger.info(
            "Upload processed: raw_path=%s processed_path=%s hash=%s clauses=%s stored_in_db=%s",
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
            "text": extracted_text,
            "clauses": clauses,
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
