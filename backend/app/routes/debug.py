from asyncio import to_thread
from datetime import datetime, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func

from app.core.dependencies import get_current_user
from app.db.models.user import User
from app.db.session import get_session
from app.db.models.document import Document

router = APIRouter()
logger = logging.getLogger(__name__)


def _require_admin_privileges(user: User) -> None:
    if getattr(user, "is_superuser", False):
        return
    role_str = str(getattr(user, "role", "")).upper()
    if any(allowed in role_str for allowed in ("SUPER_ADMIN", "ADMIN")):
        return
    raise HTTPException(
        status_code=403,
        detail="Super-administrator privileges required to access system debug endpoints.",
    )


def _get_latest_documents(limit: int = 5, user: User | None = None) -> list[dict]:
    with get_session() as session:
        query = select(Document).order_by(Document.created_at.desc())
        if user and not getattr(user, "is_superuser", False):
            # Scope to organizations user has access to
            from app.db.models.rbac import OrganizationMember, MemberStatus
            member_orgs = session.scalars(
                select(OrganizationMember.organization_id).where(
                    OrganizationMember.user_id == user.id,
                    OrganizationMember.status == MemberStatus.ACTIVE,
                )
            ).all()
            from app.db.models.organization import Organization
            created_orgs = session.scalars(
                select(Organization.id).where(Organization.created_by == user.id)
            ).all()
            allowed_orgs = set(member_orgs + created_orgs)
            query = query.where(Document.organization_id.in_(allowed_orgs))
        docs = session.scalars(query.limit(limit)).all()
        return [
            {
                "id": str(doc.id),
                "title": doc.original_filename,
                "status": doc.processing_status.value if hasattr(doc.processing_status, "value") else str(doc.processing_status),
                "progress": doc.progress,
                "created_at": doc.created_at.isoformat() if doc.created_at else None,
            }
            for doc in docs
        ]


@router.get("/debug/user-documents")
async def debug_user_documents(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return latest 5 documents from PostgreSQL with tenant bounding."""
    _require_admin_privileges(current_user)
    try:
        documents = await to_thread(_get_latest_documents, 5, current_user)
        return {"count": len(documents), "documents": documents}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to fetch user debug documents")
        raise HTTPException(status_code=500, detail="Failed to fetch user documents") from exc


@router.get("/debug/stats")
async def debug_stats(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return document counts from PostgreSQL."""
    _require_admin_privileges(current_user)
    try:
        def _fetch_counts() -> int:
            with get_session() as session:
                query = select(func.count(Document.id))
                if not getattr(current_user, "is_superuser", False):
                    from app.db.models.rbac import OrganizationMember, MemberStatus
                    from app.db.models.organization import Organization
                    member_orgs = session.scalars(
                        select(OrganizationMember.organization_id).where(
                            OrganizationMember.user_id == current_user.id,
                            OrganizationMember.status == MemberStatus.ACTIVE,
                        )
                    ).all()
                    created_orgs = session.scalars(
                        select(Organization.id).where(Organization.created_by == current_user.id)
                    ).all()
                    allowed_orgs = set(member_orgs + created_orgs)
                    query = query.where(Document.organization_id.in_(allowed_orgs))
                return session.scalar(query) or 0

        total_count = await to_thread(_fetch_counts)
        return {
            "total_documents": total_count,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to fetch debug stats")
        raise HTTPException(status_code=500, detail="Failed to fetch stats") from exc


@router.get("/debug/neo4j-state")
def neo4j_state(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Returns exact count of nodes and edges in Neo4j. Superadmin only."""
    _require_admin_privileges(current_user)
    if not getattr(current_user, "is_superuser", False):
        raise HTTPException(
            status_code=403,
            detail="Superadmin access required for raw Neo4j state inspection.",
        )
    from app.db.neo4j import is_neo4j_available, run_query

    if not is_neo4j_available():
        return {"status": "unavailable", "message": "Neo4j not reachable"}

    def _cypher_count(cypher: str) -> int:
        rows = run_query(cypher)
        return int(rows[0]["c"]) if rows else 0

    return {
        "status": "connected",
        "counts": {
            "total_nodes": _cypher_count("MATCH (n) RETURN count(n) AS c"),
            "documents": _cypher_count("MATCH (d:Document) RETURN count(d) AS c"),
            "clauses": _cypher_count("MATCH (c:Clause) RETURN count(c) AS c"),
            "has_clause_edges": _cypher_count(
                "MATCH ()-[:HAS_CLAUSE]->() RETURN count(*) AS c",
            ),
            "similar_to_edges": _cypher_count(
                "MATCH ()-[:SIMILAR_TO]->() RETURN count(*) AS c",
            ),
        },
        "sample_documents": run_query(
            "MATCH (d:Document) RETURN d.id AS id, d.title AS title LIMIT 5",
        )
        or [],
        "sample_clauses": run_query(
            "MATCH (c:Clause) RETURN c.id AS id, c.text AS text LIMIT 3",
        )
        or [],
    }
