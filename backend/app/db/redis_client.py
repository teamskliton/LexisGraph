import logging
import os
from pathlib import Path

import redis
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

_backend_dir = Path(__file__).resolve().parent.parent.parent
_env_path = _backend_dir / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

REDIS_HOST = os.getenv("REDIS_HOST", "localhost").strip()
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

_redis_client: redis.Redis | None = None


def get_client() -> redis.Redis:
    """Create/reuse the Redis client."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )
        logger.info("Redis client initialised for %s:%s", REDIS_HOST, REDIS_PORT)
    return _redis_client


def test_connection() -> bool:
    """Ping Redis to verify reachability."""
    try:
        get_client().ping()
        logger.info("Redis connectivity OK")
        return True
    except redis.ConnectionError as exc:
        logger.warning("Redis connectivity FAILED: %s", exc)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis connectivity FAILED (unexpected): %s", exc)
        return False


def close_client() -> None:
    """Close the Redis connection pool."""
    global _redis_client
    if _redis_client is not None:
        _redis_client.close()
        _redis_client = None
        logger.info("Redis client closed")
