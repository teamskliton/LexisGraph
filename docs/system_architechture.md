# Chapter 2 — System Architecture

---

# 2.1 Architectural Philosophy

LexisGraph follows a modular, service-oriented architecture that separates legal knowledge management from compliance analysis.

The system is designed around the following principles:

- Separation of concerns
- Scalability
- Explainable AI
- Privacy by design
- Modular AI pipeline
- Independent frontend and backend
- Centralized legal knowledge
- Stateless APIs

The architecture intentionally separates the legal knowledge base from organization-specific data to ensure maintainability and security.

---

# 2.2 High-Level Architecture

The system consists of six major layers.

```
                    Next.js Frontend
                           │
                 REST API / HTTPS
                           │
                     FastAPI Backend
                           │
 ┌───────────────┬──────────┴───────────────┬──────────────┐
 │               │                          │              │
 ▼               ▼                          ▼              ▼
MongoDB      Neo4j Graph            OpenRouter LLM   Background Jobs
                           │
                    Legal Knowledge Base
```

Each layer has a clearly defined responsibility.

---

# 2.3 Core Components

The platform consists of:

## Frontend

Technology

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui

Responsibilities

- Authentication
- Dashboard
- Admin Portal
- Upload Interface
- Reports
- Graph Visualization
- Settings

The frontend never performs AI operations.

All business logic resides inside FastAPI.

---

## Backend

Technology

- FastAPI

Responsibilities

- Authentication
- Authorization
- Document Processing
- Graph Construction
- Embedding Generation
- GraphRAG Retrieval
- Compliance Analysis
- LLM Orchestration
- Report Generation

---

## MongoDB

Purpose

Document storage.

Stores

- Legal documents
- User policies
- Embeddings
- Reports
- Metadata
- Users
- Audit logs

---

## Neo4j

Purpose

Knowledge graph.

Stores

- Legal relationships
- Clause relationships
- Cross references
- Semantic links

---

## OpenRouter

Purpose

LLM inference.

Responsibilities

- Compliance reasoning
- Explanation generation
- Recommendation generation
- Executive summary
- Natural language reports

The LLM should never be used as long-term storage.

It only performs reasoning using retrieved context.

---

# 2.4 Two Independent Pipelines

The platform is built around two completely independent pipelines.

Pipeline A

Legal Knowledge Base

Pipeline B

Compliance Analysis

This separation is mandatory.

---

# 2.5 Pipeline A — Legal Knowledge Base

Only administrators can access this pipeline.

```
Admin

↓

Add Government Source

↓

Scheduler

↓

Download Documents

↓

Extract Text

↓

Clean Text

↓

Clause Extraction

↓

Generate Embeddings

↓

Store MongoDB

↓

Build Neo4j

↓

Legal Knowledge Base Ready
```

Purpose

Continuously maintain legal knowledge.

Users never interact with this pipeline.

---

# 2.6 Pipeline B — Compliance Analysis

Users access this pipeline.

```
Upload Company Policy

↓

Extract Text

↓

Clause Extraction

↓

Generate Embeddings

↓

Hybrid GraphRAG Retrieval

↓

LLM Reasoning

↓

Compliance Report

↓

Download Report
```

Purpose

Evaluate company policies.

This pipeline never modifies legal documents.

---

# 2.7 Legal Knowledge Base

The legal knowledge base contains only trusted legal information.

Examples

- DPDP Act
- IT Act
- CERT-In Guidelines
- RBI Circulars
- SEBI Regulations
- Labour Laws
- Company Act
- ISO Standards

The knowledge base is continuously updated.

Organizations never upload legal documents.

---

# 2.8 Organization Policy Repository

Organization policies remain completely separate from the legal knowledge base.

Examples

- HR Policy
- Cyber Security Policy
- Privacy Policy
- Data Retention Policy
- Vendor Policy

These documents are analyzed against the legal knowledge base.

---

# 2.9 Document Processing Architecture

Every document follows the same preprocessing pipeline.

```
Raw Document

↓

Text Extraction

↓

Cleaning

↓

Normalization

↓

Clause Detection

↓

Metadata Extraction

↓

Embedding Generation

↓

Storage
```

This pipeline is reusable for both legal documents and organization policies.

---

# 2.10 Knowledge Representation

Every clause is represented in two forms.

Representation 1

Semantic Embedding

```
Clause

↓

Embedding Model

↓

Vector
```

Representation 2

Knowledge Graph

```
Clause

↓

Neo4j Node
```

Both representations must remain synchronized.

---

# 2.11 Hybrid Retrieval Architecture

LexisGraph shall implement Hybrid GraphRAG Retrieval.

The retrieval process consists of four stages.

Stage 1

Vector Search

↓

Find semantically similar clauses.

Stage 2

Graph Expansion

↓

Traverse Neo4j relationships.

Stage 3

Metadata Filtering

↓

Domain

Jurisdiction

Version

Effective Date

Stage 4

Context Assembly

↓

Prepare evidence for LLM.

---

# 2.12 LLM Reasoning Pipeline

The LLM is used only after retrieval.

```
Retrieved Legal Clauses

+

Policy Clauses

+

Graph Context

↓

Prompt Construction

↓

LLM

↓

Reasoning

↓

Structured JSON Output
```

The LLM should never answer without retrieved evidence.

---

# 2.13 Compliance Analysis Flow

The compliance engine performs:

1.

Policy ingestion

2.

Clause extraction

3.

Relevant regulation retrieval

4.

Graph expansion

5.

Context preparation

6.

LLM reasoning

7.

Gap detection

8.

Recommendation generation

9.

Confidence estimation

10.

Report generation

---

# 2.14 Explainable AI

Every AI decision must include:

- Supporting clauses
- Referenced regulations
- Confidence
- Explanation
- Recommendation

The platform shall never return unexplained compliance decisions.

---

# 2.15 Scheduler Architecture

A background scheduler periodically updates the legal knowledge base.

Responsibilities

- Visit trusted websites
- Detect updates
- Download new documents
- Skip duplicates
- Reprocess modified documents
- Update MongoDB
- Update Neo4j

The scheduler shall support configurable intervals.

---

# 2.16 Component Responsibilities

Frontend

Responsible for:

- UI
- Forms
- Authentication
- Visualization

Backend

Responsible for:

- Business logic
- AI
- Retrieval
- Security

MongoDB

Responsible for:

- Persistent document storage

Neo4j

Responsible for:

- Relationship storage

LLM

Responsible for:

- Reasoning

Scheduler

Responsible for:

- Legal database maintenance

---

# 2.17 Architectural Constraints

The following constraints must always be respected.

- Frontend must never directly access databases.
- Frontend must communicate only through REST APIs.
- Business logic must remain inside FastAPI.
- AI models must never be exposed to clients.
- MongoDB and Neo4j must remain synchronized.
- Legal knowledge must remain independent of organization policies.
- APIs must remain stateless.
- Long-running tasks must execute asynchronously.
- All AI responses must be evidence-based.

---

# 2.18 Scalability Goals

The architecture should support:

- Multiple organizations
- Thousands of legal documents
- Millions of clauses
- Multiple jurisdictions
- Multiple legal domains
- Incremental graph updates
- Horizontal backend scaling

---

# 2.19 Future Architectural Extensions

The architecture should allow future integration of:

- OCR pipeline
- Multi-language support
- Voice document ingestion
- Legal chatbot
- Version-aware regulations
- Real-time legal alerts
- Workflow automation
- Collaboration features
- Enterprise SSO
- Microservice deployment

The current design should not prevent these future enhancements.

---

# 2.20 Architecture Summary

LexisGraph follows a layered GraphRAG architecture consisting of:

- Next.js frontend
- FastAPI backend
- MongoDB document database
- Neo4j knowledge graph
- Embedding model
- OpenRouter LLM
- Background scheduler

The system separates legal knowledge maintenance from compliance analysis, enabling scalable, explainable, and privacy-preserving AI-powered compliance assessment.

---

End of Chapter 2