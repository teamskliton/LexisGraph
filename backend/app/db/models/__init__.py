"""
Database models.

Each model is defined in its own module under this package.
Import models here to make them available for Alembic autogenerate.

Usage
-----
    from app.db.models import User, Organization
"""
from app.db.models.user import User
from app.db.models.organization import Organization

__all__ = ["User", "Organization"]