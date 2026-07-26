"""
Authentication routes.

POST /auth/register  — create a new user account
POST /auth/token     — exchange credentials for a JWT access token
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.schemas import Token, UserCreate, UserLogin, UserResponse
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.core.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# ---------------------------------------------------------------------------
# POST /auth/register
# ---------------------------------------------------------------------------


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    responses={
        201: {"description": "User created successfully"},
        409: {"description": "Email or username already registered"},
        422: {"description": "Validation error"},
    },
)
def register(data: UserCreate, db: Session = Depends(get_db)) -> UserResponse:
    """
    Register a new user account.

    - Validates email format via ``EmailStr``.
    - Hashes the plain-text password with bcrypt.
    - Stores the user in PostgreSQL.
    - Rejects duplicate ``email`` or ``username`` with HTTP 409.
    - Returns the public ``UserResponse`` (never the ``hashed_password``).
    """
    # Hash password
    hashed = hash_password(data.password)

    # Build model instance (SQLAlchemy handles column assignment)
    from app.db.models import User

    user = User(
        email=data.email,
        username=data.username,
        full_name=data.full_name,
        hashed_password=hashed,
        is_active=True,
        is_superuser=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Registration failed — duplicate email or username: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email or username already exists.",
        ) from exc

    logger.info("User registered: id=%s email=%s", user.id, user.email)
    return user


# ---------------------------------------------------------------------------
# POST /auth/token
# ---------------------------------------------------------------------------


@router.post(
    "/token",
    response_model=Token,
    summary="Authenticate and receive an access token",
    responses={
        200: {"description": "Token issued successfully"},
        401: {"description": "Invalid credentials"},
        422: {"description": "Validation error"},
    },
)
def login(data: UserLogin, db: Session = Depends(get_db)) -> Token:
    """
    Authenticate with username/email + password and return a JWT.

    - Looks up the user by ``username`` (supports email-style usernames).
    - Verifies the plain-text password against the stored bcrypt hash.
    - Generates a signed JWT with the user's ``id`` as the ``sub`` claim.
    - Returns ``access_token``, ``token_type="bearer"``, and ``expires_in`` in seconds.
    - Raises HTTP 401 if the user does not exist or the password is wrong.
    """
    from app.db.models import User

    # Look up user by username or email
    user = db.query(User).filter(
        (User.username == data.username) | (User.email == data.username)
    ).first()

    if user is None or not verify_password(data.password, user.hashed_password):
        logger.warning("Login failed — invalid credentials for username/email: %s", data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        logger.warning("Login rejected — inactive user: %s", user.id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from app.core.security import ACCESS_TOKEN_EXPIRE_MINUTES

    expires_in = ACCESS_TOKEN_EXPIRE_MINUTES * 60  # seconds

    access_token = create_access_token(data={"sub": str(user.id)})

    logger.info("Token issued for user: id=%s", user.id)
    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=expires_in,
    )


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Return the currently authenticated user",
    responses={
        200: {"description": "Current user"},
        401: {"description": "Not authenticated"},
        403: {"description": "Account disabled"},
    },
)
def read_current_user(
    current_user=Depends(get_current_user),
) -> UserResponse:
    """
    Return the authenticated user making the request.

    Requires a valid ``Authorization: Bearer <token>`` header.
    """
    return current_user