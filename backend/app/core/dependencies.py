"""
FastAPI dependency injectors.

All dependencies are stateless — they read request-scoped state (JWT token,
DB session) and return domain objects or raise HTTP exceptions.
"""
from __future__ import annotations

import logging
import uuid

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import TokenExpiredError, TokenInvalidError, oauth2_scheme, verify_token
from app.db.session import get_db

logger = logging.getLogger(__name__)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """
    FastAPI dependency that returns the currently authenticated user.

    Reads the ``Authorization: Bearer <token>`` header, verifies the JWT,
    extracts the ``sub`` claim (user UUID), and fetches the user from PostgreSQL.

    Raises
    ------
    HTTPException(401)
        - Missing or malformed token (``TokenInvalidError``)
        - Expired token (``TokenExpiredError``)
        - User not found in the database

    Returns
    -------
    User
        The authenticated SQLAlchemy model instance.
    """
    try:
        payload = verify_token(token)
    except TokenExpiredError as exc:
        logger.warning("Token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except TokenInvalidError as exc:
        logger.warning("Invalid token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    sub: str | None = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = uuid.UUID(sub)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user identifier in token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from app.db.models import User

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled.",
        )

    return user


from fastapi.security import OAuth2PasswordBearer

optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)


def get_optional_current_user(
    token: str | None = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Return authenticated User if token is present and valid, else None."""
    if not token:
        return None
    try:
        return get_current_user(token=token, db=db)
    except HTTPException:
        return None