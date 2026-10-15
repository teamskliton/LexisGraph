# LexisGraph

<div align="center">

**Intelligent Legal Compliance & Knowledge Graph Analysis Platform**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?style=flat&logo=next.js&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Neo4j](https://img.shields.io/badge/Neo4j-5-008CC1?style=flat&logo=neo4j&logoColor=white)](https://neo4j.com)
[![Qdrant](https://img.shields.io/badge/Qdrant-Vector_DB-DC2626?style=flat&logo=qdrant&logoColor=white)](https://qdrant.tech)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat&logo=redis&logoColor=white)](https://redis.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

</div>

---

## Overview

**LexisGraph** is an enterprise legal compliance analysis, policy formation, and knowledge-graph platform. It ingests complex regulatory documents and corporate policy files, extracts clause-level semantics, constructs interconnected knowledge graphs, and performs automated compliance gap analysis with dense vector embeddings and explainable legal citations.

In addition to compliance audits, LexisGraph features an autonomous **Policy Formation** governance workflow that guides startups and established enterprises from organizational circumstance discovery to grounded policy drafting, formal multi-stage review, cryptographic approval hashing, and direct production repository publication.

---

## Architecture & Data Flow

```
                                  ┌─────────────────────────────────────────┐
                                  │      Client Layer (Next.js 16)          │
                                  │ - Executive Dashboard  - Knowledge Graph│
                                  │ - Compliance Viewer    - AI Assistant   │
                                  │ - Policy Formation     - Policy Center  │
                                  └────────────────────┬────────────────────┘
                                                       │ REST / WebSocket
                                                       ▼
                                  ┌─────────────────────────────────────────┐
                                  │      Backend API (FastAPI / Python)     │
                                  │  - Auth & RBAC         - Clause Parser  │
                                  │  - GraphRAG Engine     - Background Jobs│
                                  │  - Policy Formation    - Lifecycle Sync │
                                  └───────┬────────────┬────────────┬───────┘
                                          │            │            │
            ┌─────────────────────────────┼────────────┼────────────┼─────────────────────────────┐
            ▼                             ▼            ▼            ▼                             ▼
┌───────────────────────┐     ┌──────────────────────┐   ┌──────────────────────┐     ┌───────────────────────┐
│     PostgreSQL 16     │     │       Neo4j 5        │   │        Qdrant        │     │        Redis 7        │
│ Relational Data, RBAC,│     │ Knowledge Graph:     │   │ Dense Clause Vector  │     │ Job Queue, Real-time  │
│ Documents, Assessments│     │ Clauses, Acts, Rules │   │ Similarity Search    │     │ Status & Cache        │
│ Drafts, Audit Logs    │     │                      │   │                      │     │                       │
└───────────────────────┘     └──────────────────────┘   └──────────────────────┘     └───────────────────────┘
```

### Polyglot Persistence Layer

| Engine | Role & Stored Entities | Port |
|---|---|---|
| **PostgreSQL 16** | Users, Organizations, Document metadata, Compliance reports, Findings, Remediations, Assessments, Policy Drafts, Approval Audits | `5433:5432` |
| **Neo4j 5** | Knowledge Graph: Regulation clauses, Policy clauses, Legal entities, Cross-references | `7474`, `7687` |
| **Qdrant** | High-dimensional dense embeddings for clause similarity and semantic search | `6333` |
| **Redis 7** | Cache, task orchestration, asynchronous job tracking | `6379` |
| **pgAdmin 4** | Web-based PostgreSQL administration interface | `5050` |

---

## Repository Structure

```
LexisGraph/
├── backend/                  # FastAPI Application Service
│   ├── alembic/              # PostgreSQL database migrations
│   ├── app/                  # Application source code
│   │   ├── compliance/       # Compliance engine & scoring services
│   │   ├── core/             # Configuration, security, JWT, schemas
│   │   ├── db/               # Multi-database drivers (Postgres, Neo4j, Qdrant, Redis)
│   │   ├── routes/           # REST API route endpoints
│   │   └── services/         # Scrapers, NLP parsing, GraphRAG, PDF reporting
│   ├── tests/                # Automated unit & integration tests
│   ├── pytest.ini            # Pytest configuration
│   ├── requirements.txt      # Python dependencies
│   └── Dockerfile            # Container build specification
├── client/                   # Next.js 16 Frontend Web Application
│   ├── public/               # Static assets and icons
│   ├── src/                  # Application source code
│   │   ├── app/              # App Router pages and layouts
│   │   ├── components/       # Feature & UI component library
│   │   ├── services/         # Typed API connectors
│   │   └── styles/           # Design system tokens and styles
│   ├── .env.example          # Client environment template
│   └── package.json          # Node dependencies and scripts
├── data/                     # Ingestion storage placeholders
├── docker-compose.yml        # Multi-container orchestration (DBs & Cache)
├── LICENSE                   # MIT License
└── README.md                 # Project documentation
```

---

## Prerequisites

- **Docker Desktop** (with Docker Compose v2+)
- **Python 3.11+**
- **Node.js 18+** & **npm**
- **Git**

---

## Quickstart Guide

### 1. Launch Database & Cache Services

Start the backing services in the background:

```powershell
docker compose up -d
```

Verify all containers are healthy:
```powershell
docker compose ps
```

---

### 2. Configure & Run Backend

In a terminal, navigate to `backend/`:

```powershell
cd backend

# Create local .env from example template
Copy-Item .env.example .env

# Create and activate Python virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Download spaCy model for NLP parsing
python -m spacy download en_core_web_sm

# Apply database migrations
alembic upgrade head

# Start the FastAPI server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

---

### 3. Configure & Run Frontend Client

In a second terminal, navigate to `client/`:

```powershell
cd client

# Create local environment configuration
Copy-Item .env.example .env.local

# Install dependencies
npm install

# Start the Next.js development server
npm run dev
```

The application is now live at [http://localhost:3000](http://localhost:3000).

---

## Service URLs & Ports

| Service | URL | Notes |
|---|---|---|
| **Frontend Application** | [http://localhost:3000](http://localhost:3000) | Next.js 16 Client |
| **Backend REST API** | [http://127.0.0.1:8000](http://127.0.0.1:8000) | FastAPI Core Service |
| **Interactive API Docs** | [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) | Swagger UI |
| **Alternative API Docs** | [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc) | ReDoc UI |
| **System Health Check** | [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health) | Health & DB connection probe |
| **Neo4j Browser** | [http://localhost:7474](http://localhost:7474) | User: `neo4j` / Pass: `password` |
| **pgAdmin 4** | [http://localhost:5050](http://localhost:5050) | Email: `admin@lexisgraph.com` |

---

## Policy Formation Governance Lifecycle (Stages 1–5)

LexisGraph delivers a complete, end-to-end policy formation and lifecycle management workflow designed to take organizations from circumstance discovery to live compliance enforcement:

```
Assess ──> Analyze ──> Draft ──> Review ──> Approve ──> Publish ──> Maintain
```

| Lifecycle Stage | Implementation & Governance Controls | Key Artifacts & Models |
|---|---|---|
| **1. Assess** | 6-step guided Organization Assessment Wizard capturing corporate structure, jurisdictions, industries, data categories, and operational scale. Fully persisted with resume capability. | `OrganizationAssessment` |
| **2. Analyze** | Discovers statutory obligations against a canonical legal registry (DPDP Act, IT Act, CERT-In, SEBI CS Framework, ISO 27001), evaluates existing policy coverage, and generates a traceable Policy Needs Analysis. | `PolicyNeedsAnalysis` |
| **3. Draft** | AI-assisted drafting grounded in specific statutory requirements and user evidence. Features section-level regeneration, debounced autosave, and strict fallback telemetry (`generation_method`, `is_template_fallback`, retry grounding). | `PolicyDraft` |
| **4. Review** | Review queue with workspace role filtering (`ADMIN`, `COMPLIANCE_ANALYST`, `REVIEWER`). Draft locks against concurrent modifications during review. | `READY_FOR_REVIEW` |
| **5. Approve** | Assigned approver review with mandatory feedback, optimistic concurrency control (`expected_version`), self-approval blocking in multi-member workspaces, and canonical SHA-256 content hashing. | `PolicyApprovalAudit` |
| **6. Publish** | Direct integration into the production `Document` table (`document_type = DocumentType.POLICY`). Triggers automated text processing and vector indexing without duplicate tables. Atomic file rollback cleanup on failure. | `Document` (POLICY) |
| **7. Maintain** | Version branching (`vN+1`), effective date scheduler (`PENDING_EFFECTIVE` to `ACTIVE`), review cadence tracking (`Annual`, `Semi-Annual`, `Quarterly`), and automatic superseding of prior active policies. | `SUPERSEDED` / `ACTIVE` |

---

## Testing & Quality Assurance

### Comprehensive Test Suites (75+ Automated Tests)
LexisGraph enforces end-to-end test coverage across all compliance, policy formation, and workspace isolation boundaries:

```powershell
cd backend

# Run the complete Policy Formation suite (Stages 1–5)
.\venv\Scripts\python.exe -m unittest tests/test_policy_formation_assessment.py tests/test_policy_needs_analysis.py tests/test_policy_drafting.py tests/test_policy_approval_publishing.py -v

# Run the Workspace Isolation & Multitenancy suite
.\venv\Scripts\python.exe -m unittest tests/test_workspace_isolation.py -v

# Run all backend tests via pytest
.\venv\Scripts\pytest.exe
```

### Frontend Build & Typecheck
Verify production build correctness and strict TypeScript compilation:

```powershell
cd client

# Validate strict TypeScript types (0 errors)
npx tsc --noEmit

# Run production build and lint
npm run build
npm run lint
```

---

## Core Platform Capabilities

1. **Autonomous Policy Formation Lifecycle**: End-to-end 7-step governance workflow from organizational assessment to grounded AI drafting, cryptographic approval hashing, and publication into the active Policies repository.
2. **Multi-Tenant RBAC Workspaces**: Role-based access control (Admin, Compliance Analyst, Legal Analyst, Reviewer, Organization Admin) with strictly isolated tenant boundaries and audit logs.
3. **Automated Document Ingestion & Storage**: Safe upload and parsing of internal policy documents and global statutory regulations with SHA-256 deduplication and atomic rollbacks.
4. **GraphRAG Compliance Scoring**: Evaluates compliance alignment (`compliant`, `partial`, `gap`) using dense vector similarity (Qdrant) combined with interconnected graph context (Neo4j).
5. **Remediation & Evidence Management**: Corrective action tracking, evidence document verification, auditor approval cycles, and chronological compliance health timelines.
6. **Interactive Knowledge Graph Canvas**: Visual graph explorer mapping policies, statutory regulations, legal entities, clauses, and cross-document dependencies.
7. **Conversational AI Legal Assistant**: Grounded legal query interface citing specific statutory provisions and policy clauses with confidence metrics.
8. **Automated Policy Lifecycle Engine**: Effective date scheduling (`PENDING_EFFECTIVE` to `ACTIVE`), review cadence reminders, and automatic version superseding.

---

## License

This project is licensed under the MIT License — see the [LICENSE](./LICENSE) file for details.
