"""
Database models.

Each model is defined in its own module under this package.
Import models here to make them available for Alembic autogenerate.

Usage
-----
    from app.db.models import User, Item
"""
from app.db.models.user import User

__all__ = ["User"]