from app.db.neo4j import is_neo4j_available, run_query

_DEFAULT_DOCUMENT_LIMIT = 12
_DEFAULT_CLAUSE_LIMIT = 120
_DEFAULT_SIMILARITY_EDGE_LIMIT = 180


def get_graph_snapshot(
    max_documents: int = _DEFAULT_DOCUMENT_LIMIT,
    max_clauses: int = _DEFAULT_CLAUSE_LIMIT,
    max_similarity_edges: int = _DEFAULT_SIMILARITY_EDGE_LIMIT,
    knowledge_graph_only: bool = False,
    build_id: str | None = None,
) -> dict:
    if not is_neo4j_available():
        return {
            "status": "unavailable",
            "nodes": [],
            "edges": [],
            "meta": {
                "documents": 0,
                "clauses": 0,
                "has_clause_edges": 0,
                "similarity_edges": 0,
            },
        }

    if build_id:
        selected_build = run_query(
            """
            MATCH (b:KnowledgeGraphBuild {id: $build_id})
            RETURN b.id AS build_id,
                   b.created_at AS created_at,
                   b.user_document_id AS user_document_id,
                   b.user_document_title AS user_document_title,
                   b.domain_document_ids AS domain_document_ids,
                   b.domain_document_titles AS domain_document_titles,
                   coalesce(b.active, false) AS active
            LIMIT 1
            """,
            {"build_id": build_id},
        )
        if selected_build:
            return _get_knowledge_graph_snapshot(selected_build[0])
    active_build = run_query(
        """
        MATCH (b:KnowledgeGraphBuild {active: true})
        RETURN b.id AS build_id,
               b.created_at AS created_at,
               b.user_document_id AS user_document_id,
               b.user_document_title AS user_document_title,
               b.domain_document_ids AS domain_document_ids,
               b.domain_document_titles AS domain_document_titles,
               coalesce(b.active, false) AS active
        ORDER BY b.created_at DESC
        LIMIT 1
        """
    )
    if active_build:
        return _get_knowledge_graph_snapshot(active_build[0])
    if knowledge_graph_only:
        return {
            "status": "ok",
            "nodes": [],
            "edges": [],
            "metadata": {"nodes": 0, "relationships": 0, "build_id": None, "active": False},
        }

    document_rows = run_query(
        """
        MATCH (d:Document)
        OPTIONAL MATCH (d)-[:HAS_CLAUSE]->(c:Clause)
        RETURN d.id AS id,
               d.title AS title,
               d.source_type AS source_type,
               count(c) AS clause_count
        ORDER BY coalesce(d.title, d.id)
        LIMIT $limit
        """,
        {"limit": max_documents},
    )
    document_ids = [row["id"] for row in document_rows if row.get("id")]
    if not document_ids:
        return {
            "status": "ok",
            "nodes": [],
            "edges": [],
            "meta": {
                "documents": 0,
                "clauses": 0,
                "has_clause_edges": 0,
                "similarity_edges": 0,
            },
        }

    clause_rows = run_query(
        """
        MATCH (d:Document)-[:HAS_CLAUSE]->(c:Clause)
        WHERE d.id IN $document_ids
        RETURN d.id AS document_id,
               c.id AS clause_id,
               c.text AS clause_text,
               c.source_type AS source_type,
               c.type AS clause_type
        ORDER BY document_id, clause_id
        LIMIT $limit
        """,
        {"document_ids": document_ids, "limit": max_clauses},
    )

    clause_ids = [row["clause_id"] for row in clause_rows if row.get("clause_id")]
    similarity_rows = []
    if clause_ids:
        similarity_rows = run_query(
            """
            MATCH (c1:Clause)-[r:SIMILAR_TO]->(c2:Clause)
            WHERE c1.id IN $clause_ids AND c2.id IN $clause_ids
            RETURN c1.id AS source_id,
                   c2.id AS target_id,
                   r.score AS score
            ORDER BY r.score DESC
            LIMIT $limit
            """,
            {"clause_ids": clause_ids, "limit": max_similarity_edges},
        )

    nodes: list[dict] = []
    edges: list[dict] = []
    seen_nodes: set[str] = set()

    for row in document_rows:
        node_id = str(row.get("id") or "")
        if not node_id or node_id in seen_nodes:
            continue
        seen_nodes.add(node_id)
        nodes.append(
            {
                "id": node_id,
                "kind": "document",
                "label": row.get("title") or "Untitled",
                "source_type": row.get("source_type") or "unknown",
                "clause_count": int(row.get("clause_count") or 0),
            }
        )

    for row in clause_rows:
        clause_id = str(row.get("clause_id") or "")
        document_id = str(row.get("document_id") or "")
        if not clause_id or not document_id:
            continue
        if clause_id not in seen_nodes:
            seen_nodes.add(clause_id)
            nodes.append(
                {
                    "id": clause_id,
                    "kind": "clause",
                    "label": row.get("clause_text") or "",
                    "source_type": row.get("source_type") or "unknown",
                    "clause_type": row.get("clause_type") or "general",
                }
            )
        edges.append(
            {
                "id": f"has_clause:{document_id}:{clause_id}",
                "kind": "HAS_CLAUSE",
                "source": document_id,
                "target": clause_id,
            }
        )

    for row in similarity_rows:
        source_id = str(row.get("source_id") or "")
        target_id = str(row.get("target_id") or "")
        if not source_id or not target_id:
            continue
        edges.append(
            {
                "id": f"similar_to:{source_id}:{target_id}",
                "kind": "SIMILAR_TO",
                "source": source_id,
                "target": target_id,
                "score": float(row.get("score") or 0.0),
            }
        )

    return {
        "status": "ok",
        "nodes": nodes,
        "edges": edges,
        "meta": {
            "documents": len(document_rows),
            "clauses": len({row.get('clause_id') for row in clause_rows if row.get('clause_id')}),
            "has_clause_edges": len(clause_rows),
            "similarity_edges": len(similarity_rows),
        },
    }


def _get_knowledge_graph_snapshot(build: dict) -> dict:
    build_id = build["build_id"]
    rows = run_query("MATCH (n {kg_build_id: $build_id}) RETURN n.id AS id, labels(n) AS labels, coalesce(n.title, n.text, n.name, 'Untitled') AS label, n.source_id AS source_id, n.type AS clause_type", {"build_id": build_id})
    edge_rows = run_query("MATCH (a {kg_build_id: $build_id})-[r]->(b {kg_build_id: $build_id}) RETURN a.id AS source, b.id AS target, type(r) AS kind, r.score AS score, r.confidence AS confidence", {"build_id": build_id})
    nodes = []
    for row in rows:
        labels = set(row.get("labels") or [])
        kind = next((label for label in ("UserDocument", "PolicyClause", "DomainDocument", "RegulationClause", "Entity") if label in labels), "Entity")
        nodes.append({"id": row["id"], "kind": kind, "label": row.get("label") or "Untitled", "source_id": row.get("source_id") or "", "clause_type": row.get("clause_type") or ""})
    edges = [{"id": f"{row['kind']}:{row['source']}:{row['target']}", "source": row["source"], "target": row["target"], "kind": row["kind"], "score": float(row.get("score") or 0), "confidence": float(row.get("confidence") or 0)} for row in edge_rows]
    return {
        "status": "ok",
        "nodes": nodes,
        "edges": edges,
        "metadata": {
            "build_id": build_id,
            "created_at": build.get("created_at"),
            "active": bool(build.get("active")),
            "user_document_id": build.get("user_document_id"),
            "user_document_title": build.get("user_document_title"),
            "domain_document_ids": build.get("domain_document_ids") or [],
            "domain_document_titles": build.get("domain_document_titles") or [],
            "nodes": len(nodes),
            "relationships": len(edges),
        },
    }
