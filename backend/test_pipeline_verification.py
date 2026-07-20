import logging
import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.preprocessing import clean_text, extract_structure, preprocess_text
from app.services.compliance import detect_compliance_gaps
from app.services.llm_reasoning import generate_compliance_reasoning

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pipeline_test")


def test_layer1_preprocessing():
    logger.info("--- Testing Layer 1: Ingestion & Preprocessing ---")
    sample_text = (
        "Under Section 135 of the Companies Act 2013, every company having a net worth of rupees 500 crore "
        "or more during any financial year shall constitute a Corporate Social Responsibility Committee. "
        "The board of directors must approve the CSR policy within 90 days."
    )

    cleaned = clean_text(sample_text)
    logger.info("Cleaned text output: %s", cleaned)

    # Assert numbers preserved
    assert "135" in cleaned, "Section number 135 was removed!"
    assert "2013" in cleaned, "Year 2013 was removed!"
    assert "500" in cleaned, "Number 500 was removed!"
    assert "90" in cleaned, "Day limit 90 was removed!"
    logger.info("✅ Number preservation check passed")

    # Preprocess text into clauses
    clauses = preprocess_text(sample_text)
    logger.info("Extracted clauses count: %s", len(clauses))
    assert len(clauses) > 0, "No clauses extracted!"

    for c in clauses:
        logger.info(
            "Clause ID: %s | Type: %s | Subject: '%s' | Action: '%s' | Object: '%s'",
            c.get("clause_id"),
            c.get("type"),
            c.get("subject"),
            c.get("action"),
            c.get("object"),
        )
        assert "clause_id" in c, "clause_id missing!"
        assert "embedding" in c and len(c["embedding"]) == 384, "Embedding missing or incorrect dimension!"

    logger.info("✅ Layer 1 preprocessing test PASSED successfully!")


def test_layer3_compliance_reasoning():
    logger.info("--- Testing Layer 3: Legal Compliance Reasoning ---")
    policy_clause = "The company shall maintain employee data confidentiality for at least 5 years."
    matched_clause = "In accordance with Data Protection regulations, personal data must be securely stored for a period of not less than 5 years."

    reasoning = generate_compliance_reasoning(
        policy_clause=policy_clause,
        matched_clause=matched_clause,
        status="compliant",
        vector_score=0.85,
        graph_score=0.78,
    )
    logger.info("Generated Legal Reasoning Summary:\n%s", reasoning)
    assert reasoning and len(reasoning) > 10, "LLM reasoning output invalid!"
    logger.info("✅ Layer 3 compliance reasoning test PASSED successfully!")


if __name__ == "__main__":
    logger.info("🚀 Starting LexisGraph Pipeline Verification Tests...")
    test_layer1_preprocessing()
    test_layer3_compliance_reasoning()
    logger.info("🎉 ALL PIPELINE VERIFICATION TESTS PASSED SUCCESSFULLY!")
