import logging

from fastapi import APIRouter, HTTPException, Query

from app.services.compliance import detect_compliance_gaps
from app.services.explainer import (
    check_gemini_health,
    enrich_compliance_results,
    generate_remediation_suggestion,
)
from app.services.retrieval import retrieve_relevant_clauses

router = APIRouter()
logger = logging.getLogger(__name__)

_MAX_ANALYSIS_ITEMS = 5


def _build_summary(results: list[dict]) -> dict:
    total_clauses = len(results)
    compliant_count = sum(1 for item in results if item.get("status") == "compliant")
    gap_count = sum(1 for item in results if item.get("status") == "gap")
    compliance_score = (compliant_count / total_clauses) if total_clauses else 0.0

    return {
        "total_clauses": total_clauses,
        "compliant": compliant_count,
        "gaps": gap_count,
        "compliance_score": round(compliance_score, 2),
    }


def _build_verdict(compliance_score: float) -> str:
    if compliance_score > 0.8:
        return "The policy is largely compliant with regulatory requirements."
    if compliance_score > 0.5:
        return "The policy is partially compliant but has some gaps."
    return "The policy has significant compliance gaps and needs improvement."


@router.get("/compliance-check")
def compliance_check() -> dict:
    try:
        raw_results = detect_compliance_gaps()
        return {"gaps": enrich_compliance_results(raw_results)}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Compliance check failed")
        raise HTTPException(status_code=500, detail="Compliance check failed") from exc


@router.get("/llm-health")
def llm_health() -> dict:
    try:
        healthy = check_gemini_health()
        if not healthy:
            raise HTTPException(status_code=503, detail="OpenRouter API unreachable")
        return {
            "llm_provider": "openrouter",
            "status": "healthy",
        }
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("OpenRouter LLM health check failed")
        raise HTTPException(status_code=503, detail="OpenRouter API unreachable") from exc


@router.get("/compliance-analysis")
def compliance_analysis(query: str, explain: bool = Query(True)) -> dict:
    try:
        normalized_query = (query or "").strip()
        if not normalized_query:
            summary = _build_summary([])
            return {
                "query": "",
                "summary": summary,
                "verdict": _build_verdict(summary["compliance_score"]),
                "analysis": [],
            }

        retrieval_results = retrieve_relevant_clauses(normalized_query)
        relevance_by_text: dict[str, float] = {}
        relevant_texts: set[str] = set()

        for result in retrieval_results:
            query_match = (result.get("query_match") or "").strip()
            similarity_score = result.get("similarity_score")
            relevance = float(similarity_score) if isinstance(similarity_score, (int, float)) else 0.0

            if query_match:
                relevant_texts.add(query_match)
                previous = relevance_by_text.get(query_match, 0.0)
                if relevance > previous:
                    relevance_by_text[query_match] = relevance

            for related_clause in result.get("related_clauses", []) or []:
                related_text = (related_clause or "").strip()
                if related_text:
                    relevant_texts.add(related_text)
                    relevance_by_text.setdefault(related_text, relevance * 0.9)

        compliance_results = detect_compliance_gaps()

        prioritized_results: list[dict] = []
        for item in compliance_results:
            policy_clause = (item.get("policy_clause") or "").strip()
            matched_clause = (item.get("matched_clause") or "").strip()
            if relevant_texts and policy_clause not in relevant_texts and matched_clause not in relevant_texts:
                continue
            prioritized_results.append(item)

        if not prioritized_results:
            prioritized_results = compliance_results

        def _sort_key(item: dict) -> tuple[float, float]:
            policy_clause = (item.get("policy_clause") or "").strip()
            matched_clause = (item.get("matched_clause") or "").strip()
            relevance = max(
                relevance_by_text.get(policy_clause, 0.0),
                relevance_by_text.get(matched_clause, 0.0),
            )
            confidence = item.get("confidence")
            confidence_value = float(confidence) if isinstance(confidence, (int, float)) else 0.0
            return (relevance, confidence_value)

        prioritized_results = sorted(prioritized_results, key=_sort_key, reverse=True)[:_MAX_ANALYSIS_ITEMS]

        if not explain:
            analysis_rows = [
                {
                    "policy_clause": item.get("policy_clause", ""),
                    "status": item.get("status", "gap"),
                    "confidence": item.get("confidence", 0.0),
                    "matched_clause": item.get("matched_clause"),
                    "remediation_suggestion": (
                        generate_remediation_suggestion(
                            policy_clause=item.get("policy_clause", ""),
                            matched_clause=item.get("matched_clause"),
                            explanation=None,
                            use_llm=False,
                        )
                        if item.get("status", "gap") == "gap"
                        else ""
                    ),
                }
                for item in prioritized_results
            ]
            summary = _build_summary(analysis_rows)
            verdict = _build_verdict(summary["compliance_score"])
            return {"query": normalized_query, "summary": summary, "verdict": verdict, "analysis": analysis_rows}

        explained_results = enrich_compliance_results(prioritized_results)
        analysis_rows = [
            {
                "policy_clause": item.get("policy_clause", ""),
                "status": item.get("status", "gap"),
                "confidence": item.get("confidence", 0.0),
                "explanation": item.get("explanation", "No explanation available."),
                "matched_clause": item.get("matched_clause"),
                "remediation_suggestion": (
                    generate_remediation_suggestion(
                        policy_clause=item.get("policy_clause", ""),
                        matched_clause=item.get("matched_clause"),
                        explanation=item.get("explanation", ""),
                        use_llm=True,
                    )
                    if item.get("status", "gap") == "gap"
                    else ""
                ),
            }
            for item in explained_results
        ]

        summary = _build_summary(analysis_rows)
        verdict = _build_verdict(summary["compliance_score"])
        return {"query": normalized_query, "summary": summary, "verdict": verdict, "analysis": analysis_rows}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Compliance analysis failed")
        summary = _build_summary([])
        return {
            "query": query,
            "summary": summary,
            "verdict": _build_verdict(summary["compliance_score"]),
            "analysis": [],
            "error": "Compliance analysis failed",
        }
