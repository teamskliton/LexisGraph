# Chapter 7 — Backend Architecture

---

# 7.1 Introduction

The backend is the core of LexisGraph.

It is responsible for:

- Authentication
- Authorization
- Legal document ingestion
- Company policy processing
- Knowledge Graph generation
- Vector embedding generation
- GraphRAG retrieval
- LLM orchestration
- Compliance analysis
- Report generation
- Background processing
- Scheduler execution
- Audit logging

The backend shall be implemented using **FastAPI** and follow a modular Clean Architecture.

Business logic shall never be placed directly inside API routes.

---

# 7.2 Technology Stack

Backend Framework

- FastAPI

Programming Language

- Python 3.12+

Database

- MongoDB Atlas

Graph Database

- Neo4j Aura

Authentication

- JWT

Password Hashing

- Argon2

Vector Embeddings

- BAAI/bge-large-en-v1.5 (or latest BGE model)

LLM

- OpenRouter

Background Queue

- Celery + Redis

Scheduler

- APScheduler

Validation

- Pydantic v2

Dependency Management

- uv

Logging

- structlog

Configuration

- pydantic-settings

---

# 7.3 Architectural Principles

The backend shall follow:

- Clean Architecture
- Separation of Concerns
- Dependency Injection
- Repository Pattern
- Service Layer Pattern
- Async-first Design
- Stateless APIs
- SOLID Principles

No module should directly depend on another module's implementation.

Dependencies shall point inward.

---

# 7.4 Backend Folder Structure

```

backend/
│
├── app/
│
├── api/
│ ├── auth/
│ ├── admin/
│ ├── organizations/
│ ├── policies/
│ ├── reports/
│ ├── graph/
│ └── health/
│
├── core/
│ ├── config.py
│ ├── security.py
│ ├── database.py
│ ├── logging.py
│ └── dependencies.py
│
├── auth/
│
├── models/
│
├── schemas/
│
├── repositories/
│
├── services/
│
├── ingestion/
│
├── graph/
│
├── retrieval/
│
├── ai/
│
├── compliance/
│
├── workers/
│
├── scheduler/
│
├── middleware/
│
├── utils/
│
└── main.py

```

Every directory has a single responsibility.

---

# 7.5 API Layer

The API layer shall contain only:

- Request validation
- Authentication
- Authorization
- Response serialization

API routes shall never contain business logic.

Example

```

Wrong

router.post("/upload")

↓

Extract PDF

↓

Generate embeddings

↓

Run AI

```

Correct

```

router.post("/upload")

↓

PolicyService

↓

Return Response

```

---

# 7.6 Service Layer

Every major feature shall have its own service.

Examples

```

AuthService

OrganizationService

PolicyService

EmbeddingService

GraphService

GraphRAGService

ComplianceService

ReportService

SchedulerService

```

Services shall coordinate application logic.

Services may call multiple repositories.

Services shall never directly access HTTP requests.

---

# 7.7 Repository Layer

Repositories shall contain database logic only.

Examples

```

UserRepository

OrganizationRepository

PolicyRepository

LegalRepository

ReportRepository

GraphRepository

```

Repositories shall not perform AI reasoning.

---

# 7.8 AI Layer

The AI layer shall remain independent.

Modules

```

Embedding Service

Retriever

Prompt Builder

LLM Client

Response Parser

Confidence Calculator

```

Responsibilities

Generate embeddings

Retrieve evidence

Construct prompts

Call LLM

Validate output

Return structured JSON

---

# 7.9 Graph Layer

Responsible for Neo4j.

Modules

```

Graph Builder

Graph Updater

Graph Validator

Relationship Generator

Similarity Builder

```

No MongoDB logic shall exist inside Graph modules.

---

# 7.10 Ingestion Layer

Responsible for legal knowledge ingestion.

Modules

```

Website Scraper

PDF Loader

HTML Loader

Text Cleaner

Clause Extractor

Metadata Extractor

Embedding Generator

Mongo Storage

Graph Builder

```

Runs independently of user uploads.

---

# 7.11 Compliance Layer

Responsible for organization policy analysis.

Workflow

```

Policy

↓

Extract Text

↓

Clause Extraction

↓

Embeddings

↓

GraphRAG Retrieval

↓

LLM

↓

Gap Analysis

↓

Recommendations

↓

Report

```

No legal database modifications occur here.

---

# 7.12 Authentication Architecture

Authentication Flow

```

Login

↓

Verify Password

↓

Generate JWT

↓

Return Access Token

↓

Authenticated Requests

```

Refresh Tokens should be supported.

Passwords shall never be reversible.

---

# 7.13 Authorization

Roles

Administrator

Organization User

Future

Compliance Reviewer

Auditor

Permissions shall be checked before every protected operation.

---

# 7.14 Background Workers

Long-running jobs shall execute outside HTTP requests.

Examples

- PDF Processing
- Embeddings
- Graph Updates
- Report Generation

Workflow

```

API

↓

Queue

↓

Worker

↓

Mongo

↓

Neo4j

↓

Complete

```

HTTP requests should return immediately after queuing.

---

# 7.15 Scheduler

Scheduler Responsibilities

- Monitor legal websites
- Detect updates
- Download documents
- Queue processing
- Update graph

Scheduler must be independent of API requests.

---

# 7.16 Dependency Injection

FastAPI dependency injection shall be used.

Examples

- Database
- Current User
- JWT
- Settings
- Logger

Global variables shall be avoided.

---

# 7.17 Middleware

Required Middleware

- CORS
- Request Logging
- Rate Limiting
- Authentication
- Error Handling
- Request ID
- GZip Compression

Future

- Metrics

---

# 7.18 Exception Handling

Custom exceptions shall be implemented.

Examples

```

AuthenticationError

AuthorizationError

ValidationError

GraphError

EmbeddingError

LLMError

ProcessingError

```

Raw exceptions shall never reach clients.

---

# 7.19 Configuration

Configuration shall use environment variables only.

Never hardcode

- API Keys
- Secrets
- URLs
- Passwords

Use

```

.env

```

and

```

pydantic-settings

```

---

# 7.20 Logging

Use structured logging.

Every request shall include

- Request ID
- User ID
- Organization ID
- Timestamp
- Duration

Sensitive information shall never be logged.

---

# 7.21 Async Design

FastAPI endpoints shall be asynchronous whenever possible.

Avoid blocking operations.

CPU-intensive tasks shall execute in background workers.

---

# 7.22 Request Lifecycle

Example

```

User Upload

↓

Authentication

↓

Validation

↓

Policy Service

↓

Queue Job

↓

Worker

↓

Extract

↓

Embeddings

↓

GraphRAG

↓

LLM

↓

Store Report

↓

Notify User

```

---

# 7.23 Security Principles

The backend shall follow:

- Zero Trust
- Least Privilege
- Input Validation
- Output Sanitization
- Secure Defaults

Every endpoint must validate authorization.

---

# 7.24 Coding Standards

All code shall follow:

- Type Hints
- Pydantic Models
- Async Functions
- Black Formatting
- Ruff Linting
- Modular Design
- Comprehensive Docstrings

Magic numbers and duplicated logic shall be avoided.

---

# 7.25 Future Extensibility

The architecture shall support:

- Multi-tenancy
- Microservices
- Multiple embedding providers
- Multiple LLM providers
- Event-driven architecture
- Kubernetes deployment

without requiring major code restructuring.

---

# 7.26 Backend Acceptance Criteria

The backend shall be considered complete when:

✓ APIs contain no business logic.

✓ Services encapsulate application behavior.

✓ Repositories isolate database access.

✓ AI components are modular.

✓ Background jobs handle long-running tasks.

✓ Scheduler operates independently.

✓ JWT authentication is secure.

✓ Role-based authorization is enforced.

✓ Logging is structured.

✓ Configuration is environment-driven.

✓ The backend is horizontally scalable.

---

# 7.27 Summary

The FastAPI backend is the central orchestration layer of LexisGraph.

It coordinates document ingestion, legal knowledge management, GraphRAG retrieval, AI reasoning, compliance analysis, and report generation while maintaining a modular, secure, scalable, and maintainable architecture based on Clean Architecture principles.

---

End of Chapter 7