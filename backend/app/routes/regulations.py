"""
Global Regulations API Router.
Provides Global Regulation Repository browsing, semantic search, and organization link/unlink management.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.models import User, Organization
from app.db.session import get_db
from app.services import regulation_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/regulations", tags=["regulations"])


# ---------------------------------------------------------------------------
# Pydantic Schemas for Regulations
# ---------------------------------------------------------------------------

class LinkRegulationRequest(BaseModel):
    organization_id: uuid.UUID = Field(..., description="Organization ID to link regulation to")
    regulation_id: uuid.UUID = Field(..., description="Global Regulation ID to link")


class UnlinkRegulationRequest(BaseModel):
    organization_id: uuid.UUID = Field(..., description="Organization ID to unlink regulation from")
    regulation_id: uuid.UUID = Field(..., description="Global Regulation ID to unlink")


class GlobalRegulationResponse(BaseModel):
    id: uuid.UUID
    title: str
    act_name: Optional[str] = None
    version: Optional[str] = None
    act_year: Optional[int] = None
    jurisdiction: Optional[str] = None
    issuing_authority: Optional[str] = None
    document_hash: str
    original_filename: str
    file_size: int
    processing_status: str
    is_linked: bool = False

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "",
    summary="List all global regulations",
)
@router.get(
    "/",
    summary="List all global regulations (alias)",
    include_in_schema=False,
)
def list_regulations(
    organization_id: Optional[uuid.UUID] = Query(None, description="Organization ID to include link status"),
    search: Optional[str] = Query(None, description="Search query string"),
    only_linked: bool = Query(False, description="Filter only regulations linked to the organization"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return all shared global regulations in the repository, showing link status for the specified organization.
    """
    return regulation_service.list_global_regulations(
        db,
        organization_id=organization_id,
        search_query=search,
        only_linked=only_linked,
    )


@router.get(
    "/search",
    summary="Semantic search across global regulations",
)
def search_regulations(
    q: str = Query(..., min_length=1, description="Semantic search query"),
    organization_id: Optional[uuid.UUID] = Query(None, description="Organization ID context"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Perform semantic keyword and vector search over global regulations.
    """
    results = regulation_service.list_global_regulations(db, organization_id=organization_id, search_query=q)
    return results[:limit]


@router.post(
    "/link",
    summary="Link global regulation to organization",
)
def link_regulation(
    data: LinkRegulationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Link a shared global regulation version to an organization without duplicating files or embeddings.
    Requires Manager or Admin role / ownership.
    """
    org = db.get(Organization, data.organization_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")

    link = regulation_service.link_regulation_to_organization(
        db,
        organization_id=data.organization_id,
        regulation_id=data.regulation_id,
    )
    return {
        "message": "Regulation linked successfully",
        "link_id": str(link.id),
        "organization_id": str(link.organization_id),
        "regulation_id": str(link.regulation_id),
        "enabled": link.enabled,
    }


@router.delete(
    "/unlink",
    summary="Unlink global regulation from organization",
)
@router.post(
    "/unlink",
    summary="Unlink global regulation from organization (alias)",
    include_in_schema=False,
)
def unlink_regulation(
    data: UnlinkRegulationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Remove organization link to a regulation.
    Never deletes the global regulation row if referenced by other organizations.
    """
    org = db.get(Organization, data.organization_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")

    success = regulation_service.unlink_regulation_from_organization(
        db,
        organization_id=data.organization_id,
        regulation_id=data.regulation_id,
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found or already removed.")

    return {"message": "Regulation unlinked successfully"}
