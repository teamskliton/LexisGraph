from app.routes import compliance as compliance_route


def test_compliance_analysis_explain_false_includes_rule_based_remediation(monkeypatch):
    monkeypatch.setattr(compliance_route, "retrieve_relevant_clauses", lambda _query: [])
    monkeypatch.setattr(
        compliance_route,
        "detect_compliance_gaps",
        lambda: [
            {
                "policy_clause": "No logging controls are defined",
                "status": "gap",
                "confidence": 0.2,
                "matched_clause": None,
            }
        ],
    )

    payload = compliance_route.compliance_analysis("logging", explain=False)

    assert payload["analysis"][0]["status"] == "gap"
    assert "remediation_suggestion" in payload["analysis"][0]
    assert payload["analysis"][0]["remediation_suggestion"] == (
        "Add audit log retention controls with clear monitoring and escalation requirements."
    )


def test_compliance_analysis_explain_true_includes_remediation(monkeypatch):
    monkeypatch.setattr(compliance_route, "retrieve_relevant_clauses", lambda _query: [])
    base_results = [
        {
            "policy_clause": "No controls specified",
            "status": "gap",
            "confidence": 0.1,
            "matched_clause": "mandatory audit logging and breach reporting controls",
        }
    ]
    monkeypatch.setattr(compliance_route, "detect_compliance_gaps", lambda: base_results)
    monkeypatch.setattr(
        compliance_route,
        "enrich_compliance_results",
        lambda rows: [
            {
                **rows[0],
                "explanation": "The clause lacks explicit control requirements.",
            }
        ],
    )

    payload = compliance_route.compliance_analysis("controls", explain=True)

    assert payload["analysis"][0]["status"] == "gap"
    assert "remediation_suggestion" in payload["analysis"][0]
    assert payload["analysis"][0]["remediation_suggestion"].endswith(".")
