import os
import sys
import json
import logging
import urllib.request
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv
from app.db.mongo import get_database
from app.db.neo4j import run_query

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("check_connections")


def check_mongo():
    logger.info("🔍 Testing MongoDB Atlas Connection...")
    try:
        db = get_database()
        command_result = db.command("ping")
        logger.info("✅ MongoDB Connected Successfully! Ping result: %s", command_result)
        user_count = db["user_documents"].count_documents({})
        ext_count = db["external_documents"].count_documents({})
        dom_count = db["domain_documents"].count_documents({})
        logger.info("   MongoDB Doc Counts -> user: %s | external: %s | domain: %s", user_count, ext_count, dom_count)
        return True
    except Exception as exc:
        logger.error("❌ MongoDB Connection Failed: %s", exc)
        return False


def check_neo4j():
    logger.info("🔍 Testing Neo4j Aura Connection...")
    try:
        result = run_query("MATCH (n) RETURN count(n) AS node_count")
        logger.info("✅ Neo4j Connected Successfully! Total nodes in database: %s", result[0]["node_count"] if result else 0)
        return True
    except Exception as exc:
        logger.error("❌ Neo4j Connection Failed: %s", exc)
        return False


def check_openrouter_or_gemini():
    logger.info("🔍 Testing LLM API Connectivity (OpenRouter / Gemini)...")
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")

    if openrouter_key:
        logger.info("Testing OpenRouter API Key...")
        try:
            req = urllib.request.Request(
                "https://openrouter.ai/api/v1/chat/completions",
                data=json.dumps({
                    "model": "meta-llama/llama-3-8b-instruct:free",
                    "messages": [{"role": "user", "content": "Ping"}]
                }).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {openrouter_key}",
                    "Content-Type": "application/json",
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                logger.info("✅ OpenRouter API Connected Successfully!")
                return True
        except urllib.error.HTTPError as err:
            logger.warning("⚠️ OpenRouter HTTP Error %s: %s", err.code, err.read().decode("utf-8", errors="ignore"))
        except Exception as exc:
            logger.warning("⚠️ OpenRouter Error: %s", exc)

    if gemini_key:
        logger.info("Testing Gemini API Key...")
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
            req = urllib.request.Request(
                url,
                data=json.dumps({"contents": [{"parts": [{"text": "Ping"}]}]}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                logger.info("✅ Gemini API Connected Successfully!")
                return True
        except urllib.error.HTTPError as err:
            logger.warning("⚠️ Gemini HTTP Error %s: %s", err.code, err.read().decode("utf-8", errors="ignore"))
        except Exception as exc:
            logger.warning("⚠️ Gemini Error: %s", exc)

    logger.warning("⚠️ No valid active LLM API key detected. Automated algorithmic fallback will be used.")
    return False


if __name__ == "__main__":
    logger.info("=== LexisGraph Health & Connection Check ===")
    mongo_ok = check_mongo()
    neo4j_ok = check_neo4j()
    llm_ok = check_openrouter_or_gemini()
    logger.info("Summary: Mongo=%s | Neo4j=%s | LLM_API=%s", mongo_ok, neo4j_ok, llm_ok)
