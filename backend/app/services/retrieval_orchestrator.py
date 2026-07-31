"""
Retrieval Orchestrator — Hybrid GraphRAG Context Retrieval.

Orchestrates multi-modal retrieval across Qdrant (vector embeddings) and
Neo4j (knowledge graph relationships) filtered by organization_id.

Maintains 100% backward compatibility while leveraging the production-ready
HybridRetriever engine under the hood.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Sequence

from app.services.hybrid_retriever import (
    HybridSearchResultItem,
    get_hybrid_retriever,
)

logger = logging.getLogger(__name__)

_DEFAULT_VECTOR_TOP_K = 20
_MIN_SIMILARITY_SCORE = 0.25


@dataclass
class RetrievedClause:
    """Structured clause metadata item in the unified context."""

    clause_id: str
    text: str
    score: float
    source: str  # "vector", "graph", or "hybrid"
    document_id: str | None = None
    title: str | None = None
    domain: str | None = None
    clause_type: str | None = None
    graph_neighbors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RetrievalContext:
    """Structured context ready for LLM consumption."""

    organization_id: str
    question: str
    total_clauses: int
    clauses: list[RetrievedClause]
    formatted_prompt_context: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "organization_id": self.organization_id,
            "question": self.question,
            "total_clauses": self.total_clauses,
            "clauses": [c.to_dict() for c in self.clauses],
            "formatted_prompt_context": self.formatted_prompt_context,
        }


def _format_context_for_llm(clauses: Sequence[RetrievedClause]) -> str:
    """Format structured clauses into a clean markdown prompt context block."""
    if not clauses:
        return "No relevant legal clauses found."

    lines: list[str] = ["### Relevant Legal Context & Graph Evidence:"]
    for idx, item in enumerate(clauses, start=1):
        doc_info = f" (Document: {item.title})" if item.title else ""
        lines.append(f"\n[{idx}] Clause {item.clause_id}{doc_info} [Relevance: {item.score:.2f}]:")
        lines.append(f'"{item.text.strip()}"')

        if item.graph_neighbors:
            lines.append("   Related Graph Knowledge:")
            for n_text in item.graph_neighbors:
                lines.append(f'   - "{n_text.strip()}"')

    return "\n".join(lines)


def retrieve_context(
    organization_id: uuid.UUID | str,
    question: str,
    *,
    top_k: int = _DEFAULT_VECTOR_TOP_K,
) -> RetrievalContext:
    """Orchestrate hybrid retrieval using HybridRetriever engine.

    Parameters
    ----------
    organization_id : uuid.UUID | str
        UUID of the organization scope.
    question : str
        User question/prompt string.
    top_k : int, optional
        Number of vector matches to retrieve (default: 20).

    Returns
    -------
    RetrievalContext
        Structured payload containing deduplicated, ranked clauses and formatted text.
    """
    org_id_str = str(organization_id)
    clean_question = question.strip()

    if not clean_question:
        return RetrievalContext(
            organization_id=org_id_str,
            question=clean_question,
            total_clauses=0,
            clauses=[],
            formatted_prompt_context="No question provided.",
        )

    logger.info(
        "[RETRIEVAL ORCHESTRATOR] Starting hybrid retrieval org_id=%s query=%r",
        org_id_str,
        clean_question,
    )

    retriever = get_hybrid_retriever()
    hybrid_result = retriever.retrieve_sync(
        query=clean_question,
        organization_id=org_id_str,
        top_k_vector=top_k,
        top_n_final=10,
    )

    clauses: list[RetrievedClause] = []
    for item in hybrid_result.items:
        # Determine source label based on scores
        if item.vector_score > 0 and item.graph_score > 0:
            source_label = "hybrid"
        elif item.graph_score > 0:
            source_label = "graph"
        else:
            source_label = "vector"

        shared_entities = item.relationship_metadata.get("shared_entities", [])
        retrieved_clause = RetrievedClause(
            clause_id=item.clause_id,
            text=item.clause_text,
            score=item.final_score,
            source=source_label,
            document_id=item.document_id,
            title=item.document_name,
            graph_neighbors=shared_entities,
        )
        clauses.append(retrieved_clause)

    formatted_context = _format_context_for_llm(clauses)

    logger.info(
        "[RETRIEVAL ORCHESTRATOR] Hybrid retrieval complete: org_id=%s total_clauses=%d",
        org_id_str,
        len(clauses),
    )

    return RetrievalContext(
        organization_id=org_id_str,
        question=clean_question,
        total_clauses=len(clauses),
        clauses=clauses,
        formatted_prompt_context=formatted_context,
    )
