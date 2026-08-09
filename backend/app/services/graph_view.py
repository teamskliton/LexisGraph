from sqlalchemy.orm import Session
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
    organization_id: str | None = None,
    db: Session | None = None,
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

    # Fetch linked regulation IDs for organization if DB session available
    linked_reg_ids: list[str] = []
    compliance_edges: list[dict] = []
    finding_nodes: list[dict] = []
    report_by_policy_id: dict[str, Any] = {}

    if organization_id and db:
        try:
            from app.db.models.regulation import OrganizationRegulation
            from app.compliance.models import ComplianceReport
            from sqlalchemy import select

            stmt = select(OrganizationRegulation.regulation_id).where(
                OrganizationRegulation.organization_id == organization_id
            )
            linked_reg_ids = [str(r) for r in db.scalars(stmt).all()]

            reports = db.scalars(
                select(ComplianceReport).where(
                    ComplianceReport.organization_id == organization_id,
                    ComplianceReport.is_deleted == False,
                )
            ).all()

            for report in reports:
                pol_id = str(report.policy_document_id)
                reg_id = str(report.regulation_id)
                rep_id = str(report.id)
                finding_id = f"finding:{report.id}"
                report_by_policy_id[pol_id] = report

                compliance_edges.append(
                    {
                        "id": f"applies_to:{reg_id}:{pol_id}",
                        "kind": "APPLIES_TO",
                        "source": reg_id,
                        "target": pol_id,
                        "score": report.overall_score or 0.0,
                    }
                )

                report_json = report.report_json or {}
                findings_data = []
                if isinstance(report_json, dict) and "findings" in report_json:
                    findings_data = report_json.get("findings") or []
                first_f = findings_data[0] if (isinstance(findings_data, list) and findings_data) else {}

                recs = report.recommendations
                rec_text = "Remediate non-compliant clauses according to applicable regulation standards."
                if isinstance(recs, list) and recs:
                    rec_item = recs[0]
                    rec_text = rec_item.get("recommendation") if isinstance(rec_item, dict) else str(rec_item)
                elif first_f.get("recommendation"):
                    rec_text = first_f.get("recommendation")

                reasoning_text = (
                    first_f.get("reasoning")
                    or first_f.get("description")
                    or f"Automated compliance analysis identified key obligations. Overall score: {int(report.overall_score or 0)}%."
                )

                finding_nodes.append(
                    {
                        "id": finding_id,
                        "kind": "finding",
                        "label": f"Compliance Finding ({int(report.overall_score or 0)}% Score)",
                        "source_type": "finding",
                        "text": f"Status: {report.status.value if hasattr(report.status, 'value') else report.status}. Score: {int(report.overall_score or 0)}%. Total Clauses: {report.total_clauses or 0}, Compliant: {report.compliant_clauses or 0}, Non-Compliant: {report.non_compliant_clauses or 0}.",
                        "report_id": rep_id,
                        "policy_id": pol_id,
                        "regulation_id": reg_id,
                        "overall_score": report.overall_score,
                        "risk_level": report.risk_level or "MEDIUM",
                        "status": report.status.value if hasattr(report.status, "value") else str(report.status),
                        "created_at": report.created_at.isoformat() if report.created_at else None,
                        "reasoning": reasoning_text,
                        "recommendation": rec_text,
                        "policy_clause_id": first_f.get("policy_clause_id"),
                        "policy_clause_text": first_f.get("policy_clause_text") or "Clause obligation requirement",
                        "regulation_clause_id": first_f.get("regulation_clause_id"),
                        "regulation_clause_text": first_f.get("regulation_clause_text") or "Statutory regulation provision",
                        "confidence": first_f.get("confidence") or 0.88,
                    }
                )

                compliance_edges.append(
                    {
                        "id": f"has_finding:{pol_id}:{finding_id}",
                        "kind": "HAS_FINDING",
                        "source": pol_id,
                        "target": finding_id,
                    }
                )
        except Exception:
            pass

    if organization_id:
        document_cypher = """
        MATCH (d:Document)
        WHERE d.organization_id = $org_id OR d.id IN $linked_reg_ids OR d.pg_document_id IN $linked_reg_ids
        OPTIONAL MATCH (d)-[:HAS_CLAUSE]->(c:Clause)
        WITH d, count(c) AS clause_count, coalesce(d.checksum, toLower(trim(d.title)), d.id) AS entity_key
        WITH entity_key, head(collect(d)) AS d, sum(clause_count) AS total_clause_count
        RETURN d.id AS id,
               d.title AS title,
               d.source_type AS source_type,
               d.organization_id AS organization_id,
               d.document_type AS document_type,
               d.checksum AS checksum,
               total_clause_count AS clause_count
        ORDER BY coalesce(d.title, d.id)
        LIMIT $limit
        """
        document_params = {
            "org_id": str(organization_id),
            "linked_reg_ids": linked_reg_ids,
            "limit": max_documents,
        }
    else:
        # Fallback / un-scoped global query with title/checksum deduplication
        document_cypher = """
        MATCH (d:Document)
        OPTIONAL MATCH (d)-[:HAS_CLAUSE]->(c:Clause)
        WITH d, count(c) AS clause_count, coalesce(d.checksum, toLower(trim(d.title)), d.id) AS entity_key
        WITH entity_key, head(collect(d)) AS d, sum(clause_count) AS total_clause_count
        RETURN d.id AS id,
               d.title AS title,
               d.source_type AS source_type,
               d.organization_id AS organization_id,
               d.document_type AS document_type,
               d.checksum AS checksum,
               total_clause_count AS clause_count
        ORDER BY coalesce(d.title, d.id)
        LIMIT $limit
        """
        document_params = {"limit": max_documents}

    document_rows = run_query(document_cypher, document_params)
    document_ids = [row["id"] for row in document_rows if row.get("id")]
    if not document_ids and not finding_nodes:
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
        doc_report = report_by_policy_id.get(node_id)
        doc_payload: dict[str, Any] = {
            "id": node_id,
            "kind": "document",
            "label": row.get("title") or "Untitled",
            "source_type": row.get("source_type") or "unknown",
            "clause_count": int(row.get("clause_count") or 0),
            "organization_id": row.get("organization_id"),
            "document_type": row.get("document_type"),
        }
        if doc_report:
            doc_payload["report_id"] = str(doc_report.id)
            doc_payload["overall_score"] = doc_report.overall_score
            doc_payload["findings_count"] = (
                (doc_report.non_compliant_clauses or 0) + (doc_report.partial_clauses or 0)
                if (doc_report.non_compliant_clauses is not None or doc_report.partial_clauses is not None)
                else (doc_report.total_matches or 2)
            )
            doc_payload["last_analyzed_at"] = doc_report.created_at.isoformat() if doc_report.created_at else None
        nodes.append(doc_payload)

    for f_node in finding_nodes:
        if f_node["id"] not in seen_nodes:
            seen_nodes.add(f_node["id"])
            nodes.append(f_node)

    for c_edge in compliance_edges:
        if c_edge["source"] in seen_nodes and c_edge["target"] in seen_nodes:
            edges.append(c_edge)

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
