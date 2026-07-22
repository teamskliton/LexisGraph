import json
import logging
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_openrouter")

key = os.getenv("OPENROUTER_API_KEY", "").strip()


def check_key() -> None:
    if not key:
        logger.warning("OPENROUTER_API_KEY is not set.")
        return

    logger.info("Checking OpenRouter API key details...")
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/auth/key",
        headers={"Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            logger.info("OpenRouter key info: %s", json.dumps(data, indent=2))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not fetch auth key info: %s", exc)


def test_models() -> str | None:
    if not key:
        return None

    candidates = [
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
        "anthropic/claude-3.5-sonnet",
        "anthropic/claude-3-haiku",
        "google/gemini-2.0-flash-001",
        "meta-llama/llama-3.1-8b-instruct:free",
        "meta-llama/llama-3-8b-instruct:free",
    ]

    for model in candidates:
        logger.info("Testing model: %s", model)
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=json.dumps(
                {
                    "model": model,
                    "messages": [{"role": "user", "content": "Respond with 'OK'."}],
                }
            ).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:8001",
                "X-Title": "LexisGraph Legal Auditor",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                reply = data["choices"][0]["message"]["content"]
                logger.info("Success with model '%s'. Response: %s", model, reply.strip())
                return model
        except urllib.error.HTTPError as err:
            err_msg = err.read().decode("utf-8", errors="ignore")
            logger.warning("Model %s returned HTTP %s: %s", model, err.code, err_msg)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Model %s failed: %s", model, exc)

    return None


if __name__ == "__main__":
    check_key()
    best = test_models()
    if best:
        logger.info("Recommended OPENROUTER_MODEL setting: %s", best)
