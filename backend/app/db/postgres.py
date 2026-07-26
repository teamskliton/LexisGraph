import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

logger = logging.getLogger(__name__)

_backend_dir = Path(__file__).resolve().parent.parent.parent
_env_path = _backend_dir / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres").strip()
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "").strip()
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost").strip()
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432").strip()
POSTGRES_DB = os.getenv("POSTGRES_DB", "lexisgraph").strip()

DATABASE_URL = (
    f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
    f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
)

_engine = None


def get_engine():
    """Create/reuse the SQLAlchemy engine for PostgreSQL."""
    global _engine
    if _engine is None:
        if not POSTGRES_PASSWORD:
            logger.warning("POSTGRES_PASSWORD not set — PostgreSQL may be unavailable")
        _engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,          # verify connection before use
            pool_size=5,
            max_overflow=10,
            connect_args={"connect_timeout": 10},
        )
        logger.info(
            "PostgreSQL engine created for %s@%s:%s/%s",
            POSTGRES_USER,
            POSTGRES_HOST,
            POSTGRES_PORT,
            POSTGRES_DB,
        )
    return _engine


def test_connection() -> bool:
    """Execute a trivial query to verify PostgreSQL reachability."""
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("PostgreSQL connectivity OK")
        return True
    except OperationalError as exc:
        logger.warning("PostgreSQL connectivity FAILED: %s", exc)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.error("PostgreSQL unexpected error: %s", exc)
        return False


def close_engine() -> None:
    """Dispose the SQLAlchemy connection pool."""
    global _engine
    if _engine is not None:
        _engine.dispose()
        _engine = None
        logger.info("PostgreSQL engine disposed")
