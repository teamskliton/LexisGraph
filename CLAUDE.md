# LexisGraph — Master Project Context & Documentation (CLAUDE.md)

> **Purpose:** This file serves as the definitive, single-source-of-truth context document for AI agents and developers working on **LexisGraph**.
> It consolidates all documentation, system architecture, database design, API specifications, backend/client features, security protocols, GraphRAG pipeline details, and sprint progress till now.

---

## 1. Project Overview & System Vision

**LexisGraph** is an enterprise legal-domain knowledge-graph and compliance-analysis platform. It ingests complex legal documents (regulations, statutory acts, and corporate policy files), extracts clause-level semantic structure, and performs hybrid automated compliance verification.

### Core Pipeline Workflow

```
┌─────────────────┐      ┌──────────────────────────┐      ┌─────────────────────────┐
│ Upload PDF /    │ ───► │ Storage & Processing     │ ───► │ Knowledge Graph (Neo4j) │
│ Regulation Document    │ Metadata (PostgreSQL)    │      │ & Vector Store (Qdrant) │
└─────────────────┘      └──────────────────────────┘      └────────────┬────────────┘
                                                                        │
┌─────────────────┐      ┌──────────────────────────┐                   │
│ Next.js Client  │ ◄─── │ Compliance Scoring &     │ ◄─────────────────┘
│ Interactive UI  │      │ Vector + Graph Retrieval │
└─────────────────┘      └──────────────────────────┘
```

1. **Document Upload & Storage:** Authenticated users upload policy or regulation documents (PDFs) which are stored on disk (`backend/storage/uploads/`) with tracking metadata stored in PostgreSQL.
2. **Clause Extraction & Preprocessing:** Documents are parsed into discrete policy and regulation clauses, generating chunk embeddings and extracting entities/relationships.
3. **Dual-Index Persistence:**
   - **Knowledge Graph (Neo4j):** Document hierarchy, clauses, legal entities, cross-references, and match relationships.
   - **Vector Store (Qdrant):** Dense semantic embeddings for clause similarity retrieval.
4. **Hybrid Compliance Scoring:** Calculates compliance alignment (`compliant`, `partial`, `gap`) using vector semantic similarity combined with Neo4j graph context and optional LLM reasoning.
5. **Interactive Exploration & Reporting:** Serves REST APIs consumed by a Next.js 15 frontend featuring a Graph Explorer, Compliance Viewer, and Report Exporter.

---

## 2. Tech Stack & Polyglot Persistence Architecture

LexisGraph leverages specialized storage engines tailored for distinct workloads:

| Layer | Technology | Primary Responsibility |
|---|---|---|
| **Backend API** | FastAPI (Python 3.11+) | Async REST API service, security, task orchestration |
| **Relational DB** | PostgreSQL + SQLAlchemy 2.0 + Alembic | Business data, Users, Organizations, Document metadata, Audit logs, Settings |
| **Graph DB** | Neo4j | Knowledge graph (Acts, Regulations, Clauses, Entities, Relationships) |
| **Vector Store** | Qdrant | Dense vector embeddings & similarity search |
| **Cache & Task Queue** | Redis | Session caching & asynchronous background jobs |
| **Object / File Storage**| Local Filesystem (`backend/storage/uploads/`) | PDFs, uploaded files, generated reports |
| **Legacy Storage** | MongoDB | Read-only legacy document store (*do not use for new features*) |
| **Client Frontend** | Next.js 15 (App Router) + TypeScript + Tailwind CSS | Interactive dashboard, graph explorer, compliance reporting |

---

## 3. Database Architecture & Schema Design

### Polyglot Data Distribution

- **PostgreSQL (`lexisgraph` DB):**
  - `users`: User profiles, hashed passwords, roles (`is_active`, `is_superuser`), UTC timestamps.
  - `organizations`: Organization names, tenant identification, domain metadata.
  - `documents`: Document upload tracking, `document_type` (`REGULATION`, `POLICY`), `processing_status` (`UPLOADED`, `PROCESSING`, `PROCESSED`, `FAILED`), file path, size, MIME type, SHA256 checksum, progress % and step tracking.
- **Neo4j Graph Model:**
  - **Nodes:** `UserDocument`, `PolicyClause`, `DomainDocument`, `RegulationClause`, `Entity`, `Authority`
  - **Relationships:** `HAS_CLAUSE`, `BELONGS_TO`, `HAS_ENTITY`, `MATCH`, `PARTIAL_MATCH`, `MISSING`
- **Qdrant Vector Collections:**
  - Dense embeddings for clauses and legal definitions with payload metadata linking back to PostgreSQL Document UUIDs and Neo4j node IDs.

### Database Session & Alembic Migration Setup

- **Lazy Session Initialization (`backend/app/db/session.py`):**
  - Database connections are initialized lazily to avoid connection attempts during module imports (e.g., during Alembic autogenerate).
  - Engine configured with `pool_pre_ping=True`, `pool_recycle=300`, `pool_size=5`, `max_overflow=10`.
  - FastAPI dependency `get_db()` yields sessions with automatic commit/rollback and connection cleanup.
- **Alembic Configuration (`backend/alembic/`):**
  - `env.py` uses `app.core.config.get_database_url()` as single source of truth.
  - Applied Migrations:
    - `0001_initial_migration_placeholder.py`: Seed migration history.
    - `0f0c9b648e58`: Create `users` table.
    - `a1b2c3d4e5f6`: Create `documents` table.
    - `b2c3d4e5f6a7`: Add processing tracking columns (`processing_started_at`, `processed_at`, `error_message`, `mongo_document_id`).
    - `c3d4e5f6a7b8`: Add progress tracking columns (`progress INT DEFAULT 0`, `current_step VARCHAR(150)`).

---

## 4. `/backend` — Architecture & Completed Features

Detailed documentation lives in [`backend/CLAUDE.md`](./backend/CLAUDE.md).

### Directory Structure

```
backend/
├── alembic/              # Alembic migration scripts and env.py
├── app/
│   ├── core/             # Configuration, security, schemas, dependencies
│   │   ├── config.py     # Pydantic environment configuration
│   │   ├── security.py   # Password hashing (bcrypt) & JWT token utilities
│   │   ├── schemas.py    # Pydantic schemas (User, Token, Document, etc.)
│   │   └── dependencies.py # FastAPI dependencies (get_current_user, get_db)
│   ├── db/               # Database drivers and models
│   │   ├── session.py    # SQLAlchemy 2.0 lazy engine & session factory
│   │   ├── models/       # SQLAlchemy models (user.py, document.py)
│   │   ├── neo4j.py      # Neo4j client connection
│   │   ├── qdrant.py     # Qdrant client connection
│   │   ├── redis_client.py # Redis client connection
│   │   └── postgres.py   # Legacy DB driver (DO NOT MODIFY)
│   ├── routes/           # FastAPI REST endpoints
│   │   ├── auth.py       # User authentication (/auth/register, /auth/token, /auth/me)
│   │   ├── documents.py  # Document upload and management (/documents/*)
│   │   ├── graph.py      # Neo4j graph operations & explorer
│   │   ├── compliance.py # Compliance evaluation endpoints
│   │   ├── retrieval.py  # Semantic search endpoints
│   │   ├── export.py     # Report export endpoints
│   │   └── debug.py      # System health and diagnostics
│   └── services/         # Core business logic & GraphRAG pipeline
│       ├── storage.py    # File storage service (validation, SHA256, pathing)
│       ├── document_processor.py # Parsing & text extraction
│       ├── graph_builder.py # Legal entity/relation extraction to Neo4j
│       ├── knowledge_graph.py # Graph query & traversal service
│       ├── retrieval.py  # Vector similarity search engine
│       ├── compliance.py # Hybrid compliance analysis engine
│       └── llm_reasoning.py # LLM orchestration layer (OpenRouter / Gemini)
├── storage/              # File upload storage root (git-ignored uploads)
└── tests/                # Pytest unit and integration test suite
```

### Security & Authentication Layer

- **Password Security (`app/core/security.py`):** Bcrypt password hashing via `passlib[bcrypt]` (`hash_password`, `verify_password`).
- **JWT Authorization:** Token creation and verification (`create_access_token`, `verify_token`) using `python-jose` with configurable algorithm (`HS256`) and expiration (`ACCESS_TOKEN_EXPIRE_MINUTES`).
- **FastAPI Authentication Dependency (`app/core/dependencies.py`):** `get_current_user` extracts Bearer JWT from `Authorization` header, verifies claims, resolves user in PostgreSQL, and enforces active status checks.

### API Endpoints Overview

#### Authentication (`app/routes/auth.py`)
- `POST /auth/register` — Registers user, hashes password, saves to PostgreSQL, returns `UserResponse` (201).
- `POST /auth/token` — Authenticates username/email + password, returns OAuth2 JWT Bearer token.
- `GET /auth/me` (Protected) — Returns authenticated user details.

#### Document Management (`app/routes/documents.py` & `app/services/storage.py`)
- `POST /documents/upload` — Non-blocking upload; validates PDF MIME type & size limit (50MB), computes SHA256 checksum, saves file to `storage/uploads/`, creates PostgreSQL record, and triggers async background processing.
- `GET /documents/` — Lists documents filtered by organization, type, or status.
- `GET /documents/{id}` — Returns document metadata.
- `GET /documents/{id}/status` — Returns realtime progress tracking (`progress` 0-100%, `current_step`, `processing_status`).
- `POST /documents/{id}/retry` — Re-queues failed document processing jobs.
- `DELETE /documents/{id}` — Removes PostgreSQL record and physical storage file.

#### Knowledge Graph & Compliance (`app/routes/graph.py` & `app/routes/compliance.py`)
- `POST /graph/build` — Constructs knowledge graph from selected user policy and regulation documents.
- `GET /graph/explorer` — Fetches root nodes and lazy expansion branches for UI visualization.
- `GET /graph/history` — Returns build execution logs and past graph states.
- `POST /graph/reset` — Clears active graph session state.
- `POST /compliance/analyze` — Evaluates policy clauses against regulation clauses, outputting status (`compliant`, `partial`, `gap`), vector score, graph score, and reasoning summary.
- `POST /retrieval/query` — Semantic search over legal clauses using Qdrant vector index.

---

## 5. `/client` — Architecture & Completed Features

The client is a **Next.js 15 App Router** project written in TypeScript.

### Directory Structure

```
client/
├── src/
│   ├── app/              # Next.js App Router pages & routes
│   │   ├── page.tsx      # Landing page / home redirect
│   │   ├── login/        # User login page
│   │   ├── register/     # Registration page
│   │   ├── dashboard/    # Main analytics & graph metrics dashboard
│   │   ├── upload/       # Document upload workspace
│   │   ├── documents/    # Document management & status view
│   │   └── organizations/# Organization management UI
│   ├── components/       # Shared UI components
│   │   ├── ui/           # shadcn/ui primitives (Button, Input, Card, Dialog)
│   │   ├── layout/       # Navbar, Sidebar, Page Shell
│   │   ├── dashboard/    # Metric cards & summary graphs
│   │   ├── graph/        # Graph Explorer canvas & interaction controls
│   │   ├── upload/       # Drag-and-drop dropzone & progress indicators
│   │   └── reports/      # Compliance report viewers
│   ├── context/          # React context providers
│   │   └── auth-context.tsx # Auth state, login/logout, route protection
│   ├── features/         # Domain-specific feature modules
│   │   ├── documents/    # Document features
│   │   ├── organizations/# Organization features
│   │   ├── compliance/   # Compliance features
│   │   └── reports/      # Reporting features
│   └── services/         # Client API service layer
│       ├── api.ts        # Axios instance with Bearer token interceptor & 401 handling
│       ├── auth-service.ts # Typed auth API client
│       └── document-service.ts # Typed document API client
├── public/               # Static web assets
├── components.json       # shadcn/ui configuration
├── tsconfig.json         # TypeScript configuration
└── tailwind.config.ts    # Tailwind CSS configuration
```

### Client Capabilities & Features

- **Authentication & Authorization:** Client-side JWT management with `AuthContext` protecting routes, handling auto-login, header attachments in Axios, and auto-logout on HTTP 401.
- **Modern Design System:** Light/Dark mode via `next-themes` and `ThemeProvider`, modern SaaS top-navigation layout, styled using Tailwind CSS and shadcn/ui.
- **Document Management UI:** Drag-and-drop PDF upload dropzone, upload progress tracking, file status listing, retry and delete operations.
- **Graph Explorer:** Visual representation of Neo4j knowledge graph nodes, node filtering, lazy expansion of regulation/policy clause branches, zoom/fit controls, and historical build selection.

---

## 6. Sprint Status & Development Roadmap

### Sprint Overview

| Sprint | Scope & Key Deliverables | Status |
|---|---|---|
| **Sprint 1 & 2** | Knowledge Graph prototype in Neo4j, Qdrant vector store setup, basic similarity scoring engine, initial React frontend setup. | ✅ Completed |
| **Sprint 3** | **Document Management System:** PostgreSQL `Document` model, Alembic migrations, `storage.py` local storage service, async document upload API, tracking columns (`progress`, `current_step`), frontend Next.js auth & document pages. | ✅ Completed |
| **Sprint 4 (Current/Next)** | **Automated Ingestion & Parsing Pipeline:** PDF text extraction, legal clause chunking, Named Entity Recognition (NER), automatic graph builder pipeline trigger, Qdrant auto-indexing. | 🚧 In Progress |
| **Sprint 5 (Planned)** | **Advanced Compliance & RAG Reasoning:** Durable background task queue (Celery/Redis), LLM multi-provider fallback engine, exportable compliance audit PDF reports. | ⏳ Planned |

---

## 7. Key System Constraints & Developer Guidelines

1. **Database Usage Rules:**
   - **PostgreSQL ONLY** for all new application data, users, metadata, and transactional records.
   - **Do NOT use MongoDB** for any new features. MongoDB scripts (`app/db/mongo.py`) are legacy and read-only.
   - **Do NOT modify** `app/db/postgres.py` or `app/db/mongo.py` — legacy drivers required for backwards compatibility.
2. **Migration Discipline:**
   - All schema updates MUST be implemented via Alembic migrations under `backend/alembic/versions/`.
   - Never modify or delete previously applied migration scripts.
3. **Frontend Rules:**
   - All new client pages MUST use the **Next.js App Router** under `client/src/app/` (never `src/pages/`).
   - Use shadcn/ui primitives and Tailwind CSS; maintain light/dark theme compatibility.
4. **Security Requirements:**
   - Never commit secrets or hardcoded passwords.
   - `JWT_SECRET` must be set in environment configuration (`.env`).
   - All protected routes must enforce authentication via `Depends(get_current_user)`.

---

## 8. Environment Variables Reference

### Backend Configuration (`backend/.env`)

```ini
# PostgreSQL Database Settings
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/lexisgraph
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=lexisgraph

# Security & JWT
JWT_SECRET=your_super_secret_jwt_key_here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# External Databases & Services
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
QDRANT_HOST=localhost
QDRANT_PORT=6333
REDIS_URL=redis://localhost:6379/0

# Optional LLM Reasoning Provider
LLM_REASONING_PROVIDER=gemini # or openrouter
GEMINI_API_KEY=your_gemini_key
OPENROUTER_API_KEY=your_openrouter_key
```

### Client Configuration (`client/.env.local`)

```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 9. Essential Command Reference

### Backend Execution & Migrations

```bash
cd backend

# Start backend FastAPI server
uvicorn app.main:app --reload --port 8000

# Apply all database migrations
alembic upgrade head

# Autogenerate a new migration after model changes
alembic revision --autogenerate -m "describe changes"

# Run tests
pytest
```

### Client Execution

```bash
cd client

# Install dependencies
npm install

# Start Next.js development server
npm run dev

# Build production bundle
npm run build
```

---

*Last updated: August 2, 2026*

