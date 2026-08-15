"""
Authentication routes.

POST /auth/register  — create a new user account
POST /auth/token     — exchange credentials for a JWT access token
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
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
    db: Session = Depends(get_db),
) -> UserResponse:
    """
    Return the authenticated user making the request with their organization memberships.

    Requires a valid ``Authorization: Bearer <token>`` header.
    """
    from app.db.models import Organization
    from app.db.models.rbac import OrganizationMember, MemberStatus
    from app.core.schemas import UserMembershipResponse

    memberships_data: list[UserMembershipResponse] = []

    # Query all active memberships for this user
    members = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == current_user.id,
        OrganizationMember.status == MemberStatus.ACTIVE,
    ).all()

    seen_org_ids = set()
    for m in members:
        seen_org_ids.add(m.organization_id)
        org = db.get(Organization, m.organization_id)
        if org:
            memberships_data.append(
                UserMembershipResponse(
                    organization_id=m.organization_id,
                    organization_name=org.name,
                    role=m.role.value if hasattr(m.role, "value") else str(m.role),
                    status=m.status.value if hasattr(m.status, "value") else str(m.status),
                    is_owner=(org.created_by == current_user.id),
                )
            )

    # Also include owned organizations if missing from members table
    owned_orgs = db.query(Organization).filter(
        Organization.created_by == current_user.id,
    ).all()
    for org in owned_orgs:
        if org.id not in seen_org_ids:
            memberships_data.append(
                UserMembershipResponse(
                    organization_id=org.id,
                    organization_name=org.name,
                    role="ADMIN",
                    status="ACTIVE",
                    is_owner=True,
                )
            )
            seen_org_ids.add(org.id)

    user_res = UserResponse.model_validate(current_user)
    user_res.memberships = memberships_data
    return user_res


# ---------------------------------------------------------------------------
# POST /auth/setup-role
# ---------------------------------------------------------------------------


class SetupRoleRequest(BaseModel):
    """Role selection payload for post-registration onboarding."""
    role: str


@router.post(
    "/setup-role",
    summary="Finalize role selection after normal signup (server-side)",
    responses={
        200: {"description": "Role set, organization and membership created"},
        400: {"description": "Invalid role"},
        403: {"description": "Only ADMIN or LEGAL_ANALYST allowed for normal signup"},
        409: {"description": "Role already set for this user"},
    },
)
def setup_role(
    data: SetupRoleRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Post-registration role selection for normal (non-invited) users.

    Only ``ADMIN`` and ``LEGAL_ANALYST`` (displayed as "Compliance Analyst") are
    accepted.  Any other value is rejected with HTTP 403.

    - Creates a new Organization owned by the authenticated user.
    - Creates an ``OrganizationMember`` record with the selected role.
    - Returns the new organization_id and confirmed role.

    This endpoint must NOT be called for users joining via invitation;
    their role is set exclusively by the invitation record.
    """
    from app.db.models import Organization
    from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus

    # ── Role validation ──────────────────────────────────────────────────────
    ALLOWED_SIGNUP_ROLES = {"ADMIN", "LEGAL_ANALYST", "COMPLIANCE_ANALYST"}
    role_upper = data.role.upper().strip()

    if role_upper not in ALLOWED_SIGNUP_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Role '{data.role}' is not allowed for direct signup. "
                "Only ADMIN or LEGAL_ANALYST (Compliance Analyst) may be selected here. "
                "Other roles are assigned exclusively through organization invitations."
            ),
        )

    user_role = UserRole.LEGAL_ANALYST if role_upper in {"LEGAL_ANALYST", "COMPLIANCE_ANALYST"} else UserRole(role_upper)

    # ── Idempotency: check if user already has an org membership ─────────────
    existing_membership = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == current_user.id,
        OrganizationMember.status == MemberStatus.ACTIVE,
    ).first()

    if existing_membership:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Role has already been set for this account.",
        )

    # ── Create Organization ──────────────────────────────────────────────────
    role_label = "Admin" if user_role == UserRole.ADMIN else "Compliance Analyst"
    org = Organization(
        name=f"{current_user.full_name}'s Workspace",
        description=f"Default workspace for {current_user.full_name} ({role_label})",
        created_by=current_user.id,
    )
    db.add(org)
    db.flush()  # get org.id without committing

    # ── Create OrganizationMember ────────────────────────────────────────────
    import uuid as _uuid
    member = OrganizationMember(
        id=_uuid.uuid4(),
        organization_id=org.id,
        user_id=current_user.id,
        role=user_role,
        status=MemberStatus.ACTIVE,
    )
    db.add(member)

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("setup_role: DB commit failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete role setup. Please try again.",
        ) from exc

    db.refresh(org)

    logger.info(
        "Role setup completed: user=%s role=%s org=%s",
        current_user.id, user_role, org.id,
    )

    return {
        "message": f"Role set to {user_role.value}. Organization workspace created.",
        "organization_id": str(org.id),
        "organization_name": org.name,
        "role": user_role.value,
    }