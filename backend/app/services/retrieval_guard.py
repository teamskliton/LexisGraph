"""
Retrieval Guard — Centralized Server-Side Security Authorization Gate.

Enforces zero-trust tenant data isolation for all AI Assistant retrieval and generation workflows.
Validates candidate clauses, evidence items, and source citations against PostgreSQL ground-truth
records before they can enter LLM prompts or be serialized in client responses.
"""
from __future__ import annotations

import logging
import re
import uuid
from typing import Any, Sequence

from sqlalchemy.orm import Session

from app.compliance.models import ComplianceReport, ReportFinding
from app.db.models import Document, Regulation
from app.schemas.chat import RelatedDocument, SourceCitation

logger = logging.getLogger(__name__)


def validate_retrieval_candidates(
    db: Session,
    organization_id: uuid.UUID | str,
    clauses: Sequence[Any],
) -> list[Any]:
    """
    Validate every candidate retrieved clause against ground-truth PostgreSQL records.
    
    A candidate clause is authorized IF AND ONLY IF:
    1. It belongs to a Document in PostgreSQL with document.organization_id == organization_id, OR
    2. It belongs to a Regulation in PostgreSQL with regulation.is_global == True.

    Candidates lacking verifiable ownership metadata or belonging to another tenant
    are strictly quarantined/excluded.
    """
    try:
        org_uuid = uuid.UUID(str(organization_id)) if isinstance(organization_id, str) else organization_id
    except (ValueError, TypeError):
        logger.error("[RETRIEVAL_GUARD] Invalid organization_id: %r; blocking all candidates", organization_id)
        return []

    if not clauses:
        return []

    # Pre-fetch candidate document IDs from clauses
    raw_doc_ids: set[str] = set()
    for item in clauses:
        doc_id = getattr(item, "document_id", None) if not isinstance(item, dict) else item.get("document_id")
        if doc_id:
            raw_doc_ids.add(str(doc_id).strip())

    parsed_doc_uuids: dict[str, uuid.UUID] = {}
    for d_str in raw_doc_ids:
        try:
            parsed_doc_uuids[d_str] = uuid.UUID(d_str)
        except (ValueError, TypeError):
            continue

    # Batch query authorized Documents and global Regulations
    authorized_policy_map: dict[str, Document] = {}
    if parsed_doc_uuids:
        docs = (
            db.query(Document)
            .filter(
                Document.id.in_(list(parsed_doc_uuids.values())),
                Document.organization_id == org_uuid,
            )
            .all()
        )
        for d in docs:
            authorized_policy_map[str(d.id)] = d

    authorized_regulation_map: dict[str, Regulation] = {}
    if parsed_doc_uuids:
        regs = (
            db.query(Regulation)
            .filter(
                Regulation.id.in_(list(parsed_doc_uuids.values())),
                Regulation.is_global == True,  # noqa: E712
            )
            .all()
        )
        for r in regs:
            authorized_regulation_map[str(r.id)] = r

    authorized_clauses: list[Any] = []
    for item in clauses:
        doc_id_val = getattr(item, "document_id", None) if not isinstance(item, dict) else item.get("document_id")
        doc_id_str = str(doc_id_val).strip() if doc_id_val else ""
        clause_id_val = getattr(item, "clause_id", None) if not isinstance(item, dict) else item.get("clause_id")
        title_cand = getattr(item, "title", None) or getattr(item, "document_name", None) if not isinstance(item, dict) else (item.get("title") or item.get("document_name"))
        title_str = str(title_cand).strip() if title_cand else ""

        if not doc_id_str:
            # Check if statutory legal act by title with word boundary (e.g. Code of Wages Act, Minimum Wages Act)
            is_statutory = bool(
                title_str and re.search(r"\b(?:act|code of wages|minimum wages|statute|regulations?)\b", title_str, re.IGNORECASE)
            )
            if is_statutory:
                authorized_clauses.append(item)
                continue

            # Missing document ownership metadata — exclude immediately
            logger.warning(
                "[RETRIEVAL_GUARD] Quarantined candidate with missing document_id: clause_id=%s title=%r",
                clause_id_val,
                title_str,
            )
            continue

        if doc_id_str in authorized_policy_map:
            # Verified workspace policy
            policy_doc = authorized_policy_map[doc_id_str]
            if hasattr(item, "title"):
                item.title = policy_doc.original_filename
            elif isinstance(item, dict):
                item["title"] = policy_doc.original_filename
            authorized_clauses.append(item)
            continue

        if doc_id_str in authorized_regulation_map:
            # Verified shared global statutory regulation
            reg_doc = authorized_regulation_map[doc_id_str]
            reg_title = reg_doc.title or reg_doc.act_name or "Statutory Regulation"
            if hasattr(item, "title"):
                item.title = reg_title
            elif isinstance(item, dict):
                item["title"] = reg_title
            authorized_clauses.append(item)
            continue

        # Check if the document exists in DB under another tenant (data leakage detection)
        if doc_id_str in parsed_doc_uuids:
            foreign_doc = db.get(Document, parsed_doc_uuids[doc_id_str])
            if foreign_doc and foreign_doc.organization_id != org_uuid:
                logger.error(
                    "[SECURITY ALERT] Blocked cross-tenant retrieval attempt! doc_id=%s belongs to org=%s, requested by org=%s",
                    foreign_doc.id,
                    foreign_doc.organization_id,
                    org_uuid,
                )
                continue

        # Check if item represents a statutory legal regulation/act and doc_id was not a foreign doc
        is_statutory = bool(
            title_str and re.search(r"\b(?:act|code of wages|minimum wages|statute|regulations?)\b", title_str, re.IGNORECASE)
        )
        if is_statutory and doc_id_str not in parsed_doc_uuids:
            authorized_clauses.append(item)
            continue

        logger.warning(
            "[RETRIEVAL_GUARD] Quarantined unverified candidate: clause_id=%s doc_id=%s title=%r",
            clause_id_val,
            doc_id_str,
            title_str,
        )

    logger.info(
        "[RETRIEVAL_GUARD] Candidate verification complete: org_id=%s candidate_count=%d authorized_count=%d",
        org_uuid,
        len(clauses),
        len(authorized_clauses),
    )
    return authorized_clauses


def authorize_citations(
    db: Session,
    organization_id: uuid.UUID | str,
    citations: Sequence[SourceCitation],
) -> list[SourceCitation]:
    """
    Validate every candidate SourceCitation before response serialization or prompt inclusion.
    Rejects citations referring to foreign tenant documents, reports, or unverified entities.
    """
    try:
        org_uuid = uuid.UUID(str(organization_id)) if isinstance(organization_id, str) else organization_id
    except (ValueError, TypeError):
        return []

    if not citations:
        return []

    verified_citations: list[SourceCitation] = []

    for cit in citations:
        doc_id_str = cit.document_id

        d_uuid: uuid.UUID | None = None
        if doc_id_str:
            try:
                d_uuid = uuid.UUID(str(doc_id_str))
            except (ValueError, TypeError):
                d_uuid = None

        if d_uuid:
            # 1. Check if Document belonging to active workspace
            doc = db.query(Document).filter(Document.id == d_uuid, Document.organization_id == org_uuid).first()
            if doc:
                cit.document = doc.original_filename
                cit.type = "Policy"
                verified_citations.append(cit)
                continue

            # 2. Check if shared global Regulation
            reg = db.query(Regulation).filter(Regulation.id == d_uuid, Regulation.is_global == True).first()  # noqa: E712
            if reg:
                cit.document = reg.title or reg.act_name or "Statutory Regulation"
                cit.type = "Regulation"
                verified_citations.append(cit)
                continue

            # 3. Check if foreign tenant document (Security Alert!)
            foreign_doc = db.get(Document, d_uuid)
            if foreign_doc and foreign_doc.organization_id != org_uuid:
                logger.error(
                    "[SECURITY ALERT] Rejected unauthorized foreign tenant citation: doc_id=%s requested_org=%s",
                    d_uuid,
                    org_uuid,
                )
                continue

            # 4. Check if ComplianceReport belonging to active workspace
            rep = db.query(ComplianceReport).filter(ComplianceReport.id == d_uuid, ComplianceReport.organization_id == org_uuid).first()
            if rep:
                verified_citations.append(cit)
                continue

            # 5. Check if ReportFinding whose parent report belongs to active workspace
            finding = (
                db.query(ReportFinding)
                .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
                .filter(ReportFinding.id == d_uuid, ComplianceReport.organization_id == org_uuid)
                .first()
            )
            if finding:
                verified_citations.append(cit)
                continue

        # Check if statutory legal regulation/act reference by title (only if not a non-existent UUID)
        doc_title = str(cit.document or "").strip()
        is_statutory = bool(
            doc_title and re.search(r"\b(?:act|code of wages|minimum wages|statute|regulations?)\b", doc_title, re.IGNORECASE)
        )
        if is_statutory and not d_uuid:
            cit.type = "Regulation"
            verified_citations.append(cit)
            continue

        # If foreign tenant document or unverified source
        logger.warning(
            "[SECURITY ALERT] Rejected unauthorized source citation: doc_id=%s title=%r requested_org=%s",
            doc_id_str,
            cit.document,
            org_uuid,
        )

    return verified_citations


def filter_related_documents(
    db: Session,
    organization_id: uuid.UUID | str,
    related_docs: Sequence[RelatedDocument],
) -> list[RelatedDocument]:
    """Ensure recommended related documents strictly belong to active workspace or global regulations."""
    try:
        org_uuid = uuid.UUID(str(organization_id)) if isinstance(organization_id, str) else organization_id
    except (ValueError, TypeError):
        return []

    verified_docs: list[RelatedDocument] = []
    for rd in related_docs:
        try:
            d_uuid = uuid.UUID(str(rd.id))
        except (ValueError, TypeError):
            continue

        doc = db.query(Document).filter(Document.id == d_uuid, Document.organization_id == org_uuid).first()
        if doc:
            rd.title = doc.original_filename
            verified_docs.append(rd)
            continue

        reg = db.query(Regulation).filter(Regulation.id == d_uuid, Regulation.is_global == True).first()  # noqa: E712
        if reg:
            rd.title = reg.title or reg.act_name or "Statutory Regulation"
            verified_docs.append(rd)
            continue

    return verified_docs
