# Chapter 4 — Non-Functional Requirements

---

# 4.1 Introduction

This chapter defines the non-functional requirements (NFRs) of LexisGraph.

Unlike functional requirements, which describe what the system does, non-functional requirements define how the system should behave.

These requirements ensure the platform is:

- Secure
- Scalable
- Reliable
- Maintainable
- Explainable
- Performant
- Privacy-preserving
- Production-ready

All future implementations must comply with these requirements.

---

# 4.2 Performance Requirements

The platform shall provide responsive user interactions while efficiently processing AI workloads.

## NFR-PERF-001

The frontend shall load the dashboard in under **2 seconds** on a standard broadband connection.

---

## NFR-PERF-002

Authentication requests shall complete within **2 seconds**.

---

## NFR-PERF-003

Policy upload acknowledgement shall be returned within **3 seconds**.

Large document processing may continue asynchronously.

---

## NFR-PERF-004

Legal document ingestion shall execute as background jobs.

The user interface must never block while:

- Processing PDFs
- Building graphs
- Generating embeddings
- Running synchronization

---

## NFR-PERF-005

Compliance analysis should complete within:

- Small document (<20 pages): under 30 seconds
- Medium document (20–80 pages): under 90 seconds
- Large document (>80 pages): asynchronous processing

---

## NFR-PERF-006

Graph traversal queries should complete in under **2 seconds** for typical workloads.

---

## NFR-PERF-007

Vector retrieval should return results in under **1 second**.

---

# 4.3 Scalability Requirements

LexisGraph shall support future organizational growth.

---

## NFR-SCALE-001

The architecture shall support multiple organizations.

---

## NFR-SCALE-002

Organization data must remain logically isolated.

---

## NFR-SCALE-003

The system shall support:

- Thousands of legal documents
- Millions of legal clauses
- Large knowledge graphs

without architectural redesign.

---

## NFR-SCALE-004

The backend shall be horizontally scalable.

Multiple FastAPI instances should operate without code changes.

---

## NFR-SCALE-005

The frontend shall remain independent from backend scaling.

---

# 4.4 Reliability Requirements

The platform shall remain stable during normal operation.

---

## NFR-REL-001

Unexpected backend failures shall not corrupt stored data.

---

## NFR-REL-002

Background jobs shall support retries after failure.

---

## NFR-REL-003

Failures in AI reasoning shall not affect stored documents.

---

## NFR-REL-004

Scheduler failures shall be logged and recover automatically.

---

## NFR-REL-005

The platform shall gracefully handle:

- Database outages
- LLM failures
- Network interruptions
- API timeouts

---

# 4.5 Availability Requirements

The system should remain available during normal usage.

---

## NFR-AVA-001

Frontend availability target:

99%

---

## NFR-AVA-002

Backend availability target:

99%

---

## NFR-AVA-003

Scheduled maintenance shall not corrupt stored knowledge.

---

# 4.6 Security Requirements

Security is a first-class architectural concern.

All modules shall follow secure-by-default principles.

---

## NFR-SEC-001

All communication shall use HTTPS in production.

---

## NFR-SEC-002

Passwords shall never be stored in plaintext.

Use modern password hashing.

Example:

- Argon2
- bcrypt

---

## NFR-SEC-003

JWT authentication shall be used.

---

## NFR-SEC-004

API endpoints shall validate authentication before processing requests.

---

## NFR-SEC-005

Role-based authorization shall be enforced.

Roles include:

- Administrator
- Organization User

---

## NFR-SEC-006

Secrets shall never be hardcoded.

Use environment variables.

---

## NFR-SEC-007

API keys shall never be exposed to frontend code.

---

## NFR-SEC-008

The frontend shall never directly communicate with databases.

---

## NFR-SEC-009

Uploaded files shall be validated before processing.

Validation includes:

- MIME type
- Extension
- File size
- Corruption detection

---

## NFR-SEC-010

Potentially dangerous files shall be rejected.

---

## NFR-SEC-011

Rate limiting shall protect public APIs.

---

## NFR-SEC-012

Input validation shall be applied to every request.

---

# 4.7 Privacy Requirements

LexisGraph processes organizational documents that may contain confidential information.

Privacy is mandatory.

---

## NFR-PRIV-001

Company policies shall never become part of the public legal knowledge base.

---

## NFR-PRIV-002

Organization data shall never be shared between organizations.

---

## NFR-PRIV-003

Only authenticated users may access their own reports.

---

## NFR-PRIV-004

The platform shall follow the principle of least privilege.

---

## NFR-PRIV-005

Only required metadata shall be collected.

---

## NFR-PRIV-006

Sensitive information shall never be logged.

Examples:

- Passwords
- API Keys
- Access Tokens
- Organization secrets

---

# 4.8 AI Explainability Requirements

LexisGraph shall be an explainable AI system.

Black-box outputs are not acceptable.

---

## NFR-AI-001

Every compliance conclusion shall include supporting evidence.

---

## NFR-AI-002

Every recommendation shall reference retrieved legal clauses.

---

## NFR-AI-003

LLM outputs shall be generated only after retrieval.

The LLM shall never answer from memory alone.

---

## NFR-AI-004

Confidence scores shall accompany every compliance finding.

---

## NFR-AI-005

AI responses shall distinguish between:

- Retrieved evidence
- Generated reasoning

---

# 4.9 Maintainability Requirements

The codebase shall remain modular.

---

## NFR-MAIN-001

Frontend and backend shall be independently deployable.

---

## NFR-MAIN-002

Business logic shall reside only in backend services.

---

## NFR-MAIN-003

Database access shall be isolated from API routes.

---

## NFR-MAIN-004

Every major component shall have a single responsibility.

---

## NFR-MAIN-005

Configuration shall be centralized.

---

# 4.10 Modularity Requirements

Each module shall operate independently.

Examples:

- Authentication
- Scheduler
- Graph Builder
- Retrieval
- LLM Service

A failure in one module should not break unrelated modules.

---

# 4.11 Logging Requirements

The platform shall maintain structured logs.

---

## NFR-LOG-001

Every API request shall be logged.

---

## NFR-LOG-002

Errors shall include stack traces in server logs only.

---

## NFR-LOG-003

Production logs shall never expose confidential information.

---

## NFR-LOG-004

Background jobs shall maintain execution history.

---

# 4.12 Monitoring Requirements

The platform shall expose operational metrics.

Metrics include:

- API latency
- Scheduler status
- Graph build duration
- AI response time
- Error rate
- Database connectivity

---

# 4.13 Usability Requirements

The interface shall be intuitive.

Users should complete common workflows with minimal training.

---

## NFR-UX-001

Navigation shall remain consistent.

---

## NFR-UX-002

The platform shall provide clear validation messages.

---

## NFR-UX-003

Long-running jobs shall display progress indicators.

---

## NFR-UX-004

Error messages shall be understandable by non-technical users.

---

# 4.14 Accessibility Requirements

The frontend shall follow WCAG 2.1 AA guidelines where practical.

Requirements include:

- Keyboard navigation
- Screen-reader compatibility
- Sufficient color contrast
- Visible focus indicators
- Accessible forms

---

# 4.15 Compatibility Requirements

Supported browsers:

- Chrome
- Edge
- Firefox
- Safari

Responsive support:

- Desktop
- Tablet

Mobile support is desirable but not mandatory for Version 1.

---

# 4.16 Deployment Requirements

The platform shall support cloud deployment.

Frontend:

- Vercel

Backend:

- Railway
- Render
- Azure
- AWS

Database:

- MongoDB Atlas
- Neo4j Aura

---

# 4.17 Backup Requirements

The platform shall support:

- Database backups
- Configuration backups
- Recovery procedures

Loss of a single server shall not permanently lose critical data.

---

# 4.18 Testing Requirements

The platform shall include:

- Unit Tests
- Integration Tests
- API Tests

Critical business logic shall be tested before release.

---

# 4.19 Documentation Requirements

The project shall include:

- API Documentation
- Architecture Documentation
- Database Documentation
- Deployment Guide
- Developer Guide

Every major module shall contain inline documentation.

---

# 4.20 Future Readiness

The architecture shall allow future integration of:

- OCR
- Multi-language support
- Multiple jurisdictions
- Multi-tenant deployment
- Enterprise authentication
- Microservices
- Event-driven processing
- AI model replacement

without requiring major architectural redesign.

---

# 4.21 Non-Functional Acceptance Criteria

The platform shall satisfy the following before production release:

✓ Secure authentication

✓ Role-based authorization

✓ Explainable AI

✓ Privacy-preserving architecture

✓ Scalable backend

✓ Modular codebase

✓ Structured logging

✓ Production monitoring

✓ Reliable background jobs

✓ Responsive frontend

✓ Accessible user interface

✓ Comprehensive documentation

---

# 4.22 Summary

LexisGraph shall prioritize:

- Security over convenience
- Explainability over opaque AI
- Privacy over unrestricted data collection
- Maintainability over quick implementations
- Scalability over short-term optimization
- Reliability over feature quantity

Every implementation decision should align with these principles.

---

End of Chapter 4