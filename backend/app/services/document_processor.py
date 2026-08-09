"""
Document Processing Orchestrator — PostgreSQL + Qdrant + Neo4j.

Coordinates the document processing pipeline for a document stored in
PostgreSQL. No MongoDB dependency.

Pipeline
--------
    UPLOADED → PROCESSING → PROCESSED
                   │              │
                   └──────────────┴──▶ FAILED  (any step raises)

Stages
------
1.  Load PDF text from local storage          (extract_text)
2.  Preprocess → clause extraction + embed    (build_processed_document)
3.  Store clause embeddings in Qdrant         (vector_store.store_clauses_in_qdrant)
4.  Build Neo4j graph nodes/edges             (graph_builder.build_graph)

All status transitions, progress checkpoints, and error messages are
committed to the PostgreSQL ``documents`` row.
"""
from __future__ import annotations

import logging
import traceback
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import Document, ProcessingStatus, Regulation
from app.services.graph_builder import build_graph
from app.services.preprocessing import build_processed_document
from app.services.vector_store import store_clauses_in_qdrant
from app.utils.file_handler import extract_text

logger = logging.getLogger(__name__)

_ERROR_MESSAGE_MAX_LENGTH = 2000
_DEFAULT_DOMAIN = "IT"


class DocumentProcessingError(Exception):
    """Raised for orchestration-level problems (missing file, DB issues).

    Pipeline-stage failures are caught and expressed as FAILED status so
    background-task callers can continue processing other documents.
    """


# ---------------------------------------------------------------------------
# Status / progress helpers
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _truncate_error(message: str) -> str:
    if len(message) <= _ERROR_MESSAGE_MAX_LENGTH:
        return message
    return message[: _ERROR_MESSAGE_MAX_LENGTH - 3] + "..."


def _mark_processing_started(db: Session, document: Document | Regulation) -> None:
    document.processing_status = ProcessingStatus.PROCESSING
    document.processing_started_at = _utcnow()
    document.processed_at = None
    document.error_message = None
    document.mongo_document_id = None
    document.progress = 5
    document.current_step = "Loading document"
    db.commit()
    logger.info(
        "Processing started: document_id=%s filename=%s",
        document.id,
        document.original_filename,
    )


def _mark_processed(db: Session, document: Document | Regulation) -> None:
    document.processing_status = ProcessingStatus.PROCESSED
    document.processed_at = _utcnow()
    document.error_message = None
    document.progress = 100
    document.current_step = "Complete"
    db.commit()
    logger.info("Processing complete: document_id=%s status=PROCESSED", document.id)


def _mark_failed(db: Session, document: Document | Regulation, *, error_message: str) -> None:
    document.processing_status = ProcessingStatus.FAILED
    document.processed_at = _utcnow()
    document.error_message = _truncate_error(error_message)
    document.current_step = "Failed"
    db.commit()
    logger.error(
        "Processing failed: document_id=%s error=%s",
        document.id,
        document.error_message,
    )


def _update_progress(
    db: Session,
    document: Document | Regulation,
    *,
    progress: int,
    current_step: str,
) -> None:
    document.progress = progress
    document.current_step = current_step
    db.commit()
    logger.info(
        "Progress update: document_id=%s progress=%s%% step=%r",
        document.id,
        progress,
        current_step,
    )


# ---------------------------------------------------------------------------
# Pipeline stages
# ---------------------------------------------------------------------------

def _load_pdf_text(document: Document | Regulation) -> tuple[bytes, str]:
    """Read stored PDF and extract plain text.

    Raises DocumentProcessingError if the file is missing or unreadable.
    """
    path = Path(document.file_path)
    if not path.exists():
        raise DocumentProcessingError(
            f"Stored file not found: {document.file_path}"
        )
    try:
        file_bytes = path.read_bytes()
    except OSError as exc:
        raise DocumentProcessingError(
            f"Cannot read stored file '{document.file_path}': {exc}"
        ) from exc

    if not file_bytes:
        raise DocumentProcessingError(f"Stored file is empty: {document.file_path}")

    try:
        extracted_text = extract_text(file_bytes, document.original_filename)
    except ValueError as exc:
        raise DocumentProcessingError(
            f"Text extraction failed for '{document.original_filename}': {exc}"
        ) from exc

    if not extracted_text or not extracted_text.strip():
        raise DocumentProcessingError(
            f"No extractable text in '{document.original_filename}'"
        )

    return file_bytes, extracted_text


def _run_preprocessing(extracted_text: str, document: Document | Regulation) -> dict:
    """Run clause extraction + embedding on the extracted text."""
    logger.info(
        "Preprocessing started: document_id=%s chars=%s",
        document.id,
        len(extracted_text),
    )
    processed = build_processed_document(
        title=document.original_filename,
        text=extracted_text,
        domain=_DEFAULT_DOMAIN,
    )
    clauses = processed.get("clauses") or []
    logger.info(
        "Preprocessing complete: document_id=%s clauses=%s",
        document.id,
        len(clauses),
    )
    return processed


def _store_in_qdrant(processed: dict, document: Document | Regulation) -> int:
    """Upsert clause embeddings into Qdrant. Returns number of points stored."""
    clauses = processed.get("clauses") or []
    count = store_clauses_in_qdrant(
        clauses,
        document_id=str(document.id),
        title=processed.get("title", document.original_filename),
        domain=processed.get("domain", _DEFAULT_DOMAIN),
        organization_id=str(document.organization_id) if hasattr(document, "organization_id") else None,
    )
    logger.info(
        "Qdrant store complete: document_id=%s points=%s",
        document.id,
        count,
    )
    return count


def _build_neo4j_graph(processed: dict, document: Document | Regulation) -> dict:
    """Build Document + Clause nodes and HAS_CLAUSE edges in Neo4j."""
    org_id = str(document.organization_id) if hasattr(document, "organization_id") and document.organization_id else None
    doc_type = str(getattr(document, "document_type", "POLICY").value if hasattr(getattr(document, "document_type", None), "value") else getattr(document, "document_type", "POLICY"))
    checksum = str(getattr(document, "checksum", "")) if getattr(document, "checksum", None) else None

    result = build_graph(
        processed,
        pg_document_id=str(document.id),
        source_type="user",
        organization_id=org_id,
        document_type=doc_type,
        checksum=checksum,
    )
    logger.info(
        "Neo4j graph built: document_id=%s org_id=%s result=%s",
        document.id,
        org_id,
        result,
    )
    return result


def _record_failure(db: Session, document: Document | Regulation, exc: BaseException) -> None:
    """Log traceback and persist FAILED status."""
    type_name = type(exc).__name__
    message = f"{type_name}: {exc}"
    logger.error(
        "Pipeline stage failed: document_id=%s\n%s",
        document.id,
        traceback.format_exc(),
    )
    try:
        _mark_failed(db, document, error_message=message)
    except Exception:  # noqa: BLE001
        logger.exception(
            "Could not persist FAILED status for document_id=%s", document.id
        )


# ---------------------------------------------------------------------------
# Public orchestrator
# ---------------------------------------------------------------------------

def process_document(
    document_id: UUID | str,
    *,
    db: Session | None = None,
) -> Document:
    """Process a single uploaded document end-to-end.

    Pipeline (all stages write progress checkpoints to PostgreSQL):

        Stage 1  →  Extract text from PDF                progress=25
        Stage 2  →  Preprocess + embed clauses           progress=60
        Stage 3  →  Store embeddings in Qdrant           progress=80
        Stage 4  →  Build Neo4j graph (nodes + edges)    progress=95
        Final    →  Mark PROCESSED                       progress=100

    Parameters
    ----------
    document_id:
        PostgreSQL UUID of the document to process.
    db:
        Optional SQLAlchemy session. If omitted a fresh session is created
        and closed here; when provided the caller owns the session lifecycle.

    Returns
    -------
    Document
        The refreshed document row with its final processing state.

    Raises
    ------
    DocumentProcessingError
        Only for orchestration-level issues (missing document row, unreadable
        file). Stage failures are captured as FAILED status, not re-raised.
    """
    owns_session = db is None
    if owns_session:
        from app.db.session import get_session
        db = get_session()

    try:
        document = db.get(Document, document_id)
        if document is None:
            raise DocumentProcessingError(f"Document not found: {document_id}")

        logger.info(
            "Orchestrator invoked: document_id=%s current_status=%s",
            document.id,
            document.processing_status,
        )

        # ── PROCESSING transition ──────────────────────────────────────────
        _mark_processing_started(db, document)   # progress=5

        try:
            # Stage 1: extract text
            _, extracted_text = _load_pdf_text(document)
            _update_progress(db, document, progress=25, current_step="Extracting text")

            # Stage 2: preprocessing + embeddings
            processed = _run_preprocessing(extracted_text, document)
            _update_progress(db, document, progress=60, current_step="Generating Embeddings")

            clauses = processed.get("clauses") or []
            if not clauses:
                raise DocumentProcessingError(
                    "Preprocessing produced no valid clauses; aborting."
                )

            # Stage 3: store embeddings in Qdrant
            _store_in_qdrant(processed, document)
            _update_progress(db, document, progress=80, current_step="Storing embeddings")

            # Stage 4: build Neo4j graph
            _build_neo4j_graph(processed, document)
            _update_progress(db, document, progress=95, current_step="Building knowledge graph")

        except DocumentProcessingError:
            raise
        except Exception as exc:  # noqa: BLE001
            _record_failure(db, document, exc)
            db.refresh(document)
            return document

        # ── PROCESSED transition ──────────────────────────────────────────
        _mark_processed(db, document)
        db.refresh(document)
        return document

    finally:
        if owns_session and db is not None:
            db.close()


def process_regulation(
    regulation_id: UUID | str,
    *,
    db: Session | None = None,
) -> Regulation:
    """Process a single uploaded regulation end-to-end.

    Pipeline (all stages write progress checkpoints to PostgreSQL):

        Stage 1  →  Extract text from PDF                progress=25
        Stage 2  →  Preprocess + embed clauses           progress=60
        Stage 3  →  Store embeddings in Qdrant           progress=80
        Stage 4  →  Build Neo4j graph (nodes + edges)    progress=95
        Final    →  Mark PROCESSED                       progress=100

    Parameters
    ----------
    regulation_id:
        PostgreSQL UUID of the regulation to process.
    db:
        Optional SQLAlchemy session. If omitted a fresh session is created
        and closed here; when provided the caller owns the session lifecycle.

    Returns
    -------
    Regulation
        The refreshed regulation row with its final processing state.
    """
    owns_session = db is None
    if owns_session:
        from app.db.session import get_session
        db = get_session()

    try:
        regulation = db.get(Regulation, regulation_id)
        if regulation is None:
            raise DocumentProcessingError(f"Regulation not found: {regulation_id}")

        logger.info(
            "Orchestrator invoked: regulation_id=%s current_status=%s",
            regulation.id,
            regulation.processing_status,
        )

        # ── PROCESSING transition ──────────────────────────────────────────
        _mark_processing_started(db, regulation)   # progress=5

        try:
            # Stage 1: extract text
            _, extracted_text = _load_pdf_text(regulation)
            _update_progress(db, regulation, progress=25, current_step="Extracting text")

            # Stage 2: preprocessing + embeddings
            processed = _run_preprocessing(extracted_text, regulation)
            _update_progress(db, regulation, progress=60, current_step="Generating Embeddings")

            clauses = processed.get("clauses") or []
            if not clauses:
                raise DocumentProcessingError(
                    "Preprocessing produced no valid clauses; aborting."
                )

            # Stage 3: store embeddings in Qdrant
            _store_in_qdrant(processed, regulation)
            _update_progress(db, regulation, progress=80, current_step="Storing embeddings")

            # Stage 4: build Neo4j graph
            _build_neo4j_graph(processed, regulation)
            _update_progress(db, regulation, progress=95, current_step="Building knowledge graph")

        except DocumentProcessingError:
            raise
        except Exception as exc:  # noqa: BLE001
            _record_failure(db, regulation, exc)
            db.refresh(regulation)
            return regulation

        # ── PROCESSED transition ──────────────────────────────────────────
        _mark_processed(db, regulation)
        db.refresh(regulation)
        return regulation

    finally:
        if owns_session and db is not None:
            db.close()

