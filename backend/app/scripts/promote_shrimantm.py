"""
promote_shrimantm.py
====================
One-time database script to promote username 'shrimantm' to ADMIN role.

What it does:
1. Find user by username = 'shrimantm'
2. Find (or create) an Organization owned by this user
3. Upsert OrganizationMember with role = ADMIN, status = ACTIVE
4. Print verification results

Run from the backend directory:
    python app/scripts/promote_shrimantm.py
"""
from __future__ import annotations

import sys
import uuid
from pathlib import Path

# Ensure the backend package root is on PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.db.models import User, Organization
from app.db.models.rbac import OrganizationMember, UserRole, MemberStatus


TARGET_USERNAME = "shrimantm"


def promote(db: Session) -> None:
    # ── Step 1: Find user ─────────────────────────────────────────────────────
    user = db.query(User).filter(User.username == TARGET_USERNAME).first()
    if not user:
        print(f"ERROR: User '{TARGET_USERNAME}' not found. Check the username.")
        return

    print(f"Found user: id={user.id}, email={user.email}, full_name={user.full_name}")

    # ── Step 2: Find existing organization or create one ──────────────────────
    org = db.query(Organization).filter(Organization.created_by == user.id).first()

    if not org:
        # Also check if they're a member of any org
        existing_member = db.query(OrganizationMember).filter(
            OrganizationMember.user_id == user.id,
        ).first()

        if existing_member:
            org = db.get(Organization, existing_member.organization_id)
            print(f"Found existing org via membership: {org.name} (id={org.id})")
        else:
            # Create a new organization for this user
            org = Organization(
                id=uuid.uuid4(),
                name=f"{user.full_name}'s Workspace",
                description=f"Admin workspace for {user.full_name}",
                created_by=user.id,
            )
            db.add(org)
            db.flush()
            print(f"Created new organization: {org.name} (id={org.id})")
    else:
        print(f"Found existing organization: {org.name} (id={org.id})")

    # ── Step 3: Upsert OrganizationMember with ADMIN role ────────────────────
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org.id,
        OrganizationMember.user_id == user.id,
    ).first()

    if member:
        old_role = member.role.value if hasattr(member.role, "value") else str(member.role)
        member.role = UserRole.ADMIN
        member.status = MemberStatus.ACTIVE
        print(f"Updated existing membership: {old_role} → ADMIN")
    else:
        member = OrganizationMember(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=user.id,
            role=UserRole.ADMIN,
            status=MemberStatus.ACTIVE,
        )
        db.add(member)
        print("Created new OrganizationMember record with role=ADMIN")

    db.commit()
    db.refresh(member)

    # ── Step 4: Verification ──────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("VERIFICATION")
    print("=" * 60)
    print(f"username   : {user.username}")
    print(f"email      : {user.email}")
    print(f"user_id    : {user.id}")
    print(f"org_name   : {org.name}")
    print(f"org_id     : {org.id}")
    print(f"role       : {member.role.value}")
    print(f"status     : {member.status.value}")
    print("=" * 60)
    print("SUCCESS: shrimantm is now ADMIN.")


if __name__ == "__main__":
    db: Session = SessionLocal()
    try:
        promote(db)
    except Exception as e:
        db.rollback()
        print(f"FAILED: {e}")
        raise
    finally:
        db.close()
