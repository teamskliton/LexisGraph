# Chapter 9 — Database Design & Data Models

---

# 9.1 Purpose

The Database Layer is responsible for securely storing, organizing, versioning, and retrieving all data used by LexisGraph.

The platform uses a hybrid persistence architecture because no single database technology is optimal for every workload.

The database layer shall support:

- Organization management
- User authentication
- Legal Knowledge Base
- Policy management
- Knowledge Graph
- Semantic embeddings
- Compliance reports
- Audit logs
- Background jobs
- AI metadata

The design shall prioritize scalability, consistency, explainability, and maintainability.

---

# 9.2 Hybrid Database Architecture

LexisGraph shall use multiple storage technologies.

```
                     LexisGraph Backend
                            │
      ┌─────────────────────┼─────────────────────┐
      │                     │                     │
      ▼                     ▼                     ▼
   MongoDB              Neo4j Graph            Redis
(Document Store)      (Knowledge Graph)      (Cache & Queue)
      │                     │                     │
Policies               Legal Relations      Celery Jobs
Reports                References           Sessions
Users                  Graph Traversal      Temporary Cache
Organizations          Semantic Links
Embeddings
Audit Logs
```

Each database serves a specialized responsibility.

---

# 9.3 Database Responsibilities

## MongoDB

Stores structured application data.

Examples

- Users
- Organizations
- Policies
- Reports
- Legal Clauses
- Embeddings
- Audit Logs

---

## Neo4j

Stores relationships between legal entities.

Examples

- Clause references
- Section hierarchy
- Regulation dependencies
- Similarity relationships

---

## Redis

Stores temporary operational data.

Examples

- Background job queues
- Session cache
- Rate limiting counters
- Retrieval cache

Redis shall never be treated as permanent storage.

---

# 9.4 Multi-Tenant Data Model

LexisGraph is a multi-tenant platform.

Every organization owns its own operational data.

```
Organization
     │
     ├── Users
     ├── Policies
     ├── Reports
     ├── Settings
     └── Audit Logs
```

Shared legal knowledge is stored independently and is never modified by organizations.

---

# 9.5 Core Entities

The platform shall define the following primary entities.

Authentication

- User
- Role
- Session

Organizations

- Organization
- Organization Settings

Legal Knowledge

- Legal Source
- Legal Document
- Legal Clause
- Embedding

Policy Management

- Policy
- Policy Clause

Compliance

- Report
- Finding
- Recommendation

Operations

- Audit Log
- Background Job
- Scheduler Task

---

# 9.6 Entity Relationships

```
Organization
      │
      ├────────────── Users
      │
      ├────────────── Policies
      │                    │
      │                    ▼
      │             Policy Clauses
      │                    │
      │                    ▼
      │                Reports
      │                    │
      │                    ▼
      │                Findings
      │
      └────────────── Audit Logs

Legal Sources
      │
      ▼
Legal Documents
      │
      ▼
Legal Clauses
      │
      ▼
Embeddings

Legal Clauses
      │
      ▼
Neo4j Knowledge Graph
```

---

# 9.7 MongoDB Collections

The backend shall create the following collections.

```
users

roles

organizations

organization_settings

legal_sources

legal_documents

legal_clauses

embeddings

policies

policy_clauses

reports

findings

recommendations

audit_logs

jobs

scheduler_tasks
```

Collection names shall remain lowercase and plural.

---

# 9.8 Global Document Standards

Every MongoDB document shall contain standard metadata.

```
_id

created_at

updated_at

created_by

updated_by

organization_id (where applicable)

version

status
```

These fields provide consistency across collections.

---

# 9.9 Identifier Strategy

Every entity shall use a globally unique identifier.

Examples

```
ORG-000001

USR-000104

POL-000842

REP-000012

LAW-DPDP-SEC08-CL02
```

Internal MongoDB ObjectIds may be retained, but business identifiers shall be exposed to users.

---

# 9.10 Data Ownership

Organization-owned collections:

- Policies
- Policy Clauses
- Reports
- Findings
- Recommendations
- Audit Logs

Shared collections:

- Legal Sources
- Legal Documents
- Legal Clauses
- Knowledge Graph

Organization users shall never modify shared legal data.

---

# 9.11 Indexing Strategy

Indexes shall be created for frequently queried fields.

Examples

Users

- Email
- Organization ID

Policies

- Organization ID
- Upload Date
- Status

Reports

- Organization ID
- Policy ID
- Compliance Score

Legal Clauses

- Clause ID
- Jurisdiction
- Domain
- Version

Audit Logs

- Timestamp
- User ID

Indexes shall be reviewed periodically based on production query patterns.

---

# 9.12 Data Validation

All database writes shall be validated.

Validation includes:

Required fields

Correct data types

Unique constraints

Reference integrity

Business rule validation

Validation shall occur before persistence.

---

# 9.13 Versioning

The platform shall preserve historical data.

Versioning applies to:

Legal documents

Legal clauses

Policies

Reports

Prompt templates

Embeddings

Historical records shall remain immutable.

---

# 9.14 Soft Deletion

Operational entities shall support soft deletion.

```
status = deleted
```

Soft-deleted data shall remain recoverable for a configurable retention period.

Legal regulations shall not be physically deleted unless explicitly retired by an administrator.

---

# 9.15 Data Retention

Retention policies shall be configurable.

Examples

Audit Logs

7 years (configurable)

Reports

Configurable

Policy Uploads

Configurable

Temporary Jobs

Automatic cleanup after completion

Retention policies shall comply with applicable regulations and organizational requirements.

---

# 9.16 Backup & Recovery

The platform shall support:

Daily MongoDB backups

Periodic Neo4j backups

Redis persistence (where appropriate)

Disaster recovery procedures

Backup verification

Recovery testing

Recovery procedures shall preserve referential integrity.

---

# 9.17 Security

Database security requirements include:

TLS-encrypted connections

Least-privilege database users

Encrypted secrets

No hardcoded credentials

Network restrictions

Audit logging for administrative actions

Sensitive fields (such as passwords) shall be stored using secure one-way hashing or encryption as appropriate.

---

# 9.18 Performance Considerations

The database layer shall support:

Concurrent users

Background ingestion

Parallel AI analysis

Efficient graph traversal

Low-latency report retrieval

Future horizontal scaling

Queries shall avoid unnecessary collection scans.

---

# 9.19 Future Extensions

The database architecture shall support:

Multiple jurisdictions

Additional graph databases

Distributed storage

Sharding

Archival storage

Data warehouses

Analytics pipelines

NoSQL + SQL hybrid deployments

without requiring fundamental redesign.

---

# 9.20 Acceptance Criteria

The Database Layer shall be considered complete when:

✓ Multi-tenant isolation is enforced.

✓ MongoDB stores structured application data.

✓ Neo4j stores legal relationships.

✓ Redis supports transient workloads.

✓ Historical versions are preserved.

✓ Required indexes are implemented.

✓ Validation occurs before persistence.

✓ Backup and recovery procedures are defined.

✓ Security controls protect sensitive information.

---

# 9.21 Summary

The LexisGraph database architecture combines MongoDB, Neo4j, and Redis into a unified persistence layer. MongoDB manages structured application data, Neo4j models legal relationships, and Redis supports transient operational workloads. This hybrid design enables scalable document management, explainable GraphRAG retrieval, secure multi-tenant isolation, and efficient AI-powered compliance analysis while maintaining data integrity and future extensibility.

---

End of Section 9.1