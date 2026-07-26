"""
Organization CRUD operations.

Provides a set of reusable database operations for the Organization entity.
All functions accept a SQLAlchemy Session and return domain objects or raise
custom exceptions.
"""
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db.models import Organization, User
from app.core.schemas import OrganizationCreate, OrganizationUpdate


class OrganizationNotFoundError(Exception):
    """Raised when an organization is not found."""

    def __init__(self, organization_id: uuid.UUID):
        self.organization_id = organization_id
        super().__init__(f"Organization {organization_id} not found")


class OrganizationForbiddenError(Exception):
    """Raised when a user is not authorized to perform an action on an organization."""

    def __init__(self, organization_id: uuid.UUID, user_id: uuid.UUID):
        self.organization_id = organization_id
        self.user_id = user_id
        super().__init__(
            f"User {user_id} is not authorized to modify organization {organization_id}"
        )


def create_organization(
    db: Session,
    organization_in: OrganizationCreate,
    creator: User,
) -> Organization:
    """
    Create a new organization owned by the given user.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    organization_in : OrganizationCreate
        Validated Pydantic schema with organization data.
    creator : User
        The user creating the organization (becomes the owner via created_by).

    Returns
    -------
    Organization
        The newly created organization instance.

    Raises
    ------
    IntegrityError
        If a database constraint is violated during creation.
    """
    organization = Organization(
        name=organization_in.name,
        description=organization_in.description,
        industry=organization_in.industry,
        website=organization_in.website,
        logo_url=organization_in.logo_url,
        created_by=creator.id,
    )
    db.add(organization)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise
    return organization


def get_organization(
    db: Session,
    organization_id: uuid.UUID,
) -> Organization:
    """
    Retrieve a single organization by its UUID.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    organization_id : uuid.UUID
        UUID of the organization to retrieve.

    Returns
    -------
    Organization
        The found organization instance.

    Raises
    ------
    OrganizationNotFoundError
        If no organization exists with the given UUID.
    """
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise OrganizationNotFoundError(organization_id)
    return organization


def get_user_organizations(
    db: Session,
    user_id: uuid.UUID,
) -> list[Organization]:
    """
    Retrieve all organizations owned by a specific user.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    user_id : uuid.UUID
        UUID of the owner whose organizations to retrieve.

    Returns
    -------
    list[Organization]
        List of organizations owned by the user (may be empty).
    """
    from sqlalchemy import select

    stmt = select(Organization).where(Organization.created_by == user_id)
    result = db.execute(stmt)
    return list(result.scalars().all())


def update_organization(
    db: Session,
    organization_id: uuid.UUID,
    organization_in: OrganizationUpdate,
    current_user: User,
) -> Organization:
    """
    Update an existing organization.

    Only the organization owner can update it.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    organization_id : uuid.UUID
        UUID of the organization to update.
    organization_in : OrganizationUpdate
        Validated Pydantic schema with fields to update.
    current_user : User
        The user attempting the update (must be the owner).

    Returns
    -------
    Organization
        The updated organization instance.

    Raises
    ------
    OrganizationNotFoundError
        If no organization exists with the given UUID.
    OrganizationForbiddenError
        If current_user is not the owner of the organization.
    IntegrityError
        If a database constraint is violated during update.
    """
    organization = get_organization(db, organization_id)

    if organization.created_by != current_user.id:
        raise OrganizationForbiddenError(organization_id, current_user.id)

    update_data = organization_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(organization, field, value)

    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise

    return organization


def delete_organization(
    db: Session,
    organization_id: uuid.UUID,
    current_user: User,
) -> Organization:
    """
    Delete an organization.

    Only the organization owner can delete it.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    organization_id : uuid.UUID
        UUID of the organization to delete.
    current_user : User
        The user attempting the deletion (must be the owner).

    Returns
    -------
    Organization
        The deleted organization instance (for reference before removal).

    Raises
    ------
    OrganizationNotFoundError
        If no organization exists with the given UUID.
    OrganizationForbiddenError
        If current_user is not the owner of the organization.
    """
    organization = get_organization(db, organization_id)

    if organization.created_by != current_user.id:
        raise OrganizationForbiddenError(organization_id, current_user.id)

    db.delete(organization)
    db.flush()

    return organization