# 9.2 Organization & User Data Model

---

# 9.2.1 Purpose

The Organization & User Data Model manages authentication, authorization, organization isolation, user roles, account settings, and ownership of all resources within LexisGraph.

Every resource in the platform shall belong to exactly one organization.

The system shall enforce strict multi-tenant isolation to ensure that no organization can access another organization's data.

---

# 9.2.2 Collections

The Organization Module consists of the following MongoDB collections.

```
organizations

users

roles

organization_settings

sessions (optional)

api_keys (future)
```

---

# 9.2.3 Entity Relationship

```
Organization
      │
      ├──────────── Users
      │                  │
      │                  ▼
      │                Roles
      │
      ├──────────── Settings
      │
      ├──────────── Policies
      │
      ├──────────── Reports
      │
      └──────────── Audit Logs
```

Every user belongs to one organization.

---

# 9.2.4 Organization Collection

Collection

```
organizations
```

Purpose

Stores organization information and acts as the tenant root for all organizational data.

---

Required Fields

```
_id

organization_id

name

slug

industry

country

jurisdiction

subscription_plan

status

created_at

updated_at

created_by

updated_by
```

---

Field Definitions

| Field | Type | Required | Description |
|---------|------|----------|-------------|
| organization_id | String | Yes | Business identifier |
| name | String | Yes | Organization name |
| slug | String | Yes | URL-friendly unique identifier |
| industry | String | Yes | Industry category |
| country | String | Yes | Primary operating country |
| jurisdiction | String | Yes | Applicable legal jurisdiction |
| subscription_plan | Enum | Yes | Free, Pro, Enterprise |
| status | Enum | Yes | Active, Suspended, Deleted |
| created_at | Date | Yes | Creation timestamp |
| updated_at | Date | Yes | Last update timestamp |

---

Validation Rules

Organization name

Minimum 3 characters

Maximum 150 characters

Slug

Unique

Lowercase

No spaces

Country

ISO Country Code

Subscription Plan

```
FREE

PRO

ENTERPRISE
```

Status

```
ACTIVE

SUSPENDED

DELETED
```

---

Indexes

```
organization_id

slug

status

country
```

---

Example Document

```json
{
  "organization_id": "ORG-000001",
  "name": "ABC Technologies",
  "slug": "abc-technologies",
  "industry": "Information Technology",
  "country": "IN",
  "jurisdiction": "India",
  "subscription_plan": "PRO",
  "status": "ACTIVE"
}
```

---

# 9.2.5 User Collection

Collection

```
users
```

Purpose

Stores authenticated platform users.

Every user belongs to exactly one organization.

---

Required Fields

```
_id

user_id

organization_id

first_name

last_name

email

password_hash

role_id

status

email_verified

last_login

created_at

updated_at
```

---

Field Definitions

| Field | Type | Required | Description |
|---------|------|----------|-------------|
| user_id | String | Yes | Business identifier |
| organization_id | String | Yes | Organization reference |
| first_name | String | Yes | User first name |
| last_name | String | Yes | User last name |
| email | String | Yes | Unique email |
| password_hash | String | Yes | Secure password hash |
| role_id | String | Yes | Assigned role |
| email_verified | Boolean | Yes | Verification status |
| last_login | Date | No | Last login timestamp |
| status | Enum | Yes | User account status |

---

Password Requirements

Minimum

```
12 characters
```

Must contain

Uppercase

Lowercase

Number

Special Character

Passwords shall never be stored in plaintext.

Passwords shall be hashed using Argon2id (preferred) or bcrypt with an appropriate work factor.

---

User Status

```
ACTIVE

PENDING

LOCKED

SUSPENDED

DELETED
```

---

Indexes

```
email

organization_id

status

role_id
```

---

Example Document

```json
{
  "user_id": "USR-000001",
  "organization_id": "ORG-000001",
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "role_id": "ROLE_ADMIN",
  "email_verified": true,
  "status": "ACTIVE"
}
```

---

# 9.2.6 Roles Collection

Collection

```
roles
```

Purpose

Defines role-based permissions.

Default Roles

```
SUPER_ADMIN

ORG_ADMIN

COMPLIANCE_MANAGER

ANALYST

VIEWER
```

---

Required Fields

```
role_id

name

permissions

description

created_at
```

---

Permissions Example

```json
[
    "policy.upload",
    "policy.read",
    "report.read",
    "report.export",
    "organization.manage"
]
```

Permissions shall follow a resource.action naming convention.

---

Indexes

```
role_id

name
```

---

# 9.2.7 Organization Settings Collection

Collection

```
organization_settings
```

Purpose

Stores organization-specific configuration.

Example Fields

```
organization_id

default_jurisdiction

default_language

timezone

theme

retention_policy

allowed_file_types

max_upload_size

created_at

updated_at
```

---

Example Document

```json
{
  "organization_id": "ORG-000001",
  "default_jurisdiction": "India",
  "default_language": "English",
  "timezone": "Asia/Kolkata",
  "max_upload_size": 52428800
}
```

---

# 9.2.8 Authentication Rules

Authentication shall support:

Email & Password

OAuth (Google, Microsoft) (Future)

Enterprise SSO (OIDC/SAML) (Future)

Password Reset

Email Verification

Multi-Factor Authentication (Future)

---

# 9.2.9 Authorization

The backend shall enforce Role-Based Access Control (RBAC).

Authorization shall be evaluated for every protected API request.

Permissions shall never be enforced solely in the frontend.

---

# 9.2.10 Session Management

The platform shall support secure JWT-based authentication.

JWTs shall:

Expire automatically

Be signed securely

Support refresh tokens

Be invalidated after logout

Session information shall not contain sensitive user data.

---

# 9.2.11 Multi-Tenant Isolation Rules

Every query shall include:

```
organization_id
```

Users shall only access:

Their own policies

Their own reports

Their own audit logs

Their own settings

Shared legal knowledge remains read-only.

---

# 9.2.12 Audit Requirements

The following events shall be logged:

User Registration

Login

Logout

Password Change

Role Change

Organization Creation

User Invitation

Account Suspension

Permission Updates

Audit logs shall include timestamps and the initiating user.

---

# 9.2.13 Security Requirements

Passwords shall be hashed.

Email verification required.

Rate limiting enabled.

Account lockout after repeated failed logins.

HTTPS required.

JWT secret stored securely.

Sensitive fields excluded from API responses.

---

# 9.2.14 Future Enhancements

The architecture shall support:

Single Sign-On

SCIM User Provisioning

Multiple Organizations per User

Delegated Administration

Custom Roles

Attribute-Based Access Control (ABAC)

API Tokens

Hardware Security Keys (WebAuthn)

---

# 9.2.15 Acceptance Criteria

The Organization & User Module shall be considered complete when:

✓ Organizations are isolated.

✓ Users authenticate securely.

✓ RBAC is enforced.

✓ Passwords are securely hashed.

✓ JWT authentication is implemented.

✓ Organization settings are configurable.

✓ Audit logs capture authentication events.

✓ Organization ownership is enforced across all resources.

---

# 9.2.16 Summary

The Organization & User Data Model establishes the security and tenancy foundation of LexisGraph. It defines organizations as the primary ownership boundary, secures user authentication with modern password hashing and JWT-based sessions, enforces role-based access control, and ensures strict isolation between tenants. This module provides the identity and access management layer upon which all other platform functionality is built.

---

End of Section 9.2