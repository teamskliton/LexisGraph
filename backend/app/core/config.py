"""
Application configuration.

Loads settings from environment variables.
"""
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Locate .env relative to the backend directory
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(dotenv_path=_BACKEND_DIR / ".env", override=True)


def get_database_url() -> str:
    """
    Build the PostgreSQL connection URL from environment variables.

    Precedence:
        1. DATABASE_URL (full connection string, e.g. postgresql+psycopg://...)
        2. Individual components (POSTGRES_USER, POSTGRES_PASSWORD, etc.)

    Returns
    -------
    str
        A SQLAlchemy-compatible PostgreSQL connection URL.
    """
    # Full connection string takes priority
    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url:
        return database_url

    # Fall back to individual components
    user = os.getenv("POSTGRES_USER", "postgres").strip()
    password = os.getenv("POSTGRES_PASSWORD", "").strip()
    host = os.getenv("POSTGRES_HOST", "localhost").strip()
    port = os.getenv("POSTGRES_PORT", "5432").strip()
    dbname = os.getenv("POSTGRES_DB", "lexisgraph").strip()

    if not password:
        logger.warning("POSTGRES_PASSWORD is not set — PostgreSQL may be unavailable")

    return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{dbname}"


# Convenience export so callers can import directly
DATABASE_URL = get_database_url()