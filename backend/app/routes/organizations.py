from __future__ import annotations

import logging
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.schemas import (
    OrganizationCreate,
    OrganizationResponse,
    OrganizationUpdate,
)
from app.core.dependencies import get_current_user
from app.db.models import Organization, User
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get(
    "/",
    response_model=List[OrganizationResponse],
    summary="List user's organizations",
)
def get_organizations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[Organization]:
    """
    Get all organizations created by the authenticated user.
    """
    orgs = db.query(Organization).filter(Organization.created_by == current_user.id).all()
    return orgs


@router.post(
    "/",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new organization",
)
def create_organization(
    data: OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Organization:
    """
    Create a new organization owned by the authenticated user.
    """
    org = Organization(
        name=data.name,
        description=data.description,
        industry=data.industry,
        website=data.website,
        logo_url=data.logo_url,
        created_by=current_user.id,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    
    logger.info("Organization created: id=%s by user=%s", org.id, current_user.id)
    return org


@router.get(
    "/{organization_id}",
    response_model=OrganizationResponse,
    summary="Get an organization by ID",
)
def get_organization(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Organization:
    """
    Get a specific organization by its ID.
    User can only access their own organizations.
    """
    org = db.query(Organization).filter(
        Organization.id == organization_id,
        Organization.created_by == current_user.id
    ).first()
    
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found or you don't have access to it."
        )
        
    return org


@router.put(
    "/{organization_id}",
    response_model=OrganizationResponse,
    summary="Update an organization",
)
def update_organization(
    organization_id: uuid.UUID,
    data: OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Organization:
    """
    Update an existing organization.
    Only the owner can update their organization.
    """
    org = db.query(Organization).filter(
        Organization.id == organization_id,
        Organization.created_by == current_user.id
    ).first()
    
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found or you don't have access to it."
        )
        
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(org, field, value)
        
    db.commit()
    db.refresh(org)
    
    logger.info("Organization updated: id=%s by user=%s", org.id, current_user.id)
    return org


@router.delete(
    "/{organization_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an organization",
)
def delete_organization(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete an organization.
    Only the owner can delete their organization.
    """
    org = db.query(Organization).filter(
        Organization.id == organization_id,
        Organization.created_by == current_user.id
    ).first()
    
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found or you don't have access to it."
        )
        
    db.delete(org)
    db.commit()
    
    logger.info("Organization deleted: id=%s by user=%s", organization_id, current_user.id)
    return None
