"""
Document upload and management routes.

Provides endpoints for uploading and managing documents within organizations.
"""
from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.schemas import DocumentResponse, DocumentStatusResponse
from app.db.models import Document, DocumentType as DBDocumentType, Organization, ProcessingStatus, User
from app.db.session import get_db
from app.services.document_processor import process_document
from app.services.storage import store_document, StorageError, InvalidMimeTypeError, FileTooLargeError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])


def _validate_organization_ownership(
    db: Session,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Organization:
    """
    Validate that the organization exists and is owned by the given user.

    Parameters
    ----------
    db : Session
        Database session.
    organization_id : uuid.UUID
        UUID of the organization to validate.
    user_id : uuid.UUID
        UUID of the user who should own the organization.

    Returns
    -------
    Organization
        The validated organization.

    Raises
    ------
    HTTPException
        If the organization is not found or not owned by the user.
    """
    org = db.query(Organization).filter(
        Organization.id == organization_id,
        Organization.created_by == user_id,
    ).first()

    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found or you don't have access to it.",
        )
    return org


@router.post(
    "/upload",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a document",
)
def upload_document(
    background_tasks: BackgroundTasks,
    organization_id: uuid.UUID = Form(..., description="UUID of the organization to upload to"),
    document_type: str = Form(..., description="Document type: REGULATION or POLICY"),
    file: UploadFile = File(..., description="PDF file to upload"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Document:
    """
    Upload a document to an organization.

    - **organization_id**: UUID of the organization to upload the document to
    - **document_type**: Either "REGULATION" or "POLICY"
    - **file**: PDF file (max 50 MB)

    The authenticated user must own the organization.

    The file is validated (PDF only, max 50 MB), stored locally, and metadata
    is saved to PostgreSQL with processing_status set to UPLOADED.
    """
    # Validate document type
    if document_type not in (DBDocumentType.REGULATION.value, DBDocumentType.POLICY.value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid document_type: {document_type}. Must be 'REGULATION' or 'POLICY'.",
        )

    # Validate organization ownership
    _validate_organization_ownership(db, organization_id, current_user.id)

    # Store file and get metadata
    try:
        stored_metadata = store_document(file, document_type)
    except InvalidMimeTypeError as e:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(e),
        )
    except FileTooLargeError as e:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=str(e),
        )
    except StorageError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage error: {str(e)}",
        )

    # Create document record
    document = Document(
        organization_id=organization_id,
        uploaded_by=current_user.id,
        original_filename=stored_metadata.original_filename,
        stored_filename=stored_metadata.stored_filename,
        file_path=stored_metadata.path,
        file_size=stored_metadata.size,
        mime_type=stored_metadata.mime_type,
        checksum=stored_metadata.checksum,
        document_type=DBDocumentType(document_type),
        processing_status=ProcessingStatus.UPLOADED,
    )

    db.add(document)
    db.commit()
    db.refresh(document)

    # Enqueue the heavy AI pipeline (text extraction → preprocessing +
    # embedding → Mongo bridge → graph build) to run AFTER the response is
    # sent, so the upload request never blocks on spaCy/Neo4j.
    #
    # The orchestrator is invoked with only the document id (not the ORM
    # object) so it re-loads the row in a fresh, self-owned DB session — the
    # request-scoped `db` is closed by `get_db()` once this request ends and
    # must not be touched by the background task.
    try:
        background_tasks.add_task(process_document, document.id)
        logger.info(
            "Enqueued background processing for document: id=%s",
            document.id,
        )
    except Exception:  # noqa: BLE001  (never block a successful upload)
        logger.exception(
            "Failed to enqueue background processing for document: id=%s",
            document.id,
        )

    logger.info(
        "Document uploaded: id=%s, org=%s, type=%s, by user=%s",
        document.id,
        organization_id,
        document_type,
        current_user.id,
    )

    return document


@router.get(
    "/",
    response_model=list[DocumentResponse],
    summary="List documents in an organization",
)
def list_documents(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Document]:
    """
    List all documents in an organization.

    - **organization_id**: UUID of the organization whose documents to list

    The authenticated user must own the organization.
    Only documents belonging to the specified organization are returned.
    """
    # Validate organization ownership
    org = _validate_organization_ownership(db, organization_id, current_user.id)

    documents = db.query(Document).filter(
        Document.organization_id == org.id
    ).order_by(Document.created_at.desc()).all()

    return documents


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
    summary="Get a document by ID",
)
def get_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Document:
    """
    Get a specific document by its ID.

    - **document_id**: UUID of the document to retrieve

    The authenticated user must own the organization that contains the document.
    """
    # Find the document
    document = db.get(Document, document_id)

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    # Validate organization ownership
    _validate_organization_ownership(db, document.organization_id, current_user.id)

    return document


@router.get(
    "/{document_id}/status",
    response_model=DocumentStatusResponse,
    summary="Get document processing status",
)
def get_document_status(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentStatusResponse:
    """
    Get the current processing status of a document.

    - **document_id**: UUID of the document to query

    Returns the processing status, progress percentage (0-100), the active
    pipeline step label, and any error message. Only the user who uploaded
    the document can query its status.

    Example response::

        {
            "document_id": "<uuid>",
            "status": "PROCESSING",
            "progress": 60,
            "current_step": "Generating Embeddings",
            "error_message": null,
            "processing_started_at": "2026-07-27T17:00:00Z",
            "processed_at": null
        }
    """
    document = db.get(Document, document_id)

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    # 403 rather than 404 so users know the document exists but is not theirs.
    if document.uploaded_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this document.",
        )

    logger.info(
        "Status queried: document_id=%s status=%s progress=%s by user=%s",
        document.id,
        document.processing_status,
        document.progress,
        current_user.id,
    )

    return DocumentStatusResponse(
        document_id=document.id,
        status=document.processing_status,
        progress=document.progress,
        current_step=document.current_step,
        error_message=document.error_message,
        processing_started_at=document.processing_started_at,
        processed_at=document.processed_at,
    )


@router.post(
    "/{document_id}/retry",
    response_model=DocumentStatusResponse,
    summary="Retry processing a failed document",
)
def retry_document(
    document_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentStatusResponse:
    """
    Retry processing a document that has a FAILED status.

    - **document_id**: UUID of the failed document to retry

    Only the user who uploaded the document can trigger a retry.
    Returns 409 Conflict if the document is not in the FAILED state.

    On success the document status is immediately reset to UPLOADED and
    processing is re-queued as a background task. The returned status
    object reflects the reset state before the background task begins.
    """
    document = db.get(Document, document_id)

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    if document.uploaded_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to retry this document.",
        )

    if document.processing_status != ProcessingStatus.FAILED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot retry document with status '{document.processing_status.value}'. "
                "Only documents with status 'FAILED' can be retried."
            ),
        )

    # Reset the document to its initial uploadable state so the orchestrator
    # re-runs the full pipeline cleanly.
    document.processing_status = ProcessingStatus.UPLOADED
    document.progress = 0
    document.current_step = None
    document.error_message = None
    document.processing_started_at = None
    document.processed_at = None
    document.mongo_document_id = None
    db.commit()
    db.refresh(document)

    # Enqueue background processing — same orchestrator as the original upload.
    try:
        background_tasks.add_task(process_document, document.id)
        logger.info(
            "Retry enqueued: document_id=%s by user=%s",
            document.id,
            current_user.id,
        )
    except Exception:  # noqa: BLE001  (never block a successful reset)
        logger.exception(
            "Failed to enqueue retry for document_id=%s",
            document.id,
        )

    return DocumentStatusResponse(
        document_id=document.id,
        status=document.processing_status,
        progress=document.progress,
        current_step=document.current_step,
        error_message=document.error_message,
        processing_started_at=document.processing_started_at,
        processed_at=document.processed_at,
    )


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a document",
)
def delete_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """
    Delete a document.

    - **document_id**: UUID of the document to delete

    The authenticated user must own the organization that contains the document.
    Deletes both the database record and the stored file.

    Returns 204 No Content on success.
    """
    # Find the document
    document = db.get(Document, document_id)

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    # Validate organization ownership
    _validate_organization_ownership(db, document.organization_id, current_user.id)

    # Store the file path before deleting the record
    file_path = document.file_path

    # Delete the database record
    db.delete(document)
    db.commit()

    # Delete the stored file
    try:
        file_path_obj = Path(file_path)
        if file_path_obj.exists():
            file_path_obj.unlink()
            logger.info("Deleted file: %s", file_path)
    except OSError as e:
        # Log but don't fail - the database record is already deleted
        logger.warning("Failed to delete file %s: %s", file_path, e)

    logger.info(
        "Document deleted: id=%s, file=%s, by user=%s",
        document_id,
        file_path,
        current_user.id,
    )

    return None