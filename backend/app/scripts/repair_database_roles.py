"""
repair_database_roles.py
========================
Database audit and repair script for LexisGraph RBAC roles:
1. Ensures user 'shrimantm' is explicitly set to ADMIN in his organizations.
2. Ensures user 'mrmore@gmail.com' is explicitly set to VIEWER in 'Mr Shrimant's Workspace' (as invited).
3. Ensures every organization owner has an active OrganizationMember record with role=ADMIN.
4. Reports all repaired records and final state.
"""
from __future__ import annotations

import sys
import uuid
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.db.models import User, Organization
from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus


def repair_database(db: Session) -> None:
    print("=" * 70)
    print("LEXISGRAPH DATABASE ROLE AUDIT & REPAIR")
    print("=" * 70)

    # ── 1. Fix shrimantm ─────────────────────────────────────────────────────
    shrimant = db.query(User).filter(
        (User.username == "shrimantm") | (User.email == "shrimantmarathe2005@gmail.com")
    ).first()

    if shrimant:
        print(f"\n[1] Processing user 'shrimantm' (id={shrimant.id}):")
        shrimant_orgs = db.query(Organization).filter(
            Organization.created_by == shrimant.id
        ).all()

        for org in shrimant_orgs:
            member = db.query(OrganizationMember).filter(
                OrganizationMember.organization_id == org.id,
                OrganizationMember.user_id == shrimant.id,
            ).first()

            if not member:
                member = OrganizationMember(
                    id=uuid.uuid4(),
                    organization_id=org.id,
                    user_id=shrimant.id,
                    role=UserRole.ADMIN,
                    status=MemberStatus.ACTIVE,
                )
                db.add(member)
                db.commit()
                print(f"  + Created ADMIN membership for org '{org.name}' ({org.id})")
            else:
                old_role = member.role.value if hasattr(member.role, "value") else str(member.role)
                member.role = UserRole.ADMIN
                member.status = MemberStatus.ACTIVE
                db.commit()
                print(f"  * Updated membership for org '{org.name}' ({org.id}): {old_role} -> ADMIN")

    # ── 2. Fix mrmore@gmail.com ──────────────────────────────────────────────
    mrmore = db.query(User).filter(
        (User.username == "mrmore") | (User.email == "mrmore@gmail.com")
    ).first()

    if mrmore:
        print(f"\n[2] Processing user 'mrmore@gmail.com' (id={mrmore.id}):")
        mrmore_memberships = db.query(OrganizationMember).filter(
            OrganizationMember.user_id == mrmore.id
        ).all()

        for m in mrmore_memberships:
            org = db.get(Organization, m.organization_id)
            org_name = org.name if org else str(m.organization_id)
            if org and org.created_by != mrmore.id:
                old_role = m.role.value if hasattr(m.role, "value") else str(m.role)
                m.role = UserRole.VIEWER
                m.status = MemberStatus.ACTIVE
                db.commit()
                print(f"  * Updated invited membership in '{org_name}' ({m.organization_id}): {old_role} -> VIEWER")

        mrmore_owned = db.query(Organization).filter(
            Organization.created_by == mrmore.id
        ).all()
        for org in mrmore_owned:
            member = db.query(OrganizationMember).filter(
                OrganizationMember.organization_id == org.id,
                OrganizationMember.user_id == mrmore.id,
            ).first()
            if not member:
                member = OrganizationMember(
                    id=uuid.uuid4(),
                    organization_id=org.id,
                    user_id=mrmore.id,
                    role=UserRole.ADMIN,
                    status=MemberStatus.ACTIVE,
                )
                db.add(member)
                db.commit()
                print(f"  + Created ADMIN membership for owned org '{org.name}' ({org.id})")

    # ── 3. Fix mrabc@gmail.com (Reviewer in Lexisgraph Org) ───────────────────
    mrabc = db.query(User).filter(
        (User.username == "mrabc") | (User.email == "mrabc@gmail.com")
    ).first()

    if mrabc:
        print(f"\n[3] Processing user 'mrabc@gmail.com' (id={mrabc.id}):")
        # Target organization is Lexisgraph Org
        lexis_org = db.query(Organization).filter(Organization.name == "Lexisgraph Org").first()
        if lexis_org:
            member = db.query(OrganizationMember).filter(
                OrganizationMember.organization_id == lexis_org.id,
                OrganizationMember.user_id == mrabc.id,
            ).first()

            if not member:
                member = OrganizationMember(
                    id=uuid.uuid4(),
                    organization_id=lexis_org.id,
                    user_id=mrabc.id,
                    role=UserRole.REVIEWER,
                    status=MemberStatus.ACTIVE,
                )
                db.add(member)
                db.commit()
                print(f"  + Created REVIEWER membership for '{lexis_org.name}' ({lexis_org.id})")
            else:
                member.role = UserRole.REVIEWER
                member.status = MemberStatus.ACTIVE
                db.commit()
                print(f"  * Updated membership for '{lexis_org.name}' ({lexis_org.id}) -> REVIEWER")

    # ── 3. Audit all organizations to ensure creator has ADMIN membership ────
    print("\n[3] Auditing all organizations for owner ADMIN memberships:")
    all_orgs = db.query(Organization).all()
    for org in all_orgs:
        if org.created_by:
            owner_member = db.query(OrganizationMember).filter(
                OrganizationMember.organization_id == org.id,
                OrganizationMember.user_id == org.created_by,
            ).first()

            if not owner_member:
                owner_member = OrganizationMember(
                    id=uuid.uuid4(),
                    organization_id=org.id,
                    user_id=org.created_by,
                    role=UserRole.ADMIN,
                    status=MemberStatus.ACTIVE,
                )
                db.add(owner_member)
                db.commit()
                print(f"  + Added missing owner ADMIN membership for org '{org.name}' (owner={org.created_by})")
            elif owner_member.role != UserRole.ADMIN:
                owner_member.role = UserRole.ADMIN
                owner_member.status = MemberStatus.ACTIVE
                db.commit()
                print(f"  * Corrected owner role to ADMIN for org '{org.name}' (owner={org.created_by})")

    db.commit()
    print("\n" + "=" * 70)
    print("DATABASE REPAIR COMPLETED SUCCESSFULLY")
    print("=" * 70)

    # Verification summary
    print("\nCURRENT MEMBERSHIP STATE:")
    members = db.query(OrganizationMember).all()
    for m in members:
        u = db.get(User, m.user_id)
        org = db.get(Organization, m.organization_id)
        u_name = u.username if u else "unknown"
        org_name = org.name if org else "unknown"
        role_val = m.role.value if hasattr(m.role, "value") else str(m.role)
        status_val = m.status.value if hasattr(m.status, "value") else str(m.status)
        print(f" - User: {u_name:18} | Org: {org_name:24} | Role: {role_val:10} | Status: {status_val}")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        repair_database(db)
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()
