from app.services import explainer


def test_rule_based_remediation_logging():
    suggestion = explainer.generate_remediation_suggestion(
        policy_clause="The policy does not define logging requirements.",
        matched_clause=None,
        explanation=None,
        use_llm=False,
    )

    assert suggestion == "Add audit log retention controls with clear monitoring and escalation requirements."


def test_rule_based_remediation_authentication():
    suggestion = explainer.generate_remediation_suggestion(
        policy_clause="Authentication controls are not clearly specified.",
        matched_clause=None,
        explanation=None,
        use_llm=False,
    )

    assert suggestion == "Add stronger access control requirements, including multi-factor authentication for privileged access."


def test_matched_clause_remediation_is_one_sentence():
    suggestion = explainer.generate_remediation_suggestion(
        policy_clause="General clause",
        matched_clause="mandatory audit logging and breach reporting controls for all systems",
        explanation="",
        use_llm=True,
    )

    assert suggestion.endswith(".")
    assert "Align this clause with the matched regulation" in suggestion
