"""
Chat API Router — RAG Question Answering.

POST /chat
    Accepts organization_id and question, checks user organization ownership,
    retrieves hybrid legal context via Retrieval Orchestrator (Qdrant + Neo4j),
    generates an answer via LLM (Gemini / OpenRouter), and returns structured
    answer + citations.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.core.schemas import ChatRequest, ChatResponse, SourceCitation
from app.db.models import Organization, User
from app.services.llm_reasoning import _resolve_reasoning
from app.services.retrieval_orchestrator import retrieve_context

router = APIRouter(prefix="", tags=["Chat"])
logger = logging.getLogger(__name__)


def _build_chat_prompt(question: str, formatted_context: str) -> str:
    """Construct prompt for the LLM using retrieved legal context."""
    return (
        "You are LexisGraph AI Legal Assistant. Answer the user's question accurately based "
        "on the provided legal context and evidence. Cite specific provisions or documents "
        "when relevant. If the context does not contain sufficient information to answer "
        "completely, state clearly what is supported by the context.\n\n"
        f"--- CONTEXT START ---\n"
        f"{formatted_context}\n"
        f"--- CONTEXT END ---\n\n"
        f"User Question: {question}\n\n"
        "Detailed Legal Answer:"
    )


@router.post(
    "/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit a question for RAG-based legal answer with citations",
)
def chat_endpoint(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatResponse:
    """
    RAG-powered Chat endpoint.

    - **organization_id**: UUID of the organization (must be owned by authenticated user)
    - **question**: Question or query text

    Flow:
    1. Authenticate user via JWT.
    2. Verify user owns the requested organization.
    3. Call Retrieval Orchestrator to fetch Qdrant vector chunks + Neo4j graph nodes.
    4. Pass formatted prompt context to LLM (Gemini / OpenRouter service).
    5. Extract structured citations from retrieved clauses.
    6. Return answer and sources array.
    """
    # 1 & 2. Verify organization access
    org = db.get(Organization, payload.organization_id)
    if org is None or org.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found or access denied",
        )

    logger.info(
        "[CHAT] Request received: user_id=%s org_id=%s question=%r",
        current_user.id,
        payload.organization_id,
        payload.question,
    )

    # 3. Retrieve hybrid context
    context = retrieve_context(
        organization_id=payload.organization_id,
        question=payload.question,
    )

    # 4. Generate answer via LLM service
    prompt = _build_chat_prompt(payload.question, context.formatted_prompt_context)
    llm_answer = _resolve_reasoning(prompt)

    if not llm_answer:
        if context.total_clauses > 0:
            llm_answer = (
                "Based on your organization's legal documents, relevant clauses were found "
                "supporting your query (see citations below). However, automated LLM synthesis "
                "is currently offline."
            )
        else:
            llm_answer = (
                "No relevant document clauses were found in your organization's repository "
                "to answer this question."
            )

    # 5. Build citations list
    sources: list[SourceCitation] = []
    seen_sources: set[tuple[str, str]] = set()

    for clause_item in context.clauses:
        doc_title = clause_item.title or "Document"
        clause_snippet = clause_item.text.strip()
        
        # Determine human-friendly search source label
        raw_source = clause_item.source.lower()
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
                    document=doc_title,
                    clause=clause_snippet,
                    clause_number=clause_item.clause_id,
                    confidence_score=round(clause_item.score, 4),
                    search_source=search_source,
                )
            )

    logger.info(
        "[CHAT] Completed: org_id=%s answer_len=%s citations=%s",
        payload.organization_id,
        len(llm_answer),
        len(sources),
    )

    return ChatResponse(
        answer=llm_answer,
        sources=sources,
    )
