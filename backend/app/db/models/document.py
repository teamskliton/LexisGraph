"""
Document model.

Uses SQLAlchemy 2.0 declarative style with Mapped[] annotations.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import String, DateTime, ForeignKey, BigInteger, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class DocumentType(str, Enum):
    """Document type classification."""

    REGULATION = "REGULATION"
    POLICY = "POLICY"


class ProcessingStatus(str, Enum):
    """Document processing status."""

    UPLOADED = "UPLOADED"
    PROCESSING = "PROCESSING"
    PROCESSED = "PROCESSED"
    FAILED = "FAILED"


class Document(Base):
    """
    Document entity representing uploaded files.

    Attributes
    ----------
    id : UUID
        Primary key — server-generated UUID4.
    organization_id : UUID
        Foreign key to the organization this document belongs to.
    uploaded_by : UUID
        Foreign key to the user who uploaded this document.
    original_filename : str
        Original name of the uploaded file.
    stored_filename : str
        Server-generated storage name for the file.
    file_path : str
        Full path to the stored file on the filesystem.
    file_size : int
        Size of the file in bytes.
    mime_type : str
        MIME type of the file (e.g., application/pdf).
    checksum : str
        SHA-256 hash of the file contents.
    document_type : DocumentType
        Classification of the document (REGULATION or POLICY).
    processing_status : ProcessingStatus
        Current state of document processing.
    progress : int
        Processing progress percentage (0–100). Updated at each pipeline stage.
    current_step : str | None
        Human-readable label for the active pipeline step (e.g. "Generating Embeddings").
        Null when processing has not started.
    created_at : datetime
        UTC timestamp when the document was uploaded.
    updated_at : datetime
        UTC timestamp of the last modification.
    organization : Organization
        Relationship to the parent organization.
    uploader : User
        Relationship to the user who uploaded the document.
    """

    __tablename__ = "documents"

    # Primary key — UUID4, server-generated (INSERT leaves this out).
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Foreign key to organizations.id.
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Foreign key to users.id — the user who uploaded this document.
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    stored_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    file_path: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    file_size: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    mime_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    checksum: Mapped[str] = mapped_column(
        String(64),  # SHA-256 produces 64 hex characters
        nullable=False,
        index=True,
    )

    document_type: Mapped[DocumentType] = mapped_column(
        nullable=False,
    )

    processing_status: Mapped[ProcessingStatus] = mapped_column(
        nullable=False,
        default=ProcessingStatus.UPLOADED,
    )

    # Processing progress percentage (0–100). Updated at each pipeline stage
    # so the status endpoint can report fine-grained progress without relying
    # on in-memory state that would be lost across server restarts.
    progress: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    # Human-readable label for the current pipeline step.  Null until
    # processing begins; set to "Complete" or "Failed" at terminal states.
    current_step: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    # When processing last transitioned INTO PROCESSING (null until then).
    processing_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # When processing last reached a terminal state (PROCESSED or FAILED).
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Human-readable error message captured on FAILED. Null when not failed.
    # Capped to keep the column cheap — orchestrator truncates if needed.
    error_message: Mapped[str | None] = mapped_column(
        String(2000),
        nullable=True,
    )

    # Foreign key into MongoDB — the ObjectId string returned by the legacy
    # document store. Stored here so the Postgres record links back to the
    # processed clauses/graph payload the existing GraphRAG services use.
    mongo_document_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationship to the parent organization.
    organization: Mapped["Organization"] = relationship(
        "Organization",
        back_populates="documents",
        lazy="select",
    )

    # Relationship to the user who uploaded this document.
    uploader: Mapped["User"] = relationship(
        "User",
        back_populates="documents",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<Document(id={self.id}, filename={self.original_filename!r})>"