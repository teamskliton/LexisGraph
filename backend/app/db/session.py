"""
SQLAlchemy 2.0 session factory and database dependency.

This module provides:
    - A reusable SQLAlchemy Engine configured for the application.
    - A SessionLocal factory (scoped session class) bound to that engine.
    - A Base class for declarative models (metadata only — no models defined here yet).
    - A FastAPI dependency ``get_db()`` that yields a fresh session per request
      and automatically closes it when the request finishes.

Usage
-----
    from app.db.session import get_db, SessionLocal, Base

    # Inside a FastAPI route
    @app.get("/example")
    def example_route(db: Session = Depends(get_db)):
        result = db.execute(select(User).where(User.id == 1))
        return result.scalar_one_or_none()

Notes
-----
    - All database lazily is initialised on first use — no connection is made
      when this module is imported.  This allows Alembic and other tools to
      import ``Base`` without triggering a live DB connection.
    - ``pool_pre_ping=True`` validates connections before checkout
      (handles stale connections from idle timeouts).
    - ``pool_recycle=300`` replaces connections after 5 minutes to avoid
      PostgreSQL's ``idle_in_transaction_session_timeout``.
    - ``future=True`` enables SQLAlchemy 2.0 behavioral mode.
    - ``pool_size=5`` and ``max_overflow=10`` are reasonable defaults for
      moderate traffic; adjust based on deployment.
"""
from __future__ import annotations

import logging
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# SQLAlchemy Engine (lazy — created on first use, not at import time)
# ---------------------------------------------------------------------------

_engine: Engine | None = None


def get_engine() -> Engine:
    """
    Create (or return the cached) SQLAlchemy Engine.

    Lazily initialised on first call — importing this module does NOT
    attempt a database connection.

    Connection parameters:
    - ``pool_pre_ping=True`` — send a test ping before using a connection
      from the pool, avoiding errors from connections dropped by the server.
    - ``pool_recycle=300`` — recycle connections after 5 minutes so they
      do not hit PostgreSQL's idle-in-transaction timeout.
    - ``pool_size=5`` — minimum connections kept in the pool.
    - ``max_overflow=10`` — extra connections created under load before the
      pool blocks waiting for one to be returned.
    - ``future=True`` — opt into SQLAlchemy 2.0 behaviors and deprecate
      legacy APIs.
    - ``connect_timeout=10`` — fail fast if the server is unreachable.

    Returns
    -------
    Engine
        Configured SQLAlchemy engine instance.
    """
    global _engine

    if _engine is None:
        # Import here so this module can be imported by Alembic / tests
        # without triggering a live database connection at import time.
        from app.core.config import get_database_url

        database_url = get_database_url()
        _engine = create_engine(
            database_url,
            pool_pre_ping=True,
            pool_recycle=300,
            pool_size=5,
            max_overflow=10,
            future=True,
            connect_args={"connect_timeout": 10},
        )
        logger.info(
            "PostgreSQL engine initialised — pool_size=%d, max_overflow=%d",
            5,
            10,
        )

    return _engine


# ---------------------------------------------------------------------------
# Session factory (lazy — created on first use)
# ---------------------------------------------------------------------------

_SessionLocal: sessionmaker | None = None


def _get_session_local() -> sessionmaker:
    """Lazily create the sessionmaker (called on first session request)."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            bind=get_engine(),
            autocommit=False,
            autoflush=False,
        )
    return _SessionLocal


def get_session() -> Session:
    """
    Produce a new SQLAlchemy ORM session.

    This is the internal factory used by ``get_db()``.  Exposed separately
    so that code outside FastAPI request handlers (e.g. scripts, tests)
    can create sessions without going through the dependency injection
    mechanism.

    Returns
    -------
    Session
        A new uncommitted session.  Caller is responsible for commit/close.
    """
    return _get_session_local()()


# Alias for public API compatibility — returns a new session from the lazy factory
def SessionLocal() -> Session:
    return _get_session_local()()


# ---------------------------------------------------------------------------
# Declarative Base
# ---------------------------------------------------------------------------

# ``Base`` is used as the parent class for all SQLAlchemy declarative models.
# It provides the ``metadata`` attribute that stores schema information.
# Models are defined separately in their own modules (not in this file).
class Base(DeclarativeBase):
    """Base class for all declarative SQLAlchemy models."""
    pass


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a SQLAlchemy session and ensures it is closed.

    The session is committed automatically on success.  If an unhandled
    exception propagates out of the request, the transaction is rolled back
    and the session is disposed, preventing broken connections from being
    returned to the pool.

    Usage::

        from fastapi import Depends
        from sqlalchemy.orm import Session
        from app.db.session import get_db

        @app.get("/users/{user_id}")
        def get_user(user_id: int, db: Session = Depends(get_db)):
            return db.get(User, user_id)

    Yields
    ------
    Session
        A SQLAlchemy ORM session tied to the request lifecycle.
    """
    db = _get_session_local()()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()