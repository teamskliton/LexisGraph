import logging
import os
import re
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any
import requests

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

logger = logging.getLogger(__name__)

_EXPLANATION_CACHE: OrderedDict[tuple[str, str, str], str] = OrderedDict()

if load_dotenv is not None:
    _DOTENV_PATH = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(dotenv_path=_DOTENV_PATH)

_OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
_OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-001")
_OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1/chat/completions")
_OPENROUTER_TIMEOUT_SECONDS = int(os.getenv("OPENROUTER_TIMEOUT_SECONDS", os.getenv("GEMINI_TIMEOUT_SECONDS", "20")))
_OPENROUTER_RETRY_ATTEMPTS = max(1, int(os.getenv("OPENROUTER_RETRY_ATTEMPTS", "2")))
_OPENROUTER_RETRY_BACKOFF_SECONDS = float(os.getenv("OPENROUTER_RETRY_BACKOFF_SECONDS", "0.6"))
_OPENROUTER_REFERRER = os.getenv("OPENROUTER_HTTP_REFERER", "").strip()
_OPENROUTER_APP_TITLE = os.getenv("OPENROUTER_X_TITLE", "LexisGraph").strip()
_BATCH_SIZE = 5
_EXPLANATION_CACHE_MAX_SIZE = int(os.getenv("EXPLANATION_CACHE_MAX_SIZE", "2000"))

_SYSTEM_PROMPT = (
    "You are a legal compliance assistant. Use ONLY the provided policy and regulation text. "
    "Do not add external knowledge or assumptions. Keep each explanation concise, professional, "
    "and grounded strictly in the supplied inputs."
)


def get_cached_explanation(key: tuple[str, str, str]) -> str | None:
    value = _EXPLANATION_CACHE.get(key)
    if value is not None:
        _EXPLANATION_CACHE.move_to_end(key)
    return value


def set_cached_explanation(key: tuple[str, str, str], value: str) -> None:
    if key in _EXPLANATION_CACHE:
        _EXPLANATION_CACHE.move_to_end(key)
    _EXPLANATION_CACHE[key] = value
    while len(_EXPLANATION_CACHE) > _EXPLANATION_CACHE_MAX_SIZE:
        _EXPLANATION_CACHE.popitem(last=False)


def _normalize_text(value: object) -> str:
    return (value or "").__str__().strip()


def _cache_key(policy_clause: str, matched_clause: str | None, status: str) -> tuple[str, str, str]:
    return (
        _normalize_text(policy_clause),
        _normalize_text(matched_clause),
        _normalize_text(status).lower(),
    )


def _truncate(value: str, max_length: int = 1200) -> str:
    text = (value or "").strip()
    if len(text) <= max_length:
        return text
    return text[: max_length - 3].rstrip() + "..."


def _escape_prompt_text(value: str) -> str:
    text = (value or "").replace("```", "'''")
    text = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F]", " ", text)
    return text


def _build_single_prompt(
    policy_clause: str,
    matched_clause: str | None,
    status: str,
    confidence: float | None,
) -> str:
    confidence_text = f"{confidence:.4f}" if isinstance(confidence, (int, float)) else "N/A"
    normalized_status = (status or "").strip().lower()

    if normalized_status == "compliant":
        return (
            "Explain why this policy clause appears compliant. Use ONLY the provided policy and regulation text. "
            "Do not add external knowledge.\n\n"
            f"Policy clause:\n<{_escape_prompt_text(_truncate(policy_clause))}>\n\n"
            f"Matched regulation clause:\n<{_escape_prompt_text(_truncate(matched_clause or 'N/A'))}>\n\n"
            f"Status: {normalized_status}\n"
            f"Confidence: {confidence_text}\n\n"
            "Requirements: 2-3 short lines, professional tone, grounded strictly in the text above."
        )

    return (
        "Explain why this policy clause may be non-compliant and what is likely missing. Use ONLY the provided policy "
        "and regulation text. Do not add external knowledge.\n\n"
        f"Policy clause:\n<{_escape_prompt_text(_truncate(policy_clause))}>\n\n"
        f"Closest regulation clause (if available):\n<{_escape_prompt_text(_truncate(matched_clause or 'N/A'))}>\n\n"
        f"Status: {normalized_status or 'gap'}\n"
        f"Confidence: {confidence_text}\n\n"
        "Requirements: 2-3 short lines, professional tone, grounded strictly in the text above. "
        "If evidence is limited, say so explicitly."
    )


def _build_batch_prompt(items: list[dict]) -> str:
    sections: list[str] = []
    for index, item in enumerate(items, start=1):
        policy_clause = _escape_prompt_text(_truncate(_normalize_text(item.get("policy_clause"))))
        matched_clause = _escape_prompt_text(_truncate(_normalize_text(item.get("matched_clause")) or "N/A"))
        status = _normalize_text(item.get("status")).lower() or "gap"
        confidence = item.get("confidence")
        confidence_text = f"{confidence:.4f}" if isinstance(confidence, (int, float)) else "N/A"

        sections.append(
            f"{index}. Policy: {policy_clause}\n"
            f"   Regulation: {matched_clause}\n"
            f"   Status: {status}\n"
            f"   Confidence: {confidence_text}"
        )

    return (
        "Explain compliance status for the following clauses. Use ONLY the provided policy and regulation text. "
        "Do not add external knowledge or assumptions. Keep each explanation to 2-3 short lines and professional in tone. "
        "Return a numbered list with one explanation per clause in the same order.\n\n"
        + "\n\n".join(sections)
    )


def _call_openrouter(user_prompt: str) -> str | None:
    if not _OPENROUTER_API_KEY:
        return None

    payload = {
        "model": _OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
    }
    headers = {
        "Authorization": f"Bearer {_OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    if _OPENROUTER_REFERRER:
        headers["HTTP-Referer"] = _OPENROUTER_REFERRER
    if _OPENROUTER_APP_TITLE:
        headers["X-Title"] = _OPENROUTER_APP_TITLE

    retriable_codes = {429, 500, 502, 503, 504}
    body: dict[str, Any] | None = None

    for attempt in range(1, _OPENROUTER_RETRY_ATTEMPTS + 1):
        try:
            response = requests.post(
                _OPENROUTER_BASE_URL,
                headers=headers,
                json=payload,
                timeout=_OPENROUTER_TIMEOUT_SECONDS,
            )

            if response.status_code in retriable_codes and attempt < _OPENROUTER_RETRY_ATTEMPTS:
                wait_seconds = _OPENROUTER_RETRY_BACKOFF_SECONDS * attempt
                logger.warning(
                    "OpenRouter returned %s. Retrying in %.2fs (attempt %s/%s)",
                    response.status_code,
                    wait_seconds,
                    attempt,
                    _OPENROUTER_RETRY_ATTEMPTS,
                )
                time.sleep(wait_seconds)
                continue

            response.raise_for_status()
            body = response.json()
            break
        except requests.Timeout:
            if attempt < _OPENROUTER_RETRY_ATTEMPTS:
                wait_seconds = _OPENROUTER_RETRY_BACKOFF_SECONDS * attempt
                logger.warning(
                    "OpenRouter request timed out after %ss. Retrying in %.2fs (attempt %s/%s)",
                    _OPENROUTER_TIMEOUT_SECONDS,
                    wait_seconds,
                    attempt,
                    _OPENROUTER_RETRY_ATTEMPTS,
                )
                time.sleep(wait_seconds)
                continue

            logger.warning("OpenRouter explanation request timed out after %s seconds", _OPENROUTER_TIMEOUT_SECONDS)
            return None
        except requests.RequestException:
            logger.exception("Failed to generate explanation from OpenRouter API")
            return None
        except ValueError:
            logger.exception("OpenRouter API returned non-JSON response")
            return None

    if not isinstance(body, dict):
        return None

    choices = body.get("choices")
    if not isinstance(choices, list) or not choices:
        return None

    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None

    if isinstance(content, list):
        content = "\n".join(part.get("text", "") for part in content if isinstance(part, dict))

    if not isinstance(content, str) or not content.strip():
        return None

    return content.strip()


def _call_gemini(user_prompt: str) -> str | None:
    # Backward-compatible wrapper name used by existing internal call paths.
    return _call_openrouter(user_prompt)


def _call_gemini_batch(items: list[dict]) -> str | None:
    return _call_gemini(_build_batch_prompt(items))


def _normalize_explanation(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return "No explanation available."

    limited_lines = lines[:3]
    return "\n".join(limited_lines)


def _single_sentence(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "")).strip()
    if not cleaned:
        return "No remediation suggestion available."

    match = re.match(r"^(.*?[.!?])(?:\s|$)", cleaned)
    sentence = match.group(1).strip() if match else cleaned
    if sentence and sentence[-1] not in {".", "!", "?"}:
        sentence += "."
    return sentence


def _rule_based_remediation(policy_clause: str, matched_clause: str | None, explanation: str | None = None) -> str:
    text = " ".join(
        [
            (policy_clause or "").lower(),
            (matched_clause or "").lower(),
            (explanation or "").lower(),
        ]
    )

    if "logging" in text or "audit log" in text:
        return "Add audit log retention controls with clear monitoring and escalation requirements."
    if "authentication" in text or "access control" in text or "mfa" in text:
        return "Add stronger access control requirements, including multi-factor authentication for privileged access."
    if "breach" in text or "incident" in text:
        return "Add explicit breach reporting timelines and incident response obligations."
    if "encryption" in text or "encrypt" in text:
        return "Add mandatory encryption controls for data at rest and in transit."
    if "retention" in text or "records" in text:
        return "Add clear record retention periods and evidence preservation requirements."

    if matched_clause:
        return "Align this clause with the matched regulation by explicitly adding its mandatory controls and conditions."
    return "Add explicit mandatory controls, measurable requirements, and enforcement conditions for this obligation."


def _fallback_explanation(status: str, confidence: float | None, matched_clause: str | None) -> str:
    normalized_status = (status or "").strip().lower()

    if normalized_status == "compliant":
        if matched_clause:
            return f"This clause aligns with '{_truncate(matched_clause, 400)}'."
        return "This clause aligns with the available regulation text."

    _ = confidence
    return "No sufficiently similar regulation clause was found."


def _parse_batch_response(text: str, expected_count: int) -> list[str] | None:
    lines = [line.rstrip() for line in text.splitlines() if line.strip()]
    explanations: list[str] = []
    current: list[str] = []
    current_index = 0

    pattern = re.compile(r"^\s*(\d+)[\).:-]?\s*(.*)$")

    for line in lines:
        match = pattern.match(line)
        if match:
            if current:
                explanations.append(_normalize_explanation("\n".join(current)))
                current = []

            current_index = int(match.group(1))
            content = match.group(2).strip()
            if content:
                current.append(content)
            continue

        if current_index:
            current.append(line.strip())

    if current:
        explanations.append(_normalize_explanation("\n".join(current)))

    if len(explanations) != expected_count:
        return None

    return explanations


def _batch_or_fallback(items: list[dict]) -> list[str]:
    if not items:
        return []

    llm_output = _call_gemini_batch(items)
    if llm_output:
        parsed = _parse_batch_response(llm_output, len(items))
        if parsed is not None:
            return parsed

    return [
        _fallback_explanation(item.get("status", "gap"), item.get("confidence"), item.get("matched_clause"))
        for item in items
    ]


def generate_explanations_batch(items: list[dict]) -> list[str]:
    """Generate explanations for multiple compliance results with caching and batching."""
    if not items:
        return []

    ordered_results: list[str | None] = [None] * len(items)
    cache_misses: list[tuple[int, dict]] = []

    for index, item in enumerate(items):
        key = _cache_key(item.get("policy_clause", ""), item.get("matched_clause"), item.get("status", "gap"))
        cached = get_cached_explanation(key)
        if cached is not None:
            ordered_results[index] = cached
            continue

        cache_misses.append((index, item))

    for offset in range(0, len(cache_misses), _BATCH_SIZE):
        batch_slice = cache_misses[offset : offset + _BATCH_SIZE]
        batch_items = [item for _, item in batch_slice]
        batch_explanations = _batch_or_fallback(batch_items)

        for (original_index, item), explanation in zip(batch_slice, batch_explanations, strict=False):
            key = _cache_key(item.get("policy_clause", ""), item.get("matched_clause"), item.get("status", "gap"))
            normalized = _normalize_explanation(explanation)
            set_cached_explanation(key, normalized)
            ordered_results[original_index] = normalized

    return [result or "No explanation available." for result in ordered_results]


def generate_explanation(
    policy_clause: str,
    matched_clause: str | None,
    status: str,
    confidence: float | None = None,
) -> str:
    """Generate a concise, grounded explanation for a compliance result."""
    key = _cache_key(policy_clause, matched_clause, status)
    cached = get_cached_explanation(key)
    if cached is not None:
        return cached

    prompt = _build_single_prompt(policy_clause, matched_clause, status, confidence)
    llm_output = _call_gemini(prompt)

    if llm_output:
        explanation = _normalize_explanation(llm_output)
        set_cached_explanation(key, explanation)
        return explanation

    explanation = _fallback_explanation(status, confidence, matched_clause)
    set_cached_explanation(key, explanation)
    return explanation


def enrich_compliance_results(results: list[dict]) -> list[dict]:
    """Attach batched explanation text to each compliance result record."""
    if not results:
        return []

    explanation_inputs: list[dict[str, Any]] = []
    for item in results:
        explanation_inputs.append(
            {
                "policy_clause": (item.get("policy_clause") or "").strip(),
                "matched_clause": item.get("matched_clause"),
                "status": str(item.get("status") or "gap"),
                "confidence": item.get("confidence"),
            }
        )

    explanations = generate_explanations_batch(explanation_inputs)
    enriched: list[dict] = []

    for item, explanation in zip(results, explanations, strict=False):
        enriched_item = dict(item)
        enriched_item["explanation"] = explanation
        enriched.append(enriched_item)

    return enriched


def enrich_compliance_results_without_explanations(results: list[dict]) -> list[dict]:
    """Return structured compliance results without LLM calls."""
    return [dict(item) for item in results]


def check_gemini_health() -> bool:
    """Return whether OpenRouter API is reachable and can generate a minimal response."""
    output = _call_gemini("Reply with exactly: OK")
    return isinstance(output, str) and bool(output.strip())


def generate_remediation_suggestion(
    policy_clause: str,
    matched_clause: str | None,
    explanation: str | None = None,
    use_llm: bool = True,
) -> str:
    """Generate a concise one-sentence remediation recommendation for a gap clause."""
    if matched_clause:
        matched_based = (
            "Align this clause with the matched regulation by explicitly requiring "
            f"{_truncate(_normalize_text(matched_clause), 180)}"
        )
        return _single_sentence(matched_based)

    if use_llm:
        prompt = (
            "Provide exactly one concise sentence describing a remediation action for this non-compliant policy clause. "
            "Use ONLY the provided text and do not add external assumptions.\n\n"
            f"Policy clause:\n<{_escape_prompt_text(_truncate(_normalize_text(policy_clause), 1200))}>\n\n"
            f"Context explanation:\n<{_escape_prompt_text(_truncate(_normalize_text(explanation), 1200) or 'N/A')}>\n"
        )
        llm_output = _call_gemini(prompt)
        if llm_output:
            return _single_sentence(llm_output)

    return _single_sentence(_rule_based_remediation(policy_clause, matched_clause, explanation))
