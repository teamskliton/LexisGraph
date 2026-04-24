import logging
from threading import Lock

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from app.db.neo4j import run_query
from app.services.clause_utils import (
    collect_unique_clauses,
    filter_common_dimension_clauses,
)

logger = logging.getLogger(__name__)

_EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
_MODEL: SentenceTransformer | None = None
_MODEL_LOCK = Lock()
_COLLECTIONS = ("user_documents", "external_documents")


def _get_model() -> SentenceTransformer:
    global _MODEL
    if _MODEL is None:
        with _MODEL_LOCK:
            if _MODEL is None:
                logger.info("Loading retrieval model: %s", _EMBEDDING_MODEL_NAME)
                _MODEL = SentenceTransformer(_EMBEDDING_MODEL_NAME)
    return _MODEL


def is_model_loaded() -> bool:
    """Return whether retrieval embedding model is currently loaded in memory."""
    return _MODEL is not None


def preload_model() -> None:
    """Load retrieval embedding model eagerly for startup diagnostics."""
    _get_model()


def _collect_clauses() -> list[dict]:
    """Collect unique clause texts and embeddings from MongoDB."""
    return collect_unique_clauses(_COLLECTIONS)


def _filter_common_dimension_clauses(clauses: list[dict]) -> list[dict]:
    """Keep clauses from the dominant embedding dimension only."""
    return filter_common_dimension_clauses(clauses)


def retrieve_relevant_clauses(query: str) -> list[dict]:
    """Retrieve top relevant clauses via embeddings and expand with graph neighbors."""
    if not query or not query.strip():
        return []

    model = _get_model()
    query_embedding = model.encode(query)

    clauses = _collect_clauses()
    clauses = _filter_common_dimension_clauses(clauses)
    if not clauses:
        return []

    embeddings = np.asarray([clause["embedding"] for clause in clauses], dtype=float)
    query_vector = np.asarray(query_embedding, dtype=float).reshape(1, -1)

    if query_vector.shape[1] != embeddings.shape[1]:
        logger.error(
            "Embedding dimension mismatch for retrieval query=%s query_dim=%s clause_dim=%s",
            query,
            query_vector.shape[1],
            embeddings.shape[1],
        )
        raise ValueError("Embedding dimension mismatch between query and stored clause vectors")

    similarity_scores = cosine_similarity(query_vector, embeddings)[0]
    top_indices = np.argsort(similarity_scores)[::-1][:3]

    top_clauses = []
    top_clause_ids: list[str] = []
    for index in top_indices:
        clause = clauses[index]
        top_clauses.append((clause, float(similarity_scores[index])))
        top_clause_ids.append(clause["clause_id"])

    neighbor_rows = run_query(
        """
        UNWIND $ids AS clause_id
        MATCH (c:Clause {id: clause_id})-[r:SIMILAR_TO]->(n:Clause)
        RETURN clause_id, n.text AS text, r.score AS score
        ORDER BY clause_id, score DESC
        """,
        {"ids": top_clause_ids},
    )

    neighbors_by_clause: dict[str, list[str]] = {clause_id: [] for clause_id in top_clause_ids}
    for row in neighbor_rows:
        clause_id = row.get("clause_id")
        text = row.get("text")
        if not isinstance(clause_id, str) or not isinstance(text, str) or not text.strip():
            continue
        bucket = neighbors_by_clause.setdefault(clause_id, [])
        if len(bucket) < 3:
            bucket.append(text.strip())

    expanded_results: list[dict] = []
    for clause, score in top_clauses:
        clause_id = clause["clause_id"]
        expanded_results.append(
            {
                "query_match": clause["text"],
                "similarity_score": score,
                "related_clauses": neighbors_by_clause.get(clause_id, []),
            }
        )

    return expanded_results
