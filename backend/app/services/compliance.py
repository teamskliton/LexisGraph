import logging

from sklearn.metrics.pairwise import cosine_similarity

from app.db.neo4j import run_query
from app.services.graph_builder import generate_clause_id
from app.services.llm_reasoning import generate_compliance_reasoning
from app.services.retrieval import _collect_clauses

logger = logging.getLogger(__name__)

_SIMILARITY_THRESHOLD = 0.65
_PARTIAL_THRESHOLD = 0.45
_VECTOR_WEIGHT = 0.8
_GRAPH_WEIGHT = 0.2


def _collect_user_clauses() -> list[dict]:
    return _collect_clauses(("user_documents",))


def _collect_reference_clauses() -> list[dict]:
    return _collect_clauses(("external_documents", "domain_documents"))


def _best_graph_neighbor_score(clause_text: str) -> float:
    """Check if the clause has structural graph context (parent document, neighbors).

    Returns 1.0 if the clause has structural context in the graph, 0.0 otherwise.
    Neo4j is NEVER used for semantic similarity (no SIMILAR_TO).
    """
    clause_id = generate_clause_id(clause_text)
    query = """
    MATCH (d:Document)-[:HAS_CLAUSE]->(c:Clause {id: $id})
    RETURN count(d) AS doc_count
    LIMIT 1
    """
    try:
        rows = run_query(query, {"id": clause_id})
    except Exception:  # noqa: BLE001
        logger.warning("Skipping graph context check for clause_id=%s due to Neo4j query failure", clause_id)
        return 0.0

    if not rows:
        return 0.0

    doc_count = rows[0].get("doc_count", 0)
    return 1.0 if doc_count > 0 else 0.0


def detect_compliance_gaps() -> list[dict]:
    """Detect policy compliance using direct embedding similarity, graph context, and optional LLM reasoning."""
    user_clauses = _collect_user_clauses()
    reference_clauses = _collect_reference_clauses()

    if not user_clauses:
        logger.info("[COMPLIANCE] Gap detection complete clauses=0")
        return []

    if not reference_clauses:
        results = []
        for item in user_clauses:
            reasoning = generate_compliance_reasoning(
                policy_clause=item["text"],
                matched_clause=None,
                status="gap",
                vector_score=0.0,
                graph_score=0.0,
            )
            results.append(
                {
                    "policy_clause": item["text"],
                    "status": "gap",
                    "confidence": 0.0,
                    "matched_clause": None,
                    "vector_score": 0.0,
                    "graph_score": 0.0,
                    "reasoning_summary": reasoning,
                }
            )
        logger.info("[COMPLIANCE] Gap detection complete (no reference clauses) clauses=%s", len(results))
        return results

    results_by_clause: list[dict] = []
    reference_by_dim: dict[int, list[dict]] = {}
    for reference_clause in reference_clauses:
        dimension = len(reference_clause["embedding"])
        reference_by_dim.setdefault(dimension, []).append(reference_clause)

    for user_clause in user_clauses:
        user_text = user_clause["text"]
        user_embedding = user_clause["embedding"]
        candidate_references = reference_by_dim.get(len(user_embedding), [])

        best_score = 0.0
        best_match = None

        for reference_clause in candidate_references:
            reference_embedding = reference_clause["embedding"]
            score = float(cosine_similarity([user_embedding], [reference_embedding])[0][0])

            if score > best_score:
                best_score = score
                best_match = reference_clause["text"]

        graph_score = _best_graph_neighbor_score(user_text)
        combined_score = (_VECTOR_WEIGHT * best_score) + (_GRAPH_WEIGHT * graph_score)

        if combined_score >= _SIMILARITY_THRESHOLD:
            status = "compliant"
        elif combined_score >= _PARTIAL_THRESHOLD:
            status = "partial"
        else:
            status = "gap"

        vector_score = round(best_score, 4)
        graph_score = round(graph_score, 4)
        confidence = round(combined_score, 4)

        reasoning_summary = generate_compliance_reasoning(
            policy_clause=user_text,
            matched_clause=best_match,
            status=status,
            vector_score=vector_score,
            graph_score=graph_score,
        )

        results_by_clause.append(
            {
                "policy_clause": user_text,
                "status": status,
                "confidence": confidence,
                "matched_clause": best_match,
                "vector_score": vector_score,
                "graph_score": graph_score,
                "reasoning_summary": reasoning_summary,
            }
        )

    logger.info("[COMPLIANCE] Gap detection complete clauses=%s", len(results_by_clause))
    return results_by_clause
