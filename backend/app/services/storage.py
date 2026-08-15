"""
Local file storage service for document uploads.

Provides a reusable service for storing files on the local filesystem
with UUID-based filenames, SHA-256 checksums, and MIME type validation.

Directory structure:
    storage/
        uploads/
            regulations/
            policies/
"""
from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

# Storage root relative to backend directory
_STORAGE_ROOT = Path(__file__).resolve().parent.parent.parent / "storage" / "uploads"

# Allowed MIME types
ALLOWED_MIME_TYPES = {"application/pdf"}

# Maximum file size in bytes (50 MB)
MAX_FILE_SIZE = 50 * 1024 * 1024


class StorageError(Exception):
    """Base exception for storage operations."""

    pass


class InvalidMimeTypeError(StorageError):
    """Raised when the uploaded file is not a PDF."""

    def __init__(self, mime_type: str):
        self.mime_type = mime_type
        super().__init__(f"Invalid MIME type: {mime_type}. Only PDF files are allowed.")


class FileTooLargeError(StorageError):
    """Raised when the uploaded file exceeds the maximum size."""

    def __init__(self, size: int, max_size: int = MAX_FILE_SIZE):
        self.size = size
        self.max_size = max_size
        super().__init__(f"File size {size} bytes exceeds maximum allowed size of {max_size} bytes.")


@dataclass
class StoredFileMetadata:
    """
    Metadata for a stored file.

    Attributes
    ----------
    original_filename : str
        Original name of the uploaded file.
    stored_filename : str
        Server-generated UUID filename with original extension preserved.
    path : str
        Full path to the stored file on the filesystem.
    checksum : str
        SHA-256 hash of the file contents.
    size : int
        Size of the file in bytes.
    mime_type : str
        MIME type of the file.
    """

    original_filename: str
    stored_filename: str
    path: str
    checksum: str
    size: int
    mime_type: str


def _compute_sha256(file_content: bytes) -> str:
    """Compute SHA-256 checksum of file content."""
    return hashlib.sha256(file_content).hexdigest()


def _get_extension(filename: str) -> str:
    """Extract the file extension from a filename."""
    return Path(filename).suffix.lower()


def _ensure_storage_dirs() -> tuple[Path, Path, Path]:
    """Ensure all storage directories exist. Returns (regulations_dir, policies_dir, evidence_dir)."""
    regulations_dir = _STORAGE_ROOT / "regulations"
    policies_dir = _STORAGE_ROOT / "policies"
    evidence_dir = _STORAGE_ROOT / "evidence"
    regulations_dir.mkdir(parents=True, exist_ok=True)
    policies_dir.mkdir(parents=True, exist_ok=True)
    evidence_dir.mkdir(parents=True, exist_ok=True)
    return regulations_dir, policies_dir, evidence_dir


def validate_file(file: UploadFile) -> None:
    """
    Validate an uploaded file.

    Validates:
    - MIME type is application/pdf
    - File size does not exceed MAX_FILE_SIZE
    """
    # Check MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise InvalidMimeTypeError(file.content_type or "unknown")

    # Read and check size
    file.file.seek(0, 2)  # Seek to end
    size = file.file.tell()
    file.file.seek(0)  # Reset to beginning

    if size > MAX_FILE_SIZE:
        raise FileTooLargeError(size)


def store_document(file: UploadFile, document_type: str) -> StoredFileMetadata:
    """
    Store an uploaded file on the local filesystem.
    """
    # Validate MIME type and size
    validate_file(file)

    # Determine storage directory based on document type
    regulations_dir, policies_dir, _ = _ensure_storage_dirs()

    if document_type == "REGULATION":
        storage_dir = regulations_dir
    elif document_type == "POLICY":
        storage_dir = policies_dir
    else:
        raise StorageError(f"Invalid document type: {document_type}. Must be 'REGULATION' or 'POLICY'.")

    # Read file content
    file_content = file.file.read()

    # Generate UUID filename with original extension
    extension = _get_extension(file.filename or "file.pdf")
    stored_filename = f"{uuid.uuid4()}{extension}"

    # Compute checksum
    checksum = _compute_sha256(file_content)

    # Build storage path
    file_path = storage_dir / stored_filename

    # Write file to disk
    file_path.write_bytes(file_content)

    # Reset file position (so caller can read again if needed)
    file.file.seek(0)

    return StoredFileMetadata(
        original_filename=file.filename or "unknown",
        stored_filename=stored_filename,
        path=str(file_path),
        checksum=checksum,
        size=len(file_content),
        mime_type=file.content_type or "application/pdf",
    )


ALLOWED_EVIDENCE_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_EVIDENCE_SIZE = 25 * 1024 * 1024  # 25 MB


def store_remediation_evidence(file: UploadFile) -> StoredFileMetadata:
    """
    Store an uploaded remediation evidence document/image safely on disk.
    """
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_EVIDENCE_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported evidence file type '{content_type}'. Allowed: PDF, DOCX, DOC, TXT, PNG, JPG, WEBP.",
        )

    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)

    if size > MAX_EVIDENCE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Evidence file size ({size / (1024*1024):.1f}MB) exceeds 25MB limit.",
        )

    _, _, evidence_dir = _ensure_storage_dirs()
    file_content = file.file.read()
    extension = _get_extension(file.filename or "evidence.bin")
    stored_filename = f"{uuid.uuid4()}{extension}"
    checksum = _compute_sha256(file_content)
    file_path = evidence_dir / stored_filename
    file_path.write_bytes(file_content)
    file.file.seek(0)

    return StoredFileMetadata(
        original_filename=file.filename or "evidence",
        stored_filename=stored_filename,
        path=str(file_path),
        checksum=checksum,
        size=len(file_content),
        mime_type=content_type or "application/octet-stream",
    )