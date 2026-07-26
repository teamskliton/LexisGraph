"""Initial migration — schema placeholder

This is the first Alembic migration in the project.  It is intentionally
empty: no tables are created here so that the database starts in a clean
state.  Tables are added incrementally through subsequent migrations as
models are defined.

Revision ID: 0001
Revises:
Create Date: 2026-07-26
"""
from __future__ import annotations

revision: str | None = "0001"
down_revision: str | None = None
branch_labels: str | list[str] | None = None
depends_on: str | list[str] | None = None


def upgrade() -> None:
    """No schema changes — this migration is a placeholder."""
    pass


def downgrade() -> None:
    """No schema changes — this migration is a placeholder."""
    pass