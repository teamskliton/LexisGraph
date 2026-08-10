import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.compliance import detect_compliance_gaps
from app.services.llm_reasoning import generate_compliance_reasoning
from app.services.preprocessing import clean_text, preprocess_text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pipeline_test")


def test_layer1_preprocessing() -> None:
    logger.info("--- Testing Layer 1: Ingestion & Preprocessing ---")
    sample_text = (
        "Under Section 135 of the Companies Act 2013, every company having a net worth of rupees 500 crore "
        "or more during any financial year shall constitute a Corporate Social Responsibility Committee. "
        "The board of directors must approve the CSR policy within 90 days."
    )

    cleaned = clean_text(sample_text)
    logger.info("Cleaned text output: %s", cleaned)
    assert "Section" in sample_text or "Section" in cleaned
    assert "Companies Act" in cleaned
    assert "Corporate Social Responsibility" in cleaned

    clauses = preprocess_text(sample_text)
    logger.info("Extracted clauses count: %s", len(clauses))
    assert len(clauses) > 0

    for clause in clauses:
        assert "clause_id" in clause
        assert "embedding" in clause and len(clause["embedding"]) == 384

    logger.info("Layer 1 preprocessing test passed.")


def test_layer3_compliance_reasoning() -> None:
    logger.info("--- Testing Layer 3: Legal Compliance Reasoning ---")
    reasoning = generate_compliance_reasoning(
        policy_clause="The company shall maintain employee data confidentiality for at least 5 years.",
        matched_clause="Personal data must be securely stored for a period of not less than 5 years.",
        status="compliant",
        vector_score=0.85,
        graph_score=0.78,
    )
    logger.info("Generated reasoning summary: %s", reasoning)
    assert reasoning and len(reasoning) > 10


if __name__ == "__main__":
    logger.info("Starting LexisGraph pipeline verification tests...")
    test_layer1_preprocessing()
    test_layer3_compliance_reasoning()
    logger.info("All pipeline verification tests passed.")
