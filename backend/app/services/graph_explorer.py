from __future__ import annotations

from statistics import mean

from app.db.neo4j import is_neo4j_available, run_query

_POLICY_CLAUSE_LIMIT = 30
_REGULATION_MATCH_LIMIT = 3
_ENTITY_LIMIT = 5


def _ensure_available() -> None:
    if not is_neo4j_available():
        raise RuntimeError("Neo4j is unavailable")


def _resolve_build(build_id: str | None = None) -> dict:
    _ensure_available()
    if build_id:
        rows = run_query(
            """
            MATCH (b:KnowledgeGraphBuild {id: $build_id})
            RETURN b.id AS build_id,
                   b.created_at AS created_at,
                   coalesce(b.active, false) AS active,
                   b.user_document_id AS user_document_id,
                   b.user_document_title AS user_document_title,
                   b.domain_document_ids AS domain_document_ids,
                   b.domain_document_titles AS domain_document_titles,
                   b.node_count AS node_count,
                   b.relationship_count AS relationship_count,
                   b.policy_clause_count AS policy_clause_count,
                   b.regulation_clause_count AS regulation_clause_count
            LIMIT 1
            """,
            {"build_id": build_id},
        )
    else:
        rows = run_query(
            """
            MATCH (b:KnowledgeGraphBuild {active: true})
            RETURN b.id AS build_id,
                   b.created_at AS created_at,
                   coalesce(b.active, false) AS active,
                   b.user_document_id AS user_document_id,
                   b.user_document_title AS user_document_title,
                   b.domain_document_ids AS domain_document_ids,
                   b.domain_document_titles AS domain_document_titles,
                   b.node_count AS node_count,
                   b.relationship_count AS relationship_count,
                   b.policy_clause_count AS policy_clause_count,
                   b.regulation_clause_count AS regulation_clause_count
            ORDER BY b.created_at DESC
            LIMIT 1
            """
        )
    if not rows:
        raise ValueError("No knowledge graph build was found")
    return rows[0]


def _summary(build_id: str) -> dict:
    counts = run_query(
        """
        MATCH (n {kg_build_id: $build_id})
        RETURN
          count(n) AS total_nodes,
          count(CASE WHEN n:PolicyClause THEN 1 END) AS policy_clauses,
          count(CASE WHEN n:RegulationClause THEN 1 END) AS regulation_clauses,
          count(CASE WHEN n:DomainDocument THEN 1 END) AS domain_documents,
          count(CASE WHEN n:Entity THEN 1 END) AS entities,
          count(CASE WHEN n:UserDocument THEN 1 END) AS user_documents
        """,
        {"build_id": build_id},
    )
    relationships = run_query(
        """
        MATCH (:KnowledgeGraphNode {kg_build_id: $build_id})-[r]->(:KnowledgeGraphNode {kg_build_id: $build_id})
        RETURN count(r) AS total_relationships,
               count(CASE WHEN type(r) = 'MATCH' THEN 1 END) AS matches,
               count(CASE WHEN type(r) = 'PARTIAL_MATCH' THEN 1 END) AS partial_matches,
               count(CASE WHEN type(r) = 'MISSING' THEN 1 END) AS missing
        """,
        {"build_id": build_id},
    )
    count_row = counts[0] if counts else {}
    rel_row = relationships[0] if relationships else {}
    return {
        "total_nodes": int(count_row.get("total_nodes") or 0),
        "total_relationships": int(rel_row.get("total_relationships") or 0),
        "policy_clauses": int(count_row.get("policy_clauses") or 0),
        "regulation_clauses": int(count_row.get("regulation_clauses") or 0),
        "domain_documents": int(count_row.get("domain_documents") or 0),
        "entities": int(count_row.get("entities") or 0),
        "user_documents": int(count_row.get("user_documents") or 0),
        "matches": int(rel_row.get("matches") or 0),
        "partial_matches": int(rel_row.get("partial_matches") or 0),
        "missing": int(rel_row.get("missing") or 0),
    }


def _build_metadata(build: dict) -> dict:
    domain_ids = build.get("domain_document_ids") or []
    domain_titles = build.get("domain_document_titles") or []
    return {
        "build_id": build["build_id"],
        "created_at": build.get("created_at"),
        "active": bool(build.get("active")),
        "user_document": {
            "id": build.get("user_document_id") or "",
            "title": build.get("user_document_title") or "Untitled policy",
        },
        "domain_documents": [
            {"id": document_id, "title": title}
            for document_id, title in zip(domain_ids, domain_titles, strict=False)
        ],
        "graph_summary": _summary(build["build_id"]),
        "limits": {
            "policy_clauses": _POLICY_CLAUSE_LIMIT,
            "regulation_matches_per_clause": _REGULATION_MATCH_LIMIT,
            "entities": _ENTITY_LIMIT,
        },
    }


def _node_payload(row: dict) -> dict:
    return {
        "id": row["id"],
        "kind": row["kind"],
        "label": row.get("label") or "Untitled",
        "short_label": row.get("short_label") or row.get("label") or "Untitled",
        "source_id": row.get("source_id") or "",
        "text": row.get("text") or "",
        "clause_type": row.get("clause_type") or "",
        "document_title": row.get("document_title") or "",
        "domain": row.get("domain") or "",
    }


def _edge_payload(row: dict) -> dict:
    return {
        "id": row["id"],
        "kind": row["kind"],
        "source": row["source"],
        "target": row["target"],
        "score": float(row.get("score") or 0),
        "confidence": float(row.get("confidence") or 0),
        "rank": int(row.get("rank") or 0),
    }


def get_graph_root(build_id: str | None = None) -> dict:
    build = _resolve_build(build_id)
    build_id = build["build_id"]
    rows = run_query(
        """
        MATCH (u:UserDocument {kg_build_id: $build_id})
        RETURN u.id AS id,
               'UserDocument' AS kind,
               coalesce(u.title, 'Untitled policy') AS label,
               coalesce(u.title, 'Untitled policy') AS short_label,
               u.source_id AS source_id,
               '' AS text,
               '' AS clause_type,
               '' AS document_title,
               '' AS domain
        UNION ALL
        MATCH (d:DomainDocument {kg_build_id: $build_id})
        RETURN d.id AS id,
               'DomainDocument' AS kind,
               coalesce(d.title, 'Untitled domain document') AS label,
               coalesce(d.title, 'Untitled domain document') AS short_label,
               d.source_id AS source_id,
               '' AS text,
               '' AS clause_type,
               coalesce(d.title, 'Untitled domain document') AS document_title,
               coalesce(d.domain, '') AS domain
        ORDER BY kind, label
        """,
        {"build_id": build_id},
    )
    return {
        "status": "ok",
        "nodes": [_node_payload(row) for row in rows],
        "edges": [],
        "metadata": _build_metadata(build),
    }


def get_document_view(document_id: str, build_id: str | None = None, limit: int = _POLICY_CLAUSE_LIMIT) -> dict:
    build = _resolve_build(build_id)
    build_id = build["build_id"]
    rows = run_query(
        """
        MATCH (u:UserDocument {id: $document_id, kg_build_id: $build_id})-[:HAS_CLAUSE]->(c:PolicyClause)
        RETURN u.id AS document_id,
               c.id AS id,
               'PolicyClause' AS kind,
               coalesce(c.text, 'Untitled clause') AS label,
               coalesce(c.source_id, 'P') AS short_label,
               c.source_id AS source_id,
               coalesce(c.text, '') AS text,
               coalesce(c.type, '') AS clause_type,
               '' AS document_title,
               '' AS domain
        ORDER BY coalesce(c.source_id, c.id)
        LIMIT $limit
        """,
        {"build_id": build_id, "document_id": document_id, "limit": limit},
    )
    nodes = [_node_payload(row) for row in rows]
    edges = [
        {
            "id": f"has_clause:{row['document_id']}:{row['id']}",
            "kind": "HAS_CLAUSE",
            "source": row["document_id"],
            "target": row["id"],
        }
        for row in rows
    ]
    return {"status": "ok", "nodes": nodes, "edges": edges, "metadata": _build_metadata(build)}


def get_clause_view(clause_id: str, build_id: str | None = None, limit: int = _REGULATION_MATCH_LIMIT) -> dict:
    build = _resolve_build(build_id)
    build_id = build["build_id"]
    clause_rows = run_query(
        """
        MATCH (p:PolicyClause {id: $clause_id, kg_build_id: $build_id})
        RETURN p.id AS id,
               coalesce(p.source_id, p.id) AS source_id,
               coalesce(p.text, '') AS text,
               coalesce(p.type, '') AS clause_type
        LIMIT 1
        """,
        {"build_id": build_id, "clause_id": clause_id},
    )
    if not clause_rows:
        raise ValueError("Policy clause was not found")
    clause = clause_rows[0]
    rows = run_query(
        """
        MATCH (p:PolicyClause {id: $clause_id, kg_build_id: $build_id})-[rel:MATCH|PARTIAL_MATCH|MISSING]->(r:RegulationClause)
        OPTIONAL MATCH (r)-[:BELONGS_TO]->(d:DomainDocument)
        RETURN r.id AS regulation_id,
               'RegulationClause' AS kind,
               coalesce(r.text, 'Untitled regulation clause') AS label,
               coalesce(r.source_id, r.id) AS short_label,
               r.source_id AS source_id,
               coalesce(r.text, '') AS text,
               coalesce(r.type, '') AS clause_type,
               coalesce(d.title, '') AS document_title,
               coalesce(d.domain, '') AS domain,
               type(rel) AS relation_kind,
               rel.score AS score,
               rel.confidence AS confidence,
               rel.rank AS rank,
               d.id AS domain_id
        ORDER BY coalesce(rel.rank, 999), coalesce(rel.score, 0) DESC
        LIMIT $limit
        """,
        {"build_id": build_id, "clause_id": clause_id, "limit": limit},
    )
    nodes = []
    edges = []
    best = None
    for row in rows:
        nodes.append(
            _node_payload(
                {
                    "id": row["regulation_id"],
                    "kind": "RegulationClause",
                    "label": row.get("label"),
                    "short_label": row.get("short_label"),
                    "source_id": row.get("source_id"),
                    "text": row.get("text"),
                    "clause_type": row.get("clause_type"),
                    "document_title": row.get("document_title"),
                    "domain": row.get("domain"),
                }
            )
        )
        edges.append(
            _edge_payload(
                {
                    "id": f"{row['relation_kind']}:{clause_id}:{row['regulation_id']}",
                    "kind": row["relation_kind"],
                    "source": clause_id,
                    "target": row["regulation_id"],
                    "score": row.get("score"),
                    "confidence": row.get("confidence"),
                    "rank": row.get("rank"),
                }
            )
        )
        if row.get("domain_id"):
            edges.append(
                {
                    "id": f"belongs_to:{row['regulation_id']}:{row['domain_id']}",
                    "kind": "BELONGS_TO",
                    "source": row["regulation_id"],
                    "target": row["domain_id"],
                }
            )
        if best is None or (row.get("rank") or 99) < (best.get("rank") or 99):
            best = row
    best_match = None
    if best:
        best_match = {
            "regulation_clause_id": best["regulation_id"],
            "label": best.get("label") or "Untitled regulation clause",
            "document_title": best.get("document_title") or "Domain document",
            "score": float(best.get("score") or 0),
            "status": best.get("relation_kind") or "MATCH",
            "regulation_text": best.get("text") or "",
            "reasoning": _reasoning_text(best.get("relation_kind") or "MATCH", best.get("score") or 0),
            "recommendation": _recommendation_text(best.get("relation_kind") or "MATCH", clause.get("text") or ""),
        }
    return {
        "status": "ok",
        "nodes": nodes,
        "edges": edges,
        "details": {
            "clause_id": clause["id"],
            "source_id": clause.get("source_id") or clause["id"],
            "clause_text": clause.get("text") or "",
            "clause_type": clause.get("clause_type") or "",
            "best_match": best_match,
        },
        "metadata": _build_metadata(build),
    }


def get_regulation_view(regulation_id: str, build_id: str | None = None, limit: int = _ENTITY_LIMIT) -> dict:
    build = _resolve_build(build_id)
    build_id = build["build_id"]
    regulation_rows = run_query(
        """
        MATCH (r:RegulationClause {id: $regulation_id, kg_build_id: $build_id})
        OPTIONAL MATCH (r)-[:BELONGS_TO]->(d:DomainDocument)
        RETURN r.id AS regulation_id,
               coalesce(r.source_id, r.id) AS source_id,
               coalesce(r.text, '') AS text,
               coalesce(r.type, '') AS clause_type,
               coalesce(d.title, '') AS document_title,
               d.id AS domain_id
        LIMIT 1
        """,
        {"build_id": build_id, "regulation_id": regulation_id},
    )
    if not regulation_rows:
        raise ValueError("Regulation clause was not found")
    regulation = regulation_rows[0]
    entity_rows = run_query(
        """
        MATCH (r:RegulationClause {id: $regulation_id, kg_build_id: $build_id})-[:HAS_ENTITY]->(e:Entity)
        RETURN e.id AS id,
               'Entity' AS kind,
               coalesce(e.name, 'Entity') AS label,
               coalesce(e.name, 'Entity') AS short_label,
               '' AS source_id,
               '' AS text,
               '' AS clause_type,
               '' AS document_title,
               '' AS domain
        ORDER BY coalesce(e.name, e.id)
        LIMIT $limit
        """,
        {"build_id": build_id, "regulation_id": regulation_id, "limit": limit},
    )
    nodes = [_node_payload(row) for row in entity_rows]
    edges = [
        {
            "id": f"has_entity:{regulation_id}:{row['id']}",
            "kind": "HAS_ENTITY",
            "source": regulation_id,
            "target": row["id"],
        }
        for row in entity_rows
    ]
    return {
        "status": "ok",
        "nodes": nodes,
        "edges": edges,
        "details": {
            "regulation_clause_id": regulation["regulation_id"],
            "source_id": regulation.get("source_id") or regulation["regulation_id"],
            "regulation_text": regulation.get("text") or "",
            "document_title": regulation.get("document_title") or "",
            "domain_id": regulation.get("domain_id") or "",
        },
        "metadata": _build_metadata(build),
    }


def _reasoning_text(status: str, score: float) -> str:
    if status == "MATCH":
        return f"The clause strongly aligns with the regulatory requirement based on semantic similarity and graph evidence. Score: {float(score):.2f}."
    if status == "PARTIAL_MATCH":
        return f"The clause covers part of the regulatory requirement, but the wording or scope appears incomplete. Score: {float(score):.2f}."
    return f"The clause does not sufficiently cover the linked regulatory requirement in the current graph evidence. Score: {float(score):.2f}."


def _recommendation_text(status: str, clause_text: str) -> str:
    if status == "MATCH":
        return "Keep this clause as supporting evidence and review it only if the mapped regulation changes."
    if status == "PARTIAL_MATCH":
        return "Refine this policy clause with more specific scope, conditions, or retention obligations so it fully mirrors the regulatory text."
    if clause_text:
        return "Add a new policy clause or rewrite the current one so the missing regulatory requirement is explicitly addressed."
    return "Add or revise policy language to cover the missing regulatory requirement explicitly."


def derive_sidebar_positions(nodes: list[dict], edges: list[dict], kind: str) -> list[float]:
    targets: dict[str, list[float]] = {}
    for edge in edges:
        if edge["kind"] != kind:
            continue
        targets.setdefault(edge["target"], []).append(float(edge.get("anchor_y") or 0))
    return [mean(values) for values in targets.values() if values]
