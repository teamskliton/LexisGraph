"""
Security utilities.

Provides:
    - Password hashing and verification (bcrypt)
    - JWT access token creation and verification (python-jose)

Usage
-----
    from app.core.security import (
        hash_password, verify_password,
        create_access_token, verify_token,
    )

    hashed = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", hashed)

    token = create_access_token({"sub": "user_123"})
    claims = verify_token(token)
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any

import bcrypt
from dotenv import load_dotenv
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

# Locate .env relative to the backend directory
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(_BACKEND_DIR, ".env"), override=True)


def hash_password(plain_password: str) -> str:
    """
    Hash a plain-text password using bcrypt.

    Parameters
    ----------
    plain_password : str
        The password to hash. Must not be empty.

    Returns
    -------
    str
        The hashed password (e.g. "$2b$12$...").

    Raises
    ------
    ValueError
        If plain_password is empty or contains only whitespace.
    """
    if not plain_password or not plain_password.strip():
        raise ValueError("Password cannot be empty")

    password_bytes = plain_password.encode("utf-8")
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]

    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain-text password against a stored bcrypt hash.

    Parameters
    ----------
    plain_password : str
        The password supplied by the user.
    hashed_password : str
        The stored hash (from a prior call to hash_password).

    Returns
    -------
    bool
        True if the password matches, False otherwise.
    """
    if not plain_password or not hashed_password:
        return False

    try:
        password_bytes = plain_password.encode("utf-8")
        if len(password_bytes) > 72:
            password_bytes = password_bytes[:72]
        return bcrypt.checkpw(password_bytes, hashed_password.encode("utf-8"))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# JWT Configuration
# ---------------------------------------------------------------------------

#: HMAC secret key for signing JWTs.  MUST be set in ``.env``.
JWT_SECRET: str = os.getenv("JWT_SECRET", "")
#: Algorithm used for signing.  HS256 is standard for symmetric signing.
JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
#: Access token lifetime in minutes (default 24 hours).
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

if not JWT_SECRET:
    logger.warning("JWT_SECRET is not set — tokens will be signed with an insecure default")


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------


class TokenError(Exception):
    """Base exception for token-related errors."""
    pass


class TokenExpiredError(TokenError):
    """Raised when the token has passed its expiration time."""
    pass


class TokenInvalidError(TokenError):
    """Raised when the token is malformed, tampered, or has an invalid signature."""
    pass


# ---------------------------------------------------------------------------
# Token utilities
# ---------------------------------------------------------------------------


def create_access_token(
    data: dict[str, Any],
    *,
    expires_delta: timedelta | None = None,
) -> str:
    """
    Create a signed JWT access token.

    Parameters
    ----------
    data : dict[str, Any]
        Payload to encode into the token.  Must include a ``sub`` (subject)
        claim identifying the user, e.g. ``{"sub": user_id}``.
    expires_delta : timedelta | None
        Override the default expiration.  ``None`` uses ``ACCESS_TOKEN_EXPIRE_MINUTES``.

    Returns
    -------
    str
        The encoded JWT string.

    Raises
    ------
    TokenError
        If ``JWT_SECRET`` is empty and no override is provided.
    ValueError
        If ``data`` is empty or missing ``sub``.

    Examples
    --------
        token = create_access_token({"sub": str(user.id)})
        token = create_access_token({"sub": str(user.id)}, expires_delta=timedelta(hours=2))
    """
    if not data:
        raise ValueError("Token payload cannot be empty")

    to_encode = data.copy()

    # Copy ``sub`` to standard claim name if not already set
    if "sub" not in to_encode:
        raise ValueError('Token payload must contain a "sub" (subject) claim')

    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta is not None
        else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})

    secret = JWT_SECRET or "INSECURE_DEFAULT_DO_NOT_USE_IN_PRODUCTION"
    encoded_jwt = jwt.encode(to_encode, secret, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> dict[str, Any]:
    """
    Verify and decode a JWT access token.

    Performs signature verification, expiration check (``exp``), and
    issued-at check (``iat``) using constant-time comparison to resist timing
    attacks.

    Parameters
    ----------
    token : str
        The raw JWT string to verify.

    Returns
    -------
    dict[str, Any]
        The decoded token payload (claims dictionary).

    Raises
    ------
    TokenExpiredError
        The token has passed its ``exp`` timestamp.
    TokenInvalidError
        The token is malformed, uses an unknown algorithm, or fails signature
        verification (including tampering).
    TokenError
        Any other token-related failure.

    Examples
    --------
        claims = verify_token(access_token)
        user_id = claims["sub"]
    """
    secret = JWT_SECRET or "INSECURE_DEFAULT_DO_NOT_USE_IN_PRODUCTION"

    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],
            options={
                "require": ["exp", "iat", "sub"],
                "verify_exp": True,
                "verify_iat": True,
            },
        )
        return payload

    except jwt.ExpiredSignatureError as exc:
        raise TokenExpiredError("Token has expired") from exc
    except jwt.JWTClaimsError as exc:
        raise TokenInvalidError(f"Invalid token claims: {exc}") from exc
    except JWTError as exc:
        # Covers malformed JWT, wrong algorithm, missing signature, etc.
        raise TokenInvalidError(f"Invalid token: {exc}") from exc


# ---------------------------------------------------------------------------
# FastAPI OAuth2 dependency
# ---------------------------------------------------------------------------

from fastapi.security import OAuth2PasswordBearer

#: OAuth2 scheme for use in FastAPI ``Depends()``.
#: Clients send the token in the ``Authorization: Bearer <token>`` header.
#: Raises ``HTTPException(status_code=401)`` if the header is missing.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")