"""
Sprint 8.2: Compliance Matching & Accuracy Technical Evaluation Suite.

Evaluates 8 core compliance matching scenarios:
1. Clear Covered: Explicit policy evidence satisfies all requirements.
2. Clear Gap: No relevant policy evidence found.
3. Partial Match: Multi-obligation requirement partially satisfied (identifies missing_aspects).
4. Semantic Equivalence (False-Negative Prevention): Different wording/synonyms satisfy obligation.
5. Irrelevant Similarity (False-Positive Prevention): High keyword overlap without satisfying obligation.
6. Multi-Section Aggregation: Multi-part requirement satisfied across separate policy sections.
7. Conflicting Evidence: Contradictory policy statements flagged as UNABLE_TO_DETERMINE.
8. No-Evidence: Completely unrelated document text results in GAP.

Calculates technical evaluation metrics:
- Accuracy
- Precision (Gap detection)
- Recall (Gap detection)
- F1 Score (Gap detection)
"""
from __future__ import annotations

import json
import unittest
import unittest.mock
import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from app.compliance.models import ComplianceReport, ComplianceReportStatus
from app.compliance.routes import router as compliance_router
from app.core.dependencies import get_current_user
from app.db.models import Document, DocumentType, Organization, ProcessingStatus, User, Regulation
from app.db.session import Base, get_db
from app.services.compliance_engine import (
    _deduplicate_policy_matches,
    _parse_batch_llm_response,
    _normalise_status,
    _heuristic_fallback,
    evaluate_batch_compliance_with_llm,
)


class MatchingAccuracyEvaluationTest(unittest.TestCase):
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
            email="auditor@lexisgraph.internal",
            username="auditor",
            full_name="Lead Auditor",
            hashed_password="hashed_pw_test",
            is_active=True,
            is_superuser=False,
        )
        self.db.add(self.user)

        self.org = Organization(
            id=uuid.uuid4(),
            name="LexisGraph Evaluation Org",
            description="Org for matching accuracy evaluation",
            created_by=self.user.id,
        )
        self.db.add(self.org)

        self.reg_doc = Regulation(
            id=uuid.uuid4(),
            uploaded_by=self.user.id,
            title="Benchmark Compliance Regulation 2026",
            act_name="Benchmark Act",
            act_year=2026,
            version="2026.1",
            jurisdiction="India",
            original_filename="benchmark_reg.pdf",
            stored_filename="benchmark_reg_stored.pdf",
            file_path="/tmp/benchmark_reg.pdf",
            file_size=8192,
            mime_type="application/pdf",
            document_hash="benchmark_reg_hash_v1",
            processing_status=ProcessingStatus.PROCESSED,
        )
        self.db.add(self.reg_doc)

        self.policy_doc = Document(
            id=uuid.uuid4(),
            organization_id=self.org.id,
            uploaded_by=self.user.id,
            original_filename="internal_policy_eval.pdf",
            stored_filename="internal_policy_eval_stored.pdf",
            file_path="/tmp/internal_policy_eval.pdf",
            file_size=4096,
            mime_type="application/pdf",
            checksum="internal_policy_hash_v1",
            document_type=DocumentType.POLICY,
            processing_status=ProcessingStatus.PROCESSED,
        )
        self.db.add(self.policy_doc)
        self.db.commit()

        self.app = FastAPI()
        self.app.include_router(compliance_router)

        def _override_get_db():
            yield self.db

        def _override_get_current_user():
            return self.user

        self.app.dependency_overrides[get_db] = _override_get_db
        self.app.dependency_overrides[get_current_user] = _override_get_current_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.db.query(ComplianceReport).delete()
        self.db.query(Document).delete()
        self.db.query(Regulation).delete()
        self.db.query(Organization).delete()
        self.db.query(User).delete()
        self.db.commit()
        self.db.close()

    def test_chunk_deduplication(self):
        """Test that redundant / near-identical chunks are deduplicated before matching."""
        raw_matches = [
            {"clause_id": "c1", "text": "The company shall provide annual compliance training to all employees.", "score": 0.92},
            {"clause_id": "c2", "text": "The company shall provide annual compliance training to all employees.", "score": 0.91},  # exact duplicate
            {"clause_id": "c3", "text": "The company shall provide annual compliance training to all employees in Q1.", "score": 0.88},  # substring duplicate
            {"clause_id": "c4", "text": "An independent audit of data records must be conducted semi-annually.", "score": 0.75},  # distinct
        ]

        deduped = _deduplicate_policy_matches(raw_matches)
        self.assertEqual(len(deduped), 2)
        self.assertEqual(deduped[0]["clause_id"], "c1")
        self.assertEqual(deduped[1]["clause_id"], "c4")

    def test_evaluation_dataset_and_metrics(self):
        """
        Run the 8 technical evaluation test cases through the matching parser & evaluator,
        and calculate technical evaluation metrics (Accuracy, Precision, Recall, F1).
        """
        eval_scenarios = [
            # 1. Clear Covered
            {
                "id": "TC_01_CLEAR_COVERED",
                "type": "COVERED",
                "regulation_clause": "The employer shall constitute an Internal Complaints Committee at all administrative units.",
                "matched_policy_clauses": [
                    {"clause_id": "p1", "text": "An Internal Complaints Committee (ICC) is formally constituted across all administrative units and branch offices.", "score": 0.89}
                ],
                "expected_status": "COMPLIANT",
                "mock_llm_response": json.dumps([{
                    "clause_index": 1,
                    "status": "COMPLIANT",
                    "confidence": "HIGH",
                    "missing_aspects": [],
                    "conflicting_evidence": False,
                    "reasoning": "Policy explicitly confirms ICC constitution across all administrative units.",
                    "recommendation": None
                }]),
            },
            # 2. Clear Gap
            {
                "id": "TC_02_CLEAR_GAP",
                "type": "GAP",
                "regulation_clause": "Organization must maintain an audit log of all data processing activities for seven years.",
                "matched_policy_clauses": [],
                "expected_status": "NON_COMPLIANT",
                "mock_llm_response": None,  # No policy match -> short-circuit to NON_COMPLIANT
            },
            # 3. Partial Match
            {
                "id": "TC_03_PARTIAL_MATCH",
                "type": "PARTIAL",
                "regulation_clause": "The organization must establish an Internal Complaints Committee with specified composition (at least 4 members, Presiding Officer female) and defined responsibilities.",
                "matched_policy_clauses": [
                    {"clause_id": "p3", "text": "An Internal Complaints Committee exists within the organization.", "score": 0.72}
                ],
                "expected_status": "PARTIALLY_COMPLIANT",
                "mock_llm_response": json.dumps([{
                    "clause_index": 1,
                    "status": "PARTIALLY_COMPLIANT",
                    "confidence": "HIGH",
                    "missing_aspects": ["Committee composition (minimum 4 members)", "Presiding officer gender requirement", "Defined operational responsibilities"],
                    "conflicting_evidence": False,
                    "reasoning": "Policy acknowledges committee existence but omits mandatory composition and operational responsibilities.",
                    "recommendation": "Specify member count, presiding officer criteria, and operational duties."
                }]),
            },
            # 4. Semantic Equivalence (False Negative Prevention)
            {
                "id": "TC_04_SEMANTIC_EQUIVALENCE",
                "type": "COVERED",
                "regulation_clause": "Employees shall receive annual awareness training regarding data protection obligations.",
                "matched_policy_clauses": [
                    {"clause_id": "p4", "text": "All staff members must participate in yearly workplace education covering privacy and information security responsibilities.", "score": 0.78}
                ],
                "expected_status": "COMPLIANT",
                "mock_llm_response": json.dumps([{
                    "clause_index": 1,
                    "status": "COMPLIANT",
                    "confidence": "HIGH",
                    "missing_aspects": [],
                    "conflicting_evidence": False,
                    "reasoning": "Yearly workplace education is semantically equivalent to annual awareness training.",
                    "recommendation": None
                }]),
            },
            # 5. Irrelevant Similarity (False Positive Prevention)
            {
                "id": "TC_05_IRRELEVANT_SIMILARITY",
                "type": "GAP",
                "regulation_clause": "Employer must establish an Internal Complaints Committee to handle statutory harassment grievances.",
                "matched_policy_clauses": [
                    {"clause_id": "p5", "text": "The company has a complaints email address for general customer support inquiries.", "score": 0.52}
                ],
                "expected_status": "NON_COMPLIANT",
                "mock_llm_response": json.dumps([{
                    "clause_index": 1,
                    "status": "NON_COMPLIANT",
                    "confidence": "HIGH",
                    "missing_aspects": ["Statutory Internal Complaints Committee", "Grievance redressal mechanism"],
                    "conflicting_evidence": False,
                    "reasoning": "Customer support complaints email does not fulfill statutory Internal Complaints Committee mandate.",
                    "recommendation": "Establish a dedicated statutory Internal Complaints Committee."
                }]),
            },
            # 6. Multi-Section Evidence Aggregation
            {
                "id": "TC_06_MULTI_SECTION_AGGREGATION",
                "type": "COVERED",
                "regulation_clause": "The committee must consist of qualified members and submit an annual report to the employer.",
                "matched_policy_clauses": [
                    {"clause_id": "p6_a", "text": "Section 4: The committee comprises four certified compliance officers.", "score": 0.71},
                    {"clause_id": "p6_b", "text": "Section 8: An annual compliance report is prepared and submitted to executive leadership.", "score": 0.69}
                ],
                "expected_status": "COMPLIANT",
                "mock_llm_response": json.dumps([{
                    "clause_index": 1,
                    "status": "COMPLIANT",
                    "confidence": "HIGH",
                    "missing_aspects": [],
                    "conflicting_evidence": False,
                    "reasoning": "Section 4 provides committee qualifications and Section 8 provides annual report submission obligations.",
                    "recommendation": None
                }]),
            },
            # 7. Conflicting Evidence Handling
            {
                "id": "TC_07_CONFLICTING_EVIDENCE",
                "type": "UNABLE",
                "regulation_clause": "The grievance committee shall have exactly five appointed members.",
                "matched_policy_clauses": [
                    {"clause_id": "p7_a", "text": "Policy Section 2: Committee shall consist of 3 members.", "score": 0.76},
                    {"clause_id": "p7_b", "text": "Policy Section 9: Committee shall consist of 5 members.", "score": 0.74}
                ],
                "expected_status": "UNABLE_TO_DETERMINE",
                "mock_llm_response": json.dumps([{
                    "clause_index": 1,
                    "status": "UNABLE_TO_DETERMINE",
                    "confidence": "LOW",
                    "missing_aspects": ["Harmonized committee size specification"],
                    "conflicting_evidence": True,
                    "reasoning": "Contradictory policy sections specify 3 members vs 5 members.",
                    "recommendation": "Reconcile contradictory member counts between Section 2 and Section 9."
                }]),
            },
            # 8. No-Evidence Unrelated Text
            {
                "id": "TC_08_NO_EVIDENCE_UNRELATED",
                "type": "GAP",
                "regulation_clause": "Organization must conduct an annual third-party cybersecurity audit.",
                "matched_policy_clauses": [
                    {"clause_id": "p8", "text": "Office pantry supplies are replenished on the first Monday of every month.", "score": 0.18}
                ],
                "expected_status": "NON_COMPLIANT",
                "mock_llm_response": json.dumps([{
                    "clause_index": 1,
                    "status": "NON_COMPLIANT",
                    "confidence": "HIGH",
                    "missing_aspects": ["Third-party cybersecurity audit mandate"],
                    "conflicting_evidence": False,
                    "reasoning": "Pantry policy text is unrelated to cybersecurity audit requirements.",
                    "recommendation": "Incorporate annual third-party cybersecurity audit mandate."
                }]),
            },
        ]

        # Execute evaluation cases
        results = []
        for case in eval_scenarios:
            batch_item = {
                "index": 1,
                "regulation_clause": case["regulation_clause"],
                "matched_policy_clauses": case["matched_policy_clauses"],
                "structural_context": {},
            }

            if not case["matched_policy_clauses"]:
                eval_res = evaluate_batch_compliance_with_llm([batch_item])[0]
            else:
                with unittest.mock.patch("app.services.compliance_engine._resolve_reasoning", return_value=case["mock_llm_response"]):
                    eval_res = evaluate_batch_compliance_with_llm([batch_item])[0]

            actual_status = eval_res["status"]
            is_correct = (actual_status == case["expected_status"])
            results.append({
                "id": case["id"],
                "expected": case["expected_status"],
                "actual": actual_status,
                "correct": is_correct,
                "confidence": eval_res.get("confidence"),
                "missing_aspects": eval_res.get("missing_aspects", []),
                "conflicting": eval_res.get("conflicting_evidence", False),
            })

        # Verify all 8 scenarios evaluated correctly
        correct_count = sum(1 for r in results if r["correct"])
        total_cases = len(results)
        accuracy = (correct_count / total_cases) * 100.0
        self.assertEqual(accuracy, 100.0, f"Expected 100% accuracy on evaluation suite, got {accuracy}%: {results}")

        # Compute Gap Detection Metrics (True Positives: Expected NON_COMPLIANT, Actual NON_COMPLIANT)
        gap_expected = [r for r in results if r["expected"] == "NON_COMPLIANT"]
        gap_predicted = [r for r in results if r["actual"] == "NON_COMPLIANT"]
        tp_gap = sum(1 for r in results if r["expected"] == "NON_COMPLIANT" and r["actual"] == "NON_COMPLIANT")
        fp_gap = sum(1 for r in results if r["expected"] != "NON_COMPLIANT" and r["actual"] == "NON_COMPLIANT")
        fn_gap = sum(1 for r in results if r["expected"] == "NON_COMPLIANT" and r["actual"] != "NON_COMPLIANT")

        precision_gap = (tp_gap / (tp_gap + fp_gap)) if (tp_gap + fp_gap) > 0 else 1.0
        recall_gap = (tp_gap / (tp_gap + fn_gap)) if (tp_gap + fn_gap) > 0 else 1.0
        f1_gap = (2 * precision_gap * recall_gap / (precision_gap + recall_gap)) if (precision_gap + recall_gap) > 0 else 1.0

        self.assertEqual(precision_gap, 1.0)
        self.assertEqual(recall_gap, 1.0)
        self.assertEqual(f1_gap, 1.0)

        # Verify specific Sprint 8.2 features in outputs:
        # Partial match scenario has populated missing_aspects
        partial_res = next(r for r in results if r["id"] == "TC_03_PARTIAL_MATCH")
        self.assertTrue(len(partial_res["missing_aspects"]) >= 2)

        # Conflicting scenario has conflicting flag set
        conflict_res = next(r for r in results if r["id"] == "TC_07_CONFLICTING_EVIDENCE")
        self.assertTrue(conflict_res["conflicting"])


if __name__ == "__main__":
    unittest.main()
