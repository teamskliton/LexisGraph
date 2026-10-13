"""
Chat Service — AI Legal Assistant Business Logic with Persistent Memory, Real-Time Streaming & Intelligent Recommendations.

Orchestrates RAG workflow:
1. Verify organization authorization & resolve persistent conversation session in PostgreSQL.
2. Load bounded conversation history (latest 10 messages).
3. Perform hybrid context retrieval via Qdrant (vectors) + Neo4j (knowledge graph).
4. Build LLM prompt with system prompt, history, hybrid context, user question, and recommendation generation directives.
5. Stream token-by-token or generate batch response via Gemini / OpenRouter.
6. Extract 3 non-repeating follow-up questions, recommended legal actions, and related documents.
7. Persist user & assistant messages to PostgreSQL and return structured response/events.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from typing import Any, AsyncGenerator, Sequence

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db.models import ConversationMessage, Document, Organization, Regulation, User
from app.compliance.models import ComplianceReport, ReportFinding
from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    RecommendedAction,
    RelatedDocument,
    SourceCitation,
)
from app.core.workspace_context import WorkspaceContext, verify_user_workspace_membership
from app.services.activity_service import log_activity
from app.services.llm_reasoning import _resolve_reasoning, _stream_resolve_reasoning
from app.services.memory_service import (
    get_or_create_session,
    get_recent_history,
    save_message_pair,
)
from app.services.retrieval_guard import (
    authorize_citations,
    filter_related_documents,
    validate_retrieval_candidates,
)
from app.services.retrieval_orchestrator import (
    RetrievalContext,
    _format_context_for_llm,
    retrieve_context,
)

logger = logging.getLogger(__name__)

NO_EVIDENCE_MESSAGE = "I couldn't find sufficient evidence in the uploaded documents."
MIN_CONFIDENCE_THRESHOLD = 0.25


def _format_history_block(history: Sequence[ConversationMessage]) -> str:
    """Format recent conversation history into a clean prompt section."""
    if not history:
        return "No prior conversation history."

    lines: list[str] = []
    for msg in history:
        role_label = "User" if msg.role.lower() == "user" else "Assistant"
        lines.append(f"{role_label}: {msg.message.strip()}")
    return "\n".join(lines)


def _clean_query_for_semantic_retrieval(query: str) -> str:
    """Strip structured UI context brackets and raw UUID prefixes from query for vector search."""
    cleaned = re.sub(r"\[Context\s+(?:Report ID|Policy|Regulation|Focus):\s*[^\]]+\]", "", query, flags=re.IGNORECASE)
    cleaned = re.sub(r"#[0-9a-fA-F-]{8,36}", "", cleaned)
    return cleaned.strip() or query.strip()


def _enrich_context_with_entities(
    db: Session,
    organization_id: uuid.UUID | str,
    question: str,
) -> tuple[str, list[SourceCitation], list[dict[str, Any]]]:
    """
    Detect explicit report IDs, finding IDs, and context tags in the question and load
    ground-truth database records (ComplianceReport, ReportFinding, Document, Regulation)
    from PostgreSQL to ground the AI Legal Assistant.
    """
    extra_context_lines: list[str] = []
    extra_sources: list[SourceCitation] = []
    extra_docs: list[dict[str, Any]] = []

    # 1. Extract finding IDs: 'finding ID <uuid>' or 'finding (<uuid>)' or raw UUID matching ReportFinding
    finding_matches = re.findall(
        r"(?:finding\s*(?:ID\s*)?\(?([0-9a-fA-F-]{36})\)?)|(?:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}))",
        question,
        re.IGNORECASE,
    )
    extracted_uuids: list[str] = []
    for m in finding_matches:
        uid = m[0] or m[1]
        if uid and uid not in extracted_uuids:
            extracted_uuids.append(uid)

    # Check for Report ID tag
    report_tag_match = re.search(r"\[Context Report ID:\s*([0-9a-fA-F-]+)\]", question, re.IGNORECASE)
    report_tag_id = report_tag_match.group(1).strip() if report_tag_match else None

    # Also detect short report references like 'report #265e6130'
    short_report_match = re.search(r"report\s*#?([0-9a-fA-F]{8})", question, re.IGNORECASE)
    short_report_hex = short_report_match.group(1).strip() if short_report_match else None

    # Convert organization_id to UUID
    try:
        org_uuid = uuid.UUID(str(organization_id)) if isinstance(organization_id, str) else organization_id
    except (ValueError, TypeError):
        org_uuid = None

    if not org_uuid:
        return "", [], []

    # Check ReportFinding records strictly belonging to this organization
    found_findings: list[ReportFinding] = []
    for uid_str in extracted_uuids:
        try:
            f_uuid = uuid.UUID(uid_str)
            f = (
                db.query(ReportFinding)
                .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
                .filter(
                    ReportFinding.id == f_uuid,
                    ComplianceReport.organization_id == org_uuid,
                    ComplianceReport.is_deleted == False,
                )
                .first()
            )
            if f and f not in found_findings:
                found_findings.append(f)
        except (ValueError, TypeError):
            continue

    # Format findings into prompt context
    for f in found_findings:
        rep = db.query(ComplianceReport).filter(ComplianceReport.id == f.report_id, ComplianceReport.organization_id == org_uuid).first()
        pol = db.query(Document).filter(Document.id == rep.policy_document_id, Document.organization_id == org_uuid).first() if rep else None
        reg = db.query(Regulation).filter(Regulation.id == rep.regulation_id).first() if rep else None

        pol_name = pol.original_filename if pol else "Internal Policy Document"
        reg_name = (reg.title or reg.act_name) if reg else "Statutory Regulation"

        lines = [
            f"\n### Detailed Audit Finding Context (Finding ID: {f.id}):",
            f"- Associated Report ID: {f.report_id}",
            f"- Evaluated Policy: {pol_name}",
            f"- Statutory Regulation: {reg_name}",
            f"- Compliance Status: {f.status}",
            f"- Severity: {f.severity}",
            f"- Metric Confidence: {f.confidence:.2f}",
        ]
        if f.citation:
            lines.append(f"- Regulatory Requirement / Citation: \"{f.citation.strip()}\"")
        if f.reasoning:
            lines.append(f"- Audit Analysis & Reasoning: \"{f.reasoning.strip()}\"")
        if f.recommendation:
            lines.append(f"- Remediation Recommendation: \"{f.recommendation.strip()}\"")

        extra_context_lines.append("\n".join(lines))

        # Add to source citations
        extra_sources.append(
            SourceCitation(
                document_id=str(pol.id) if pol else str(f.report_id),
                clause_id=str(f.policy_clause_id or f.id),
                document=f"{pol_name} vs {reg_name}",
                section=f"Finding {str(f.id)[:8]} ({f.status})",
                clause=f.citation or f.reasoning or f"Compliance Finding {f.id}",
                clause_number=str(f.regulation_clause_id or f.id),
                page=1,
                similarity=round(float(f.confidence or 0.9), 4),
                type="Compliance Finding",
                confidence_score=round(float(f.confidence or 0.9), 4),
                search_source="Compliance Audit Database",
            )
        )
        if pol:
            extra_docs.append({"id": str(pol.id), "title": pol_name, "score": 0.95})
        if reg:
            extra_docs.append({"id": str(reg.id), "title": reg_name, "score": 0.95})

    # Check ComplianceReport records strictly belonging to this organization
    target_reports: list[ComplianceReport] = []
    if report_tag_id:
        try:
            r = db.query(ComplianceReport).filter(
                ComplianceReport.id == uuid.UUID(report_tag_id),
                ComplianceReport.organization_id == org_uuid,
                ComplianceReport.is_deleted == False,
            ).first()
            if r and r not in target_reports:
                target_reports.append(r)
        except (ValueError, TypeError):
            pass

    # Match short hex in question
    if short_report_hex and not target_reports:
        candidate_reps = db.query(ComplianceReport).filter(
            ComplianceReport.organization_id == org_uuid,
            ComplianceReport.is_deleted == False,
        ).all()
        for r in candidate_reps:
            if str(r.id).lower().startswith(short_report_hex.lower()):
                if r not in target_reports:
                    target_reports.append(r)
                break

    # Also if extracted_uuids has a compliance report
    for uid_str in extracted_uuids:
        try:
            r_uuid = uuid.UUID(uid_str)
            r = db.query(ComplianceReport).filter(
                ComplianceReport.id == r_uuid,
                ComplianceReport.organization_id == org_uuid,
                ComplianceReport.is_deleted == False,
            ).first()
            if r and r not in target_reports:
                target_reports.append(r)
        except (ValueError, TypeError):
            continue

    for r in target_reports:
        pol = db.query(Document).filter(Document.id == r.policy_document_id, Document.organization_id == org_uuid).first()
        reg = db.query(Regulation).filter(Regulation.id == r.regulation_id, Regulation.is_global == True).first()
        pol_name = pol.original_filename if pol else "Internal Policy Document"
        reg_name = (reg.title or reg.act_name) if reg else "Statutory Regulation"

        # Fetch findings for this report
        findings = db.query(ReportFinding).filter(ReportFinding.report_id == r.id).all()
        high_or_non_compliant = [
            f for f in findings if f.severity in ("HIGH", "CRITICAL") or f.status in ("NON_COMPLIANT", "PARTIALLY_COMPLIANT")
        ]

        summary_text = r.executive_summary or r.summary or ""
        if isinstance(r.report_json, dict) and not summary_text:
            summary_text = str(r.report_json.get("summary") or "")

        lines = [
            f"\n### Compliance Audit Report Context (Report ID: {r.id}):",
            f"- Evaluated Policy: {pol_name}",
            f"- Statutory Regulation: {reg_name}",
            f"- Overall Compliance Score: {r.overall_score:.2f}%",
            f"- Audit Status: {r.status.value if hasattr(r.status, 'value') else r.status}",
            f"- Assessed Risk Level: {r.risk_level or 'CRITICAL'}",
            f"- Total Findings: {len(findings)} (High/Non-compliant: {len(high_or_non_compliant)})",
            f"- Executive Summary: {summary_text}",
        ]

        if high_or_non_compliant:
            lines.append("Key High-Risk and Non-Compliant Findings in this Report:")
            for idx, hf in enumerate(high_or_non_compliant[:6], start=1):
                rec_part = f" | Action: {hf.recommendation.strip()}" if hf.recommendation else ""
                lines.append(
                    f"  {idx}. [Finding {hf.id}] Status: {hf.status}, Severity: {hf.severity}. "
                    f"Requirement: \"{hf.citation or 'N/A'}\"{rec_part}"
                )

        extra_context_lines.append("\n".join(lines))

        extra_sources.append(
            SourceCitation(
                document_id=str(r.id),
                clause_id=str(r.id),
                document=f"Report #{str(r.id)[:8]}: {pol_name} vs {reg_name}",
                section=f"Score: {r.overall_score:.1f}% | Risk: {r.risk_level or 'HIGH'}",
                clause=summary_text[:300] if summary_text else f"Compliance audit report with score {r.overall_score:.1f}%",
                clause_number=str(r.id)[:8],
                page=1,
                similarity=1.0,
                type="Compliance Report",
                confidence_score=1.0,
                search_source="Compliance Audit Database",
            )
        )
        if pol:
            extra_docs.append({"id": str(pol.id), "title": pol_name, "score": 1.0})
        if reg:
            extra_docs.append({"id": str(reg.id), "title": reg_name, "score": 1.0})

    return "\n\n".join(extra_context_lines), extra_sources, extra_docs


def _build_legal_assistant_prompt(
    question: str,
    formatted_context: str,
    history: Sequence[ConversationMessage] | None = None,
) -> str:
    """Construct prompt for Gemini LLM using system prompt, history, hybrid context, and query."""
    history_block = _format_history_block(history or [])

    return (
        "You are LexisGraph AI Legal Assistant. Answer the user's question accurately, thoroughly, and objectively "
        "based on the provided legal context, compliance reports, audit findings, clause IDs, document titles, "
        "and conversation history.\n\n"
        "RULES:\n"
        "1. Answer user questions directly based on the provided context. If the context includes compliance audit reports "
        "or specific findings, synthesize a comprehensive legal answer covering findings, scores, risks, and remediation actions.\n"
        "2. ONLY if the provided context is completely empty and lacks any information to answer the question, "
        f"output exactly: \"{NO_EVIDENCE_MESSAGE}\"\n"
        "3. Cite specific document titles, report IDs, or clause numbers when referencing evidence.\n"
        "4. Provide your final legal answer directly in clean markdown without including internal reasoning drafts or scratchpad notes.\n"
        "5. AT THE VERY END OF YOUR RESPONSE, output a JSON recommendations block starting exactly with '--- RECOMMENDATIONS_JSON ---' "
        "containing 3 short follow-up questions and recommended actions.\n\n"
        f"--- CONVERSATION HISTORY (LAST 10 MESSAGES) START ---\n"
        f"{history_block}\n"
        f"--- CONVERSATION HISTORY END ---\n\n"
        f"--- RETRIEVED LEGAL & AUDIT CONTEXT START ---\n"
        f"{formatted_context}\n"
        f"--- RETRIEVED LEGAL & AUDIT CONTEXT END ---\n\n"
        f"Current User Question: {question}\n\n"
        "Detailed Legal Answer:"
    )


def _format_source_citations(clauses: Sequence[Any]) -> list[SourceCitation]:
    """Convert retrieved context clauses into rich structured source citations."""
    sources: list[SourceCitation] = []
    seen_sources: set[tuple[str, str]] = set()

    for item in clauses:
        if isinstance(item, dict):
            doc_title = item.get("title") or item.get("document_name") or item.get("document") or "Legal Document"
            clause_snippet = str(item.get("clause_text") or item.get("text") or item.get("clause") or "").strip()
            clause_id = item.get("clause_id") or str(uuid.uuid4())
            doc_id = item.get("document_id")
            section = item.get("section") or item.get("title") or item.get("document_name") or "Section"
            page = int(item.get("page_number") or item.get("page") or 1)
            score = float(item.get("final_score") or item.get("score") or item.get("vector_score") or 0.9)
            doc_type = item.get("document_type") or item.get("type") or "Regulation"
            raw_source = str(item.get("source") or "vector").lower()
        else:
            doc_title = getattr(item, "document_name", None) or getattr(item, "title", None) or getattr(item, "document", None) or "Legal Document"
            clause_snippet = str(getattr(item, "clause_text", None) or getattr(item, "text", None) or getattr(item, "clause", None) or "").strip()
            clause_id = getattr(item, "clause_id", None) or str(uuid.uuid4())
            doc_id = getattr(item, "document_id", None)
            section = getattr(item, "section", None) or getattr(item, "title", None) or getattr(item, "document_name", None) or "Section"
            page = int(getattr(item, "page_number", 1) or getattr(item, "page", 1) or 1)
            score = float(getattr(item, "final_score", 0.0) or getattr(item, "score", 0.0) or getattr(item, "vector_score", 0.0) or 0.9)
            doc_type = getattr(item, "document_type", None) or getattr(item, "type", "Regulation")
            raw_source = str(getattr(item, "source", "vector")).lower()

        if not clause_snippet:
            clause_snippet = f"Legal context snippet for clause {str(clause_id)[:8]}"

        if raw_source == "hybrid":
            search_source = "Both"
        elif raw_source == "graph":
            search_source = "Graph Search"
        else:
            search_source = "Vector Search"

        source_tuple = (doc_title, clause_snippet)
        if source_tuple not in seen_sources:
            seen_sources.add(source_tuple)
            sources.append(
                SourceCitation(
                    document_id=str(doc_id) if doc_id else None,
                    clause_id=str(clause_id) if clause_id else None,
                    document=doc_title,
                    section=str(section),
                    clause=clause_snippet,
                    clause_number=str(clause_id) if clause_id else None,
                    page=page,
                    similarity=round(score, 4),
                    type=str(doc_type),
                    confidence_score=round(score, 4),
                    search_source=search_source,
                )
            )

    return sources


def _extract_recommendations_and_clean_answer(
    raw_answer: str,
    clauses: Sequence[Any],
    history: Sequence[ConversationMessage] | None = None,
    extra_docs: Sequence[dict[str, Any]] | None = None,
) -> tuple[str, list[str], list[RecommendedAction], list[RelatedDocument]]:
    """
    Parse recommendations JSON block from LLM output, deduplicate follow-up questions against conversation history,
    and build related document suggestions.
    """
    clean_text = raw_answer
    follow_ups: list[str] = []
    actions: list[RecommendedAction] = []
    related_docs: list[RelatedDocument] = []

    # 1. Parse JSON recommendations block if present
    if "--- RECOMMENDATIONS_JSON ---" in raw_answer:
        parts = raw_answer.split("--- RECOMMENDATIONS_JSON ---")
        clean_text = parts[0].strip()
        json_part = parts[1].strip()

        try:
            # Extract JSON object using regex match
            match = re.search(r"\{.*\}", json_part, re.DOTALL)
            if match:
                data = json.loads(match.group(0))
                if isinstance(data.get("follow_up_questions"), list):
                    follow_ups = [str(q).strip() for q in data["follow_up_questions"] if q]
                if isinstance(data.get("recommended_actions"), list):
                    for act in data["recommended_actions"]:
                        if isinstance(act, dict) and "type" in act and "title" in act:
                            actions.append(
                                RecommendedAction(
                                    type=str(act["type"]),
                                    title=str(act["title"]),
                                    description=str(act.get("description", "")),
                                )
                            )
        except Exception as exc:
            logger.warning("Failed to parse LLM recommendations JSON: %s", exc)

    # 2. History deduplication for follow-up questions
    previous_questions: set[str] = set()
    if history:
        for m in history:
            if m.role.lower() == "user":
                previous_questions.add(m.message.strip().lower())

    filtered_follow_ups = [q for q in follow_ups if q.lower() not in previous_questions]

    # Fallback to default context-aware follow-up questions if needed
    default_follow_ups = [
        "What are the high-risk non-compliant areas?",
        "Compare this requirement with our internal company policies.",
        "What immediate remediation steps should be prioritized?",
    ]
    for dfu in default_follow_ups:
        if len(filtered_follow_ups) >= 3:
            break
        if dfu.lower() not in previous_questions and dfu not in filtered_follow_ups:
            filtered_follow_ups.append(dfu)

    filtered_follow_ups = filtered_follow_ups[:3]

    # 3. Fallback recommended actions if none parsed
    if not actions:
        actions = [
            RecommendedAction(
                type="compare_policy",
                title="Run Compliance Check",
                description="Compare your internal policy against the matched regulation clause.",
            ),
            RecommendedAction(
                type="view_document",
                title="Open Regulation Document",
                description="Review the original legal source document in viewer.",
            ),
            RecommendedAction(
                type="view_graph",
                title="Explore Knowledge Graph",
                description="Inspect Neo4j 2-hop legal relationships and connected entities.",
            ),
        ]

    # 4. Derive related documents from extra_docs and retrieved context clauses
    seen_docs: set[str] = set()
    if extra_docs:
        for ed in extra_docs:
            d_title = ed.get("title") or "Document"
            d_id = ed.get("id") or str(uuid.uuid4())
            d_score = float(ed.get("score", 0.95))
            if d_title not in seen_docs:
                seen_docs.add(d_title)
                related_docs.append(
                    RelatedDocument(
                        id=str(d_id),
                        title=d_title,
                        similarity=round(d_score, 2),
                    )
                )

    for item in clauses:
        doc_title = getattr(item, "title", None) or "Legal Regulation"
        doc_id = getattr(item, "document_id", None) or str(uuid.uuid4())
        score = float(getattr(item, "score", 0.85))

        if doc_title not in seen_docs:
            seen_docs.add(doc_title)
            related_docs.append(
                RelatedDocument(
                    id=str(doc_id),
                    title=doc_title,
                    similarity=round(score, 2),
                )
            )

    return clean_text, filtered_follow_ups, actions, related_docs[:4]


def process_chat_request(
    db: Session,
    current_user: User,
    payload: ChatRequest,
    ws_ctx: WorkspaceContext | None = None,
) -> ChatResponse:
    """
    Process AI Legal Assistant chat request with persistent PostgreSQL memory & recommendations (batch mode).
    """
    # 1. Trusted Workspace Context and Membership Authorization
    target_org_id = payload.organization_id
    if ws_ctx:
        if target_org_id and target_org_id != ws_ctx.organization_id:
            verify_user_workspace_membership(db, current_user.id, target_org_id)
        else:
            target_org_id = ws_ctx.organization_id
    else:
        verify_user_workspace_membership(db, current_user.id, target_org_id)

    # 2. Get or create persistent conversation session in PostgreSQL
    session = get_or_create_session(
        db,
        user_id=current_user.id,
        organization_id=target_org_id,
        conversation_id=payload.conversation_id,
        first_question=payload.question,
    )
    conv_id_str = str(session.id)

    # 3. Load latest 10 messages for bounded history context
    recent_history = get_recent_history(db, conversation_id=session.id, limit=10)

    logger.info(
        "[CHAT_SERVICE] Request: user_id=%s org_id=%s conv_id=%s history_len=%d question=%r",
        current_user.id,
        target_org_id,
        conv_id_str,
        len(recent_history),
        payload.question,
    )

    # Log activity
    snippet = payload.question[:40] + "..." if len(payload.question) > 40 else payload.question
    log_activity(
        db,
        user_id=current_user.id,
        event_type="AI_CHAT_STARTED",
        title="AI Chat Session",
        description=f"Asked LexisGraph AI: '{snippet}'",
        icon_type="chat",
        extra_data={
            "organization_id": str(target_org_id),
            "conversation_id": conv_id_str,
        },
    )

    # 4. Entity context enrichment (PostgreSQL compliance reports, findings, policies, regulations)
    extra_context, extra_sources, extra_docs = _enrich_context_with_entities(
        db=db,
        organization_id=target_org_id,
        question=payload.question,
    )

    # 5. Hybrid context retrieval (Qdrant vector + Neo4j graph)
    semantic_query = _clean_query_for_semantic_retrieval(payload.question)
    context: RetrievalContext = retrieve_context(
        organization_id=target_org_id,
        question=semantic_query,
    )

    # 5.1 SERVER-SIDE AUTHORIZATION GATE: Validate candidate retrieved clauses
    authorized_clauses = validate_retrieval_candidates(
        db=db,
        organization_id=target_org_id,
        clauses=context.clauses,
    )
    context.clauses = authorized_clauses
    context.total_clauses = len(authorized_clauses)
    context.formatted_prompt_context = _format_context_for_llm(authorized_clauses)

    # 6. Check evidence sufficiency (allow either DB entity match or semantic clause match)
    top_score = max((c.score for c in context.clauses), default=0.0) if context.clauses else 0.0
    has_retrieved_clauses = context.total_clauses > 0 and top_score >= MIN_CONFIDENCE_THRESHOLD
    has_entity_evidence = bool(extra_context.strip())

    if not has_retrieved_clauses and not has_entity_evidence:
        logger.info(
            "[CHAT_SERVICE] Insufficient evidence (total_clauses=%d, top_score=%.4f, entity_evidence=%s) for question=%r",
            context.total_clauses,
            top_score,
            has_entity_evidence,
            payload.question,
        )
        answer = NO_EVIDENCE_MESSAGE
        save_message_pair(
            db,
            conversation_id=session.id,
            user_message=payload.question,
            assistant_message=answer,
            sources=None,
        )
        return ChatResponse(
            answer=answer,
            sources=[],
            follow_up_questions=[
                "Upload policy documents to query against?",
                "Select a specific compliance audit report to examine?",
                "Try searching for data protection or labour regulations?",
            ],
            recommended_actions=[],
            related_documents=[],
            conversation_id=conv_id_str,
        )

    # 7. Merge prompt contexts
    combined_context_parts = []
    if extra_context.strip():
        combined_context_parts.append(extra_context.strip())
    if context.formatted_prompt_context and context.formatted_prompt_context != "No question provided.":
        combined_context_parts.append(context.formatted_prompt_context.strip())

    full_prompt_context = "\n\n".join(combined_context_parts)

    # 8. Build prompt (system prompt + 10 history msgs + enriched context + question)
    prompt = _build_legal_assistant_prompt(
        question=payload.question,
        formatted_context=full_prompt_context,
        history=recent_history,
    )
    llm_answer = _resolve_reasoning(prompt)

    # Combine sources and pass through server-side citation authorization gate
    retrieved_sources = _format_source_citations(context.clauses)
    all_candidate_sources = extra_sources + retrieved_sources
    authorized_sources = authorize_citations(
        db=db,
        organization_id=target_org_id,
        citations=all_candidate_sources,
    )

    if not llm_answer or (NO_EVIDENCE_MESSAGE.lower() in llm_answer.lower() and not has_entity_evidence):
        logger.info("[CHAT_SERVICE] LLM response returned low confidence or empty.")
        answer = NO_EVIDENCE_MESSAGE
        sources = []
        sources_dict_list = None
        follow_ups = []
        actions = []
        related_docs = []
    else:
        clean_ans, follow_ups, actions, raw_related_docs = _extract_recommendations_and_clean_answer(
            llm_answer, context.clauses, recent_history, extra_docs
        )
        related_docs = filter_related_documents(
            db=db,
            organization_id=target_org_id,
            related_docs=raw_related_docs,
        )
        answer = clean_ans
        sources = authorized_sources
        sources_dict_list = [s.model_dump() for s in sources]

    metadata_dict = {
        "follow_up_questions": follow_ups,
        "recommended_actions": [a.model_dump() for a in actions],
        "related_documents": [r.model_dump() for r in related_docs],
    }

    # 7. Save user & assistant messages to PostgreSQL with metadata
    save_message_pair(
        db,
        conversation_id=session.id,
        user_message=payload.question,
        assistant_message=answer,
        sources=sources_dict_list,
        metadata=metadata_dict,
    )

    logger.info(
        "[CHAT_SERVICE] Completed: org_id=%s answer_len=%d citations=%d conv_id=%s",
        target_org_id,
        len(answer),
        len(sources),
        conv_id_str,
    )

    return ChatResponse(
        answer=answer,
        sources=sources,
        follow_up_questions=follow_ups,
        recommended_actions=actions,
        related_documents=related_docs,
        conversation_id=conv_id_str,
    )


async def stream_chat_request(
    request: Request,
    db: Session,
    current_user: User,
    payload: ChatRequest,
    ws_ctx: WorkspaceContext | None = None,
) -> AsyncGenerator[str, None]:
    """
    Real-time SSE token-by-token streaming chat generator with recommendations.

    Yields SSE events:
    - event: token -> data: {"text": "..."}
    - event: sources -> data: [...]
    - event: recommendations -> data: {"follow_up_questions": [...], "recommended_actions": [...], "related_documents": [...]}
    - event: done -> data: {"conversation_id": "..."}
    - event: error -> data: {"message": "..."}
    """
    start_time = time.perf_counter()

    # 1. Trusted Workspace Context and Membership Authorization
    target_org_id = payload.organization_id
    try:
        if ws_ctx:
            if target_org_id and target_org_id != ws_ctx.organization_id:
                verify_user_workspace_membership(db, current_user.id, target_org_id)
            else:
                target_org_id = ws_ctx.organization_id
        else:
            verify_user_workspace_membership(db, current_user.id, target_org_id)
    except Exception as exc:
        yield f"event: error\ndata: {json.dumps({'message': 'Organization not found or access denied'})}\n\n"
        return

    # 2. Get or create persistent conversation session in PostgreSQL
    session = get_or_create_session(
        db,
        user_id=current_user.id,
        organization_id=target_org_id,
        conversation_id=payload.conversation_id,
        first_question=payload.question,
    )
    conv_id_str = str(session.id)

    # 3. Load latest 10 messages for bounded history context
    recent_history = get_recent_history(db, conversation_id=session.id, limit=10)

    # 4. Entity context enrichment (PostgreSQL compliance reports, findings, policies, regulations)
    extra_context, extra_sources, extra_docs = _enrich_context_with_entities(
        db=db,
        organization_id=target_org_id,
        question=payload.question,
    )

    # 5. Hybrid context retrieval (Qdrant vector + Neo4j graph)
    semantic_query = _clean_query_for_semantic_retrieval(payload.question)
    context: RetrievalContext = retrieve_context(
        organization_id=target_org_id,
        question=semantic_query,
    )

    # 5.1 SERVER-SIDE AUTHORIZATION GATE: Validate candidate retrieved clauses
    authorized_clauses = validate_retrieval_candidates(
        db=db,
        organization_id=target_org_id,
        clauses=context.clauses,
    )
    context.clauses = authorized_clauses
    context.total_clauses = len(authorized_clauses)
    context.formatted_prompt_context = _format_context_for_llm(authorized_clauses)

    # Format sources list combining DB entity sources and semantic retrieved clauses
    retrieved_sources = _format_source_citations(context.clauses)
    all_candidate_sources = extra_sources + retrieved_sources
    authorized_sources = authorize_citations(
        db=db,
        organization_id=target_org_id,
        citations=all_candidate_sources,
    )
    sources_payload = [s.model_dump() for s in authorized_sources]

    # 6. Check evidence sufficiency (allow either DB entity match or semantic clause match)
    top_score = max((c.score for c in context.clauses), default=0.0) if context.clauses else 0.0
    has_retrieved_clauses = context.total_clauses > 0 and top_score >= MIN_CONFIDENCE_THRESHOLD
    has_entity_evidence = bool(extra_context.strip())

    if not has_retrieved_clauses and not has_entity_evidence:
        logger.info("[CHAT_STREAM] Low confidence or zero clauses found and no entity context.")
        save_message_pair(
            db,
            conversation_id=session.id,
            user_message=payload.question,
            assistant_message=NO_EVIDENCE_MESSAGE,
            sources=None,
        )
        yield f"event: token\ndata: {json.dumps({'text': NO_EVIDENCE_MESSAGE})}\n\n"
        yield f"event: sources\ndata: {json.dumps([])}\n\n"
        yield f"event: recommendations\ndata: {json.dumps({'follow_up_questions': ['Select a specific compliance audit report to examine?', 'Try searching for data protection or labour regulations?'], 'recommended_actions': [], 'related_documents': []})}\n\n"
        yield f"event: done\ndata: {json.dumps({'conversation_id': conv_id_str})}\n\n"
        return

    # 7. Merge prompt contexts
    combined_context_parts = []
    if extra_context.strip():
        combined_context_parts.append(extra_context.strip())
    if context.formatted_prompt_context and context.formatted_prompt_context != "No question provided.":
        combined_context_parts.append(context.formatted_prompt_context.strip())

    full_prompt_context = "\n\n".join(combined_context_parts)

    # 8. Build prompt and stream tokens
    prompt = _build_legal_assistant_prompt(
        question=payload.question,
        formatted_context=full_prompt_context,
        history=recent_history,
    )

    accumulated_tokens: list[str] = []
    client_disconnected = False

    try:
        for token_chunk in _stream_resolve_reasoning(prompt):
            if await request.is_disconnected():
                logger.info("[CHAT_STREAM] Client disconnected; canceling token generation.")
                client_disconnected = True
                break

            if token_chunk:
                accumulated_tokens.append(token_chunk)
                # Only stream text before --- RECOMMENDATIONS_JSON ---
                current_full = "".join(accumulated_tokens)
                if "--- RECOMMENDATIONS_JSON ---" not in current_full:
                    yield f"event: token\ndata: {json.dumps({'text': token_chunk})}\n\n"
                await asyncio.sleep(0.005)

    except Exception as exc:
        logger.exception("[CHAT_STREAM] Error during token streaming: %s", exc)
        yield f"event: error\ndata: {json.dumps({'message': str(exc)})}\n\n"
        return

    # If stream finished normally (not cancelled by disconnect)
    if not client_disconnected and accumulated_tokens:
        raw_full = "".join(accumulated_tokens).strip()

        clean_ans, follow_ups, actions, raw_related_docs = _extract_recommendations_and_clean_answer(
            raw_full, context.clauses, recent_history, extra_docs
        )
        related_docs = filter_related_documents(
            db=db,
            organization_id=target_org_id,
            related_docs=raw_related_docs,
        )

        if not clean_ans or (NO_EVIDENCE_MESSAGE.lower() in clean_ans.lower() and not has_entity_evidence):
            clean_ans = NO_EVIDENCE_MESSAGE
            sources_dict_list = None
            final_sources_payload = []
        else:
            sources_dict_list = [s.model_dump() for s in authorized_sources]
            final_sources_payload = sources_payload

        recommendations_payload = {
            "follow_up_questions": follow_ups,
            "recommended_actions": [a.model_dump() for a in actions],
            "related_documents": [r.model_dump() for r in related_docs],
        }

        # Save to PostgreSQL with metadata
        save_message_pair(
            db,
            conversation_id=session.id,
            user_message=payload.question,
            assistant_message=clean_ans,
            sources=sources_dict_list,
            metadata=recommendations_payload,
        )

        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(
            "[CHAT_STREAM] Stream completed successfully: conv_id=%s duration_ms=%.2f",
            conv_id_str,
            duration_ms,
        )

        yield f"event: sources\ndata: {json.dumps(final_sources_payload)}\n\n"
        yield f"event: recommendations\ndata: {json.dumps(recommendations_payload)}\n\n"
        yield f"event: done\ndata: {json.dumps({'conversation_id': conv_id_str})}\n\n"
