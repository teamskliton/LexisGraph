# LexisGraph Backend — Claude Code Instructions

> This file documents all PostgreSQL infrastructure decisions and procedures.
> Read this before making any changes to the database layer.

---

## PostgreSQL Foundation

### Files

| File | Purpose |
|---|---|
| `app/core/config.py` | Loads `DATABASE_URL` from `.env`; falls back to individual `POSTGRES_*` vars |
| `app/core/dependencies.py` | `get_current_user` FastAPI dependency |
| `app/core/security.py` | Password hashing, JWT create/verify, `oauth2_scheme`, `TokenError` exceptions |
| `app/core/schemas.py` | `UserCreate`, `UserLogin`, `UserResponse`, `Token`, `TokenPayload` |
| `app/db/session.py` | SQLAlchemy 2.0 engine, `SessionLocal`, `Base`, `get_db()` dependency |
| `app/db/models/user.py` | `User` SQLAlchemy model |
| `app/db/models/__init__.py` | Exports all models |
| `app/routes/auth.py` | `/auth/register`, `/auth/token`, `/auth/me` |
| `app/db/postgres.py` | **DO NOT MODIFY** — legacy MongoDB-compatible singleton used by other team members |

### Configuration (`app/core/config.py`)

- `get_database_url()` reads `DATABASE_URL` first
- If `DATABASE_URL` is empty, it builds `postgresql+psycopg2://{user}:{password}@{host}:{port}/{db}` from individual `POSTGRES_*` env vars
  - Uses `postgresql+psycopg2://` driver — compatible with `psycopg2-binary` in requirements
- Warns if `POSTGRES_PASSWORD` is not set
- `DATABASE_URL` is exported as a module-level constant (but engine creation is fully lazy)

### Session Factory (`app/db/session.py`)

**All database objects are lazily initialized** — no connection is made when the module is imported.
This allows Alembic and other tools to import `Base` without triggering a live DB connection.

- `get_engine()` — process-wide `Engine` singleton
  - `pool_pre_ping=True` — validates connections before use
  - `pool_recycle=300` — recycles connections after 5 minutes
  - `pool_size=5`, `max_overflow=10`
  - `future=True` — SQLAlchemy 2.0 mode
  - `connect_timeout=10`
- `_get_session_local()` — lazily created `sessionmaker`, called on first session request
- `SessionLocal` — public alias (bound to `get_engine` callable for lazy binding)
- `get_session()` — standalone session factory for non-FastAPI use
- `Base` — `DeclarativeBase` subclass for all future models
- `get_db()` — FastAPI dependency: yields session, auto-commits on success, rolls back on error, always closes

---

## Alembic Migration Setup

### Files

| File | Purpose |
|---|---|
| `alembic.ini` | Alembic configuration (always in `backend/`) |
| `alembic/env.py` | Migration environment — reads `DATABASE_URL` from `app.core.config` |
| `alembic/script.py.mako` | Revision file template |
| `alembic/versions/` | Migration revision scripts |

### Key Configuration Decisions

- `script_location = alembic` — scripts live in `backend/alembic/`
- `prepend_sys_path = .` — makes `app` importable from `backend/` root
- `version_table = alembic_version` — tracks applied migrations
- `env.py` sets `sqlalchemy.url` from `app.core.config.get_database_url()` — **single source of truth, no URL duplication**
- `target_metadata = Base.metadata` — passed to autogenerate to detect model changes
- `future=True` passed to `engine_from_config` — SQLAlchemy 2.0 mode
- `env.py` imports models so autogenerate can inspect schemas

### Important Constraints

- **`script.py.mako`** must NOT contain `target_metadata = context.get_context().target_metadata` — that line causes `AttributeError` in SQLAlchemy 2.0. Use `target_metadata = None` as a placeholder.
- **Every revision file** must declare `revision`, `down_revision`, `branch_labels`, and `depends_on` variables.
- **Placeholder migration** (`0001_initial_migration_placeholder.py`) is intentionally empty — apply it with `alembic upgrade head` before autogenerating new migrations.
- Migration files are **never regenerated** — once created, edit them manually if needed.

### Alembic Commands

```bash
cd backend

# Apply all migrations (run after pulling new changes)
alembic upgrade head

# Show current migration
alembic current

# Show migration history
alembic history

# Create a new migration (after defining/changing models)
alembic revision --autogenerate -m "description of changes"

# Roll back last migration
alembic downgrade -1

# Roll back to specific revision
alembic downgrade <revision_id>

# Generate SQL script (no DB connection needed)
alembic upgrade head --sql > migration.sql

# Run autogenerate with verbose output
alembic revision --autogenerate -m "add models" --verbose
```

---

## User Model (`app/db/models/user.py`)

SQLAlchemy 2.0 style with `Mapped[]` annotations. All timestamps are timezone-aware (UTC).

| Column | Type | Constraints |
|---|---|---|
| `id` | `UUID` (PostgreSQL) | Primary key, server-generated UUID4 |
| `email` | `String(320)` | Unique, not null, indexed |
| `username` | `String(50)` | Unique, not null, indexed |
| `full_name` | `String(255)` | Not null |
| `hashed_password` | `String(255)` | Not null |
| `is_active` | `Boolean` | Default `True`, not null |
| `is_superuser` | `Boolean` | Default `False`, not null |
| `created_at` | `DateTime(timezone=True)` | UTC, default `now()`, not null |
| `updated_at` | `DateTime(timezone=True)` | UTC, auto-updated, not null |

### Migration Applied

```
Revision: 0f0c9b648e58  ("add users table")
Parent:   0001           (placeholder)
Status:   applied to database
```

### After Adding a New Model

1. Define the model in `app/db/models/<name>.py`
2. Import it in `alembic/env.py` under the `# Import all models` comment
3. Generate the migration:
   ```bash
   alembic revision --autogenerate -m "add <name> table"
   ```
4. Add `revision`, `down_revision`, `branch_labels`, `depends_on` to the generated file
5. Review the generated `upgrade()`/`downgrade()` before applying
6. Apply it:
   ```bash
   alembic upgrade head
   ```

---

## Environment Variables

All read from `backend/.env`:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | (none) | Full connection string (takes precedence) |
| `POSTGRES_USER` | `postgres` | Database user |
| `POSTGRES_PASSWORD` | (empty) | Database password |
| `POSTGRES_HOST` | `localhost` | Database host |
| `POSTGRES_PORT` | `5432` | Database port |
| `POSTGRES_DB` | `lexisgraph` | Database name |

**Note:** `.env` has `POSTGRES_PORT=5433` (Docker), adjust if running locally without Docker.

---

## Constraints

- **DO NOT use MongoDB** for any new application data
- **DO NOT modify existing GraphRAG services**
- **DO NOT delete existing code**
- **All new application data** must use PostgreSQL
- **Existing MongoDB files** (`app/db/mongo.py`, etc.) must remain untouched — other team members may still use them
- **Existing PostgreSQL file** `app/db/postgres.py` is legacy — do not modify

---

## Security Utilities (`app/core/security.py`)

Provides password hashing (bcrypt/argon2 via passlib) and JWT authentication (python-jose).

### Dependencies

```
passlib[bcrypt]
bcrypt
python-jose[cryptography]
```

### Password Functions

| Function | Signature | Description |
|---|---|---|
| `hash_password` | `(plain_password: str) -> str` | Hash with bcrypt (rounds=12). Raises `ValueError` if empty. |
| `verify_password` | `(plain_password: str, hashed_password: str) -> bool` | Constant-time verification. |

### JWT Functions

| Function | Signature | Description |
|---|---|---|
| `create_access_token` | `(data: dict, *, expires_delta?: timedelta) -> str` | Encode JWT with `sub` claim. Raises `ValueError` if `sub` missing. |
| `verify_token` | `(token: str) -> dict[str, Any]` | Decode & verify JWT. Raises `TokenExpiredError` or `TokenInvalidError`. |
| `oauth2_scheme` | `OAuth2PasswordBearer` | FastAPI dependency — extracts Bearer token from `Authorization` header. |

### Custom Exceptions (in `app/core/security.py`)

```
TokenError           — base exception
├── TokenExpiredError  — token past its exp claim
└── TokenInvalidError  — malformed / tampered / wrong signature
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | (empty — **must be set in production**) | HMAC secret for signing. |
| `JWT_ALGORITHM` | `HS256` | Algorithm (HS256 / HS384 / HS512). |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Token lifetime. |

### Usage

```python
from app.core.security import create_access_token, verify_token, oauth2_scheme
from app.core.security import TokenExpiredError, TokenInvalidError

# Create token
token = create_access_token({"sub": str(user_id)})

# Verify token
claims = verify_token(token)
user_id = claims["sub"]

# FastAPI route usage
from fastapi import Depends
@app.get("/me")
def read_current_user(token: str = Depends(oauth2_scheme)):
    claims = verify_token(token)
    ...
```

---

## Pydantic Schemas (`app/core/schemas.py`)

Pydantic v2 models for request/response validation. All response models use
`from_attributes=True` and exclude `hashed_password`.

| Schema | Purpose |
|---|---|
| `UserCreate` | POST body for user registration (`email`, `username`, `full_name`, `password`) |
| `UserLogin` | POST body for username/email + password authentication |
| `UserResponse` | API response (excludes `hashed_password`) |
| `Token` | OAuth2 token response (`access_token`, `token_type="bearer"`) |
| `TokenPayload` | Decoded JWT claims (`sub`, `exp`, `iat`) |

Usage:

```python
from app.core.schemas import UserCreate, UserResponse, Token

# In a route
@app.post("/users", response_model=UserResponse)
def create_user(data: UserCreate):
    ...
```

---

## Authentication Routes (`app/routes/auth.py`)

### POST /auth/register

```
POST /auth/register
Body:    { "email", "username", "full_name", "password" }
Returns: UserResponse (201) | HTTPException (409 duplicate | 422 validation)
```

- Validates `email` format (`EmailStr`)
- Hashes password with bcrypt
- Stores in PostgreSQL via SQLAlchemy
- Raises HTTP 409 on duplicate `email` or `username`
- Returns `UserResponse` (no `hashed_password`)

### POST /auth/token

```
POST /auth/token
Body:    { "username" (or email), "password" }
Returns: Token (200) | HTTPException (401 invalid | 422 validation)
```

- Looks up user by `username` OR `email`
- Verifies bcrypt password hash
- Rejects inactive users (HTTP 401)
- Returns `{ "access_token", "token_type": "bearer", "expires_in" }`
  - `expires_in` = `ACCESS_TOKEN_EXPIRE_MINUTES * 60` seconds

### GET /auth/me (protected)

```
GET /auth/me
Header: Authorization: Bearer <token>
Returns: UserResponse (200) | HTTPException (401 | 403)
```

- `Depends(get_current_user)` — validates JWT, fetches user from PostgreSQL
- Returns current user's public profile
- Raises 403 if account is disabled

### `get_current_user` (`app/core/dependencies.py`)

```
token = Depends(oauth2_scheme)      ← reads Bearer header
payload = verify_token(token)       ← raises TokenExpiredError / TokenInvalidError
user_id = uuid.UUID(payload["sub"])
user = db.get(User, user_id)        ← raises 401 if not found
return user                         ← raises 403 if is_active=False
```

---

## Future Work

- [x] Define SQLAlchemy `User` model
- [x] Generate and apply `add users table` migration
- [x] Create `app/core/security.py` — password hashing + JWT utilities
- [x] Add JWT: `create_access_token()`, `verify_token()`, `OAuth2PasswordBearer`, `TokenError` exceptions
- [x] Create `app/core/schemas.py` — `UserCreate`, `UserLogin`, `UserResponse`, `Token`, `TokenPayload`
- [x] Implement `POST /auth/register` route
- [x] Implement `POST /auth/token` route (login)
- [x] Add `get_current_user` FastAPI dependency (`app/core/dependencies.py`)
- [x] Add `GET /auth/me` route (protected, returns `UserResponse`)
- [ ] Protect routes with `Depends(get_current_user)`