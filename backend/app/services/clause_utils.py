import hashlib
from collections import Counter

from app.db.mongo import get_database


def generate_clause_id(text: str) -> str:
    """Generate stable clause id from clause text."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def is_valid_embedding(embedding: object) -> bool:
    return (
        isinstance(embedding, list)
        and bool(embedding)
        and all(isinstance(value, (int, float)) for value in embedding)
    )


def collect_unique_clauses(
    collection_names: tuple[str, ...],
    limit: int | None = None,
) -> list[dict]:
    """Collect unique clauses with numeric embeddings across MongoDB collections."""
    database = get_database()
    clauses_by_id: dict[str, dict] = {}

    for collection_name in collection_names:
        collection = database[collection_name]
        for doc in collection.find({}, {"clauses": 1}):
            clauses = doc.get("clauses", []) or []
            for clause in clauses:
                text = (clause.get("text") or "").strip()
                embedding = clause.get("embedding")
                if not text or not is_valid_embedding(embedding):
                    continue

                clause_id = generate_clause_id(text)
                if clause_id in clauses_by_id:
                    continue

                clauses_by_id[clause_id] = {
                    "clause_id": clause_id,
                    "text": text,
                    "embedding": embedding,
                }

                if limit is not None and len(clauses_by_id) >= limit:
                    return list(clauses_by_id.values())

    return list(clauses_by_id.values())


def filter_common_dimension_clauses(clauses: list[dict]) -> list[dict]:
    """Keep clauses from the dominant embedding dimension only."""
    if not clauses:
        return []

    dimension_counts = Counter(len(clause["embedding"]) for clause in clauses)
    target_dimension, _ = dimension_counts.most_common(1)[0]
    return [clause for clause in clauses if len(clause["embedding"]) == target_dimension]
