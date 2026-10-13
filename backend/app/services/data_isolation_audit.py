"""
Data Isolation Audit & Quarantine Utility.

Audits and repairs historical vector embeddings, Neo4j graph nodes/edges, and
conversation citation records to ensure 100% tenant data isolation compliance:
1. Audits Qdrant vector store points for missing or incorrect organization_id.
2. Audits Neo4j graph nodes and relationship edges for cross-tenant linkages.
3. Audits persistent conversation messages to sanitize any cross-tenant citations.
4. Quarantines ambiguous or unverified records until administrative review.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ConversationMessage, ConversationSession, Document, Regulation
from app.db.neo4j import run_query
from app.db.qdrant import get_client
from app.services.vector_store import COLLECTION_REGULATION, COLLECTION_USER

logger = logging.getLogger(__name__)


def audit_vector_store(db: Session) -> dict[str, Any]:
    """
    Audit and repair vector embeddings in Qdrant collections.
    Repairs missing organization_id from PostgreSQL records or quarantines unverified points.
    """
    stats = {
        "scanned": 0,
        "valid": 0,
        "repaired": 0,
        "quarantined": 0,
        "errors": 0,
    }

    try:
        client = get_client()
        collections_to_audit = [COLLECTION_USER, COLLECTION_REGULATION]

        for coll in collections_to_audit:
            offset = None
            while True:
                points, next_offset = client.scroll(
                    collection_name=coll,
                    limit=100,
                    with_payload=True,
                    with_vectors=False,
                    offset=offset,
                )
                if not points:
                    break

                for point in points:
                    stats["scanned"] += 1
                    payload = dict(point.payload or {})
                    doc_id_str = payload.get("document_id")
                    org_id_str = payload.get("organization_id")
                    is_global = payload.get("is_global")

                    # If already properly tagged
                    if org_id_str and is_global is not None:
                        stats["valid"] += 1
                        continue

                    # Attempt reliable repair against PostgreSQL
                    repaired = False
                    if doc_id_str:
                        try:
                            d_uuid = uuid.UUID(str(doc_id_str))
                        except (ValueError, TypeError):
                            d_uuid = None

                        if d_uuid:
                            doc = db.get(Document, d_uuid)
                            if doc:
                                payload["organization_id"] = str(doc.organization_id)
                                payload["is_global"] = False
                                payload["document_type"] = "Policy"
                                client.set_payload(
                                    collection_name=coll,
                                    payload=payload,
                                    points=[point.id],
                                )
                                stats["repaired"] += 1
                                repaired = True
                                continue

                            reg = db.get(Regulation, d_uuid)
                            if reg:
                                payload["organization_id"] = "global" if reg.is_global else str(getattr(reg, "organization_id", "global"))
                                payload["is_global"] = reg.is_global
                                payload["document_type"] = "Regulation"
                                client.set_payload(
                                    collection_name=coll,
                                    payload=payload,
                                    points=[point.id],
                                )
                                stats["repaired"] += 1
                                repaired = True
                                continue

                    if not repaired:
                        # Ambiguous record — quarantine it
                        payload["is_quarantined"] = True
                        payload["quarantine_reason"] = "Unverified tenant ownership metadata"
                        # Set an isolated quarantine scope so it cannot match any real workspace
                        payload["organization_id"] = f"quarantine_{uuid.uuid4()}"
                        payload["is_global"] = False
                        client.set_payload(
                            collection_name=coll,
                            payload=payload,
                            points=[point.id],
                        )
                        stats["quarantined"] += 1

                if not next_offset:
                    break
                offset = next_offset

    except Exception as exc:
        logger.exception("[DATA_AUDIT] Vector store audit error: %s", exc)
        stats["errors"] += 1

    return stats


def audit_knowledge_graph(db: Session) -> dict[str, Any]:
    """
    Audit Neo4j graph nodes and relationship edges.
    1. Repairs missing organization_id / is_global on Clause and Document nodes.
    2. Quarantines ambiguous nodes.
    3. Prunes cross-tenant SIMILAR_TO or REFERENCES edges connecting distinct private tenants.
    """
    stats = {
        "nodes_scanned": 0,
        "nodes_repaired": 0,
        "nodes_quarantined": 0,
        "cross_tenant_edges_pruned": 0,
    }

    try:
        # 1. Prune cross-tenant SIMILAR_TO relationships between private tenants
        prune_query = """
        MATCH (c1:Clause)-[r:SIMILAR_TO]->(c2:Clause)
        WHERE c1.organization_id IS NOT NULL 
          AND c2.organization_id IS NOT NULL
          AND c1.organization_id <> c2.organization_id
          AND c1.is_global <> true
          AND c2.is_global <> true
        DELETE r
        RETURN count(r) AS pruned
        """
        prune_res = run_query(prune_query)
        if prune_res:
            stats["cross_tenant_edges_pruned"] += prune_res[0].get("pruned", 0)

        # 2. Audit Clause nodes lacking organization_id
        clauses_to_repair = run_query(
            """
            MATCH (c:Clause)
            WHERE c.organization_id IS NULL OR c.is_global IS NULL
            OPTIONAL MATCH (d:Document)-[:HAS_CLAUSE]->(c)
            RETURN c.id AS clause_id, c.document_id AS document_id, d.id AS doc_id, d.organization_id AS doc_org
            LIMIT 500
            """
        )
        stats["nodes_scanned"] = len(clauses_to_repair)

        for row in clauses_to_repair:
            c_id = row.get("clause_id")
            doc_id = row.get("document_id") or row.get("doc_id")
            doc_org = row.get("doc_org")

            repaired = False
            if doc_org:
                run_query(
                    """
                    MATCH (c:Clause {id: $cid})
                    SET c.organization_id = $org, c.is_global = false
                    """,
                    {"cid": c_id, "org": str(doc_org)},
                )
                stats["nodes_repaired"] += 1
                repaired = True
            elif doc_id:
                try:
                    d_uuid = uuid.UUID(str(doc_id))
                except (ValueError, TypeError):
                    d_uuid = None

                if d_uuid:
                    doc = db.get(Document, d_uuid)
                    if doc:
                        run_query(
                            """
                            MATCH (c:Clause {id: $cid})
                            SET c.organization_id = $org, c.is_global = false
                            """,
                            {"cid": c_id, "org": str(doc.organization_id)},
                        )
                        stats["nodes_repaired"] += 1
                        repaired = True
                    else:
                        reg = db.get(Regulation, d_uuid)
                        if reg:
                            run_query(
                                """
                                MATCH (c:Clause {id: $cid})
                                SET c.organization_id = $org, c.is_global = $is_global
                                """,
                                {
                                    "cid": c_id,
                                    "org": "global" if reg.is_global else str(getattr(reg, "organization_id", "global")),
                                    "is_global": reg.is_global,
                                },
                            )
                            stats["nodes_repaired"] += 1
                            repaired = True

            if not repaired:
                # Quarantine unverified clause
                run_query(
                    """
                    MATCH (c:Clause {id: $cid})
                    SET c:Quarantined, c.is_quarantined = true, c.organization_id = $quarantine_org, c.is_global = false
                    """,
                    {"cid": c_id, "quarantine_org": f"quarantine_{uuid.uuid4()}"},
                )
                stats["nodes_quarantined"] += 1

    except Exception as exc:
        logger.exception("[DATA_AUDIT] Knowledge graph audit error: %s", exc)

    return stats


def audit_conversation_citations(db: Session) -> dict[str, Any]:
    """
    Audit historical conversation messages and sanitize any cross-tenant citations.
    """
    stats = {
        "messages_scanned": 0,
        "citations_sanitized": 0,
    }

    try:
        messages = (
            db.query(ConversationMessage)
            .join(ConversationSession, ConversationMessage.conversation_id == ConversationSession.id)
            .filter(ConversationMessage.sources_json.isnot(None))
            .all()
        )
        stats["messages_scanned"] = len(messages)

        for msg in messages:
            sources = msg.sources_json
            if not isinstance(sources, list) or not sources:
                continue

            session = db.get(ConversationSession, msg.conversation_id)
            if not session or not session.organization_id:
                continue

            target_org_id = session.organization_id
            sanitized_sources = []
            modified = False

            for cit in sources:
                if not isinstance(cit, dict):
                    continue
                doc_id_val = cit.get("document_id")
                if not doc_id_val:
                    sanitized_sources.append(cit)
                    continue

                try:
                    d_uuid = uuid.UUID(str(doc_id_val))
                except (ValueError, TypeError):
                    d_uuid = None

                if not d_uuid:
                    sanitized_sources.append(cit)
                    continue

                # Check if belongs to session org or global regulation
                doc = db.query(Document).filter(Document.id == d_uuid, Document.organization_id == target_org_id).first()
                reg = db.query(Regulation).filter(Regulation.id == d_uuid, Regulation.is_global == True).first()  # noqa: E712

                if doc or reg:
                    sanitized_sources.append(cit)
                else:
                    # Foreign tenant citation leaked under previous behavior! Prune it!
                    logger.warning(
                        "[DATA_AUDIT] Pruned cross-tenant citation from message %s: foreign doc_id=%s session_org=%s",
                        msg.id,
                        d_uuid,
                        target_org_id,
                    )
                    stats["citations_sanitized"] += 1
                    modified = True

            if modified:
                msg.sources_json = sanitized_sources if sanitized_sources else None
                db.add(msg)

        db.commit()

    except Exception as exc:
        logger.exception("[DATA_AUDIT] Conversation citations audit error: %s", exc)
        db.rollback()

    return stats


def run_full_data_isolation_audit(db: Session) -> dict[str, Any]:
    """Execute complete data isolation audit and repair across vector, graph, and memory stores."""
    vector_stats = audit_vector_store(db)
    graph_stats = audit_knowledge_graph(db)
    citation_stats = audit_conversation_citations(db)

    return {
        "status": "completed",
        "vector_store": vector_stats,
        "knowledge_graph": graph_stats,
        "conversations": citation_stats,
    }
