"""
Qdrant vector store — clause embedding storage and retrieval.

Stores clause embeddings produced by the preprocessing pipeline into
Qdrant collections. Each clause becomes a point keyed by the MD5 hash
of its text (same id used in Neo4j Clause nodes).

Collections
-----------
``user_clauses``
    Clauses extracted from user-uploaded documents.

Each point payload holds:
    - ``clause_id``   : stable MD5 of clause text
    - ``document_id`` : PostgreSQL UUID of the parent document
    - ``text``        : truncated clause text (for retrieval snippets)
    - ``type``        : clause classification (obligation/permission/…)
    - ``title``       : document title
    - ``domain``      : document domain
"""
from __future__ import annotations

import hashlib
import logging
import uuid
from typing import Sequence

from qdrant_client import QdrantClient
from qdrant_client.http.exceptions import UnexpectedResponse
from qdrant_client.http.models import (
    Distance,
    PointStruct,
    VectorParams,
)

from app.db.qdrant import get_client

logger = logging.getLogger(__name__)

COLLECTION_USER = "user_clauses"
EMBEDDING_DIM = 384          # sentence-transformers/all-MiniLM-L6-v2 output size
_TEXT_SNIPPET_MAX = 500


def _ensure_collection(client: QdrantClient, name: str) -> None:
    """Create collection if it does not already exist."""
    try:
        client.get_collection(name)
    except (UnexpectedResponse, Exception):
        client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
        )
        logger.info("Qdrant collection created: %s", name)


def _clause_to_point(
    clause: dict,
    document_id: str,
    title: str,
    domain: str,
) -> PointStruct | None:
    """Convert a preprocessed clause dict to a Qdrant PointStruct.

    Returns ``None`` if the clause has no embedding (skip silently).
    """
    embedding: list[float] | None = clause.get("embedding")
    if not embedding or not isinstance(embedding, list):
        return None

    text = str(clause.get("text") or "").strip()
    clause_id = hashlib.md5(text.encode()).hexdigest()

    # MD5 is 32 hex chars — exactly what uuid.UUID(hex=...) expects.
    point_uuid = str(uuid.UUID(clause_id))

    return PointStruct(
        id=point_uuid,
        vector=embedding,
        payload={
            "clause_id": clause_id,
            "document_id": document_id,
            "text": text[:_TEXT_SNIPPET_MAX],
            "type": str(clause.get("type") or "general"),
            "title": title,
            "domain": domain,
        },
    )


def store_clauses_in_qdrant(
    clauses: Sequence[dict],
    *,
    document_id: str,
    title: str,
    domain: str,
    collection: str = COLLECTION_USER,
    batch_size: int = 64,
) -> int:
    """Upsert clause embeddings into Qdrant.

    Parameters
    ----------
    clauses:
        List of clause dicts produced by ``preprocessing.preprocess_text``.
        Each must have an ``embedding`` key with a list of floats.
    document_id:
        PostgreSQL UUID string of the parent document (stored as payload).
    title, domain:
        Document metadata stored in the point payload.
    collection:
        Qdrant collection name (default: ``user_clauses``).
    batch_size:
        How many points to upsert per Qdrant request.

    Returns
    -------
    int
        Number of points actually upserted.
    """
    client = get_client()
    _ensure_collection(client, collection)

    points: list[PointStruct] = []
    for clause in clauses:
        point = _clause_to_point(clause, document_id, title, domain)
        if point is not None:
            points.append(point)

    if not points:
        logger.warning(
            "Qdrant store: no embeddable clauses for document_id=%s", document_id
        )
        return 0

    upserted = 0
    for i in range(0, len(points), batch_size):
        batch = points[i : i + batch_size]
        client.upsert(collection_name=collection, points=batch)
        upserted += len(batch)
        logger.info(
            "Qdrant upsert: collection=%s batch=%s/%s upserted_so_far=%s",
            collection,
            i // batch_size + 1,
            -(-len(points) // batch_size),
            upserted,
        )

    logger.info(
        "Qdrant store complete: document_id=%s points=%s collection=%s",
        document_id,
        upserted,
        collection,
    )
    return upserted


def delete_document_clauses(
    document_id: str,
    collection: str = COLLECTION_USER,
) -> None:
    """Delete all clause points belonging to a document.

    Called on document deletion so Qdrant stays consistent with PostgreSQL.
    """
    client = get_client()
    from qdrant_client.http.models import Filter, FieldCondition, MatchValue
    client.delete(
        collection_name=collection,
        points_selector=Filter(
            must=[FieldCondition(key="document_id", match=MatchValue(value=document_id))]
        ),
    )
    logger.info(
        "Qdrant delete: removed clauses for document_id=%s collection=%s",
        document_id,
        collection,
    )
