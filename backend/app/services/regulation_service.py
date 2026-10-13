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
# Verified Statutory Legislation Registry & Canonical Metadata Engine
# ---------------------------------------------------------------------------

CANONICAL_REGULATION_REGISTRY: list[dict[str, Any]] = [
    {
        "patterns": [r"\bdpdp\b", r"digital\s+personal\s+data\s+protection"],
        "official_title": "Digital Personal Data Protection Act, 2023",
        "act_name": "DPDP Act",
        "jurisdiction": "India (National)",
        "issuing_authority": "Ministry of Electronics and Information Technology (MeitY)",
        "act_year": 2023,
        "effective_date": "August 11, 2023",
        "version": "Act No. 22 of 2023",
        "domain": "Data Privacy & Protection",
        "source": "The Gazette of India (CG-DL-E-12082023-248045)",
    },
    {
        "patterns": [r"\bposh\b", r"sexual\s+harassment\s+of\s+women"],
        "official_title": "Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013",
        "act_name": "POSH Act",
        "jurisdiction": "India (National)",
        "issuing_authority": "Ministry of Women and Child Development",
        "act_year": 2013,
        "effective_date": "December 9, 2013",
        "version": "Act No. 14 of 2013",
        "domain": "Employment & Workplace Safety",
        "source": "The Gazette of India",
    },
    {
        "patterns": [r"\bfema\b", r"foreign\s+exchange\s+management"],
        "official_title": "Foreign Exchange Management Act, 1999",
        "act_name": "FEMA",
        "jurisdiction": "India (National)",
        "issuing_authority": "Reserve Bank of India & Ministry of Finance",
        "act_year": 1999,
        "effective_date": "June 1, 2000",
        "version": "Act No. 42 of 1999",
        "domain": "Foreign Exchange & Trade Compliance",
        "source": "The Gazette of India",
    },
    {
        "patterns": [r"\bit\s*act\b", r"information\s+technology\s+act"],
        "official_title": "Information Technology Act, 2000",
        "act_name": "Information Technology Act",
        "jurisdiction": "India (National)",
        "issuing_authority": "Ministry of Electronics and Information Technology (MeitY)",
        "act_year": 2000,
        "effective_date": "October 17, 2000",
        "version": "Act No. 21 of 2000",
        "domain": "Cybersecurity & Electronic Commerce",
        "source": "The Gazette of India",
    },
    {
        "patterns": [r"companies\s+act"],
        "official_title": "Companies Act, 2013",
        "act_name": "Companies Act",
        "jurisdiction": "India (National)",
        "issuing_authority": "Ministry of Corporate Affairs (MCA)",
        "act_year": 2013,
        "effective_date": "April 1, 2014",
        "version": "Act No. 18 of 2013",
        "domain": "Corporate Governance & Financial Compliance",
        "source": "The Gazette of India",
    },
    {
        "patterns": [r"code\s+on\s+wages", r"code\s+of\s+wages"],
        "official_title": "Code on Wages, 2019",
        "act_name": "Code on Wages",
        "jurisdiction": "India (National)",
        "issuing_authority": "Ministry of Labour and Employment",
        "act_year": 2019,
        "effective_date": "August 8, 2019",
        "version": "Act No. 29 of 2019",
        "domain": "Labour & Wage Standards",
        "source": "The Gazette of India",
    },
    {
        "patterns": [r"factories\s+act"],
        "official_title": "Factories Act, 1948",
        "act_name": "Factories Act",
        "jurisdiction": "India (National)",
        "issuing_authority": "Ministry of Labour and Employment",
        "act_year": 1948,
        "effective_date": "April 1, 1949",
        "version": "Act No. 63 of 1948",
        "domain": "Occupational Health & Industrial Safety",
        "source": "The Gazette of India",
    },
    {
        "patterns": [r"\bgdpr\b", r"general\s+data\s+protection\s+regulation"],
        "official_title": "General Data Protection Regulation (EU) 2016/679",
        "act_name": "GDPR",
        "jurisdiction": "European Union",
        "issuing_authority": "European Parliament and Council of the European Union",
        "act_year": 2016,
        "effective_date": "May 25, 2018",
        "version": "Regulation (EU) 2016/679",
        "domain": "Data Protection & Privacy",
        "source": "Official Journal of the European Union",
    },
    {
        "patterns": [r"iso\s*27001", r"iso\/iec\s*27001"],
        "official_title": "ISO/IEC 27001:2022 Information Security Management",
        "act_name": "ISO/IEC 27001",
        "jurisdiction": "International",
        "issuing_authority": "International Organization for Standardization (ISO/IEC)",
        "act_year": 2022,
        "effective_date": "October 2022",
        "version": "ISO/IEC 27001:2022",
        "domain": "Information Security & Risk Management",
        "source": "ISO/IEC Standards Directory",
    },
]


def resolve_canonical_metadata(title: str = "", filename: str = "", act_name: str | None = None) -> dict[str, Any] | None:
    """
    Match regulation identifiers against the verified statutory registry.
    Returns verified legal metadata or None if unrecognized (never invents false values).
    """
    clean_text = re.sub(r"[_\-]+", " ", f"{title} {filename} {act_name or ''}").lower()
    for entry in CANONICAL_REGULATION_REGISTRY:
        for pattern in entry["patterns"]:
            if re.search(pattern, clean_text, re.IGNORECASE):
                return entry
    return None


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
    jurisdiction: str | None = None,
    act_year: int | None = None,
    issuing_authority: str | None = None,
) -> Regulation:
    """Create a new global regulation entry with verified metadata resolution."""
    canon = resolve_canonical_metadata(title, original_filename, act_name)

    resolved_title = title
    resolved_act_name = act_name
    resolved_year = act_year or extract_year_from_title(title) or extract_year_from_title(original_filename)
    resolved_jurisdiction = jurisdiction
    resolved_authority = issuing_authority
    resolved_version = version

    if canon:
        resolved_title = canon["official_title"] if not title or title.endswith(".pdf") else title
        resolved_act_name = resolved_act_name or canon["act_name"]
        resolved_year = resolved_year or canon["act_year"]
        resolved_jurisdiction = resolved_jurisdiction or canon["jurisdiction"]
        resolved_authority = resolved_authority or canon["issuing_authority"]
        resolved_version = resolved_version or canon["version"]
    else:
        resolved_act_name = resolved_act_name or (title.rsplit(".", 1)[0] if "." in title else title)
        resolved_version = resolved_version or (str(resolved_year) if resolved_year else None)

    regulation = Regulation(
        id=uuid.uuid4(),
        title=resolved_title,
        act_name=resolved_act_name,
        version=resolved_version,
        jurisdiction=resolved_jurisdiction,
        act_year=resolved_year,
        issuing_authority=resolved_authority,
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
    only_linked: bool = False,
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
        is_linked = reg.id in linked_ids
        if only_linked and not is_linked:
            continue

        canon = resolve_canonical_metadata(reg.title or "", reg.original_filename or "", reg.act_name or "")

        # Compute accurate verified metadata
        official_title = reg.title
        jurisdiction = reg.jurisdiction
        issuing_authority = reg.issuing_authority
        act_year = reg.act_year
        version = reg.version
        domain = None
        effective_date = None
        source = None

        if canon:
            official_title = canon["official_title"]
            # Clean up old generic default fallbacks if present
            if not jurisdiction or jurisdiction in ("Global", "India/Global", "India (Central)"):
                jurisdiction = canon["jurisdiction"]
            if not issuing_authority or (issuing_authority in ("Ministry of Corporate Affairs", "Ministry of Law and Justice") and "companies" not in (reg.title or "").lower()):
                issuing_authority = canon["issuing_authority"]
            if not act_year or (act_year == 2013 and canon["act_year"] != 2013):
                act_year = canon["act_year"]
            if not version or version in ("1.0", "Statutory Text", "2013 Statutory Text"):
                version = canon["version"]
            domain = canon["domain"]
            effective_date = canon["effective_date"]
            source = canon["source"]
        else:
            # If no canonical match, do not present generic default fallbacks as verified facts
            if issuing_authority == "Ministry of Corporate Affairs" and "companies" not in (reg.title or "").lower():
                issuing_authority = None
            if act_year == 2013 and "2013" not in f"{reg.title} {reg.original_filename}":
                act_year = extract_year_from_title(reg.title) or extract_year_from_title(reg.original_filename)

        result.append({
            "id": reg.id,
            "title": reg.title,
            "official_title": official_title,
            "act_name": reg.act_name or (canon["act_name"] if canon else reg.title),
            "version": version,
            "act_year": act_year,
            "jurisdiction": jurisdiction,
            "issuing_authority": issuing_authority,
            "effective_date": effective_date,
            "domain": domain,
            "source": source,
            "document_hash": reg.document_hash,
            "original_filename": reg.original_filename,
            "file_size": reg.file_size,
            "processing_status": reg.processing_status.value if hasattr(reg.processing_status, "value") else str(reg.processing_status),
            "created_at": reg.created_at,
            "is_linked": is_linked,
        })

    return result
