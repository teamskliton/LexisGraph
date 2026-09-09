import json
import logging
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv

from app.db.neo4j import run_query
from app.db.postgres import test_connection as check_postgres
from app.db.qdrant import test_connection as check_qdrant
from app.db.redis_client import test_connection as check_redis


def check_neo4j() -> bool:
    logger.info("Testing Neo4j connection...")
    try:
        result = run_query("MATCH (n) RETURN count(n) AS node_count")
        node_count = result[0]["node_count"] if result else 0
        logger.info("Neo4j connected successfully. Total nodes: %s", node_count)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("Neo4j connection failed: %s", exc)
        return False


def check_openrouter_or_gemini() -> bool:
    logger.info("Testing optional LLM connectivity (OpenRouter / Gemini)...")
    openrouter_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()

    if openrouter_key:
        try:
            req = urllib.request.Request(
                "https://openrouter.ai/api/v1/chat/completions",
                data=json.dumps(
                    {
                        "model": os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3-8b-instruct:free"),
                        "messages": [{"role": "user", "content": "Ping"}],
                    }
                ).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {openrouter_key}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10):
                logger.info("OpenRouter API connected successfully.")
                return True
        except urllib.error.HTTPError as err:
            logger.warning("OpenRouter HTTP Error %s: %s", err.code, err.read().decode("utf-8", errors="ignore"))
        except Exception as exc:  # noqa: BLE001
            logger.warning("OpenRouter connectivity error: %s", exc)

    if gemini_key:
        try:
            model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
            req = urllib.request.Request(
                url,
                data=json.dumps({"contents": [{"parts": [{"text": "Ping"}]}]}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10):
                logger.info("Gemini API connected successfully.")
                return True
        except urllib.error.HTTPError as err:
            logger.warning("Gemini HTTP Error %s: %s", err.code, err.read().decode("utf-8", errors="ignore"))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini connectivity error: %s", exc)

    logger.warning("No working LLM provider detected. Deterministic fallback reasoning will be used.")
    return False


if __name__ == "__main__":
    logger.info("=== LexisGraph Connection Check ===")
    pg_ok = check_postgres()
    neo4j_ok = check_neo4j()
    qdrant_ok = check_qdrant()
    redis_ok = check_redis()
    llm_ok = check_openrouter_or_gemini()
    logger.info(
        "Summary: Postgres=%s | Neo4j=%s | Qdrant=%s | Redis=%s | LLM=%s",
        pg_ok, neo4j_ok, qdrant_ok, redis_ok, llm_ok
    )
