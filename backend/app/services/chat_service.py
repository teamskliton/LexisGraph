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

from app.db.models import ConversationMessage, Organization, User
from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    RecommendedAction,
    RelatedDocument,
    SourceCitation,
)
from app.services.activity_service import log_activity
from app.services.llm_reasoning import _resolve_reasoning, _stream_resolve_reasoning
from app.services.memory_service import (
    get_or_create_session,
    get_recent_history,
    save_message_pair,
)
from app.services.retrieval_orchestrator import RetrievalContext, retrieve_context

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


def _build_legal_assistant_prompt(
    question: str,
    formatted_context: str,
    history: Sequence[ConversationMessage] | None = None,
) -> str:
    """Construct prompt for Gemini LLM using system prompt, history, hybrid context, and query."""
    history_block = _format_history_block(history or [])

    return (
        "You are LexisGraph AI Legal Assistant. Answer the user's question accurately and objectively "
        "based strictly on the provided legal context, clause IDs, document titles, graph relationships, "
        "and conversation history.\n\n"
        "RULES:\n"
        "1. Do NOT hallucinate or guess facts not supported by the context.\n"
        "2. If the context does not contain sufficient evidence to answer the question, your entire response "
        f"MUST be exactly: \"{NO_EVIDENCE_MESSAGE}\"\n"
        "3. Cite specific document titles or clause numbers when referencing evidence.\n"
        "4. Provide your final legal answer directly without including internal reasoning drafts or scratchpad notes.\n"
        "5. AT THE VERY END OF YOUR RESPONSE, output a JSON recommendations block starting exactly with '--- RECOMMENDATIONS_JSON ---' containing 3 short follow-up questions and recommended actions.\n\n"
        f"--- CONVERSATION HISTORY (LAST 10 MESSAGES) START ---\n"
        f"{history_block}\n"
        f"--- CONVERSATION HISTORY END ---\n\n"
        f"--- RETRIEVED LEGAL CONTEXT START ---\n"
        f"{formatted_context}\n"
        f"--- RETRIEVED LEGAL CONTEXT END ---\n\n"
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
            doc_id = item.get("document_id") or str(uuid.uuid4())
            section = item.get("section") or item.get("title") or item.get("document_name") or "Section"
            page = int(item.get("page_number") or item.get("page") or 1)
            score = float(item.get("final_score") or item.get("score") or item.get("vector_score") or 0.9)
            doc_type = item.get("document_type") or item.get("type") or "Regulation"
            raw_source = str(item.get("source") or "vector").lower()
        else:
            doc_title = getattr(item, "document_name", None) or getattr(item, "title", None) or getattr(item, "document", None) or "Legal Document"
            clause_snippet = str(getattr(item, "clause_text", None) or getattr(item, "text", None) or getattr(item, "clause", None) or "").strip()
            clause_id = getattr(item, "clause_id", None) or str(uuid.uuid4())
            doc_id = getattr(item, "document_id", None) or str(uuid.uuid4())
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
        "What penalties apply for non-compliance?",
        "Compare this requirement with our company policy.",
        "What clauses discuss overtime and working hours?",
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

    # 4. Derive related documents from retrieved context clauses
    seen_docs: set[str] = set()
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
) -> ChatResponse:
    """
    Process AI Legal Assistant chat request with persistent PostgreSQL memory & recommendations (batch mode).
    """
    # 1. Organization access verification
    from app.routes.reports import verify_user_organization_access
    if not verify_user_organization_access(db, current_user.id, payload.organization_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found or access denied",
        )

    # 2. Get or create persistent conversation session in PostgreSQL
    session = get_or_create_session(
        db,
        user_id=current_user.id,
        organization_id=payload.organization_id,
        conversation_id=payload.conversation_id,
        first_question=payload.question,
    )
    conv_id_str = str(session.id)

    # 3. Load latest 10 messages for bounded history context
    recent_history = get_recent_history(db, conversation_id=session.id, limit=10)

    logger.info(
        "[CHAT_SERVICE] Request: user_id=%s org_id=%s conv_id=%s history_len=%d question=%r",
        current_user.id,
        payload.organization_id,
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
            "organization_id": str(payload.organization_id),
            "conversation_id": conv_id_str,
        },
    )

    # 4. Hybrid context retrieval (Qdrant vector + Neo4j graph)
    context: RetrievalContext = retrieve_context(
        organization_id=payload.organization_id,
        question=payload.question,
    )

    # 5. Check for low confidence / zero clauses evidence
    if context.total_clauses == 0:
        logger.info("[CHAT_SERVICE] Zero clauses retrieved for question=%r", payload.question)
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
                "Upload company wage or compliance policies?",
                "Try searching for general Labour regulations?",
            ],
            recommended_actions=[],
            related_documents=[],
            conversation_id=conv_id_str,
        )

    top_score = max((c.score for c in context.clauses), default=0.0)
    if top_score < MIN_CONFIDENCE_THRESHOLD:
        logger.info(
            "[CHAT_SERVICE] Low retrieval score (top_score=%.4f < %.2f) for question=%r",
            top_score,
            MIN_CONFIDENCE_THRESHOLD,
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
                "Try asking about Code of Wages or POSH Act?",
            ],
            recommended_actions=[],
            related_documents=[],
            conversation_id=conv_id_str,
        )

    # 6. Build prompt (system prompt + 10 history msgs + hybrid context + question)
    prompt = _build_legal_assistant_prompt(
        question=payload.question,
        formatted_context=context.formatted_prompt_context,
        history=recent_history,
    )
    llm_answer = _resolve_reasoning(prompt)

    if not llm_answer or NO_EVIDENCE_MESSAGE.lower() in llm_answer.lower():
        logger.info("[CHAT_SERVICE] LLM response returned low confidence or empty.")
        answer = NO_EVIDENCE_MESSAGE
        sources = []
        sources_dict_list = None
        follow_ups = []
        actions = []
        related_docs = []
    else:
        clean_ans, follow_ups, actions, related_docs = _extract_recommendations_and_clean_answer(
            llm_answer, context.clauses, recent_history
        )
        answer = clean_ans
        sources = _format_source_citations(context.clauses)
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
        payload.organization_id,
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

    # 1. Organization access verification
    from app.routes.reports import verify_user_organization_access
    if not verify_user_organization_access(db, current_user.id, payload.organization_id):
        yield f"event: error\ndata: {json.dumps({'message': 'Organization not found or access denied'})}\n\n"
        return

    # 2. Get or create persistent conversation session in PostgreSQL
    session = get_or_create_session(
        db,
        user_id=current_user.id,
        organization_id=payload.organization_id,
        conversation_id=payload.conversation_id,
        first_question=payload.question,
    )
    conv_id_str = str(session.id)

    # 3. Load latest 10 messages for bounded history context
    recent_history = get_recent_history(db, conversation_id=session.id, limit=10)

    # 4. Hybrid context retrieval (Qdrant vector + Neo4j graph)
    context: RetrievalContext = retrieve_context(
        organization_id=payload.organization_id,
        question=payload.question,
    )

    # Format sources list
    sources = _format_source_citations(context.clauses)
    sources_payload = [s.model_dump() for s in sources]

    # 5. Check low confidence / zero clauses evidence
    top_score = max((c.score for c in context.clauses), default=0.0) if context.clauses else 0.0
    if context.total_clauses == 0 or top_score < MIN_CONFIDENCE_THRESHOLD:
        logger.info("[CHAT_STREAM] Low confidence or zero clauses found.")
        save_message_pair(
            db,
            conversation_id=session.id,
            user_message=payload.question,
            assistant_message=NO_EVIDENCE_MESSAGE,
            sources=None,
        )
        yield f"event: token\ndata: {json.dumps({'text': NO_EVIDENCE_MESSAGE})}\n\n"
        yield f"event: sources\ndata: {json.dumps([])}\n\n"
        yield f"event: recommendations\ndata: {json.dumps({'follow_up_questions': ['Try searching for general Labour regulations?'], 'recommended_actions': [], 'related_documents': []})}\n\n"
        yield f"event: done\ndata: {json.dumps({'conversation_id': conv_id_str})}\n\n"
        return

    # 6. Build prompt and stream tokens
    prompt = _build_legal_assistant_prompt(
        question=payload.question,
        formatted_context=context.formatted_prompt_context,
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

        clean_ans, follow_ups, actions, related_docs = _extract_recommendations_and_clean_answer(
            raw_full, context.clauses, recent_history
        )

        if not clean_ans or NO_EVIDENCE_MESSAGE.lower() in clean_ans.lower():
            clean_ans = NO_EVIDENCE_MESSAGE
            sources_dict_list = None
            final_sources_payload = []
        else:
            sources_dict_list = [s.model_dump() for s in sources]
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

        recommendations_payload = {
            "follow_up_questions": follow_ups,
            "recommended_actions": [a.model_dump() for a in actions],
            "related_documents": [r.model_dump() for r in related_docs],
        }

        yield f"event: sources\ndata: {json.dumps(final_sources_payload)}\n\n"
        yield f"event: recommendations\ndata: {json.dumps(recommendations_payload)}\n\n"
        yield f"event: done\ndata: {json.dumps({'conversation_id': conv_id_str})}\n\n"
