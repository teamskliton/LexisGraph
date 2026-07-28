"""
Retrieval Orchestrator — Hybrid GraphRAG Context Retrieval.

Orchestrates multi-modal retrieval across Qdrant (vector embeddings) and
Neo4j (knowledge graph relationships) filtered by organization_id.

Responsibilities:
1. Accept organization_id and user question.
2. Retrieve relevant document chunks/clauses from Qdrant vector store.
3. Retrieve connected graph nodes/neighbors from Neo4j graph database.
4. Merge both contexts.
5. Deduplicate overlapping or identical clauses.
6. Rank combined results by relevance score.
7. Return structured, LLM-ready context payload.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Sequence

from qdrant_client.http.models import FieldCondition, Filter, MatchValue

from app.db.neo4j import run_query
from app.db.qdrant import get_client
from app.services.embedding_model import get_embedding_model
from app.services.vector_store import COLLECTION_USER

logger = logging.getLogger(__name__)

_DEFAULT_VECTOR_TOP_K = 5
_DEFAULT_GRAPH_NEIGHBOR_LIMIT = 3
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


# ---------------------------------------------------------------------------
# Retrieval Steps
# ---------------------------------------------------------------------------

def _retrieve_from_qdrant(
    query_vector: list[float],
    *,
    organization_id: str | None = None,
    top_k: int = _DEFAULT_VECTOR_TOP_K,
) -> list[dict[str, Any]]:
    """Retrieve vector similarity hits from Qdrant."""
    client = get_client()

    query_filter: Filter | None = None
    if organization_id:
        query_filter = Filter(
            must=[
                FieldCondition(
                    key="organization_id",
                    match=MatchValue(value=str(organization_id)),
                )
            ]
        )

    try:
        response = client.query_points(
            collection_name=COLLECTION_USER,
            query=query_vector,
            query_filter=query_filter,
            limit=top_k,
        )
        results = response.points
    except Exception as exc:
        logger.warning(
            "Qdrant query_points with organization_id filter failed or collection empty: %s. Falling back to unfiltered search.",
            exc,
        )
        try:
            response = client.query_points(
                collection_name=COLLECTION_USER,
                query=query_vector,
                limit=top_k,
            )
            results = response.points
        except Exception:
            logger.exception("Qdrant vector search failed completely.")
            return []

    hits: list[dict[str, Any]] = []
    for hit in results:
        payload = hit.payload or {}
        hits.append(
            {
                "clause_id": payload.get("clause_id", str(hit.id)),
                "text": payload.get("text", ""),
                "score": float(hit.score),
                "document_id": payload.get("document_id"),
                "title": payload.get("title"),
                "domain": payload.get("domain"),
                "type": payload.get("type"),
            }
        )
    return hits


def _retrieve_graph_neighbors(clause_ids: Sequence[str]) -> dict[str, list[dict[str, Any]]]:
    """Retrieve graph-connected neighbor clauses and parent Document nodes from Neo4j.

    Uses ONLY structural relationships (HAS_CLAUSE, BELONGS_TO).
    Neo4j is NEVER used for semantic similarity (no SIMILAR_TO).
    """
    if not clause_ids:
        return {}

    query = """
    UNWIND $clause_ids AS cid
    MATCH (c:Clause {id: cid})
    OPTIONAL MATCH (d:Document)-[:HAS_CLAUSE]->(c)
    OPTIONAL MATCH (d)-[:HAS_CLAUSE]->(n:Clause)
    WHERE n.id <> cid
    RETURN 
        c.id AS seed_id,
        d.id AS doc_id,
        d.title AS doc_title,
        collect(DISTINCT {
            id: n.id,
            text: n.text,
            type: n.type
        })[0..5] AS neighbors
    """
    records = run_query(query, {"clause_ids": list(clause_ids)})
    
    mapping: dict[str, list[dict[str, Any]]] = {}
    for rec in records:
        seed_id = rec.get("seed_id")
        if not seed_id:
            continue
        neighbors = [
            nb for nb in (rec.get("neighbors") or [])
            if nb.get("id") and nb.get("text")
        ]
        mapping[seed_id] = neighbors

    return mapping


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


# ---------------------------------------------------------------------------
# Orchestrator Public API
# ---------------------------------------------------------------------------

def retrieve_context(
    organization_id: uuid.UUID | str,
    question: str,
    *,
    top_k: int = _DEFAULT_VECTOR_TOP_K,
) -> RetrievalContext:
    """Orchestrate hybrid retrieval across Qdrant vector store and Neo4j knowledge graph.

    Parameters
    ----------
    organization_id : uuid.UUID | str
        UUID of the organization scope.
    question : str
        User question/prompt string.
    top_k : int, optional
        Number of vector matches to retrieve (default: 5).

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
        "[RETRIEVAL ORCHESTRATOR] Starting retrieval org_id=%s query=%r",
        org_id_str,
        clean_question,
    )

    # 1. Embed query
    model = get_embedding_model()
    query_vector = model.encode(clean_question).tolist()

    # 2. Retrieve vector hits from Qdrant
    qdrant_hits = _retrieve_from_qdrant(
        query_vector,
        organization_id=org_id_str,
        top_k=top_k,
    )

    if not qdrant_hits:
        logger.info("[RETRIEVAL ORCHESTRATOR] No vector hits found in Qdrant.")
        return RetrievalContext(
            organization_id=org_id_str,
            question=clean_question,
            total_clauses=0,
            clauses=[],
            formatted_prompt_context="No relevant legal context found.",
        )

    # 3. Retrieve connected graph nodes from Neo4j for vector hit clause IDs
    clause_ids = [h["clause_id"] for h in qdrant_hits if h.get("clause_id")]
    graph_neighbors_map = _retrieve_graph_neighbors(clause_ids)

    # 4 & 5. Merge context & Deduplicate
    merged_map: dict[str, RetrievedClause] = {}

    for hit in qdrant_hits:
        cid = hit["clause_id"]
        neighbors = graph_neighbors_map.get(cid, [])
        neighbor_texts = [nb["text"] for nb in neighbors if nb.get("text")]

        clause_item = RetrievedClause(
            clause_id=cid,
            text=hit["text"],
            score=hit["score"],
            source="vector",
            document_id=hit.get("document_id"),
            title=hit.get("title"),
            domain=hit.get("domain"),
            clause_type=hit.get("type"),
            graph_neighbors=neighbor_texts,
        )
        merged_map[cid] = clause_item

    # Add graph neighbors as distinct clauses if high similarity score
    for cid, neighbors in graph_neighbors_map.items():
        parent_score = merged_map[cid].score if cid in merged_map else 0.5
        for nb in neighbors:
            nb_id = nb.get("id")
            nb_text = nb.get("text")
            nb_score = float(nb.get("score") or (parent_score * 0.85))
            
            if nb_id and nb_text and nb_id not in merged_map:
                merged_map[nb_id] = RetrievedClause(
                    clause_id=nb_id,
                    text=nb_text,
                    score=nb_score,
                    source="graph",
                    clause_type=nb.get("type"),
                )
            elif nb_id and nb_id in merged_map:
                merged_map[nb_id].source = "hybrid"

    # 6. Rank results by relevance score (descending)
    ranked_clauses = sorted(
        merged_map.values(),
        key=lambda item: item.score,
        reverse=True,
    )

    # Filter out low-relevance noise
    ranked_clauses = [c for c in ranked_clauses if c.score >= _MIN_SIMILARITY_SCORE]

    # 7. Build final structured context
    formatted_context = _format_context_for_llm(ranked_clauses)

    logger.info(
        "[RETRIEVAL ORCHESTRATOR] Retrieval complete: org_id=%s total_clauses=%s",
        org_id_str,
        len(ranked_clauses),
    )

    return RetrievalContext(
        organization_id=org_id_str,
        question=clean_question,
        total_clauses=len(ranked_clauses),
        clauses=ranked_clauses,
        formatted_prompt_context=formatted_context,
    )
