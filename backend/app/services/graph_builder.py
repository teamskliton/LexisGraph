import logging

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from app.db.mongo import get_database
from app.db.neo4j import run_query
from app.services.clause_utils import (
    collect_unique_clauses,
    filter_common_dimension_clauses,
    generate_clause_id,
)

logger = logging.getLogger(__name__)

_COLLECTIONS = ("user_documents", "external_documents")
_SIMILARITY_MAX_CLAUSES = 20


def _ensure_constraints() -> None:
    """Ensure id-based uniqueness constraints exist in Neo4j."""
    run_query(
        """
        CREATE CONSTRAINT document_id_unique IF NOT EXISTS
        FOR (d:Document)
        REQUIRE d.id IS UNIQUE
        """
    )
    run_query(
        """
        CREATE CONSTRAINT clause_id_unique IF NOT EXISTS
        FOR (c:Clause)
        REQUIRE c.id IS UNIQUE
        """
    )


def build_graph() -> dict:
    """Build a duplicate-safe graph from MongoDB processed documents."""
    _ensure_constraints()

    database = get_database()
    document_rows: list[dict] = []
    clause_rows_by_id: dict[str, dict] = {}
    relationship_rows: list[dict] = []

    for collection_name in _COLLECTIONS:
        collection = database[collection_name]

        for doc in collection.find({}, {"_id": 1, "title": 1, "source_type": 1, "clauses": 1}):
            doc_id = str(doc.get("_id", ""))
            if not doc_id:
                continue

            title = doc.get("title", "Untitled")
            source_type = doc.get("source_type", "unknown")

            document_rows.append(
                {
                    "doc_id": doc_id,
                    "title": title,
                    "source_type": source_type,
                    "collection_name": collection_name,
                }
            )

            clauses = doc.get("clauses", []) or []
            for clause in clauses:
                text = (clause.get("text") or "").strip()
                if not text:
                    continue

                ctype = clause.get("type", "general")
                embedding = clause.get("embedding", [])
                clause_id = generate_clause_id(text)

                clause_rows_by_id[clause_id] = {
                    "clause_id": clause_id,
                    "text": text,
                    "ctype": ctype,
                    "embedding": embedding,
                }
                relationship_rows.append({"doc_id": doc_id, "clause_id": clause_id})

    if document_rows:
        run_query(
            """
            UNWIND $rows AS row
            MERGE (d:Document {id: row.doc_id})
            SET d.title = row.title,
                d.source_type = row.source_type,
                d.collection = row.collection_name
            """,
            {"rows": document_rows},
        )

    clause_rows = list(clause_rows_by_id.values())
    if clause_rows:
        run_query(
            """
            UNWIND $rows AS row
            MERGE (c:Clause {id: row.clause_id})
            SET c.text = row.text,
                c.type = row.ctype,
                c.embedding = row.embedding
            """,
            {"rows": clause_rows},
        )

    if relationship_rows:
        run_query(
            """
            UNWIND $rows AS row
            MATCH (d:Document {id: row.doc_id})
            MATCH (c:Clause {id: row.clause_id})
            MERGE (d)-[:HAS_CLAUSE]->(c)
            """,
            {"rows": relationship_rows},
        )

    documents_processed = len(document_rows)
    clauses_processed = len(clause_rows)
    relationships_processed = len(relationship_rows)

    result = {
        "collections": list(_COLLECTIONS),
        "documents_processed": documents_processed,
        "clauses_processed": clauses_processed,
        "relationships_processed": relationships_processed,
    }
    logger.info("Graph build complete: %s", result)
    return result


def _extract_clauses_for_similarity(limit: int = _SIMILARITY_MAX_CLAUSES) -> list[dict]:
    """Extract unique clauses with embeddings from MongoDB for similarity linking."""
    return collect_unique_clauses(_COLLECTIONS, limit=limit)


def _filter_common_dimension_clauses(clauses: list[dict]) -> list[dict]:
    """Keep clauses from the most common embedding dimension."""
    return filter_common_dimension_clauses(clauses)


def create_similarity_edges(
    similarity_threshold: float = 0.75,
    top_k: int = 3,
    max_clauses: int = _SIMILARITY_MAX_CLAUSES,
) -> dict:
    """Create SIMILAR_TO edges between semantically close clause nodes."""
    clauses = _extract_clauses_for_similarity(limit=max_clauses)
    clauses = _filter_common_dimension_clauses(clauses)

    if len(clauses) < 2:
        result = {
            "clauses_considered": len(clauses),
            "pairs_evaluated": 0,
            "similarity_edges_upserted": 0,
            "threshold": similarity_threshold,
            "top_k": top_k,
            "max_clauses": max_clauses,
        }
        logger.info("Similarity build skipped (insufficient clauses): %s", result)
        return result

    embeddings = np.asarray([clause["embedding"] for clause in clauses], dtype=float)
    similarity_matrix = cosine_similarity(embeddings)

    pair_scores: dict[tuple[str, str], float] = {}
    pairs_evaluated = 0

    for source_index, source_clause in enumerate(clauses):
        similarities = similarity_matrix[source_index]
        ranked_indices = np.argsort(similarities)[::-1]

        matches_added = 0
        for target_index in ranked_indices:
            if source_index == target_index:
                continue

            pairs_evaluated += 1
            score = float(similarities[target_index])
            if score <= similarity_threshold:
                continue

            source_id = source_clause["clause_id"]
            target_id = clauses[target_index]["clause_id"]
            if source_id == target_id:
                continue

            pair_key = tuple(sorted((source_id, target_id)))
            previous_score = pair_scores.get(pair_key)
            if previous_score is None or score > previous_score:
                pair_scores[pair_key] = score

            matches_added += 1
            if matches_added >= top_k:
                break

    edge_rows = [
        {
            "clause_id_1": clause_id_1,
            "clause_id_2": clause_id_2,
            "score": score,
        }
        for (clause_id_1, clause_id_2), score in pair_scores.items()
    ]

    edges_upserted = len(edge_rows)
    if edge_rows:
        run_query(
            """
            UNWIND $rows AS row
            MATCH (c1:Clause {id: row.clause_id_1})
            MATCH (c2:Clause {id: row.clause_id_2})
            WHERE c1.id <> c2.id
            MERGE (c1)-[r:SIMILAR_TO]->(c2)
            SET r.score = row.score
            """,
            {"rows": edge_rows},
        )

    result = {
        "clauses_considered": len(clauses),
        "pairs_evaluated": pairs_evaluated,
        "similarity_edges_upserted": edges_upserted,
        "threshold": similarity_threshold,
        "top_k": top_k,
        "max_clauses": max_clauses,
    }
    logger.info("Similarity build complete: %s", result)
    return result
