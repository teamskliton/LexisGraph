"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from __future__ import annotations

# Alembic imports from env.py (available automatically because env.py
# is always loaded before the revision script runs).
# Do NOT reference target_metadata here — it is injected by env.py.
target_metadata = None  # noqa: F841


def upgrade() -> None:
    ${upgrades}


def downgrade() -> None:
    ${downgrades}