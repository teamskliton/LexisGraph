import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_user
from app.core.workspace_context import verify_user_workspace_membership
from app.db.models import User, Organization
from app.db.models.rbac import OrganizationMember, MemberStatus
from sqlalchemy import select, or_
from app.services.retrieval import retrieve_relevant_clauses

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/retrieve")
def retrieve(
    query: str,
    organization_id: Optional[uuid.UUID] = Query(None, description="Workspace / Organization UUID"),
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-Id"),
    x_organization_id: Optional[str] = Header(None, alias="X-Organization-Id"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    target_org_id = organization_id
    if not target_org_id and (x_workspace_id or x_organization_id):
        raw_header = x_workspace_id or x_organization_id
        try:
            target_org_id = uuid.UUID(str(raw_header).strip())
        except (ValueError, TypeError):
            pass

    if not target_org_id:
        # Resolve user's active workspace
        member_org_ids = db.scalars(
            select(OrganizationMember.organization_id).where(
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == MemberStatus.ACTIVE,
            )
        ).all()
        user_org = db.query(Organization).filter(
            or_(
                Organization.created_by == current_user.id,
                Organization.id.in_(member_org_ids) if member_org_ids else False,
            )
        ).first()
        if user_org:
            target_org_id = user_org.id

    if not target_org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active workspace or organization ID is required for retrieval.",
        )

    verify_user_workspace_membership(db, current_user.id, target_org_id)

    try:
        result = retrieve_relevant_clauses(query, organization_id=target_org_id)
        return {"results": result}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Retrieval failed")
        raise HTTPException(status_code=500, detail="Retrieval failed") from exc
