import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from neo4j import GraphDatabase
from neo4j.exceptions import AuthError, ServiceUnavailable

logger = logging.getLogger(__name__)

_backend_dir = Path(__file__).resolve().parent.parent.parent
_env_path = _backend_dir / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

NEO4J_URI = os.getenv("NEO4J_URI", "").strip()
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j").strip()
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "").strip()
NEO4J_DATABASE = os.getenv("NEO4J_DATABASE", "neo4j").strip()

_uri_preview = (NEO4J_URI[:30] + "...") if len(NEO4J_URI) > 30 else (NEO4J_URI or "(empty)")
logger.info("Neo4j URI loaded from env: %s", _uri_preview)
logger.info("Neo4j USER loaded from env: %s", NEO4J_USER)
logger.info("Neo4j DATABASE loaded from env: %s", NEO4J_DATABASE)

if not NEO4J_URI:
    logger.error(".env missing NEO4J_URI - Neo4j will be unavailable")

if not NEO4J_PASSWORD:
    logger.error(".env missing NEO4J_PASSWORD - Neo4j will be unavailable")

_driver = None


def get_driver():
    global _driver
    if _driver is None:
        if not NEO4J_URI or not NEO4J_PASSWORD:
            logger.error("Cannot initialize Neo4j driver: URI or PASSWORD missing in .env")
            return None
        try:
            _driver = GraphDatabase.driver(
                NEO4J_URI,
                auth=(NEO4J_USER, NEO4J_PASSWORD),
                connection_timeout=2.0,
                max_connection_lifetime=30,
            )

            _init_preview = (NEO4J_URI[:40] + "...") if len(NEO4J_URI) > 40 else NEO4J_URI
            logger.info("Neo4j driver initialized for uri=%s", _init_preview)
        except Exception as exc:  # noqa: BLE001
            logger.error("Neo4j driver creation failed: %s", exc)
            return None
    return _driver


def run_query(query: str, parameters: dict | None = None, write: bool = False):
    driver = get_driver()
    if driver is None:
        logger.warning("Neo4j unavailable: driver is None, skipping query")
        return []

    def _work(tx):
        result = tx.run(query, parameters or {})
        return [record.data() for record in result]

    try:
        with driver.session(database=NEO4J_DATABASE) as session:
            if write:
                return session.execute_write(_work)
            return session.execute_read(_work)
    except (ServiceUnavailable, AuthError) as exc:
        logger.warning("Neo4j query failed: %s", exc)
        return []
    except Exception as exc:  # noqa: BLE001
        logger.error("Unexpected Neo4j error: %s", exc)
        return []


def test_connection():
    result = run_query("RETURN 'Neo4j Connected Successfully' AS message")
    if not result:
        raise ServiceUnavailable("Neo4j connection test returned no rows")
    return result


def is_neo4j_available() -> bool:
    result = run_query("RETURN 1 AS ping")
    return bool(result)


def close_driver():
    global _driver
    if _driver:
        _driver.close()
        _driver = None
        logger.info("Neo4j driver closed")
