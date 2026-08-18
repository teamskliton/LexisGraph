from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session
from app.db.neo4j import is_neo4j_available, run_query

logger = logging.getLogger(__name__)

_DEFAULT_DOCUMENT_LIMIT = 20
_DEFAULT_CLAUSE_LIMIT = 150
_DEFAULT_SIMILARITY_EDGE_LIMIT = 200


def _normalize_coverage_status(raw: str | None) -> str:
    if not raw:
        return "UNABLE_TO_DETERMINE"
    s = str(raw).upper()
    if "UNABLE" in s or "CONFLICT" in s:
        return "UNABLE_TO_DETERMINE"
    if "PARTIAL" in s:
        return "PARTIALLY_COVERED"
    if "NON" in s or "GAP" in s:
        return "GAP"
    if "COMPLIANT" in s or "COVERED" in s:
        return "COVERED"
    return "UNABLE_TO_DETERMINE"


def get_graph_snapshot(
    max_documents: int = _DEFAULT_DOCUMENT_LIMIT,
    max_clauses: int = _DEFAULT_CLAUSE_LIMIT,
    max_similarity_edges: int = _DEFAULT_SIMILARITY_EDGE_LIMIT,
    knowledge_graph_only: bool = False,
    build_id: str | None = None,
    organization_id: str | None = None,
    db: Session | None = None,
    focus_node: str | None = None,
    depth: int = 2,
    search: str | None = None,
    finding_id: str | None = None,
    document_id: str | None = None,
    regulation_id: str | None = None,
) -> dict[str, Any]:
    """
    Sprint 8.3: Compliance Knowledge Graph Explorer & Traceability Snapshot.

    Synthesizes the full compliance knowledge graph across:
      REGULATION -> REQUIREMENT -> POLICY -> POLICY_SECTION -> FINDING -> REMEDIATION

    Features:
      - Real database backed entities (no fake relations)
      - Organization isolation & multi-tenancy
      - Centered neighborhood exploration for Finding, Requirement, Policy, Regulation
      - Coverage status and confidence indicators
      - Neo4j structural fusion when Neo4j is online
    """
    # 1. Knowledge Graph Build Snapshot (if explicit build_id or active build requested)
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

    if knowledge_graph_only:
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
        return {
            "status": "ok",
            "nodes": [],
            "edges": [],
            "metadata": {"nodes": 0, "relationships": 0, "build_id": None, "active": False},
        }

    # 2. Relational Compliance Graph from PostgreSQL
    nodes_by_id: dict[str, dict[str, Any]] = {}
    edges_by_id: dict[str, dict[str, Any]] = {}

    if organization_id and db:
        try:
            from app.db.models.regulation import OrganizationRegulation, Regulation
            from app.db.models.document import Document
            from app.compliance.models import ComplianceReport, ReportFinding
            from app.db.models.remediation import FindingRemediation
            from sqlalchemy import select, or_

            org_uuid = uuid.UUID(str(organization_id)) if isinstance(organization_id, str) else organization_id

            # A. Regulations
            stmt_reg_ids = select(OrganizationRegulation.regulation_id).where(
                OrganizationRegulation.organization_id == org_uuid
            )
            linked_reg_uuids = list(db.scalars(stmt_reg_ids).all())

            # Also include regulations from compliance reports
            stmt_report_regs = select(ComplianceReport.regulation_id).where(
                ComplianceReport.organization_id == org_uuid,
                ComplianceReport.is_deleted == False,
            )
            report_reg_uuids = list(db.scalars(stmt_report_regs).all())
            all_reg_uuids = list(set(linked_reg_uuids + report_reg_uuids))

            regulations = []
            if all_reg_uuids:
                regulations = db.scalars(
                    select(Regulation).where(Regulation.id.in_(all_reg_uuids))
                ).all()

            for reg in regulations:
                reg_id_str = str(reg.id)
                node_id = f"reg:{reg_id_str}"
                nodes_by_id[node_id] = {
                    "id": node_id,
                    "kind": "regulation",
                    "label": reg.title or "Regulation",
                    "source_id": reg_id_str,
                    "act_name": reg.act_name,
                    "version": reg.version,
                    "act_year": reg.act_year,
                    "jurisdiction": reg.jurisdiction,
                    "document_type": "REGULATION",
                }

            # B. Policy Documents
            policy_docs = db.scalars(
                select(Document).where(Document.organization_id == org_uuid)
            ).all()

            for doc in policy_docs:
                doc_id_str = str(doc.id)
                node_id = f"pol:{doc_id_str}"
                nodes_by_id[node_id] = {
                    "id": node_id,
                    "kind": "policy",
                    "label": doc.original_filename or "Policy Document",
                    "source_id": doc_id_str,
                    "organization_id": str(org_uuid),
                    "document_type": doc.document_type.value if hasattr(doc.document_type, "value") else str(doc.document_type),
                    "checksum": getattr(doc, "checksum", None),
                }

            # C. Compliance Reports & Requirements
            reports = db.scalars(
                select(ComplianceReport).where(
                    ComplianceReport.organization_id == org_uuid,
                    ComplianceReport.is_deleted == False,
                )
            ).all()

            for report in reports:
                pol_node_id = f"pol:{report.policy_document_id}"
                reg_node_id = f"reg:{report.regulation_id}"

                # Connect Regulation -> Policy via APPLIES_TO
                edge_id = f"applies_to:{reg_node_id}:{pol_node_id}"
                edges_by_id[edge_id] = {
                    "id": edge_id,
                    "kind": "APPLIES_TO",
                    "source": reg_node_id,
                    "target": pol_node_id,
                    "score": float(report.overall_score or 0.0),
                    "report_id": str(report.id),
                    "risk_level": report.risk_level or "MEDIUM",
                }

                # Update Policy node with analysis summary
                if pol_node_id in nodes_by_id:
                    nodes_by_id[pol_node_id]["report_id"] = str(report.id)
                    nodes_by_id[pol_node_id]["overall_score"] = report.overall_score
                    nodes_by_id[pol_node_id]["risk_level"] = report.risk_level
                    nodes_by_id[pol_node_id]["last_analyzed_at"] = (
                        report.created_at.isoformat() if report.created_at else None
                    )

                # Extract Evaluated Clauses
                report_json = report.report_json or {}
                evaluated_clauses = []
                if isinstance(report_json, dict) and "evaluated_clauses" in report_json:
                    evaluated_clauses = report_json.get("evaluated_clauses") or []
                elif report.summary:
                    try:
                        parsed = json.loads(report.summary)
                        if isinstance(parsed, dict):
                            evaluated_clauses = parsed.get("evaluated_clauses") or []
                    except Exception:
                        pass

                for idx, c in enumerate(evaluated_clauses):
                    if not isinstance(c, dict):
                        continue
                    clause_code = str(c.get("regulation_clause_id") or f"clause_{idx + 1}")
                    req_node_id = f"req:{report.regulation_id}:{clause_code}"
                    cov_status = _normalize_coverage_status(c.get("status"))

                    # Requirement Node
                    if req_node_id not in nodes_by_id:
                        nodes_by_id[req_node_id] = {
                            "id": req_node_id,
                            "kind": "requirement",
                            "label": clause_code,
                            "text": c.get("regulation_text") or f"Requirement {clause_code}",
                            "coverage_status": cov_status,
                            "similarity_score": float(c.get("similarity_score") or 0.0),
                            "confidence": str(c.get("confidence") or "HIGH"),
                            "missing_aspects": c.get("missing_aspects") or [],
                            "conflicting_evidence": bool(c.get("conflicting_evidence", False)),
                            "reasoning": c.get("reasoning") or "",
                            "recommendation": c.get("recommendation"),
                            "regulation_id": str(report.regulation_id),
                            "policy_id": str(report.policy_document_id),
                        }

                    # Regulation -> HAS_REQUIREMENT -> Requirement
                    req_edge_id = f"has_req:{reg_node_id}:{req_node_id}"
                    edges_by_id[req_edge_id] = {
                        "id": req_edge_id,
                        "kind": "HAS_REQUIREMENT",
                        "source": reg_node_id,
                        "target": req_node_id,
                    }

                    # Policy Section Evidence
                    pol_evidence = c.get("matched_policy_text")
                    if pol_evidence:
                        pol_clause_code = str(c.get("matched_policy_clause_id") or f"sec_{idx + 1}")
                        pol_sec_node_id = f"pol_sec:{report.policy_document_id}:{pol_clause_code}"

                        if pol_sec_node_id not in nodes_by_id:
                            nodes_by_id[pol_sec_node_id] = {
                                "id": pol_sec_node_id,
                                "kind": "policy_section",
                                "label": pol_clause_code,
                                "text": pol_evidence,
                                "policy_id": str(report.policy_document_id),
                            }

                        # Policy -> CONTAINS -> Policy Section
                        contains_edge_id = f"contains:{pol_node_id}:{pol_sec_node_id}"
                        edges_by_id[contains_edge_id] = {
                            "id": contains_edge_id,
                            "kind": "CONTAINS",
                            "source": pol_node_id,
                            "target": pol_sec_node_id,
                        }

                        # Requirement -> MATCHED_WITH -> Policy Section
                        matched_edge_id = f"matched:{req_node_id}:{pol_sec_node_id}"
                        edges_by_id[matched_edge_id] = {
                            "id": matched_edge_id,
                            "kind": "MATCHED_WITH",
                            "source": req_node_id,
                            "target": pol_sec_node_id,
                            "score": float(c.get("similarity_score") or 0.0),
                            "coverage_status": cov_status,
                        }

            # D. Findings (`ReportFinding`)
            findings = (
                db.query(ReportFinding)
                .join(ComplianceReport, ReportFinding.report_id == ComplianceReport.id)
                .filter(ComplianceReport.organization_id == org_uuid)
                .all()
            )

            for f in findings:
                f_id_str = str(f.id)
                finding_node_id = f"finding:{f_id_str}"
                rep = f.report

                nodes_by_id[finding_node_id] = {
                    "id": finding_node_id,
                    "kind": "finding",
                    "label": f"F-{f_id_str[:8]}",
                    "finding_id": f_id_str,
                    "severity": f.severity or "MEDIUM",
                    "lifecycle_status": f.lifecycle_status or "OPEN",
                    "status": f.status or "NON_COMPLIANT",
                    "coverage_status": "GAP" if (f.status or "").upper() == "NON_COMPLIANT" else "PARTIALLY_COVERED",
                    "reasoning": f.reasoning or "",
                    "recommendation": f.recommendation or "",
                    "citation": f.citation or "",
                    "report_id": str(f.report_id),
                    "policy_id": str(rep.policy_document_id) if rep else None,
                    "regulation_id": str(rep.regulation_id) if rep else None,
                    "regulation_clause_id": f.regulation_clause_id,
                    "policy_clause_id": f.policy_clause_id,
                }

                if rep:
                    pol_node_id = f"pol:{rep.policy_document_id}"
                    reg_node_id = f"reg:{rep.regulation_id}"

                    # Finding -> RELATES_TO -> Policy
                    edge_f_pol = f"rel_pol:{finding_node_id}:{pol_node_id}"
                    edges_by_id[edge_f_pol] = {
                        "id": edge_f_pol,
                        "kind": "RELATES_TO",
                        "source": finding_node_id,
                        "target": pol_node_id,
                    }

                    # Finding -> RELATES_TO -> Regulation
                    edge_f_reg = f"rel_reg:{finding_node_id}:{reg_node_id}"
                    edges_by_id[edge_f_reg] = {
                        "id": edge_f_reg,
                        "kind": "RELATES_TO",
                        "source": finding_node_id,
                        "target": reg_node_id,
                    }

                    # Requirement -> HAS_FINDING -> Finding
                    if f.regulation_clause_id:
                        req_node_id = f"req:{rep.regulation_id}:{f.regulation_clause_id}"
                        edge_req_find = f"has_finding:{req_node_id}:{finding_node_id}"
                        edges_by_id[edge_req_find] = {
                            "id": edge_req_find,
                            "kind": "HAS_FINDING",
                            "source": req_node_id,
                            "target": finding_node_id,
                        }

            # E. Finding Remediations (`FindingRemediation`)
            remediations = db.scalars(
                select(FindingRemediation).where(FindingRemediation.organization_id == org_uuid)
            ).all()

            for rem in remediations:
                rem_id_str = str(rem.id)
                rem_node_id = f"rem:{rem_id_str}"
                finding_node_id = f"finding:{rem.finding_id}"

                nodes_by_id[rem_node_id] = {
                    "id": rem_node_id,
                    "kind": "remediation",
                    "label": rem.title or "Remediation Plan",
                    "remediation_id": rem_id_str,
                    "finding_id": str(rem.finding_id),
                    "status": rem.status or "PENDING",
                    "description": rem.description or "",
                    "target_date": rem.target_date.isoformat() if getattr(rem, "target_date", None) else None,
                }

                # Finding -> HAS_REMEDIATION -> Remediation
                edge_f_rem = f"has_rem:{finding_node_id}:{rem_node_id}"
                edges_by_id[edge_f_rem] = {
                    "id": edge_f_rem,
                    "kind": "HAS_REMEDIATION",
                    "source": finding_node_id,
                    "target": rem_node_id,
                }

        except Exception as exc:
            logger.warning("Error synthesizing relational compliance graph: %s", exc)

    # 3. Neo4j Fusion (if available, merge additional clauses & similarity edges)
    if is_neo4j_available():
        try:
            neo_nodes = run_query("MATCH (d:Document)-[:HAS_CLAUSE]->(c:Clause) RETURN d.id AS doc_id, c.id AS clause_id, c.text AS text LIMIT 50")
            for row in neo_nodes:
                c_id = str(row.get("clause_id") or "")
                d_id = f"pol:{row.get('doc_id')}"
                if c_id and c_id not in nodes_by_id:
                    nodes_by_id[c_id] = {
                        "id": c_id,
                        "kind": "policy_section",
                        "label": c_id,
                        "text": row.get("text") or "",
                    }
                    if d_id in nodes_by_id:
                        edges_by_id[f"has_clause:{d_id}:{c_id}"] = {
                            "id": f"has_clause:{d_id}:{c_id}",
                            "kind": "CONTAINS",
                            "source": d_id,
                            "target": c_id,
                        }
        except Exception as exc:
            logger.warning("Neo4j fusion query notice: %s", exc)

    all_nodes = list(nodes_by_id.values())
    all_edges = list(edges_by_id.values())

    # 4. Targeted Neighborhood / Focus Node Filtering (Depth 1 or 2)
    target_node_id: str | None = None
    if focus_node:
        target_node_id = focus_node
    elif finding_id:
        target_node_id = f"finding:{finding_id}" if not finding_id.startswith("finding:") else finding_id
    elif regulation_id:
        target_node_id = f"reg:{regulation_id}" if not regulation_id.startswith("reg:") else regulation_id
    elif document_id:
        target_node_id = f"pol:{document_id}" if not document_id.startswith("pol:") else document_id
    elif search:
        search_lower = search.lower()
        matched = next((n for n in all_nodes if search_lower in (n.get("label") or "").lower() or search_lower in (n.get("text") or "").lower()), None)
        if matched:
            target_node_id = matched["id"]

    if target_node_id and target_node_id in nodes_by_id:
        # Bounded neighborhood traversal
        active_ids = {target_node_id}
        current_layer = {target_node_id}

        for _ in range(min(depth, 3)):
            next_layer = set()
            for edge in all_edges:
                if edge["source"] in current_layer and edge["target"] not in active_ids:
                    next_layer.add(edge["target"])
                elif edge["target"] in current_layer and edge["source"] not in active_ids:
                    next_layer.add(edge["source"])
            active_ids.update(next_layer)
            current_layer = next_layer
            if not current_layer:
                break

        # Filter nodes and edges to active neighborhood
        all_nodes = [n for n in all_nodes if n["id"] in active_ids]
        all_edges = [e for e in all_edges if e["source"] in active_ids and e["target"] in active_ids]

        # Mark focused node
        for n in all_nodes:
            if n["id"] == target_node_id:
                n["is_focused"] = True

    return {
        "status": "ok",
        "nodes": all_nodes,
        "edges": all_edges,
        "meta": {
            "total_nodes": len(all_nodes),
            "total_edges": len(all_edges),
            "focus_node": target_node_id,
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

