"""
Regulation model.

Uses SQLAlchemy 2.0 declarative style with Mapped[] annotations.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, BigInteger, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.db.models.document import ProcessingStatus


class Regulation(Base):
    """
    Regulation entity representing global uploaded regulation files.

    Attributes
    ----------
    id : UUID
        Primary key — server-generated UUID4.
    title : str
        Title of the regulation.
    act_name : str | None
        Name of the act, if applicable.
    version : str | None
        Version of the regulation.
    jurisdiction : str | None
        Jurisdiction of the regulation.
    document_hash : str
        SHA-256 hash of the file contents. Used to prevent duplicates.
    uploaded_by : UUID
        Foreign key to the user who uploaded this document.
    is_global : bool
        Whether this regulation is shared globally (defaults to True).
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
    processing_status : ProcessingStatus
        Current state of document processing.
    progress : int
        Processing progress percentage (0–100).
    current_step : str | None
        Human-readable label for the active pipeline step.
    processing_started_at : datetime | None
        When processing last transitioned INTO PROCESSING.
    processed_at : datetime | None
        When processing last reached a terminal state (PROCESSED or FAILED).
    error_message : str | None
        Human-readable error message captured on FAILED.
    mongo_document_id : str | None
        Foreign key into MongoDB, if applicable.
    created_at : datetime
        UTC timestamp when the regulation was uploaded.
    updated_at : datetime
        UTC timestamp of the last modification.
    uploader : User
        Relationship to the user who uploaded the regulation.
    """

    __tablename__ = "regulations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    act_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    version: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    jurisdiction: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    act_year: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    issuing_authority: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    document_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )

    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    is_global: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
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

    processing_status: Mapped[ProcessingStatus] = mapped_column(
        nullable=False,
        default=ProcessingStatus.UPLOADED,
    )

    progress: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    current_step: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    processing_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    error_message: Mapped[str | None] = mapped_column(
        String(2000),
        nullable=True,
    )

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

    # Relationship to the user who uploaded this document.
    uploader: Mapped["User"] = relationship(
        "User",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<Regulation(id={self.id}, title={self.title!r}, document_hash={self.document_hash!r})>"


from sqlalchemy import UniqueConstraint


class OrganizationRegulation(Base):
    """
    Junction entity linking Organizations to Global Regulations.
    Enables shared global regulations without duplicating storage or embeddings.
    """

    __tablename__ = "organization_regulations"
    __table_args__ = (
        UniqueConstraint("organization_id", "regulation_id", name="uq_org_regulation_link"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    regulation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("regulations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    organization: Mapped["Organization"] = relationship("Organization", lazy="select")
    regulation: Mapped["Regulation"] = relationship("Regulation", lazy="select")

    def __repr__(self) -> str:
        return f"<OrganizationRegulation(org={self.organization_id}, reg={self.regulation_id}, enabled={self.enabled})>"
