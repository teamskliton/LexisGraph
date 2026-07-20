import json
import logging
import os
import urllib.error
import urllib.request
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")


def generate_compliance_reasoning(
    policy_clause: str,
    matched_clause: str | None,
    status: str,
    vector_score: float,
    graph_score: float,
) -> str:
    """Generate a concise legal reasoning summary comparing policy clause to matched regulation clause."""
    if not matched_clause:
        return "No matching reference regulation clause found in current database corpus. Flagged as a potential compliance gap."

    # Try OpenRouter API if key exists
    if OPENROUTER_API_KEY and not OPENROUTER_API_KEY.startswith("your_"):
        try:
            model_name = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3-8b-instruct:free")
            url = "https://openrouter.ai/api/v1/chat/completions"
            prompt = (
                f"You are LexisGraph AI Legal Compliance Auditor.\n"
                f"User Policy Clause: \"{policy_clause}\"\n"
                f"Reference Legal Regulation Clause: \"{matched_clause}\"\n"
                f"Calculated Metric Status: {status.upper()} (Vector similarity: {vector_score}, Graph similarity: {graph_score})\n\n"
                f"Provide a 2-3 sentence legal compliance reasoning explaining whether the policy meets, partially meets, or fails the legal regulation requirements."
            )
            payload = json.dumps({
                "model": model_name,
                "messages": [{"role": "user", "content": prompt}]
            }).encode("utf-8")

            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:8001",
                    "X-Title": "LexisGraph Legal Auditor",
                },
                method="POST",
            )

            with urllib.request.urlopen(req, timeout=12) as response:
                result = json.loads(response.read().decode("utf-8"))
                choices = result.get("choices", [])
                if choices:
                    content = choices[0].get("message", {}).get("content", "")
                    if content:
                        return content.strip()
        except urllib.error.HTTPError as http_err:
            error_body = http_err.read().decode("utf-8", errors="ignore")
            logger.warning("OpenRouter API HTTP Error %s: %s", http_err.code, error_body)
        except Exception as exc:  # noqa: BLE001
            logger.warning("OpenRouter LLM reasoning API call failed: %s", exc)

    # Try Gemini API if key exists
    if GEMINI_API_KEY and not GEMINI_API_KEY.startswith("your_"):
        candidate_models = [os.getenv("GEMINI_MODEL", "gemini-1.5-flash"), "gemini-2.0-flash", "gemini-1.5-pro"]
        for model_name in candidate_models:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
                prompt = (
                    f"You are LexisGraph AI Legal Compliance Auditor.\n"
                    f"User Policy Clause: \"{policy_clause}\"\n"
                    f"Reference Legal Regulation Clause: \"{matched_clause}\"\n"
                    f"Calculated Metric Status: {status.upper()} (Vector similarity: {vector_score}, Graph similarity: {graph_score})\n\n"
                    f"Provide a 2-3 sentence legal compliance reasoning explaining whether the policy meets, partially meets, or fails the legal regulation requirements."
                )
                payload = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode("utf-8")

                req = urllib.request.Request(
                    url,
                    data=payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )

                with urllib.request.urlopen(req, timeout=10) as response:
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
                logger.warning("LLM reasoning API call failed for model %s: %s", model_name, exc)

    # Standard fallback reasoning synthesis
    if status == "compliant":
        return f"Policy clause aligns strongly with reference regulation (Vector: {vector_score}, Graph: {graph_score}). Requirements appear fully satisfied."
    if status == "partial":
        return f"Policy clause shows partial overlap with reference regulation (Vector: {vector_score}, Graph: {graph_score}). Additional operational controls recommended."
    return f"Policy clause has low alignment with reference regulation (Vector: {vector_score}, Graph: {graph_score}). Flagged as a compliance gap."
