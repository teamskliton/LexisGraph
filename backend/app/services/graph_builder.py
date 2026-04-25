import hashlib
import logging

import numpy as np
from bson import ObjectId
from bson.errors import InvalidId
from sklearn.metrics.pairwise import cosine_similarity

from app.db.mongo import (
    get_database,
    get_external_documents_collection,
    get_user_documents_collection,
)
from app.db.neo4j import run_query

logger = logging.getLogger(__name__)

_COLLECTIONS = ("user_documents", "external_documents", "domain_documents")
_SIMILARITY_MAX_CLAUSES = 20
_CLAUSE_TEXT_MAX = 2000


def diagnose_graph_inputs():
    """Print exactly what MongoDB has before graph build attempts."""
    user_col = get_user_documents_collection()
    ext_col = get_external_documents_collection()

    user_docs = list(
        user_col.find(
            {},
            {"_id": 1, "title": 1, "filename": 1, "hash": 1, "clauses": 1},
        )
    )
    ext_docs = list(
        ext_col.find(
            {},
            {"_id": 1, "source": 1, "title": 1, "hash": 1, "clauses": 1},
        )
    )

    logger.info("[DIAG] MongoDB user_documents count: %s", len(user_docs))
    logger.info("[DIAG] MongoDB external_documents count: %s", len(ext_docs))

    for doc in user_docs:
        clause_count = len(doc.get("clauses", []))
        label = doc.get("filename") or doc.get("title") or "unknown"
        h = doc.get("hash") or ""
        logger.info(
            "[DIAG] User doc: %s | hash: %s... | clauses: %s",
            label,
            h[:16] if h else "",
            clause_count,
        )
        if clause_count > 0:
            sample = doc["clauses"][0]
            if isinstance(sample, dict):
                logger.info("[DIAG] Sample clause keys: %s", list(sample.keys()))
                cid = sample.get("clause_id", "MISSING")
                logger.info("[DIAG] Sample clause_id: %s", cid)
                canonical = generate_clause_id(str(sample.get("text") or ""))
                if cid != "MISSING" and str(cid) != canonical:
                    logger.warning(
                        "[DIAG] clause_id vs md5(text) mismatch: stored=%s canonical=%s",
                        cid,
                        canonical,
                    )
                logger.info(
                    "[DIAG] Sample text: %s",
                    str(sample.get("text", "MISSING"))[:80],
                )
                emb = sample.get("embedding")
                logger.info("[DIAG] Sample embedding present: %s", emb is not None)
                logger.info(
                    "[DIAG] Sample embedding length: %s",
                    len(sample.get("embedding", [])) if isinstance(emb, list) else 0,
                )

    for doc in ext_docs:
        clause_count = len(doc.get("clauses", []))
        logger.info(
            "[DIAG] Ext doc: %s | clauses: %s",
            doc.get("source", "unknown"),
            clause_count,
        )

    return user_docs, ext_docs


def _verify_neo4j_state(step_label: str) -> None:
    """After each write, count what actually exists in Neo4j."""
    doc_count = run_query("MATCH (d:Document) RETURN count(d) AS cnt")
    clause_count = run_query("MATCH (c:Clause) RETURN count(c) AS cnt")
    edge_count = run_query("MATCH ()-[r:HAS_CLAUSE]->() RETURN count(r) AS cnt")

    d = doc_count[0]["cnt"] if doc_count else "ERROR"
    c = clause_count[0]["cnt"] if clause_count else "ERROR"
    e = edge_count[0]["cnt"] if edge_count else "ERROR"

    logger.info(
        "[NEO4J VERIFY after %s] Documents=%s Clauses=%s HAS_CLAUSE=%s",
        step_label,
        d,
        c,
        e,
    )


def _test_write_persistence() -> bool:
    """Write a test node and immediately read it back to confirm persistence."""
    write_result = run_query(
        "CREATE (t:TestNode {id: 'persistence_test', ts: datetime()}) RETURN t.id AS id",
        write=True,
    )
    logger.info("[PERSIST TEST] Write result: %s", write_result)

    read_result = run_query(
        "MATCH (t:TestNode {id: 'persistence_test'}) RETURN t.id AS id",
    )
    logger.info("[PERSIST TEST] Read back result: %s", read_result)

    run_query(
        "MATCH (t:TestNode {id: 'persistence_test'}) DELETE t",
        write=True,
    )

    if read_result and len(read_result) > 0:
        logger.info("[PERSIST TEST] Neo4j writes ARE persisting correctly")
        return True

    logger.error(
        "[PERSIST TEST] Neo4j writes are NOT persisting — session/transaction issue",
    )
    return False


def generate_clause_id(text: str) -> str:
    """Generate stable clause id from clause text."""
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def _iter_valid_clause_dicts(raw_clauses: object) -> list[dict]:
    """Yield only clause dictionaries with non-empty text."""
    if not isinstance(raw_clauses, list):
        return []

    valid: list[dict] = []
    for raw in raw_clauses:
        if not isinstance(raw, dict):
            continue
        text = str(raw.get("text") or "").strip()
        if not text:
            continue
        valid.append(raw)
    return valid


def _create_clause_nodes_batch(clauses_data: list, write: bool = True) -> list:
    """Create multiple clause nodes in one query using UNWIND."""
    if not clauses_data:
        return []

    batch = []
    for c in clauses_data:
        batch.append(
            {
                "id": str(c["id"]),
                "text": str(c.get("text", ""))[:_CLAUSE_TEXT_MAX],
                "doc_id": str(c.get("doc_id", "")),
                "source_type": str(c.get("source_type", "user")),
                "ctype": str(c.get("ctype", "general")),
            }
        )

    query = """
    UNWIND $batch AS clause
    MERGE (c:Clause {id: clause.id})
    ON CREATE SET
        c.text = clause.text,
        c.doc_id = clause.doc_id,
        c.source_type = clause.source_type,
        c.type = clause.ctype,
        c.created_at = datetime()
    ON MATCH SET
        c.text = clause.text,
        c.type = clause.ctype
    RETURN count(c) AS merged_count
    """
    result = run_query(query, {"batch": batch}, write=write)
    logger.info("[GRAPH] Batch clause upsert result: %s", result)
    return result


def _create_has_clause_edges_batch(doc_node_id: str, clause_ids: list, write: bool = True) -> list:
    """Create HAS_CLAUSE edges in batch."""
    if not clause_ids:
        return []

    query = """
    MATCH (d:Document {id: $doc_id})
    UNWIND $clause_ids AS cid
    MATCH (c:Clause {id: cid})
    MERGE (d)-[:HAS_CLAUSE]->(c)
    RETURN count(*) AS edge_count
    """
    result = run_query(
        query,
        {"doc_id": doc_node_id, "clause_ids": clause_ids},
        write=write,
    )
    logger.info("[GRAPH] HAS_CLAUSE batch edge result: %s", result)
    return result


def _ensure_constraints() -> None:
    """Ensure id-based uniqueness constraints exist in Neo4j."""
    run_query(
        """
        CREATE CONSTRAINT document_id_unique IF NOT EXISTS
        FOR (d:Document)
        REQUIRE d.id IS UNIQUE
        """,
        write=True,
    )
    run_query(
        """
        CREATE CONSTRAINT clause_id_unique IF NOT EXISTS
        FOR (c:Clause)
        REQUIRE c.id IS UNIQUE
        """,
        write=True,
    )


def build_graph(document_id: str | None = None) -> dict:
    """Build a duplicate-safe graph from MongoDB processed documents."""
    diagnose_graph_inputs()
    logger.info("[GRAPH] Graph building started")
    logger.info("🌐 GRAPH BUILD STARTED")
    logger.info("[GRAPH] STEP 1: Graph build started")
    _ensure_constraints()
    _verify_neo4j_state("_ensure_constraints")
    _test_write_persistence()
    _verify_neo4j_state("_test_write_persistence")
    logger.info("[GRAPH] STEP 2: Constraints ensured")

    database = get_database()
    documents_processed = 0
    clauses_processed = 0
    relationships_processed = 0
    skipped_clauses = 0
    document_errors = 0

    for collection_name in _COLLECTIONS:
        logger.info("[GRAPH] STEP 3: Processing collection=%s", collection_name)
        collection = database[collection_name]

        query_filter = {}
        if document_id:
            try:
                query_filter = {"_id": ObjectId(document_id)}
            except InvalidId:
                query_filter = {"_id": document_id}
        for doc in collection.find(
            query_filter,
            {"_id": 1, "title": 1, "source_type": 1, "clauses": 1},
        ):
            try:
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
                    write=True,
                )
                documents_processed += 1
                _verify_neo4j_state(f"document_MERGE doc_id={doc_id}")

                clauses = _iter_valid_clause_dicts(doc.get("clauses", []))
                batch_rows: list[dict] = []
                clause_ids: list[str] = []

                for clause in clauses:
                    text = str(clause.get("text") or "").strip()
                    ctype = str(clause.get("type") or "general")
                    clause_id = generate_clause_id(text)
                    batch_rows.append(
                        {
                            "id": clause_id,
                            "text": text,
                            "doc_id": doc_id,
                            "source_type": source_type,
                            "ctype": ctype,
                        }
                    )
                    clause_ids.append(clause_id)

                if batch_rows:
                    _create_clause_nodes_batch(batch_rows, write=True)
                    clauses_processed += len(batch_rows)
                    _verify_neo4j_state(f"clause_batch doc_id={doc_id}")

                    _create_has_clause_edges_batch(doc_id, clause_ids, write=True)
                    relationships_processed += len(clause_ids)
                    _verify_neo4j_state(f"HAS_CLAUSE_batch doc_id={doc_id}")

                raw_clauses = doc.get("clauses", [])
                if isinstance(raw_clauses, list):
                    skipped_clauses += max(0, len(raw_clauses) - len(clauses))
            except Exception:  # noqa: BLE001
                document_errors += 1
                logger.exception(
                    "[GRAPH] Failed processing document in collection=%s",
                    collection_name,
                )
                continue

    result = {
        "collections": list(_COLLECTIONS),
        "document_id": document_id,
        "documents_processed": documents_processed,
        "clauses_processed": clauses_processed,
        "relationships_processed": relationships_processed,
        "skipped_clauses": skipped_clauses,
        "document_errors": document_errors,
    }
    logger.info("[GRAPH] Nodes and edges created")
    logger.info("[GRAPH] STEP 4: Graph build complete %s", result)
    _verify_neo4j_state("build_graph_complete")
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
            write=True,
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
    _verify_neo4j_state("create_similarity_edges_complete")
    return result
