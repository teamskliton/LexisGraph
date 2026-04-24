import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

try:
    from neo4j import GraphDatabase
except ImportError:  # pragma: no cover
    GraphDatabase = None


if load_dotenv is not None:
    _DOTENV_PATH = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(dotenv_path=_DOTENV_PATH)


NEO4J_URI = os.getenv("NEO4J_URI") or os.getenv("DB_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER") or os.getenv("DB_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD") or os.getenv("DB_PASS")

_DRIVER = None


def get_driver():
    """Create or return a cached Neo4j driver."""
    global _DRIVER

    if GraphDatabase is None:
        raise RuntimeError(
            "Neo4j driver is not installed. Install with: pip install neo4j"
        )

    if not NEO4J_PASSWORD:
        raise RuntimeError("Neo4j password is not configured. Set NEO4J_PASSWORD or DB_PASS.")

    if _DRIVER is None:
        _DRIVER = GraphDatabase.driver(
            NEO4J_URI,
            auth=(NEO4J_USER, NEO4J_PASSWORD),
        )
        logger.info("Neo4j driver initialized for uri=%s", NEO4J_URI)

    return _DRIVER


def run_query(query: str, parameters: dict | None = None) -> list[dict]:
    """Execute Cypher query and return list of record dictionaries."""
    driver = get_driver()
    with driver.session() as session:
        result = session.run(query, parameters or {})
        return [record.data() for record in result]


def test_connection() -> list[dict]:
    """Run a lightweight query to verify Neo4j connectivity."""
    return run_query("RETURN 'Neo4j Connected Successfully' AS message")


def close_driver() -> None:
    """Close cached Neo4j driver if initialized."""
    global _DRIVER

    if _DRIVER is not None:
        _DRIVER.close()
        logger.info("Neo4j driver closed")
        _DRIVER = None
