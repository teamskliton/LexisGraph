import json
import logging
import os
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent.parent / ".env", override=True)
logger = logging.getLogger(__name__)

_OPENROUTER_WORKING_MODEL: str | None = None
_OPENROUTER_UNAVAILABLE_MODELS: set[str] = set()


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _is_enabled_key(value: str) -> bool:
    return bool(value) and not value.startswith("your_")


def _provider_mode() -> str:
    provider = _env("LLM_REASONING_PROVIDER", "auto").lower()
    if provider in {"openrouter", "gemini", "none", "auto"}:
        return provider
    return "auto"


def _build_prompt(
    policy_clause: str,
    matched_clause: str,
    status: str,
    vector_score: float,
    graph_score: float,
) -> str:
    return (
        "You are LexisGraph AI Legal Compliance Auditor.\n"
        f'User Policy Clause: "{policy_clause}"\n'
        f'Reference Legal Regulation Clause: "{matched_clause}"\n'
        f"Calculated Metric Status: {status.upper()} "
        f"(Vector similarity: {vector_score}, Graph similarity: {graph_score})\n\n"
        "Provide a concise 2-3 sentence legal compliance reasoning explaining whether the policy "
        "meets, partially meets, or fails the legal regulation requirements."
    )


def _openrouter_model_candidates() -> list[str]:
    configured = _env("OPENROUTER_MODEL", "meta-llama/llama-3.1-8b-instruct:free")
    candidates = [
        configured,
        "meta-llama/llama-3.1-8b-instruct:free",
        "google/gemini-2.0-flash-001",
        "openai/gpt-4o-mini",
        "openai/gpt-4o",
    ]
    deduped: list[str] = []
    for model in candidates:
        if model and model not in deduped:
            deduped.append(model)
    return deduped


def _openrouter_reasoning(prompt: str) -> str | None:
    global _OPENROUTER_WORKING_MODEL

    openrouter_api_key = _env("OPENROUTER_API_KEY")
    if not _is_enabled_key(openrouter_api_key):
        return None

    timeout_seconds = float(_env("OPENROUTER_TIMEOUT_SECONDS", "12") or "12")
    model_candidates = _openrouter_model_candidates()

    if _OPENROUTER_WORKING_MODEL and _OPENROUTER_WORKING_MODEL not in _OPENROUTER_UNAVAILABLE_MODELS:
        model_candidates = [_OPENROUTER_WORKING_MODEL] + [
            model for model in model_candidates if model != _OPENROUTER_WORKING_MODEL
        ]

    for model_name in model_candidates:
        if model_name in _OPENROUTER_UNAVAILABLE_MODELS:
            continue

        try:
            payload = json.dumps(
                {
                    "model": model_name,
                    "messages": [{"role": "user", "content": prompt}],
                }
            ).encode("utf-8")

            req = urllib.request.Request(
                "https://openrouter.ai/api/v1/chat/completions",
                data=payload,
                headers={
                    "Authorization": f"Bearer {openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:8001",
                    "X-Title": "LexisGraph Legal Auditor",
                },
                method="POST",
            )

            with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
                result = json.loads(response.read().decode("utf-8"))
                choices = result.get("choices", [])
                if choices:
                    content = choices[0].get("message", {}).get("content", "")
                    if content:
                        if _OPENROUTER_WORKING_MODEL != model_name:
                            logger.info("OpenRouter reasoning model selected: %s", model_name)
                        _OPENROUTER_WORKING_MODEL = model_name
                        return content.strip()
        except urllib.error.HTTPError as http_err:
            error_body = http_err.read().decode("utf-8", errors="ignore")
            if http_err.code == 404 and "No endpoints found" in error_body:
                _OPENROUTER_UNAVAILABLE_MODELS.add(model_name)
                logger.warning("OpenRouter model unavailable, skipping: %s", model_name)
                continue
            logger.warning("OpenRouter API HTTP Error %s for model %s: %s", http_err.code, model_name, error_body)
        except Exception as exc:  # noqa: BLE001
            logger.warning("OpenRouter LLM reasoning API call failed for model %s: %s", model_name, exc)
            break

    return None


def _gemini_reasoning(prompt: str) -> str | None:
    gemini_api_key = _env("GEMINI_API_KEY")
    if not _is_enabled_key(gemini_api_key):
        return None

    candidate_models = [
        _env("GEMINI_MODEL", "gemini-1.5-flash"),
        "gemini-2.0-flash",
        "gemini-1.5-pro",
    ]
    timeout_seconds = float(_env("GEMINI_TIMEOUT_SECONDS", "10") or "10")

    for model_name in dict.fromkeys(candidate_models):
        try:
            url = (
                "https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model_name}:generateContent?key={gemini_api_key}"
            )
            payload = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
                result = json.loads(response.read().decode("utf-8"))
                candidates = result.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts and "text" in parts[0]:
                        return parts[0]["text"].strip()
        except urllib.error.HTTPError as http_err:
            error_body = http_err.read().decode("utf-8", errors="ignore")
            logger.warning("Gemini API HTTP Error %s for model %s: %s", http_err.code, model_name, error_body)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini reasoning API call failed for model %s: %s", model_name, exc)

    return None


def _resolve_reasoning(prompt: str) -> str | None:
    provider = _provider_mode()
    openrouter_enabled = _is_enabled_key(_env("OPENROUTER_API_KEY"))
    gemini_enabled = _is_enabled_key(_env("GEMINI_API_KEY"))

    if provider == "none":
        return None
    if provider == "openrouter":
        return _openrouter_reasoning(prompt)
    if provider == "gemini":
        return _gemini_reasoning(prompt)

    if openrouter_enabled:
        return _openrouter_reasoning(prompt)
    if gemini_enabled:
        return _gemini_reasoning(prompt)
    return None


def generate_compliance_reasoning(
    policy_clause: str,
    matched_clause: str | None,
    status: str,
    vector_score: float,
    graph_score: float,
) -> str:
    """Generate a concise legal reasoning summary comparing a policy clause to a matched reference clause."""
    if not matched_clause:
        return (
            "No matching reference clause was found in the current corpus. "
            "This clause is flagged as a potential compliance gap and should be reviewed manually."
        )

    prompt = _build_prompt(policy_clause, matched_clause, status, vector_score, graph_score)
    llm_reasoning = _resolve_reasoning(prompt)
    if llm_reasoning:
        return llm_reasoning

    if status == "compliant":
        return (
            f"Policy clause aligns strongly with the matched reference clause "
            f"(Vector: {vector_score}, Graph: {graph_score}). The current wording appears to satisfy the requirement."
        )
    if status == "partial":
        return (
            f"Policy clause shows partial alignment with the matched reference clause "
            f"(Vector: {vector_score}, Graph: {graph_score}). Additional controls or clarifying language are recommended."
        )
    return (
        f"Policy clause has low alignment with the matched reference clause "
        f"(Vector: {vector_score}, Graph: {graph_score}). This should be treated as a likely compliance gap."
    )
