"""
Unit tests for app/services/compliance_engine.py.
"""
from __future__ import annotations

import json
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.compliance.models import ComplianceReport, ComplianceReportStatus
from app.db.models import Document, DocumentType, Organization, ProcessingStatus, User
from app.db.session import Base
from app.services.compliance_engine import (
    analyze_compliance_engine,
    evaluate_clause_compliance_with_llm,
    execute_report_compliance_analysis,
    retrieve_clauses_for_document,
)


class ComplianceEngineTest(unittest.TestCase):
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

        self.user = User(
            id=uuid.uuid4(),
            email="auditor@example.com",
            username="auditor",
            full_name="Compliance Auditor",
            hashed_password="hashed_pass",
        )
        self.db.add(self.user)

        self.org = Organization(
            id=uuid.uuid4(),
            name="FinTech Corp",
            created_by=self.user.id,
        )
        self.db.add(self.org)

        self.reg_doc = Document(
            id=uuid.uuid4(),
            organization_id=self.org.id,
            uploaded_by=self.user.id,
            original_filename="gdpr_article5.pdf",
            stored_filename="gdpr_article5_stored.pdf",
            file_path="/tmp/fake_reg.pdf",
            file_size=100,
            mime_type="application/pdf",
            checksum="reg_hash",
            document_type=DocumentType.REGULATION,
            processing_status=ProcessingStatus.PROCESSED,
        )
        self.db.add(self.reg_doc)

        self.policy_doc = Document(
            id=uuid.uuid4(),
            organization_id=self.org.id,
            uploaded_by=self.user.id,
            original_filename="security_policy.pdf",
            stored_filename="security_policy_stored.pdf",
            file_path="/tmp/fake_policy.pdf",
            file_size=200,
            mime_type="application/pdf",
            checksum="policy_hash",
            document_type=DocumentType.POLICY,
            processing_status=ProcessingStatus.PROCESSED,
        )
        self.db.add(self.policy_doc)

        self.db.commit()

    def tearDown(self):
        self.db.query(ComplianceReport).delete()
        self.db.query(Document).delete()
        self.db.query(Organization).delete()
        self.db.query(User).delete()
        self.db.commit()
        self.db.close()

    def test_evaluate_clause_compliance_with_llm_parsing(self):
        # Test JSON response from LLM
        mock_llm_json = json.dumps({
            "status": "COMPLIANT",
            "reasoning": "Policy clause directly satisfies regulation requirement.",
            "recommendation": None,
        })
        with patch("app.services.compliance_engine._resolve_reasoning", return_value=mock_llm_json):
            res = evaluate_clause_compliance_with_llm(
                regulation_clause="Personal data shall be processed lawfully and fairly.",
                matched_policy_clause="All customer data processing strictly follows legal consent rules.",
                similarity_score=0.85,
            )
            self.assertEqual(res["status"], "COMPLIANT")
            self.assertIn("directly satisfies", res["reasoning"])
            self.assertIsNone(res["recommendation"])

    def test_evaluate_clause_compliance_fallback_heuristic(self):
        # Test fallback when LLM is offline/disabled
        with patch("app.services.compliance_engine._resolve_reasoning", return_value=None):
            # High similarity -> COMPLIANT
            res_high = evaluate_clause_compliance_with_llm(
                regulation_clause="Data must be encrypted at rest.",
                matched_policy_clause="All storage volumes are encrypted with AES-256.",
                similarity_score=0.82,
            )
            self.assertEqual(res_high["status"], "COMPLIANT")

            # Partial similarity -> PARTIALLY_COMPLIANT
            res_partial = evaluate_clause_compliance_with_llm(
                regulation_clause="Data retention period must not exceed 2 years.",
                matched_policy_clause="Records are kept as necessary.",
                similarity_score=0.55,
            )
            self.assertEqual(res_partial["status"], "PARTIALLY_COMPLIANT")
            self.assertIsNotNone(res_partial["recommendation"])

            # No match -> NON_COMPLIANT
            res_none = evaluate_clause_compliance_with_llm(
                regulation_clause="Appoint a Data Protection Officer.",
                matched_policy_clause=None,
                similarity_score=0.0,
            )
            self.assertEqual(res_none["status"], "NON_COMPLIANT")

    def test_analyze_compliance_engine_full_workflow(self):
        reg_clauses = [
            {"clause_id": "reg-1", "text": "Personal data shall be encrypted.", "embedding": [1.0, 0.0, 0.0]},
            {"clause_id": "reg-2", "text": "Data breaches must be reported within 72 hours.", "embedding": [0.0, 1.0, 0.0]},
        ]
        policy_clauses = [
            {"clause_id": "pol-1", "text": "All internal databases are encrypted using AES-256.", "embedding": [1.0, 0.0, 0.0]},
        ]


        def _mock_retrieve(doc):
            if doc.id == self.reg_doc.id:
                return reg_clauses
            return policy_clauses

        with patch("app.services.compliance_engine.retrieve_clauses_for_document", side_effect=_mock_retrieve), \
             patch("app.services.compliance_engine._get_graph_similarity_score", return_value=0.0), \
             patch("app.services.compliance_engine._resolve_reasoning", return_value=None):

            result = analyze_compliance_engine(self.org, self.reg_doc, self.policy_doc)

            self.assertIn("overall_score", result)
            self.assertIn("status", result)
            self.assertEqual(result["status"], "COMPLETED")
            self.assertEqual(result["total_regulation_clauses"], 2)
            self.assertEqual(len(result["evaluated_clauses"]), 2)
            self.assertEqual(len(result["missing_clauses"]), 1)  # reg-2 has no match
            self.assertIsInstance(result["recommendations"], list)

    def test_execute_report_compliance_analysis(self):
        report = ComplianceReport(
            id=uuid.uuid4(),
            organization_id=self.org.id,
            regulation_id=self.reg_doc.id,
            policy_document_id=self.policy_doc.id,
            status=ComplianceReportStatus.PENDING,
            created_by=self.user.id,
        )
        self.db.add(report)
        self.db.commit()

        mock_payload = {
            "overall_score": 88.5,
            "status": "COMPLETED",
            "summary": "Compliance test report complete.",
            "missing_clauses": [],
            "weak_clauses": [],
            "recommendations": [],
        }

        with patch("app.services.compliance_engine.analyze_compliance_engine", return_value=mock_payload):
            result = execute_report_compliance_analysis(self.db, report.id)
            self.assertEqual(result["overall_score"], 88.5)

            updated_report = self.db.get(ComplianceReport, report.id)
            self.assertEqual(updated_report.status, ComplianceReportStatus.COMPLETED)
            self.assertEqual(updated_report.overall_score, 88.5)
            self.assertIsNotNone(updated_report.summary)


if __name__ == "__main__":
    unittest.main()
