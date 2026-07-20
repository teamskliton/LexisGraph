import os
import sys
import json
import logging
import urllib.request
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_openrouter")

key = os.getenv("OPENROUTER_API_KEY")

def check_key():
    logger.info("🔍 Checking OpenRouter API Key details...")
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/auth/key",
        headers={"Authorization": f"Bearer {key}"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            logger.info("✅ OpenRouter Key Info: %s", json.dumps(data, indent=2))
    except Exception as exc:
        logger.warning("Could not fetch auth key info: %s", exc)

def test_models():
    candidates = [
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
        "anthropic/claude-3.5-sonnet",
        "anthropic/claude-3-haiku",
        "google/gemini-2.0-flash-001",
        "meta-llama/llama-3.1-8b-instruct:free",
        "meta-llama/llama-3-8b-instruct:free"
    ]

    working_model = None

    for model in candidates:
        logger.info("Testing model: %s ...", model)
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=json.dumps({
                "model": model,
                "messages": [{"role": "user", "content": "Respond with 'OK'."}]
            }).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:8001",
                "X-Title": "LexisGraph Legal Auditor",
            },
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                reply = data["choices"][0]["message"]["content"]
                logger.info("🎉 SUCCESS with model '%s'! Response: %s", model, reply.strip())
                working_model = model
                break
        except urllib.error.HTTPError as err:
            err_msg = err.read().decode("utf-8", errors="ignore")
            logger.warning("❌ Model %s returned HTTP %s: %s", model, err.code, err_msg)
        except Exception as exc:
            logger.warning("❌ Model %s failed: %s", model, exc)

    return working_model

if __name__ == "__main__":
    check_key()
    best = test_models()
    if best:
        logger.info("🌟 RECOMMENDED OPENROUTER_MODEL setting: %s", best)
