import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.http.exceptions import UnexpectedResponse

logger = logging.getLogger(__name__)

_backend_dir = Path(__file__).resolve().parent.parent.parent
_env_path = _backend_dir / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost").strip()
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))

_client: QdrantClient | None = None


def get_client() -> QdrantClient:
    """Create/reuse the Qdrant client."""
    global _client
    if _client is None:
        _client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT, timeout=5)
        logger.info("Qdrant client initialised for %s:%s", QDRANT_HOST, QDRANT_PORT)
    return _client


def test_connection() -> bool:
    """List collections to verify Qdrant reachability."""
    try:
        get_client().get_collections()
        logger.info("Qdrant connectivity OK")
        return True
    except UnexpectedResponse as exc:
        logger.warning("Qdrant connectivity FAILED (unexpected response): %s", exc)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.warning("Qdrant connectivity FAILED: %s", exc)
        return False


def close_client() -> None:
    """Close the Qdrant client."""
    global _client
    if _client is not None:
        _client.close()
        _client = None
        logger.info("Qdrant client closed")
