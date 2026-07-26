"""
Alembic migration environment configuration.

This module configures Alembic to work with SQLAlchemy 2.0 and our application
infrastructure.  Key behaviours:

- Loads the real DATABASE_URL from ``app.core.config`` — no hardcoded strings.
- Sets ``run_migrations_offline()`` to emit the full schema as SQL DDL statements
  (useful for review and manual application).
- Sets ``run_migrations_online()`` to drive migrations against a live PostgreSQL
  database using a connection from SQLAlchemy's pool.
- All models are imported lazily so that migration files only need to change
  when model definitions change; no import side-effects at import time.

Usage
-----
    alembic upgrade head          # apply all pending migrations
    alembic revision --autogenerate -m "add users table"
    alembic downgrade -1          # roll back the last migration
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Ensure ``app`` is importable from the backend root directory.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND_DIR))

from app.core.config import DATABASE_URL  # noqa: E402
from app.db.session import Base           # noqa: E402

# Alembic internal config — loaded from alembic.ini
config = context.config

# Log to stdout
logging.basicConfig(format="%(levelname)s: %(message)s")
logger = logging.getLogger("alembic")

# ----------------------------------------------------------------------
# SQLAlchemy URL sourced from our application config (not alembic.ini)
# ----------------------------------------------------------------------
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# ----------------------------------------------------------------------
# Import all models so autogenerate can inspect their schemas
# ----------------------------------------------------------------------
import app.db.models  # noqa: F402

# ----------------------------------------------------------------------
# Target metadata — used by ``autogenerate`` to detect model changes
# ----------------------------------------------------------------------
target_metadata = Base.metadata

# ----------------------------------------------------------------------
# Offline migration generator
# ----------------------------------------------------------------------


def run_migrations_offline() -> None:
    """
    Emit a SQL script that recreates the entire schema without a live DB connection.

    This is useful for:
        - Reviewing the DDL before applying it anywhere
        - Generating a script to hand to a DBA
        - Running on a system that does not have network access to PostgreSQL
    """
    url = config.get_main_option("sqlalchemy.url")
    if not url:
        logger.error("sqlalchemy.url is not set — aborting offline migration")
        sys.exit(1)

    logger.info("Generating offline migration script ...")

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table="alembic_version",
    )

    with context.begin_transaction():
        context.run_migrations()


# ----------------------------------------------------------------------
# Online migration runner
# ----------------------------------------------------------------------


def run_migrations_online() -> None:
    """
    Apply migrations against a live PostgreSQL database.

    Uses SQLAlchemy's ``create_engine`` (not raw ``psycopg``) so that
    the connection is pooled and participates in Alembic's transactional
    boundary.  ``NullPool`` delegates pool lifecycle to Alembic itself.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        future=True,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table="alembic_version",
        )

        with context.begin_transaction():
            context.run_migrations()

    logger.info("Online migration complete")


# ----------------------------------------------------------------------
# Entrypoint — Alembic calls this function when running migrations
# ----------------------------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()