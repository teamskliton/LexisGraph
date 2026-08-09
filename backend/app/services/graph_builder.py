"""
Neo4j graph builder — no MongoDB dependency.

Builds Document/Clause nodes and HAS_CLAUSE/SIMILAR_TO edges directly
from the preprocessed document dict produced by
``app.services.preprocessing.build_processed_document``.

Node model
----------
(:Document {id, title, domain, source_type, pg_document_id})
(:Clause   {id, text, type, doc_id, source_type})

Relationships
-------------
(Document)-[:HAS_CLAUSE]->(Clause)
(Clause)-[:SIMILAR_TO {score}]->(Clause)   ← optional, created separately
"""
from __future__ import annotations

import hashlib
import logging
import os

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from app.db.neo4j import run_query

logger = logging.getLogger(__name__)

_CLAUSE_TEXT_MAX = 2000
_DEFAULT_SIMILARITY_THRESHOLD = float(os.getenv("GRAPH_SIMILARITY_THRESHOLD", "0.75"))
_DEFAULT_SIMILARITY_TOP_K = max(1, int(os.getenv("GRAPH_SIMILARITY_TOP_K", "3")))
_SIMILARITY_MAX_CLAUSES = max(2, int(os.getenv("GRAPH_SIMILARITY_MAX_CLAUSES", "120")))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def generate_clause_id(text: str) -> str:
    """Return stable MD5 hex digest of clause text (matches vector_store.py)."""
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def _ensure_constraints() -> None:
    """Create uniqueness constraints if they don't already exist."""
    run_query(
        """
        CREATE CONSTRAINT document_id_unique IF NOT EXISTS
        FOR (d:Document) REQUIRE d.id IS UNIQUE
        """,
        write=True,
    )
    run_query(
        """
        CREATE CONSTRAINT clause_id_unique IF NOT EXISTS
        FOR (c:Clause) REQUIRE c.id IS UNIQUE
        """,
        write=True,
    )


def _upsert_document_node(
    *,
    pg_document_id: str,
    title: str,
    domain: str,
    source_type: str = "user",
    organization_id: str | None = None,
    document_type: str = "POLICY",
    checksum: str | None = None,
) -> None:
    """MERGE a Document node keyed by the PostgreSQL UUID."""
    run_query(
        """
        MERGE (d:Document {id: $id})
        SET d.title           = $title,
            d.domain          = $domain,
            d.source_type     = $source_type,
            d.pg_document_id  = $pg_document_id,
            d.organization_id = $organization_id,
            d.document_type   = $document_type,
            d.checksum        = $checksum
        """,
        {
            "id": pg_document_id,
            "title": title,
            "domain": domain,
            "source_type": source_type,
            "pg_document_id": pg_document_id,
            "organization_id": organization_id,
            "document_type": document_type,
            "checksum": checksum,
        },
        write=True,
    )
    logger.info(
        "Neo4j Document node upserted: id=%s title=%r org_id=%s doc_type=%s",
        pg_document_id, title, organization_id, document_type,
    )


def _upsert_clause_nodes_batch(clause_rows: list[dict]) -> int:
    """Batch MERGE Clause nodes. Returns count merged."""
    if not clause_rows:
        return 0

    result = run_query(
        """
        UNWIND $batch AS c
        MERGE (n:Clause {id: c.id})
        ON CREATE SET
            n.text        = c.text,
            n.type        = c.type,
            n.doc_id      = c.doc_id,
            n.source_type = c.source_type,
            n.created_at  = datetime()
        ON MATCH SET
            n.text = c.text,
            n.type = c.type
        RETURN count(n) AS merged
        """,
        {"batch": clause_rows},
        write=True,
    )
    merged = result[0]["merged"] if result else 0
    logger.info("Neo4j Clause batch upsert: merged=%s", merged)
    return merged


def _upsert_has_clause_edges(doc_id: str, clause_ids: list[str]) -> int:
    """Create HAS_CLAUSE edges from Document → each Clause. Returns edge count."""
    if not clause_ids:
        return 0

    result = run_query(
        """
        MATCH (d:Document {id: $doc_id})
        UNWIND $clause_ids AS cid
        MATCH (c:Clause {id: cid})
        MERGE (d)-[:HAS_CLAUSE]->(c)
        RETURN count(*) AS edges
        """,
        {"doc_id": doc_id, "clause_ids": clause_ids},
        write=True,
    )
    edges = result[0]["edges"] if result else 0
    logger.info("Neo4j HAS_CLAUSE edges upserted: %s", edges)
    return edges


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_graph(
    processed: dict,
    *,
    pg_document_id: str,
    source_type: str = "user",
    organization_id: str | None = None,
    document_type: str = "POLICY",
    checksum: str | None = None,
) -> dict:
    """Build Document + Clause nodes and HAS_CLAUSE edges in Neo4j.

    Parameters
    ----------
    processed:
        The dict returned by ``preprocessing.build_processed_document``.
        Must have keys: ``title``, ``domain``, ``clauses``.
    pg_document_id:
        The PostgreSQL UUID of the parent document (used as Neo4j node id).
    source_type:
        Label stored on both Document and Clause nodes (default ``"user"``).
    organization_id:
        UUID string of the parent organization.
    document_type:
        Type of document (e.g. ``"POLICY"`` or ``"REGULATION"``).
    checksum:
        SHA-256 digest of the document content.

    Returns
    -------
    dict
        Summary stats: ``documents_created``, ``clauses_created``,
        ``edges_created``.
    """
    _ensure_constraints()

    title = processed.get("title", "Untitled")
    domain = processed.get("domain", "IT")
    clauses = processed.get("clauses") or []

    logger.info(
        "[GRAPH] Building graph: pg_document_id=%s title=%r org_id=%s doc_type=%s clauses=%s",
        pg_document_id, title, organization_id, document_type, len(clauses),
    )

    # 1. Upsert Document node
    _upsert_document_node(
        pg_document_id=pg_document_id,
        title=title,
        domain=domain,
        source_type=source_type,
        organization_id=organization_id,
        document_type=document_type,
        checksum=checksum,
    )

    # 2. Build clause rows
    clause_rows: list[dict] = []
    clause_ids: list[str] = []

    for clause in clauses:
        text = str(clause.get("text") or "").strip()
        if not text:
            continue
        ctype = str(clause.get("type") or "general")
        cid = generate_clause_id(text)
        clause_rows.append(
            {
                "id": cid,
                "text": text[:_CLAUSE_TEXT_MAX],
                "type": ctype,
                "doc_id": pg_document_id,
                "source_type": source_type,
            }
        )
        clause_ids.append(cid)

    # 3. Upsert Clause nodes
    clauses_created = _upsert_clause_nodes_batch(clause_rows)

    # 4. Create HAS_CLAUSE edges
    edges_created = _upsert_has_clause_edges(pg_document_id, clause_ids)

    result = {
        "documents_created": 1,
        "clauses_created": clauses_created,
        "edges_created": edges_created,
        "pg_document_id": pg_document_id,
        "title": title,
    }
    logger.info("[GRAPH] Build complete: %s", result)
    return result


def create_similarity_edges(
    clauses: list[dict],
    *,
    similarity_threshold: float = _DEFAULT_SIMILARITY_THRESHOLD,
    top_k: int = _DEFAULT_SIMILARITY_TOP_K,
) -> dict:
    """Create SIMILAR_TO edges between semantically close Clause nodes.

    Parameters
    ----------
    clauses:
        List of clause dicts with ``text`` and ``embedding`` keys.
    """
    # Filter to clauses with valid embeddings
    valid = [
        c for c in clauses
        if isinstance(c.get("embedding"), list) and len(c["embedding"]) > 0
    ]
    if len(valid) < 2:
        return {"clauses_considered": len(valid), "similarity_edges_upserted": 0}

    # Keep only clauses from the most common embedding dimension
    from collections import Counter
    dim_counts = Counter(len(c["embedding"]) for c in valid)
    target_dim = dim_counts.most_common(1)[0][0]
    valid = [c for c in valid if len(c["embedding"]) == target_dim]

    embeddings = np.asarray([c["embedding"] for c in valid], dtype=float)
    sim_matrix = cosine_similarity(embeddings)

    pair_scores: dict[tuple[str, str], float] = {}
    for i, clause in enumerate(valid):
        sims = sim_matrix[i]
        ranked = np.argsort(sims)[::-1]
        added = 0
        for j in ranked:
            if i == j:
                continue
            score = float(sims[j])
            if score <= similarity_threshold:
                continue
            cid_1 = generate_clause_id(str(clause.get("text") or "").strip())
            cid_2 = generate_clause_id(str(valid[j].get("text") or "").strip())
            if cid_1 == cid_2:
                continue
            key = tuple(sorted((cid_1, cid_2)))
            if key not in pair_scores or score > pair_scores[key]:
                pair_scores[key] = score
            added += 1
            if added >= top_k:
                break

    edges_upserted = 0
    for (cid_1, cid_2), score in pair_scores.items():
        run_query(
            """
            MATCH (c1:Clause {id: $cid_1})
            MATCH (c2:Clause {id: $cid_2})
            WHERE c1.id <> c2.id
            MERGE (c1)-[r:SIMILAR_TO]->(c2)
            SET r.score = $score
            """,
            {"cid_1": cid_1, "cid_2": cid_2, "score": score},
            write=True,
        )
        edges_upserted += 1

    result = {
        "clauses_considered": len(valid),
        "similarity_edges_upserted": edges_upserted,
        "threshold": similarity_threshold,
        "top_k": top_k,
    }
    logger.info("[SIMILARITY] %s", result)
    return result
