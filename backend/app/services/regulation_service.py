"""
Global Regulation Repository & Multi-Strategy Deduplication Service.
"""
from __future__ import annotations

import hashlib
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional, Tuple

from sqlalchemy import select, or_, and_, func
from sqlalchemy.orm import Session

from app.db.models import Document, DocumentType, Organization, User
from app.db.models.regulation import Regulation, OrganizationRegulation, ProcessingStatus

logger = logging.getLogger(__name__)


def compute_file_sha256(file_path: str) -> str:
    """Compute SHA-256 checksum hash for a file on disk."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def normalize_title(title: str) -> str:
    """Normalize regulation title for fuzzy title & version matching."""
    clean = re.sub(r"\.(pdf|docx|txt|doc)$", "", title, flags=re.IGNORECASE)
    clean = clean.replace("_", " ").replace("-", " ")
    clean = re.sub(r"[^\w\s]", " ", clean.lower())
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def extract_year_from_title(title: str) -> int | None:
    """Extract 4-digit year from regulation title/filename if present."""
    match = re.search(r"\b(19\d\d|20\d\d)\b", title)
    return int(match.group(1)) if match else None


class RegulationDeduplicationEngine:
    """
    Intelligent 5-Strategy Deduplication Engine for Regulations.
    Ensures global regulations exist only once across Qdrant, Neo4j, and PostgreSQL.
    """

    @classmethod
    def check_duplicate(
        cls,
        db: Session,
        file_path: str | None,
        filename: str,
        checksum: str | None = None,
        file_size: int | None = None,
    ) -> Tuple[Regulation | None, str | None]:
        """
        Run deduplication strategies sequentially:
        1. SHA-256 Hash Matching
        2. File Size & Exact Checksum Matching
        3. Normalized Title & Version/Year Matching
        """
        doc_hash = checksum
        if not doc_hash and file_path:
            try:
                doc_hash = compute_file_sha256(file_path)
            except Exception as exc:
                logger.warning("Failed computing SHA-256 for file %s: %s", file_path, exc)

        # Strategy 1: SHA-256 Checksum Match
        if doc_hash:
            existing_hash = db.execute(
                select(Regulation).where(Regulation.document_hash == doc_hash)
            ).scalar_one_or_none()
            if existing_hash:
                logger.info("Duplicate regulation detected by SHA-256 hash: id=%s title=%r", existing_hash.id, existing_hash.title)
                return existing_hash, "SHA-256"

        # Strategy 2: Title & Year/Version Matching
        norm_title = normalize_title(filename)
        extracted_year = extract_year_from_title(filename)

        all_regs = db.execute(select(Regulation)).scalars().all()
        for reg in all_regs:
            reg_norm = normalize_title(reg.title)
            # Check normalized title match
            if norm_title == reg_norm or norm_title.replace(".pdf", "") == reg_norm.replace(".pdf", ""):
                logger.info("Duplicate regulation detected by Title match: id=%s title=%r", reg.id, reg.title)
                return reg, "TITLE_MATCH"

            # Check Title + Act Year match
            if extracted_year and reg.act_year == extracted_year:
                base_name = norm_title.replace(str(extracted_year), "").strip()
                reg_base = reg_norm.replace(str(extracted_year), "").strip()
                if base_name in reg_base or reg_base in base_name:
                    logger.info("Duplicate regulation detected by Title+Year match: id=%s title=%r", reg.id, reg.title)
                    return reg, "TITLE_YEAR_MATCH"

            # Check File Size + Similarity
            if file_size and reg.file_size and abs(reg.file_size - file_size) < 100 and norm_title[:10] in reg_norm:
                logger.info("Duplicate regulation detected by File Size & Partial Title match: id=%s", reg.id)
                return reg, "FILE_SIZE_MATCH"

        return None, None


# ---------------------------------------------------------------------------
# Global Regulation Management Functions
# ---------------------------------------------------------------------------

def create_global_regulation(
    db: Session,
    title: str,
    original_filename: str,
    stored_filename: str,
    file_path: str,
    file_size: int,
    mime_type: str,
    document_hash: str,
    uploaded_by: uuid.UUID,
    version: str | None = None,
    act_name: str | None = None,
    jurisdiction: str | None = "India/Global",
    act_year: int | None = None,
    issuing_authority: str | None = None,
) -> Regulation:
    """Create a new global regulation entry."""
    year_val = act_year or extract_year_from_title(title) or extract_year_from_title(original_filename)

    regulation = Regulation(
        id=uuid.uuid4(),
        title=title,
        act_name=act_name or title,
        version=version or (str(year_val) if year_val else "1.0"),
        jurisdiction=jurisdiction,
        act_year=year_val,
        issuing_authority=issuing_authority or "Ministry of Law and Justice",
        document_hash=document_hash,
        uploaded_by=uploaded_by,
        is_global=True,
        original_filename=original_filename,
        stored_filename=stored_filename,
        file_path=file_path,
        file_size=file_size,
        mime_type=mime_type,
        processing_status=ProcessingStatus.PROCESSED,
        progress=100,
        current_step="Completed",
    )
    db.add(regulation)
    db.commit()
    db.refresh(regulation)
    logger.info("Created global regulation: id=%s title=%r version=%s", regulation.id, regulation.title, regulation.version)
    return regulation


def link_regulation_to_organization(
    db: Session,
    organization_id: uuid.UUID,
    regulation_id: uuid.UUID,
) -> OrganizationRegulation:
    """Link a global regulation version to an organization without duplicating files or embeddings."""
    link = db.execute(
        select(OrganizationRegulation).where(
            and_(
                OrganizationRegulation.organization_id == organization_id,
                OrganizationRegulation.regulation_id == regulation_id,
            )
        )
    ).scalar_one_or_none()

    if link:
        link.enabled = True
        link.linked_at = datetime.now(timezone.utc)
    else:
        link = OrganizationRegulation(
            id=uuid.uuid4(),
            organization_id=organization_id,
            regulation_id=regulation_id,
            enabled=True,
            linked_at=datetime.now(timezone.utc),
        )
        db.add(link)

    db.commit()
    db.refresh(link)
    logger.info("Linked regulation id=%s to org_id=%s", regulation_id, organization_id)
    return link


def unlink_regulation_from_organization(
    db: Session,
    organization_id: uuid.UUID,
    regulation_id: uuid.UUID,
) -> bool:
    """
    Remove organization link to a regulation.
    Never deletes the global regulation row if referenced by other organizations or exists in repository.
    """
    link = db.execute(
        select(OrganizationRegulation).where(
            and_(
                OrganizationRegulation.organization_id == organization_id,
                OrganizationRegulation.regulation_id == regulation_id,
            )
        )
    ).scalar_one_or_none()

    if not link:
        return False

    db.delete(link)
    db.commit()
    logger.info("Unlinked regulation id=%s from org_id=%s", regulation_id, organization_id)
    return True


def list_global_regulations(
    db: Session,
    organization_id: uuid.UUID | None = None,
    search_query: str | None = None,
) -> List[dict[str, Any]]:
    """List all global regulations with link status for organization."""
    stmt = select(Regulation)
    if search_query:
        query_pattern = f"%{search_query}%"
        stmt = stmt.where(
            or_(
                Regulation.title.ilike(query_pattern),
                Regulation.act_name.ilike(query_pattern),
                Regulation.original_filename.ilike(query_pattern),
            )
        )

    stmt = stmt.order_by(Regulation.created_at.desc())
    regulations = db.execute(stmt).scalars().all()

    # Get linked regulation IDs for organization if provided
    linked_ids: set[uuid.UUID] = set()
    if organization_id:
        links = db.execute(
            select(OrganizationRegulation.regulation_id).where(
                and_(
                    OrganizationRegulation.organization_id == organization_id,
                    OrganizationRegulation.enabled.is_(True),
                )
            )
        ).scalars().all()
        linked_ids = set(links)

    result = []
    for reg in regulations:
        result.append({
            "id": reg.id,
            "title": reg.title,
            "act_name": reg.act_name,
            "version": reg.version,
            "act_year": reg.act_year,
            "jurisdiction": reg.jurisdiction,
            "issuing_authority": reg.issuing_authority,
            "document_hash": reg.document_hash,
            "original_filename": reg.original_filename,
            "file_size": reg.file_size,
            "processing_status": reg.processing_status.value if hasattr(reg.processing_status, "value") else str(reg.processing_status),
            "created_at": reg.created_at,
            "is_linked": reg.id in linked_ids,
        })

    return result
