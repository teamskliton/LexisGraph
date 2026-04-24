import hashlib
import logging

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from app.db.mongo import get_database
from app.db.neo4j import run_query

logger = logging.getLogger(__name__)

_COLLECTIONS = ("user_documents", "external_documents")
_SIMILARITY_MAX_CLAUSES = 20


def generate_clause_id(text: str) -> str:
    """Generate stable clause id from clause text."""
    return hashlib.md5(text.encode("utf-8")).hexdigest()


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
    logger.info("🌐 GRAPH BUILD STARTED")
    logger.info("[GRAPH] STEP 1: Graph build started")
    _ensure_constraints()
    logger.info("[GRAPH] STEP 2: Constraints ensured")

    database = get_database()
    documents_processed = 0
    clauses_processed = 0
    relationships_processed = 0

    for collection_name in _COLLECTIONS:
        logger.info("[GRAPH] STEP 3: Processing collection=%s", collection_name)
        collection = database[collection_name]

        for doc in collection.find({}, {"_id": 1, "title": 1, "source_type": 1, "clauses": 1}):
            doc_id = str(doc.get("_id", ""))
            if not doc_id:
                continue

            title = doc.get("title", "Untitled")
            source_type = doc.get("source_type", "unknown")

            run_query(
                """
                MERGE (d:Document {id: $doc_id})
                SET d.title = $title,
                    d.source_type = $source_type,
                    d.collection = $collection_name
                """,
                {
                    "doc_id": doc_id,
                    "title": title,
                    "source_type": source_type,
                    "collection_name": collection_name,
                },
            )
            documents_processed += 1

            clauses = doc.get("clauses", []) or []
            for clause in clauses:
                text = (clause.get("text") or "").strip()
                if not text:
                    continue

                ctype = clause.get("type", "general")
                embedding = clause.get("embedding", [])
                clause_id = generate_clause_id(text)

                run_query(
                    """
                    MERGE (c:Clause {id: $clause_id})
                    SET c.text = $text,
                        c.type = $ctype,
                        c.embedding = $embedding
                    """,
                    {
                        "clause_id": clause_id,
                        "text": text,
                        "ctype": ctype,
                        "embedding": embedding,
                    },
                )
                clauses_processed += 1

                run_query(
                    """
                    MATCH (d:Document {id: $doc_id})
                    MATCH (c:Clause {id: $clause_id})
                    MERGE (d)-[:HAS_CLAUSE]->(c)
                    """,
                    {
                        "doc_id": doc_id,
                        "clause_id": clause_id,
                    },
                )
                relationships_processed += 1

    result = {
        "collections": list(_COLLECTIONS),
        "documents_processed": documents_processed,
        "clauses_processed": clauses_processed,
        "relationships_processed": relationships_processed,
    }
    logger.info("[GRAPH] STEP 4: Graph build complete %s", result)
    return result


def _extract_clauses_for_similarity(limit: int = _SIMILARITY_MAX_CLAUSES) -> list[dict]:
    """Extract unique clauses with embeddings from MongoDB for similarity linking."""
    database = get_database()
    clauses_by_id: dict[str, dict] = {}

    for collection_name in _COLLECTIONS:
        collection = database[collection_name]
        for doc in collection.find({}, {"clauses": 1}):
            clauses = doc.get("clauses", []) or []
            for clause in clauses:
                text = (clause.get("text") or "").strip()
                embedding = clause.get("embedding")
                if not text or not isinstance(embedding, list) or not embedding:
                    continue
                if not all(isinstance(value, (int, float)) for value in embedding):
                    continue

                clause_id = generate_clause_id(text)
                if clause_id in clauses_by_id:
                    continue

                clauses_by_id[clause_id] = {
                    "clause_id": clause_id,
                    "text": text,
                    "embedding": embedding,
                }

                if len(clauses_by_id) >= limit:
                    return list(clauses_by_id.values())

    return list(clauses_by_id.values())


def _filter_common_dimension_clauses(clauses: list[dict]) -> list[dict]:
    """Keep clauses from the most common embedding dimension."""
    if not clauses:
        return []

    dimension_counts: dict[int, int] = {}
    for clause in clauses:
        dimension = len(clause["embedding"])
        dimension_counts[dimension] = dimension_counts.get(dimension, 0) + 1

    target_dimension = max(dimension_counts, key=dimension_counts.get)
    return [clause for clause in clauses if len(clause["embedding"]) == target_dimension]


def create_similarity_edges(
    similarity_threshold: float = 0.75,
    top_k: int = 3,
    max_clauses: int = _SIMILARITY_MAX_CLAUSES,
) -> dict:
    """Create SIMILAR_TO edges between semantically close clause nodes."""
    logger.info(
        "[SIMILARITY] STEP 1: Similarity build started threshold=%s top_k=%s max_clauses=%s",
        similarity_threshold,
        top_k,
        max_clauses,
    )
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
        logger.info("[SIMILARITY] STEP 2: Skipped (insufficient clauses) %s", result)
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

    edges_upserted = 0
    for (clause_id_1, clause_id_2), score in pair_scores.items():
        run_query(
            """
            MATCH (c1:Clause {id: $clause_id_1})
            MATCH (c2:Clause {id: $clause_id_2})
            WHERE c1.id <> c2.id
            MERGE (c1)-[r:SIMILAR_TO]->(c2)
            SET r.score = $score
            """,
            {
                "clause_id_1": clause_id_1,
                "clause_id_2": clause_id_2,
                "score": score,
            },
        )
        edges_upserted += 1

    result = {
        "clauses_considered": len(clauses),
        "pairs_evaluated": pairs_evaluated,
        "similarity_edges_upserted": edges_upserted,
        "threshold": similarity_threshold,
        "top_k": top_k,
        "max_clauses": max_clauses,
    }
    logger.info("[SIMILARITY] STEP 2: Similarity build complete %s", result)
    return result
