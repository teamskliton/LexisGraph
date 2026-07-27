# LexisGraph — Project Context (CLAUDE.md)

> **Purpose:** This file serves as a high-level context document for AI agents working on this project.
> It summarises what has been completed so far across `/backend` and `/client`.
> Read this before starting any new task. For deep-dive details, refer to the individual `CLAUDE.md` inside each subdirectory.

---

## Project Overview

**LexisGraph** is a legal-domain knowledge-graph platform that:
- Ingests legal documents (PDFs, web pages) and extracts entities/relationships
- Builds a knowledge graph in **Neo4j**
- Stores vector embeddings in **Qdrant**
- Persists user/org data in **PostgreSQL**
- Serves a **FastAPI** backend consumed by a **Next.js** client

**Tech Stack at a Glance**

| Layer | Technology |
|---|---|
| Backend API | FastAPI (Python) |
| Relational DB | PostgreSQL + SQLAlchemy 2.0 + Alembic |
| Graph DB | Neo4j |
| Vector Store | Qdrant |
| Cache / Queue | Redis |
| Document Store | MongoDB (legacy, read-only for new code) |
| Client | Next.js 15 (App Router) + TypeScript + Tailwind CSS |

---

## `/backend` — Completed Tasks

> Detailed documentation lives in [`backend/CLAUDE.md`](./backend/CLAUDE.md).

### Database Layer

- [x] **PostgreSQL foundation** — `app/db/session.py` with lazy-initialised SQLAlchemy 2.0 engine, connection pooling (`pool_pre_ping`, `pool_recycle`, `pool_size`), `get_db()` FastAPI dependency
- [x] **Config system** — `app/core/config.py` reads `DATABASE_URL` (priority) or builds it from individual `POSTGRES_*` env vars
- [x] **Alembic migration setup** — `alembic/`, `alembic.ini`, `alembic/env.py` wired to `app.core.config` as single source of truth; `target_metadata = Base.metadata` for autogenerate
- [x] **Placeholder migration** (`0001_initial_migration_placeholder.py`) applied to seed migration history
- [x] **DB adapters present** — `app/db/mongo.py` (legacy, untouched), `app/db/neo4j.py`, `app/db/qdrant.py`, `app/db/redis_client.py`, `app/db/postgres.py` (legacy singleton, do not modify)

### User Model & Migration

- [x] **`User` SQLAlchemy model** (`app/db/models/user.py`) — UUID primary key, `email`, `username`, `full_name`, `hashed_password`, `is_active`, `is_superuser`, timezone-aware `created_at`/`updated_at`
- [x] **Migration applied** — revision `0f0c9b648e58` ("add users table") successfully run against PostgreSQL

### Documents & Processing

- [x] **`Document` SQLAlchemy model** (`app/db/models/document.py`) — UUID PK, org FK, user FK, file metadata, `document_type`, `processing_status`, `progress` (int 0–100), `current_step` (str|None), `processing_started_at`, `processed_at`, `error_message`, `mongo_document_id`
- [x] **Migrations applied:**
  - `a1b2c3d4e5f6` — create `documents` table
  - `b2c3d4e5f6a7` — add processing tracking columns (`processing_started_at`, `processed_at`, `error_message`, `mongo_document_id`)
  - `c3d4e5f6a7b8` — add progress tracking columns (`progress INT DEFAULT 0`, `current_step VARCHAR(150)`)

### Security

- [x] **`app/core/security.py`** — password hashing via `passlib[bcrypt]` (`hash_password`, `verify_password`), JWT create/verify via `python-jose` (`create_access_token`, `verify_token`), `oauth2_scheme` (Bearer token extractor), custom exception hierarchy (`TokenError` → `TokenExpiredError` / `TokenInvalidError`)

### Pydantic Schemas

- [x] **`app/core/schemas.py`** — Pydantic v2 models: `UserCreate`, `UserLogin`, `UserResponse` (excludes `hashed_password`), `Token`, `TokenPayload`

### Authentication Routes (`app/routes/auth.py`)

- [x] **`POST /auth/register`** — validates email, hashes password, stores in PostgreSQL, returns `UserResponse` (201); raises 409 on duplicate email/username
- [x] **`POST /auth/token`** — login by username or email, bcrypt verify, returns JWT `access_token` + `expires_in`; raises 401 on bad creds or inactive user
- [x] **`GET /auth/me`** (protected) — validates Bearer JWT, fetches user from PostgreSQL, returns `UserResponse`; raises 403 if disabled

### FastAPI Dependency

- [x] **`app/core/dependencies.py`** — `get_current_user` dependency: reads Bearer header → `verify_token` → lookup user by UUID → guard for inactive account

### Other Backend Routes & Services (existing / pre-built)

- [x] `app/routes/documents.py` — document ingestion endpoints
  - `POST /documents/upload` — non-blocking; 201 + background pipeline via `BackgroundTasks`
  - `GET /documents/` — list documents in an organization
  - `GET /documents/{id}` — get document by ID
  - `GET /documents/{id}/status` — returns `{document_id, status, progress, current_step, error_message, ...}`; owner-only
  - `POST /documents/{id}/retry` — re-queues FAILED document; owner-only; 409 if not FAILED
  - `DELETE /documents/{id}` — deletes record + file
- [x] `app/routes/graph.py` — graph query endpoints
- [x] `app/routes/organizations.py` — organization management
- [x] `app/routes/compliance.py` — compliance checks
- [x] `app/routes/domain.py` — domain-specific queries
- [x] `app/routes/export.py` — data export
- [x] `app/routes/retrieval.py` — retrieval-augmented generation
- [x] `app/routes/debug.py` — debug/health endpoints
- [x] `app/services/document_processor.py` — PDF/web document processing pipeline
- [x] `app/services/graph_builder.py` — entity/relationship extraction → Neo4j
- [x] `app/services/knowledge_graph.py` — KG query & traversal logic
- [x] `app/services/graph_explorer.py` — graph exploration utilities
- [x] `app/services/llm_reasoning.py` — LLM-based reasoning layer
- [x] `app/services/organization.py` — org CRUD logic
- [x] `app/services/compliance.py` — compliance rule engine
- [x] `app/services/scraper.py` — web scraping service
- [x] `app/services/preprocessing.py` — document preprocessing utilities
- [x] `app/services/retrieval.py` — vector similarity retrieval (Qdrant)
- [x] `app/services/export_service.py` — export formatting

### Pending (Backend)

- [ ] Protect non-auth routes with `Depends(get_current_user)` where required

---

## `/client` — Completed Tasks

> The client is a **Next.js 15 App Router** application written in TypeScript.

### Project Setup

- [x] Next.js 15 app initialised with App Router under `client/`
- [x] TypeScript configured (`tsconfig.json`)
- [x] Tailwind CSS + PostCSS configured
- [x] shadcn/ui component library integrated (`components.json`)
- [x] Global styles in `src/app/globals.css`
- [x] Root layout (`src/app/layout.tsx`) with `ThemeProvider`
- [x] Dark/light **theme system** — `src/components/theme-provider.tsx` wrapping `next-themes`

### Authentication (Client-Side)

- [x] **`src/context/auth-context.tsx`** — React context providing `user`, `token`, `login()`, `logout()`, `register()` with JWT stored client-side; protects routes by redirecting unauthenticated users
- [x] **`src/services/auth-service.ts`** — typed wrappers around `POST /auth/token`, `POST /auth/register`, `GET /auth/me`
- [x] **`src/services/api.ts`** — Axios instance with base URL, auto-attaches Bearer token from storage, handles 401 → logout
- [x] **Login page** (`src/app/login/page.tsx`) — email/username + password form, error handling, redirect on success
- [x] **Register page** (`src/app/register/page.tsx`) — full registration form with validation, redirects to login on success

### Pages & Features

- [x] **Home / landing page** (`src/app/page.tsx`) — entry point, redirects to dashboard if authenticated
- [x] **Dashboard** (`src/app/dashboard/page.tsx`) — protected overview page showing graph/document stats
- [x] **Upload page** (`src/app/upload/page.tsx`) — document upload UI calling upload/document endpoints
- [x] **Documents page** (`src/app/documents/page.tsx`) — document listing and management
- [x] **Organizations page** (`src/app/organizations/page.tsx`) — organization listing/management UI
- [x] **`src/services/document-service.ts`** — typed wrappers for document CRUD and upload API calls

### Component Library

- [x] `src/components/ui/` — shadcn/ui primitives (buttons, inputs, cards, dialogs, etc.)
- [x] `src/components/layout/` — shared layout components (sidebar, navbar, etc.)
- [x] `src/components/dashboard/` — dashboard-specific components
- [x] `src/components/graph/` — graph visualisation components
- [x] `src/components/upload/` — upload form components
- [x] `src/components/reports/` — report viewer components

### Feature Modules (`src/features/`)

- [x] `src/features/documents/` — document feature components
- [x] `src/features/organizations/` — organization feature components
- [x] `src/features/compliance/` — compliance feature components
- [x] `src/features/reports/` — reports feature components

---

## Key Constraints & Rules

1. **Do NOT use MongoDB** for any new application data — PostgreSQL only for new data
2. **Do NOT modify** `app/db/postgres.py` or `app/db/mongo.py` — legacy, used by other team members
3. **Do NOT delete existing code** without explicit approval
4. **All migrations** must be tracked in `backend/alembic/versions/` — never regenerate applied migrations
5. **JWT secret** (`JWT_SECRET`) must always be set in production `.env`
6. **Next.js App Router** — always use `src/app/` for new pages, not `src/pages/`

---

## Environment Variables Summary

### Backend (`backend/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Full PostgreSQL connection string (takes priority) |
| `POSTGRES_*` | Individual DB connection parts (fallback) |
| `JWT_SECRET` | JWT signing secret |
| `JWT_ALGORITHM` | Default: `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Default: `30` |

### Client (`client/.env.local`)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend base URL (e.g. `http://localhost:8000`) |

---

*Last updated: 2026-07-27*
