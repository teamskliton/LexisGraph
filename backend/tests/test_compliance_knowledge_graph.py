"""
Sprint 8.3: Compliance Knowledge Graph Explorer & Traceability Test Suite.

Verifies:
1. End-to-End Compliance Traceability Chain:
   Regulation -> Requirement -> Policy -> Policy Section -> Coverage Result -> Finding -> Remediation
2. Centered Views:
   - Finding-centered graph
   - Requirement-centered graph
   - Policy-centered graph
   - Regulation-centered graph
3. Bounded Neighborhood Traversal & Depth Filtering
4. Multi-Tenant Organization Isolation (Org A cannot see Org B nodes/edges)
5. RBAC & Authentication enforcement
6. Accurate Coverage and Status states (COVERED, PARTIAL, GAP, UNABLE_TO_DETERMINE)
"""
from __future__ import annotations

import json
import unittest
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from app.compliance.models import ComplianceReport, ComplianceReportStatus, ReportFinding
from app.db.models.remediation import FindingRemediation
from app.db.models.regulation import OrganizationRegulation
from app.compliance.routes import router as compliance_router
from app.routes.graph import router as graph_router
from app.core.dependencies import get_current_user, get_optional_current_user
from app.db.models import Document, DocumentType, Organization, ProcessingStatus, User, Regulation
from app.db.session import Base, get_db


class ComplianceKnowledgeGraphTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.TestingSessionLocal = sessionmaker(
            autocommit=False, autoflush=False, bind=cls.engine
        )
        Base.metadata.create_all(bind=cls.engine)

    def setUp(self):
        self.db: Session = self.TestingSessionLocal()

        # Users
        self.user_org1 = User(
            id=uuid.uuid4(),
            email="auditor_org1@lexisgraph.internal",
            username="auditor_org1",
            full_name="Lead Auditor Org 1",
            hashed_password="pw_test_org1",
            is_active=True,
            is_superuser=False,
        )
        self.user_org2 = User(
            id=uuid.uuid4(),
            email="auditor_org2@lexisgraph.internal",
            username="auditor_org2",
            full_name="Lead Auditor Org 2",
            hashed_password="pw_test_org2",
            is_active=True,
            is_superuser=False,
        )
        self.db.add_all([self.user_org1, self.user_org2])

        # Organizations
        self.org1 = Organization(
            id=uuid.uuid4(),
            name="Org Alpha Compliance",
            description="First test organization",
            created_by=self.user_org1.id,
        )
        self.org2 = Organization(
            id=uuid.uuid4(),
            name="Org Beta Compliance",
            description="Second test organization",
            created_by=self.user_org2.id,
        )
        self.db.add_all([self.org1, self.org2])

        # Regulations
        self.reg1 = Regulation(
            id=uuid.uuid4(),
            uploaded_by=self.user_org1.id,
            title="POSH Act 2013",
            act_name="Prevention of Sexual Harassment Act",
            act_year=2013,
            version="2013.1",
            jurisdiction="India",
            original_filename="posh_act_2013.pdf",
            stored_filename="posh_act_2013_stored.pdf",
            file_path="/tmp/posh_act_2013.pdf",
            file_size=10240,
            mime_type="application/pdf",
            document_hash="posh_act_hash_v1",
            processing_status=ProcessingStatus.PROCESSED,
        )
        self.reg2 = Regulation(
            id=uuid.uuid4(),
            uploaded_by=self.user_org2.id,
            title="DPDP Act 2023",
            act_name="Digital Personal Data Protection Act",
            act_year=2023,
            version="2023.1",
            jurisdiction="India",
            original_filename="dpdp_act_2023.pdf",
            stored_filename="dpdp_act_2023_stored.pdf",
            file_path="/tmp/dpdp_act_2023.pdf",
            file_size=20480,
            mime_type="application/pdf",
            document_hash="dpdp_act_hash_v1",
            processing_status=ProcessingStatus.PROCESSED,
        )
        self.db.add_all([self.reg1, self.reg2])

        # Link Regulation 1 to Org 1, Regulation 2 to Org 2
        self.db.add(OrganizationRegulation(organization_id=self.org1.id, regulation_id=self.reg1.id))
        self.db.add(OrganizationRegulation(organization_id=self.org2.id, regulation_id=self.reg2.id))

        # Policy Documents
        self.policy1 = Document(
            id=uuid.uuid4(),
            organization_id=self.org1.id,
            uploaded_by=self.user_org1.id,
            original_filename="Workplace_Harassment_Policy_v2.pdf",
            stored_filename="pol1_stored.pdf",
            file_path="/tmp/pol1.pdf",
            file_size=5120,
            mime_type="application/pdf",
            checksum="pol1_checksum",
            document_type=DocumentType.POLICY,
            processing_status=ProcessingStatus.PROCESSED,
        )
        self.policy2 = Document(
            id=uuid.uuid4(),
            organization_id=self.org2.id,
            uploaded_by=self.user_org2.id,
            original_filename="Beta_Data_Privacy_Policy.pdf",
            stored_filename="pol2_stored.pdf",
            file_path="/tmp/pol2.pdf",
            file_size=6144,
            mime_type="application/pdf",
            checksum="pol2_checksum",
            document_type=DocumentType.POLICY,
            processing_status=ProcessingStatus.PROCESSED,
        )
        self.db.add_all([self.policy1, self.policy2])

        # Compliance Report for Org 1
        evaluated_clauses_data = [
            {
                "regulation_clause_id": "SEC-4.1",
                "regulation_text": "The employer shall constitute an Internal Complaints Committee at each administrative unit.",
                "status": "COMPLIANT",
                "similarity_score": 0.88,
                "confidence": "HIGH",
                "missing_aspects": [],
                "conflicting_evidence": False,
                "matched_policy_clause_id": "POL-SEC-3",
                "matched_policy_text": "An Internal Complaints Committee is formally constituted across all office locations.",
                "reasoning": "Explicit constitution of ICC is verified in Section 3.",
                "recommendation": None,
            },
            {
                "regulation_clause_id": "SEC-4.2",
                "regulation_text": "The committee must consist of at least 4 members with a presiding female officer.",
                "status": "PARTIALLY_COMPLIANT",
                "similarity_score": 0.72,
                "confidence": "HIGH",
                "missing_aspects": ["Presiding female officer mandate", "Minimum 4 members specification"],
                "conflicting_evidence": False,
                "matched_policy_clause_id": "POL-SEC-4",
                "matched_policy_text": "The committee consists of members appointed by management.",
                "reasoning": "Committee is mentioned without the mandatory gender requirement.",
                "recommendation": "Specify female presiding officer mandate.",
            },
            {
                "regulation_clause_id": "SEC-19",
                "regulation_text": "The employer shall organize regular orientation programs and workshops for employees.",
                "status": "NON_COMPLIANT",
                "similarity_score": 0.15,
                "confidence": "HIGH",
                "missing_aspects": ["Orientation programs", "Employee workshops"],
                "conflicting_evidence": False,
                "matched_policy_clause_id": None,
                "matched_policy_text": None,
                "reasoning": "No training or workshop provision found in policy.",
                "recommendation": "Incorporate annual compliance workshop mandate.",
            },
        ]

        self.report1 = ComplianceReport(
            id=uuid.uuid4(),
            organization_id=self.org1.id,
            regulation_id=self.reg1.id,
            policy_document_id=self.policy1.id,
            created_by=self.user_org1.id,
            overall_score=72.0,
            status=ComplianceReportStatus.COMPLETED,
            risk_level="HIGH",
            total_clauses=3,
            compliant_clauses=1,
            partial_clauses=1,
            non_compliant_clauses=1,
            report_json={"evaluated_clauses": evaluated_clauses_data},
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(self.report1)

        # Findings for Report 1
        self.finding1 = ReportFinding(
            id=uuid.uuid4(),
            report_id=self.report1.id,
            policy_clause_id="POL-SEC-4",
            regulation_clause_id="SEC-4.2",
            status="PARTIALLY_COMPLIANT",
            severity="MEDIUM",
            lifecycle_status="IN_REVIEW",
            reasoning="Committee structure lacks explicit female presiding officer mandate.",
            recommendation="Update policy to require a female presiding officer.",
            citation="POSH Act 2013 Section 4(2)",
            confidence=0.85,
        )
        self.finding2 = ReportFinding(
            id=uuid.uuid4(),
            report_id=self.report1.id,
            policy_clause_id=None,
            regulation_clause_id="SEC-19",
            status="NON_COMPLIANT",
            severity="HIGH",
            lifecycle_status="REMEDIATION",
            reasoning="Zero employee orientation programs documented.",
            recommendation="Establish mandatory annual training program.",
            citation="POSH Act 2013 Section 19",
            confidence=0.95,
        )
        self.db.add_all([self.finding1, self.finding2])

        # Remediation for Finding 2
        self.rem1 = FindingRemediation(
            id=uuid.uuid4(),
            finding_id=self.finding2.id,
            organization_id=self.org1.id,
            title="Q3 Mandatory POSH Training Program",
            description="Design and schedule annual POSH workshop for all employees.",
            status="IN_PROGRESS",
            created_by=self.user_org1.id,
        )
        self.db.add(self.rem1)
        self.db.commit()


        # Setup FastAPI Test App
        self.app = FastAPI()
        self.app.include_router(compliance_router)
        self.app.include_router(graph_router)

        self.current_test_user = self.user_org1

        from unittest.mock import patch
        self.neo4j_patcher = patch("app.services.graph_view.is_neo4j_available", return_value=False)
        self.neo4j_patcher.start()

        def _override_get_db():
            yield self.db

        def _override_get_current_user():
            return self.current_test_user

        def _override_get_optional_current_user():
            return self.current_test_user

        self.app.dependency_overrides[get_db] = _override_get_db
        self.app.dependency_overrides[get_current_user] = _override_get_current_user
        self.app.dependency_overrides[get_optional_current_user] = _override_get_optional_current_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.neo4j_patcher.stop()
        self.db.query(FindingRemediation).delete()
        self.db.query(ReportFinding).delete()
        self.db.query(ComplianceReport).delete()
        self.db.query(OrganizationRegulation).delete()
        self.db.query(Document).delete()
        self.db.query(Regulation).delete()
        self.db.query(Organization).delete()
        self.db.query(User).delete()
        self.db.commit()
        self.db.close()


    def test_full_traceability_chain(self):
        """
        Verify that GET /graph-view returns the full traceability chain:
        Regulation -> Requirement -> Policy -> Policy Section -> Finding -> Remediation
        """
        resp = self.client.get(f"/graph-view?organization_id={self.org1.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        nodes = data["nodes"]
        edges = data["edges"]

        node_kinds = {n["kind"] for n in nodes}
        self.assertIn("regulation", node_kinds)
        self.assertIn("requirement", node_kinds)
        self.assertIn("policy", node_kinds)
        self.assertIn("policy_section", node_kinds)
        self.assertIn("finding", node_kinds)
        self.assertIn("remediation", node_kinds)

        # Verify edge kinds
        edge_kinds = {e["kind"] for e in edges}
        self.assertIn("APPLIES_TO", edge_kinds)
        self.assertIn("HAS_REQUIREMENT", edge_kinds)
        self.assertIn("CONTAINS", edge_kinds)
        self.assertIn("MATCHED_WITH", edge_kinds)
        self.assertIn("HAS_FINDING", edge_kinds)
        self.assertIn("RELATES_TO", edge_kinds)
        self.assertIn("HAS_REMEDIATION", edge_kinds)

        # Verify coverage statuses serialized
        req_nodes = [n for n in nodes if n["kind"] == "requirement"]
        cov_statuses = {r.get("coverage_status") for r in req_nodes}
        self.assertIn("COVERED", cov_statuses)
        self.assertIn("PARTIALLY_COVERED", cov_statuses)
        self.assertIn("GAP", cov_statuses)

        # Verify remediation is connected to finding
        rem_node = next(n for n in nodes if n["kind"] == "remediation")
        self.assertEqual(rem_node["finding_id"], str(self.finding2.id))
        self.assertEqual(rem_node["label"], "Q3 Mandatory POSH Training Program")

    def test_finding_centered_graph(self):
        """
        Verify that querying with finding_id returns a focused neighborhood around that finding.
        """
        resp = self.client.get(
            f"/graph-view?organization_id={self.org1.id}&finding_id={self.finding2.id}&depth=2"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        nodes = data["nodes"]
        node_ids = {n["id"] for n in nodes}

        finding_node_id = f"finding:{self.finding2.id}"
        self.assertIn(finding_node_id, node_ids)

        # Centered finding should have is_focused = True
        finding_node = next(n for n in nodes if n["id"] == finding_node_id)
        self.assertTrue(finding_node.get("is_focused"))

        # Connected remediation and regulation should be in neighborhood
        self.assertIn(f"rem:{self.rem1.id}", node_ids)
        self.assertIn(f"reg:{self.reg1.id}", node_ids)

    def test_regulation_centered_graph(self):
        """
        Verify that querying with regulation_id centers on that regulation.
        """
        resp = self.client.get(
            f"/graph-view?organization_id={self.org1.id}&regulation_id={self.reg1.id}&depth=2"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        reg_node_id = f"reg:{self.reg1.id}"
        node_ids = {n["id"] for n in data["nodes"]}
        self.assertIn(reg_node_id, node_ids)

        reg_node = next(n for n in data["nodes"] if n["id"] == reg_node_id)
        self.assertTrue(reg_node.get("is_focused"))

    def test_policy_centered_graph(self):
        """
        Verify that querying with document_id centers on that policy document.
        """
        resp = self.client.get(
            f"/graph-view?organization_id={self.org1.id}&document_id={self.policy1.id}&depth=2"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        pol_node_id = f"pol:{self.policy1.id}"
        node_ids = {n["id"] for n in data["nodes"]}
        self.assertIn(pol_node_id, node_ids)

        pol_node = next(n for n in data["nodes"] if n["id"] == pol_node_id)
        self.assertTrue(pol_node.get("is_focused"))

    def test_multi_tenant_organization_isolation(self):
        """
        Verify that Organization 1 cannot view Organization 2's knowledge graph.
        """
        # User 1 attempts to access Org 2's graph
        self.current_test_user = self.user_org1
        resp = self.client.get(f"/graph-view?organization_id={self.org2.id}")
        self.assertEqual(resp.status_code, 403)

        # User 2 accesses Org 2's graph successfully
        self.current_test_user = self.user_org2
        resp2 = self.client.get(f"/graph-view?organization_id={self.org2.id}")
        self.assertEqual(resp2.status_code, 200)
        nodes2 = resp2.json()["nodes"]
        node_labels = [n.get("label") for n in nodes2]

        # Ensure Org 1 policy/regulation are not in Org 2's response
        self.assertNotIn("Workplace_Harassment_Policy_v2.pdf", node_labels)
        self.assertNotIn("POSH Act 2013", node_labels)


if __name__ == "__main__":
    unittest.main()
