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
    clause_id = generate_clause_id(clause_text)
    query = """
    MATCH (c:Clause {id: $id})-[r:SIMILAR_TO]->(n:Clause)
    RETURN r.score AS score
    ORDER BY r.score DESC
    LIMIT 1
    """
    try:
        rows = run_query(query, {"id": clause_id})
    except Exception:  # noqa: BLE001
        logger.warning("Skipping graph similarity for clause_id=%s due to Neo4j query failure", clause_id)
        return 0.0

    if not rows:
        return 0.0

    score = rows[0].get("score")
    return float(score) if isinstance(score, (int, float)) else 0.0


def detect_compliance_gaps() -> list[dict]:
    """Detect policy compliance using direct embedding similarity, graph context, and LLM legal reasoning."""
    user_clauses = _collect_user_clauses()
    external_clauses = _collect_reference_clauses()

    if not user_clauses:
        logger.info("[COMPLIANCE] Gap detection complete clauses=0")
        return []

    if not external_clauses:
        results = [
            {
                "policy_clause": item["text"],
                "status": "gap",
                "confidence": 0.0,
                "matched_clause": None,
                "vector_score": 0.0,
                "graph_score": 0.0,
                "reasoning_summary": generate_compliance_reasoning(
                    policy_clause=item["text"],
                    matched_clause=None,
                    status="gap",
                    vector_score=0.0,
                    graph_score=0.0,
                ),
            }
            for item in user_clauses
        ]
        logger.info("[COMPLIANCE] Gap detection complete (no external clauses) clauses=%s", len(results))
        return results

    results_by_clause: list[dict] = []
    external_by_dim: dict[int, list[dict]] = {}
    for external_clause in external_clauses:
        dimension = len(external_clause["embedding"])
        external_by_dim.setdefault(dimension, []).append(external_clause)

    for user_clause in user_clauses:
        user_text = user_clause["text"]
        user_embedding = user_clause["embedding"]
        candidate_externals = external_by_dim.get(len(user_embedding), [])

        best_score = 0.0
        best_match = None

        for external_clause in candidate_externals:
            external_embedding = external_clause["embedding"]
            score = float(cosine_similarity([user_embedding], [external_embedding])[0][0])

            if score > best_score:
                best_score = score
                best_match = external_clause["text"]

        graph_score = _best_graph_neighbor_score(user_text)
        combined_score = (_VECTOR_WEIGHT * best_score) + (_GRAPH_WEIGHT * graph_score)

        if combined_score >= _SIMILARITY_THRESHOLD:
            status = "compliant"
        elif combined_score >= _PARTIAL_THRESHOLD:
            status = "partial"
        else:
            status = "gap"

        v_score = round(best_score, 4)
        g_score = round(graph_score, 4)

        reasoning = generate_compliance_reasoning(
            policy_clause=user_text,
            matched_clause=best_match,
            status=status,
            vector_score=v_score,
            graph_score=g_score,
        )

        results_by_clause.append(
            {
                "policy_clause": user_text,
                "status": status,
                "confidence": round(combined_score, 4),
                "matched_clause": best_match,
                "vector_score": v_score,
                "graph_score": g_score,
                "reasoning_summary": reasoning,
            }
        )

    logger.info("[COMPLIANCE] Gap detection complete clauses=%s", len(results_by_clause))
    return results_by_clause
