import logging
import uuid
from typing import Sequence
from collections import Counter

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from app.db.neo4j import run_query
from app.services.embedding_model import (
    get_embedding_model,
    is_model_loaded as _is_shared_model_loaded,
    preload_model as _preload_shared_model,
)
from app.services.graph_builder import generate_clause_id

logger = logging.getLogger(__name__)


def is_model_loaded() -> bool:
    return _is_shared_model_loaded()


def preload_model() -> None:
    _preload_shared_model()


def _collect_clauses(
    collection_names: tuple[str, ...] | None = None,
    organization_id: uuid.UUID | str | None = None,
) -> list[dict]:
    """Collect unique clause texts and embeddings from Qdrant vector store scoped to organization."""
    if not organization_id:
        logger.warning("[RETRIEVAL] Blocked unscoped clause collection: organization_id is required")
        return []

    org_str = str(organization_id)
    try:
        from qdrant_client.http.models import FieldCondition, Filter, MatchValue
        from app.db.qdrant import get_client
        from app.services.vector_store import COLLECTION_USER

        client = get_client()
        scroll_filter = Filter(
            should=[
                FieldCondition(key="organization_id", match=MatchValue(value=org_str)),
                FieldCondition(key="is_global", match=MatchValue(value=True)),
            ]
        )
        points, _ = client.scroll(
            collection_name=COLLECTION_USER,
            limit=200,
            with_payload=True,
            with_vectors=True,
            scroll_filter=scroll_filter,
        )
        clauses = []
        for point in points:
            payload = point.payload or {}
            point_org = payload.get("organization_id")
            is_global = payload.get("is_global") is True

            # Zero-trust verification: quarantine points not belonging to org or global
            if point_org != org_str and not is_global:
                logger.warning(
                    "[SECURITY ALERT] Quarantined mismatched vector point: point_id=%s point_org=%s target_org=%s",
                    point.id,
                    point_org,
                    org_str,
                )
                continue

            text = payload.get("text", "")
            vector = point.vector
            if text and isinstance(vector, list):
                cid = payload.get("clause_id") or generate_clause_id(text)
                clauses.append({
                    "clause_id": cid,
                    "text": text,
                    "embedding": vector,
                    "collection": COLLECTION_USER,
                })
        return clauses
    except Exception as exc:
        logger.warning("Qdrant clause collection for retrieval fallback notice: %s", exc)
        return []


def _filter_common_dimension_clauses(clauses: list[dict]) -> list[dict]:
    """Keep clauses from the dominant embedding dimension only."""
    if not clauses:
        return []

    dimension_counts = Counter(len(clause["embedding"]) for clause in clauses)
    target_dimension, _ = dimension_counts.most_common(1)[0]
    return [clause for clause in clauses if len(clause["embedding"]) == target_dimension]


def retrieve_relevant_clauses(
    query: str,
    organization_id: uuid.UUID | str | None = None,
) -> list[dict]:
    """Retrieve top relevant clauses via embeddings and expand with graph neighbors within tenant scope."""
    if not query or not query.strip():
        return []

    if not organization_id:
        logger.warning("[RETRIEVAL] Blocked unscoped retrieve_relevant_clauses for query: %r", query)
        return []

    org_str = str(organization_id)
    model = get_embedding_model()
    query_embedding = model.encode(query)

    clauses = _collect_clauses(organization_id=org_str)
    clauses = _filter_common_dimension_clauses(clauses)
    if not clauses:
        return []

    embeddings = np.asarray([clause["embedding"] for clause in clauses], dtype=float)
    query_vector = np.asarray(query_embedding, dtype=float).reshape(1, -1)

    if query_vector.shape[1] != embeddings.shape[1]:
        logger.warning(
            "Embedding dimension mismatch for retrieval query=%s query_dim=%s clause_dim=%s",
            query,
            query_vector.shape[1],
            embeddings.shape[1],
        )
        return []

    similarity_scores = cosine_similarity(query_vector, embeddings)[0]
    top_indices = np.argsort(similarity_scores)[::-1][:3]

    expanded_results: list[dict] = []
    for index in top_indices:
        clause = clauses[index]
        score = float(similarity_scores[index])
        clause_id = clause["clause_id"]

        # Structural neighbor lookup scoped to authorized organization or global regulations
        neighbors = run_query(
            """
            MATCH (d:Document)-[:HAS_CLAUSE]->(c:Clause {id: $id})
            WHERE (d.organization_id = $org_id OR d.is_global = true)
            MATCH (d)-[:HAS_CLAUSE]->(n:Clause)
            WHERE n.id <> $id AND (n.organization_id = $org_id OR n.is_global = true)
            RETURN n.text AS text
            LIMIT 3
            """,
            {"id": clause_id, "org_id": org_str},
        )

        expanded_results.append(
            {
                "query_match": clause["text"],
                "similarity_score": score,
                "related_clauses": [item.get("text", "") for item in neighbors if item.get("text")],
            }
        )

    logger.info("[RETRIEVAL] Query processed org=%s query=%s hits=%s", org_str, query.strip(), len(expanded_results))
    return expanded_results
