from app.db.mongo import get_database
from app.db.neo4j import run_query


def detect_compliance_gaps() -> list[dict]:
    """Detect policy compliance via semantic similarity against regulation clauses."""
    database = get_database()
    results_by_clause: list[dict] = []
    similarity_threshold = 0.7

    user_clauses: list[str] = []
    for doc in database["user_documents"].find({}, {"clauses.text": 1}):
        for clause in doc.get("clauses", []):
            clause_text = (clause.get("text") or "").strip()
            if clause_text:
                user_clauses.append(clause_text)

    external_clause_texts: set[str] = set()
    for doc in database["external_documents"].find({}, {"clauses.text": 1}):
        for clause in doc.get("clauses", []):
            clause_text = (clause.get("text") or "").strip()
            if clause_text:
                external_clause_texts.add(clause_text)

    query = """
    MATCH (c:Clause {text: $text})-[r:SIMILAR_TO]->(n)
    RETURN n.text AS text, r.score AS score
    """

    for clause_text in user_clauses:
        semantic_matches = run_query(query, {"text": clause_text})

        found = False
        best_external_score = 0.0

        for item in semantic_matches:
            related_text = (item.get("text") or "").strip()
            score = item.get("score")
            score_value = float(score) if isinstance(score, (int, float)) else 0.0

            if related_text and related_text in external_clause_texts:
                if score_value > best_external_score:
                    best_external_score = score_value
                if score_value > similarity_threshold:
                    found = True

        results_by_clause.append(
            {
                "policy_clause": clause_text,
                "status": "compliant" if found else "gap",
                "confidence": round(best_external_score, 4),
            }
        )

    return results_by_clause
