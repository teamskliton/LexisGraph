"""Selected-document Neo4j knowledge graph builder.

This graph is deliberately isolated from the legacy Document/Clause graph so a
new selection never removes unrelated Neo4j data.
"""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from typing import Iterable

import numpy as np
from bson import ObjectId
from bson.errors import InvalidId

from app.db.mongo import get_database
from app.db.neo4j import is_neo4j_available, run_query
from app.services.compliance import _PARTIAL_THRESHOLD, _SIMILARITY_THRESHOLD
from app.services.embedding_model import get_embedding_model

TOP_K = 3


def _find_document(collection_name: str, document_id: str) -> dict | None:
    try:
        query = {"_id": ObjectId(document_id)}
    except InvalidId:
        query = {"_id": document_id}
    return get_database()[collection_name].find_one(query)


def _valid_clauses(document: dict) -> list[dict]:
    clauses = []
    for index, clause in enumerate(document.get("clauses") or [], start=1):
        if not isinstance(clause, dict):
            continue
        text = str(clause.get("text") or "").strip()
        if not text:
            continue
        clauses.append({
            "id": str(clause.get("id") or clause.get("clause_id") or f"C{index}"),
            "text": text,
            "type": str(clause.get("type") or "general"),
            "entities": [str(value).strip() for value in clause.get("entities") or [] if str(value).strip()],
            "embedding": clause.get("embedding"),
        })
    return clauses


def _embeddings(clauses: list[dict]) -> np.ndarray:
    missing = [item for item in clauses if not isinstance(item.get("embedding"), list) or not item["embedding"]]
    if missing:
        vectors = get_embedding_model().encode([item["text"] for item in missing])
        for item, vector in zip(missing, vectors):
            item["embedding"] = vector.tolist()
    return np.asarray([item["embedding"] for item in clauses], dtype=float)


def _selection_key(user_document_id: str, domain_document_ids: Iterable[str]) -> str:
    selection = ":".join([user_document_id, *sorted(domain_document_ids)])
    return sha256(selection.encode("utf-8")).hexdigest()[:12]


def _build_id(user_document_id: str, domain_document_ids: Iterable[str]) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"kg-{timestamp}-{_selection_key(user_document_id, domain_document_ids)}"


def _ensure_build_schema() -> None:
    run_query("CREATE CONSTRAINT knowledge_graph_build_id IF NOT EXISTS FOR (b:KnowledgeGraphBuild) REQUIRE b.id IS UNIQUE", write=True)
    run_query("CREATE CONSTRAINT knowledge_graph_node_id IF NOT EXISTS FOR (n:KnowledgeGraphNode) REQUIRE n.id IS UNIQUE", write=True)


def _migrate_legacy_active_marker() -> None:
    legacy = run_query("MATCH (b:KnowledgeGraphBuild {id: 'active'}) RETURN b.build_id AS build_id LIMIT 1")
    if not legacy:
        return
    run_query(
        """
        MATCH (b:KnowledgeGraphBuild {id: 'active'})
        SET b.id = b.build_id,
            b.active = true
        REMOVE b.build_id
        """,
        write=True,
    )


def _set_active_build(build_id: str | None) -> None:
    run_query("MATCH (b:KnowledgeGraphBuild) SET b.active = false", write=True)
    if build_id:
        updated = run_query("MATCH (b:KnowledgeGraphBuild {id: $build_id}) SET b.active = true RETURN b.id AS id", {"build_id": build_id}, write=True)
        if not updated:
            raise ValueError("Knowledge graph build was not found")


def _build_counts(build_id: str) -> dict:
    rows = run_query(
        """
        MATCH (n {kg_build_id: $build_id})
        OPTIONAL MATCH (n)-[r]->()
        RETURN count(DISTINCT n) AS nodes, count(DISTINCT r) AS relationships
        """,
        {"build_id": build_id},
    )
    result = rows[0] if rows else {"nodes": 0, "relationships": 0}
    return {"nodes": int(result["nodes"]), "relationships": int(result["relationships"])}


def list_graph_documents() -> dict:
    def serialize(document: dict) -> dict:
        return {
            "id": str(document["_id"]),
            "title": document.get("title") or "Untitled document",
            "domain": document.get("domain") or "",
            "clause_count": len(document.get("clauses") or []),
        }

    db = get_database()
    users = [serialize(doc) for doc in db["user_documents"].find({}, {"title": 1, "domain": 1, "clauses": 1}).sort("created_at", -1)]
    domains = [serialize(doc) for doc in db["domain_documents"].find({}, {"title": 1, "domain": 1, "clauses": 1}).sort("created_at", -1)]
    return {"user_documents": users, "domain_documents": domains}


def clear_active_knowledge_graph() -> dict:
    """Delete only the active selected-document graph, never legacy data."""
    _ensure_build_schema()
    _migrate_legacy_active_marker()
    active = run_query("MATCH (b:KnowledgeGraphBuild {active: true}) RETURN b.id AS build_id LIMIT 1")
    if not active:
        return {"status": "success", "deleted": False, "nodes": 0, "relationships": 0}
    return delete_knowledge_graph(active[0]["build_id"])


def list_knowledge_graph_history() -> dict:
    _ensure_build_schema()
    _migrate_legacy_active_marker()
    rows = run_query(
        """
        MATCH (b:KnowledgeGraphBuild)
        RETURN b.id AS build_id,
               b.created_at AS created_at,
               coalesce(b.active, false) AS active,
               b.user_document_id AS user_document_id,
               b.user_document_title AS user_document_title,
               b.domain_document_ids AS domain_document_ids,
               b.domain_document_titles AS domain_document_titles,
               b.policy_clause_count AS policy_clause_count,
               b.regulation_clause_count AS regulation_clause_count,
               b.node_count AS node_count,
               b.relationship_count AS relationship_count
        ORDER BY b.created_at DESC
        """
    )
    builds = []
    for row in rows:
        builds.append({
            "build_id": row["build_id"],
            "created_at": row.get("created_at"),
            "active": bool(row.get("active")),
            "user_document": {
                "id": row.get("user_document_id") or "",
                "title": row.get("user_document_title") or "Untitled policy",
            },
            "domain_documents": [
                {"id": document_id, "title": title}
                for document_id, title in zip(row.get("domain_document_ids") or [], row.get("domain_document_titles") or [], strict=False)
            ],
            "policy_clauses": int(row.get("policy_clause_count") or 0),
            "regulation_clauses": int(row.get("regulation_clause_count") or 0),
            "nodes": int(row.get("node_count") or 0),
            "relationships": int(row.get("relationship_count") or 0),
        })
    return {"builds": builds}


def activate_knowledge_graph(build_id: str) -> dict:
    _ensure_build_schema()
    _migrate_legacy_active_marker()
    _set_active_build(build_id)
    return {"status": "success", "build_id": build_id}


def delete_knowledge_graph(build_id: str) -> dict:
    _ensure_build_schema()
    _migrate_legacy_active_marker()
    build_rows = run_query("MATCH (b:KnowledgeGraphBuild {id: $build_id}) RETURN coalesce(b.active, false) AS active", {"build_id": build_id})
    if not build_rows:
        return {"status": "success", "deleted": False, "nodes": 0, "relationships": 0, "build_id": build_id}
    counts = _build_counts(build_id)
    run_query("MATCH (n {kg_build_id: $build_id}) DETACH DELETE n", {"build_id": build_id}, write=True)
    run_query("MATCH (b:KnowledgeGraphBuild {id: $build_id}) DELETE b", {"build_id": build_id}, write=True)
    return {
        "status": "success",
        "deleted": True,
        "build_id": build_id,
        "was_active": bool(build_rows[0].get("active")),
        "nodes": counts["nodes"],
        "relationships": counts["relationships"],
    }


def build_knowledge_graph(user_document_id: str, domain_document_ids: list[str]) -> dict:
    if not is_neo4j_available():
        raise RuntimeError("Neo4j is unavailable")
    domain_document_ids = list(dict.fromkeys(domain_document_ids))
    if not domain_document_ids:
        raise ValueError("Select at least one domain document")

    user_document = _find_document("user_documents", user_document_id)
    if not user_document:
        raise ValueError("Selected user policy document was not found")
    domain_documents = [_find_document("domain_documents", document_id) for document_id in domain_document_ids]
    if any(document is None for document in domain_documents):
        raise ValueError("One or more selected domain documents were not found")

    policy_clauses = _valid_clauses(user_document)
    regulations = [(document, clause) for document in domain_documents if document for clause in _valid_clauses(document)]
    if not policy_clauses:
        raise ValueError("The selected user policy has no usable clauses")
    if not regulations:
        raise ValueError("The selected domain documents have no usable clauses")

    regulation_clauses = [clause for _, clause in regulations]
    policy_vectors = _embeddings(policy_clauses)
    regulation_vectors = _embeddings(regulation_clauses)
    if policy_vectors.shape[1] != regulation_vectors.shape[1]:
        raise ValueError("Selected documents use incompatible embedding dimensions")

    _ensure_build_schema()
    _migrate_legacy_active_marker()
    build_id = _build_id(user_document_id, domain_document_ids)
    created_at = datetime.now(timezone.utc).isoformat()

    user_node_id = f"{build_id}:user:{user_document_id}"
    domain_rows = []
    regulation_rows = []
    policy_rows = []
    entity_rows = []
    entity_edges = []
    for clause in policy_clauses:
        clause_node_id = f"{build_id}:policy:{clause['id']}"
        policy_rows.append({"id": clause_node_id, "source_id": clause["id"], "text": clause["text"], "type": clause["type"]})
        for entity in clause["entities"]:
            entity_id = f"{build_id}:entity:{entity.lower()}"
            entity_rows.append({"id": entity_id, "name": entity})
            entity_edges.append({"clause_id": clause_node_id, "entity_id": entity_id})
    for document in domain_documents:
        domain_node_id = f"{build_id}:domain:{document['_id']}"
        domain_rows.append({"id": domain_node_id, "source_id": str(document["_id"]), "title": document.get("title") or "Untitled domain document", "domain": document.get("domain") or ""})
        for clause in _valid_clauses(document):
            clause_node_id = f"{build_id}:regulation:{document['_id']}:{clause['id']}"
            regulation_rows.append({"id": clause_node_id, "document_id": domain_node_id, "source_id": clause["id"], "text": clause["text"], "type": clause["type"]})
            for entity in clause["entities"]:
                entity_id = f"{build_id}:entity:{entity.lower()}"
                entity_rows.append({"id": entity_id, "name": entity})
                entity_edges.append({"clause_id": clause_node_id, "entity_id": entity_id})

    _set_active_build(None)
    run_query(
        """
        CREATE (b:KnowledgeGraphBuild {
            id: $build_id,
            created_at: $created_at,
            active: true,
            selection_key: $selection_key,
            user_document_id: $user_id,
            user_document_title: $user_title,
            domain_document_ids: $domain_ids,
            domain_document_titles: $domain_titles,
            policy_clause_count: $policy_clause_count,
            regulation_clause_count: $regulation_clause_count
        })
        """,
        {
            "build_id": build_id,
            "created_at": created_at,
            "selection_key": _selection_key(user_document_id, domain_document_ids),
            "user_id": user_document_id,
            "user_title": user_document.get("title") or "Untitled policy",
            "domain_ids": [str(doc["_id"]) for doc in domain_documents],
            "domain_titles": [doc.get("title") or "Untitled domain document" for doc in domain_documents],
            "policy_clause_count": len(policy_rows),
            "regulation_clause_count": len(regulation_rows),
        },
        write=True,
    )
    run_query("MERGE (d:KnowledgeGraphNode:UserDocument {id: $id}) SET d += $props", {"id": user_node_id, "props": {"kg_build_id": build_id, "title": user_document.get("title") or "Untitled policy", "source_id": user_document_id}}, write=True)
    run_query("UNWIND $rows AS row MERGE (d:KnowledgeGraphNode:DomainDocument {id: row.id}) SET d += row SET d.kg_build_id = $build_id", {"rows": domain_rows, "build_id": build_id}, write=True)
    run_query("UNWIND $rows AS row MERGE (c:KnowledgeGraphNode:PolicyClause {id: row.id}) SET c += row SET c.kg_build_id = $build_id", {"rows": policy_rows, "build_id": build_id}, write=True)
    run_query("UNWIND $rows AS row MERGE (c:KnowledgeGraphNode:RegulationClause {id: row.id}) SET c += row SET c.kg_build_id = $build_id", {"rows": regulation_rows, "build_id": build_id}, write=True)
    run_query("UNWIND $rows AS row MERGE (e:KnowledgeGraphNode:Entity {id: row.id}) SET e += row SET e.kg_build_id = $build_id", {"rows": entity_rows, "build_id": build_id}, write=True)
    run_query("MATCH (d:UserDocument {id: $document_id}) UNWIND $clause_ids AS clause_id MATCH (c:PolicyClause {id: clause_id}) MERGE (d)-[:HAS_CLAUSE]->(c)", {"document_id": user_node_id, "clause_ids": [row["id"] for row in policy_rows]}, write=True)
    run_query("UNWIND $rows AS row MATCH (c:RegulationClause {id: row.id}) MATCH (d:DomainDocument {id: row.document_id}) MERGE (c)-[:BELONGS_TO]->(d)", {"rows": regulation_rows}, write=True)
    run_query("UNWIND $rows AS row MATCH (c {id: row.clause_id}) MATCH (e:Entity {id: row.entity_id}) MERGE (c)-[:HAS_ENTITY]->(e)", {"rows": entity_edges}, write=True)

    policy_norms = np.linalg.norm(policy_vectors, axis=1, keepdims=True)
    regulation_norms = np.linalg.norm(regulation_vectors, axis=1, keepdims=True)
    scores = np.matmul(policy_vectors, regulation_vectors.T) / np.maximum(policy_norms * regulation_norms.T, 1e-12)
    relation_rows = []
    for index, policy in enumerate(policy_rows):
        top_indices = np.argsort(scores[index])[::-1][: min(TOP_K, len(regulation_rows))]
        for rank, regulation_index in enumerate(top_indices):
            score = float(scores[index][regulation_index])
            kind = "MATCH" if score >= _SIMILARITY_THRESHOLD else "PARTIAL_MATCH" if score >= _PARTIAL_THRESHOLD else "MISSING"
            relation_rows.append({"policy_id": policy["id"], "regulation_id": regulation_rows[int(regulation_index)]["id"], "kind": kind, "score": round(score, 4), "confidence": round(score, 4), "rank": int(rank + 1)})
    for kind in ("MATCH", "PARTIAL_MATCH", "MISSING"):
        rows = [row for row in relation_rows if row["kind"] == kind]
        if rows:
            run_query(f"UNWIND $rows AS row MATCH (p:PolicyClause {{id: row.policy_id}}) MATCH (r:RegulationClause {{id: row.regulation_id}}) MERGE (p)-[edge:{kind}]->(r) SET edge.score = row.score, edge.confidence = row.confidence, edge.rank = row.rank", {"rows": rows}, write=True)

    counts = _build_counts(build_id)
    run_query(
        """
        MATCH (b:KnowledgeGraphBuild {id: $build_id})
        SET b.node_count = $node_count,
            b.relationship_count = $relationship_count
        """,
        {"build_id": build_id, "node_count": counts["nodes"], "relationship_count": counts["relationships"]},
        write=True,
    )
    return {
        "status": "success",
        "nodes": counts["nodes"],
        "relationships": counts["relationships"],
        "metadata": {
            "build_id": build_id,
            "created_at": created_at,
            "user_document": {"id": user_document_id, "title": user_document.get("title") or "Untitled policy"},
            "domain_documents": [{"id": str(doc["_id"]), "title": doc.get("title") or "Untitled domain document"} for doc in domain_documents],
            "policy_clauses": len(policy_rows),
            "regulation_clauses": len(regulation_rows),
            "top_k": TOP_K,
        },
    }
