# Chapter 10 — Backend System Architecture

---

# 10.1 Purpose

The Backend System Architecture defines the internal structure, responsibilities, communication patterns, and implementation guidelines for the LexisGraph backend.

The backend acts as the central orchestration layer that coordinates:

- User authentication
- Policy management
- Legal knowledge management
- AI orchestration
- GraphRAG retrieval
- Compliance analysis
- Report generation
- Background processing
- Security
- Audit logging

The backend shall expose secure REST APIs for frontend applications while orchestrating AI workflows and database operations.

---

# 10.2 Architectural Style

LexisGraph shall adopt a **Modular Monolith Architecture**.

The application shall be deployed as a single backend service while maintaining strict separation between functional modules.

```
                   FastAPI Backend

┌──────────────────────────────────────────────┐

 Authentication Module

 Organization Module

 Policy Module

 Legal Knowledge Module

 GraphRAG Module

 AI Orchestration Module

 Compliance Engine

 Report Module

 Audit Module

 Background Worker Module

└──────────────────────────────────────────────┘
```

Each module shall be independently testable.

Modules shall communicate through internal service interfaces rather than direct database access.

---

# 10.3 Architecture Principles

The backend shall follow the following principles.

## Separation of Concerns

Every module performs one responsibility.

---

## Dependency Inversion

Business logic shall not depend directly on database implementations.

---

## Single Responsibility

Each service performs one task.

---

## Stateless APIs

HTTP APIs shall remain stateless.

Session state shall be maintained using JWTs and Redis where appropriate.

---

## Configuration Driven

Environment variables shall control:

Database connections

AI providers

API keys

Storage

Rate limits

Security settings

---

# 10.4 High-Level Architecture

```
               Next.js Frontend

                      │

                      ▼

              FastAPI REST API

                      │

────────────────────────────────────────

Authentication

Organizations

Policies

Knowledge Base

GraphRAG

AI

Reports

Audit

────────────────────────────────────────

                      │

        MongoDB

        Neo4j

        Redis

        Object Storage

        Celery Workers
```

---

# 10.5 Backend Responsibilities

The backend shall:

Authenticate users

Authorize requests

Manage organizations

Upload policies

Process documents

Generate embeddings

Perform GraphRAG retrieval

Invoke LLM providers

Calculate compliance

Generate reports

Store results

Maintain audit logs

Execute background jobs

---

# 10.6 Technology Stack

Programming Language

```
Python 3.12+
```

Framework

```
FastAPI
```

ORM / ODM

```
Beanie (MongoDB)

or

Motor + Pydantic
```

Graph Database

```
Neo4j
```

Cache

```
Redis
```

Task Queue

```
Celery
```

Validation

```
Pydantic v2
```

Authentication

```
JWT

OAuth2

Passlib/Argon2id
```

Containerization

```
Docker
```

---

# 10.7 Project Directory Structure

```
backend/

app/

api/

v1/

auth/

organizations/

policies/

knowledge/

retrieval/

ai/

reports/

audit/

schemas/

models/

services/

repositories/

workers/

core/

middleware/

config/

utils/

tests/

scripts/

docker/

requirements.txt

main.py
```

Every module shall have its own API, service, repository, and schema.

---

# 10.8 Layered Architecture

```
API Layer

↓

Service Layer

↓

Repository Layer

↓

Database
```

Each layer has clearly defined responsibilities.

---

# 10.9 API Layer

Responsibilities

Request validation

Authentication

Authorization

Response serialization

Error handling

Business logic shall never exist inside API routes.

---

# 10.10 Service Layer

Responsibilities

Business rules

Workflow orchestration

AI coordination

Compliance logic

Validation

Services shall never depend on HTTP request objects.

---

# 10.11 Repository Layer

Responsibilities

Database operations

Query construction

Persistence

Repositories abstract MongoDB and Neo4j access.

Services shall never execute database queries directly.

---

# 10.12 Background Workers

Long-running operations shall execute asynchronously.

Examples

PDF parsing

OCR

Embedding generation

Knowledge ingestion

Compliance analysis

Report generation

Email notifications

Workers communicate through Redis and Celery.

---

# 10.13 Object Storage

Uploaded files shall be stored outside MongoDB.

Examples

Amazon S3

MinIO

Azure Blob Storage

Google Cloud Storage

MongoDB stores metadata only.

---

# 10.14 Dependency Injection

FastAPI dependency injection shall manage:

Repositories

Database connections

Current user

Settings

AI providers

Logger

Dependencies shall remain loosely coupled.

---

# 10.15 Error Handling

The backend shall implement centralized exception handling.

Standard error format

```json
{
    "success": false,
    "error": {
        "code": "POLICY_NOT_FOUND",
        "message": "Requested policy does not exist."
    }
}
```

Internal exceptions shall not expose stack traces.

---

# 10.16 Logging

The backend shall implement structured logging.

Log categories

Authentication

AI

Retrieval

Database

Reports

Errors

Audit

Logs shall include request identifiers.

---

# 10.17 Configuration Management

Configuration shall be environment-based.

Examples

```
DATABASE_URL

NEO4J_URI

REDIS_URL

OPENAI_API_KEY

JWT_SECRET

UPLOAD_PATH
```

Secrets shall never be committed to Git.

---

# 10.18 API Versioning

REST APIs shall support versioning.

Example

```
/api/v1/

↓

Future

/api/v2/
```

Breaking changes shall create new API versions.

---

# 10.19 Security

The backend shall implement:

JWT authentication

RBAC authorization

HTTPS enforcement

Rate limiting

Input validation

CORS configuration

Secure headers

Audit logging

Prompt injection protection

---

# 10.20 Performance

The backend shall support:

Concurrent users

Asynchronous endpoints

Connection pooling

Database indexing

Caching

Streaming uploads

Background processing

---

# 10.21 Future Evolution

The architecture shall support migration to microservices if required.

Potential future services

Authentication Service

Knowledge Service

AI Service

Compliance Service

Reporting Service

Notification Service

Current module boundaries shall minimize future refactoring.

---

# 10.22 Acceptance Criteria

The Backend System Architecture shall be considered complete when:

✓ Modular architecture is implemented.

✓ API, Service, and Repository layers are separated.

✓ Long-running tasks execute asynchronously.

✓ Configuration is environment-driven.

✓ Security controls are enforced.

✓ Object storage is used for uploaded files.

✓ Logging and monitoring are centralized.

✓ APIs are versioned.

✓ Modules remain independently testable.

---

# 10.23 Summary

The Backend System Architecture provides a scalable, maintainable, and production-ready foundation for LexisGraph. By adopting a modular monolith with clear separation between API, service, repository, and persistence layers, the backend remains easy to develop today while supporting future evolution into independently deployable services. Combined with asynchronous workers, secure storage, centralized configuration, and robust security controls, this architecture enables reliable AI-powered compliance analysis at enterprise scale.

---

End of Chapter 10