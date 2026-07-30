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
from app.core.schemas import DocumentResponse, DocumentStatusResponse, RegulationResponse
from app.db.models import Document, DocumentType as DBDocumentType, Organization, ProcessingStatus, User, Regulation
from app.db.session import get_db
from app.services.document_processor import process_document, process_regulation
from app.services.activity_service import log_activity
from typing import Union
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
    response_model=Union[DocumentResponse, RegulationResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Upload a document",
)
def upload_document(
    background_tasks: BackgroundTasks,
    organization_id: uuid.UUID = Form(..., description="UUID of the organization to upload to"),
    document_type: str = Form(..., description="Document type: REGULATION or POLICY"),
    file: UploadFile = File(..., description="PDF file to upload"),
    version: Optional[str] = Form(None, description="Regulation version (e.g. 2019, 2023, 2026)"),
    act_name: Optional[str] = Form(None, description="Act name for regulation"),
    jurisdiction: Optional[str] = Form(None, description="Jurisdiction"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Union[Document, Regulation]:
    """
    Upload a document to an organization or global regulation library.
    Supports regulation versioning without overwriting previous versions.
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
    except Exception as e:
        logger.exception("Unexpected error storing file: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage error: {str(e)}",
        )

    if document_type == DBDocumentType.REGULATION.value:
        # Check if global regulation exists with exact same hash
        existing_reg = db.query(Regulation).filter(Regulation.document_hash == stored_metadata.checksum).first()
        if existing_reg:
            logger.info("Global regulation already exists: hash=%s (version=%s)", stored_metadata.checksum, existing_reg.version)
            # We can delete the duplicate stored file since we won't use it
            try:
                Path(stored_metadata.path).unlink(missing_ok=True)
            except OSError:
                pass
            return existing_reg
        
        # Infer default act_name and version if missing
        reg_act = act_name or (file.filename.rsplit('.', 1)[0] if file.filename else "Regulation")
        reg_ver = version or "1.0"
        reg_juris = jurisdiction or "Global"
        reg_title = f"{reg_act} (v{reg_ver})" if version else (file.filename or "Regulation")

        # Create new regulation version (preserving existing regulation versions)
        regulation = Regulation(
            title=reg_title,
            act_name=reg_act,
            version=reg_ver,
            jurisdiction=reg_juris,
            document_hash=stored_metadata.checksum,
            uploaded_by=current_user.id,
            original_filename=stored_metadata.original_filename,
            stored_filename=stored_metadata.stored_filename,
            file_path=stored_metadata.path,
            file_size=stored_metadata.size,
            mime_type=stored_metadata.mime_type,
            processing_status=ProcessingStatus.UPLOADED,
        )
        db.add(regulation)
        db.commit()
        db.refresh(regulation)
        
        try:
            background_tasks.add_task(process_regulation, regulation.id)
            logger.info("Enqueued background processing for regulation: id=%s", regulation.id)
        except Exception:
            logger.exception("Failed to enqueue background processing for regulation: id=%s", regulation.id)
            
        log_activity(
            db,
            user_id=current_user.id,
            event_type="REGULATION_UPLOADED",
            title="Uploaded Regulation",
            description=f"Uploaded global regulation '{regulation.original_filename}'",
            icon_type="file",
            extra_data={"regulation_id": str(regulation.id)},
        )

        return regulation

    # Otherwise it's a POLICY document
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

    log_activity(
        db,
        user_id=current_user.id,
        event_type="POLICY_UPLOADED",
        title="Uploaded Policy",
        description=f"Uploaded file '{document.original_filename}'",
        icon_type="file",
        extra_data={"document_id": str(document.id), "organization_id": str(organization_id)},
    )

    return document


@router.get(
    "/",
    response_model=list[Union[DocumentResponse, RegulationResponse]],
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
    
    # Also fetch all global regulations
    regulations = db.query(Regulation).order_by(Regulation.created_at.desc()).all()
    
    # To maintain frontend backward compatibility, we convert regulations into
    # dictionaries that look like DocumentResponse, injecting the requested org_id.
    combined = []
    
    for doc in documents:
        combined.append(doc)
        
    for reg in regulations:
        reg_dict = {
            "id": reg.id,
            "organization_id": org.id,
            "uploaded_by": reg.uploaded_by,
            "original_filename": reg.original_filename,
            "stored_filename": reg.stored_filename,
            "file_path": reg.file_path,
            "file_size": reg.file_size,
            "mime_type": reg.mime_type,
            "checksum": reg.document_hash,
            "document_type": DBDocumentType.REGULATION.value,
            "processing_status": reg.processing_status,
            "progress": reg.progress,
            "current_step": reg.current_step,
            "processing_started_at": reg.processing_started_at,
            "processed_at": reg.processed_at,
            "error_message": reg.error_message,
            "created_at": reg.created_at,
            "updated_at": reg.updated_at,
        }
        combined.append(reg_dict)

    # Sort combined by created_at desc
    combined.sort(
        key=lambda x: x.created_at if hasattr(x, "created_at") else x["created_at"],
        reverse=True
    )

    return combined


@router.get(
    "/regulations",
    response_model=list[RegulationResponse],
    summary="List all global regulations",
)
def list_all_regulations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Regulation]:
    """
    List all global regulations available across all organizations.
    """
    return db.query(Regulation).order_by(Regulation.created_at.desc()).all()


@router.get(
    "/{document_id}",
    response_model=Union[DocumentResponse, RegulationResponse],
    summary="Get a document by ID",
)
def get_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Union[Document, dict]:
    """
    Get a specific document by its ID.

    - **document_id**: UUID of the document to retrieve

    The authenticated user must own the organization that contains the document.
    """
    # Find the document
    document = db.get(Document, document_id)

    if not document:
        # Check if it's a regulation
        reg = db.get(Regulation, document_id)
        if reg:
            # We don't have an organization ID here because we don't know it from the path.
            # But we can just return it as a dictionary that matches DocumentResponse without org_id 
            # or with a dummy one, or actually just return the Regulation and let FastAPI use RegulationResponse
            # since response_model is Union[DocumentResponse, RegulationResponse].
            return reg
            
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document or Regulation not found.",
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
    is_regulation = False

    if not document:
        # Check if it's a regulation
        document = db.get(Regulation, document_id)
        if document:
            is_regulation = True
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document or Regulation not found.",
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

    if is_regulation:
        return DocumentStatusResponse(
            document_id=document.id,
            status=document.processing_status,
            progress=document.progress,
            current_step=document.current_step,
            error_message=document.error_message,
            processing_started_at=document.processing_started_at,
            processed_at=document.processed_at,
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
        # Check if it is a regulation
        if db.get(Regulation, document_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Global regulations cannot be deleted.",
            )
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