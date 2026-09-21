# Chapter 3 — Functional Requirements

---

# 3.1 Introduction

This chapter defines all functional requirements of LexisGraph.

Functional requirements describe what the system shall do.

The platform consists of two major modules:

1. Administrator Module
2. Organization/User Module

Each module is divided into independent functional components.

Every requirement in this chapter is mandatory unless explicitly marked as optional or future scope.

---

# 3.2 Functional Modules

The system shall contain the following major modules.

| Module | Description |
|----------|-------------|
| Authentication | Login, Registration, Session Management |
| Admin Portal | Manage legal knowledge base |
| User Portal | Upload and manage company policies |
| Legal Knowledge Base | Store laws and regulations |
| Document Processing | Extract, preprocess and normalize documents |
| AI Processing | Embeddings, GraphRAG, LLM reasoning |
| Compliance Engine | Gap analysis |
| Reporting | Compliance reports and exports |
| Dashboard | Analytics and visualization |
| Notification System | Regulatory updates (Future) |

---

# 3.3 Administrator Module

The Administrator is responsible for maintaining the Legal Knowledge Base.

Administrators do NOT perform compliance analysis.

Administrators manage legal data only.

---

## FR-ADMIN-001

The system shall allow administrators to securely login.

---

## FR-ADMIN-002

The administrator shall be able to add trusted legal sources.

Supported source types include:

- Government Website
- Regulation Portal
- Gazette Website
- Public Legal API
- Manual PDF Upload

---

## FR-ADMIN-003

The administrator shall be able to edit legal sources.

Editable fields:

- Source Name
- URL
- Domain
- Country
- Active Status
- Synchronization Frequency

---

## FR-ADMIN-004

The administrator shall be able to disable legal sources without deleting them.

---

## FR-ADMIN-005

The administrator shall be able to delete a legal source.

Deleting a source shall not automatically delete processed legal documents unless explicitly requested.

---

## FR-ADMIN-006

The administrator shall be able to manually upload legal documents.

Supported formats:

- PDF

Future:

- DOCX
- HTML
- TXT

---

## FR-ADMIN-007

The administrator shall be able to trigger manual synchronization.

Synchronization includes:

- Download
- Processing
- Graph update

---

## FR-ADMIN-008

The administrator shall view synchronization history.

History includes:

- Start Time
- End Time
- Duration
- Status
- Errors
- Documents Processed

---

## FR-ADMIN-009

The administrator shall monitor scheduler status.

---

## FR-ADMIN-010

The administrator shall rebuild the knowledge graph.

---

## FR-ADMIN-011

The administrator shall reprocess individual legal documents.

---

## FR-ADMIN-012

The administrator shall view graph statistics.

Statistics include:

- Documents
- Clauses
- Relationships
- Similarity Edges
- Graph Density

---

# 3.4 User Module

Organizations use this module.

Users never upload legal documents.

Users upload only company policies.

---

## FR-USER-001

Users shall register using:

- Organization Name
- Email
- Password

---

## FR-USER-002

Users shall securely login.

---

## FR-USER-003

Users shall upload organization policy documents.

Supported format:

- PDF

Future:

- DOCX

---

## FR-USER-004

Users shall assign metadata while uploading.

Examples:

- Department
- Policy Category
- Effective Date
- Version

---

## FR-USER-005

The system shall validate uploaded documents.

Validation includes:

- File type
- File size
- Duplicate detection
- Corrupted PDF detection

---

## FR-USER-006

The system shall preprocess uploaded policies.

Processing includes:

- Text extraction
- Cleaning
- Clause extraction
- Metadata extraction
- Embedding generation

---

## FR-USER-007

The system shall compare uploaded policies against the Legal Knowledge Base.

---

## FR-USER-008

Users shall receive a compliance report.

---

## FR-USER-009

Users shall download reports.

Formats:

- PDF

Future:

- Excel
- DOCX

---

## FR-USER-010

Users shall access historical compliance reports.

---

# 3.5 Legal Knowledge Base Module

This module stores trusted regulations.

---

## FR-LKB-001

The system shall store legal documents.

---

## FR-LKB-002

The system shall extract legal clauses.

---

## FR-LKB-003

The system shall generate embeddings.

---

## FR-LKB-004

The system shall construct a knowledge graph.

---

## FR-LKB-005

The system shall detect duplicate legal documents.

---

## FR-LKB-006

The system shall maintain legal document versions.

---

## FR-LKB-007

The system shall support incremental updates.

Modified laws shall update only affected graph nodes.

---

# 3.6 Document Processing Module

Every uploaded document shall pass through the same pipeline.

---

## FR-DOC-001

Extract text.

---

## FR-DOC-002

Clean extracted text.

---

## FR-DOC-003

Normalize whitespace.

---

## FR-DOC-004

Remove headers and footers.

---

## FR-DOC-005

Detect legal sections.

---

## FR-DOC-006

Split into clauses.

---

## FR-DOC-007

Generate metadata.

Metadata includes:

- Source
- Section
- Clause Number
- Domain
- Version

---

## FR-DOC-008

Generate embeddings.

---

# 3.7 Graph Construction Module

---

## FR-GRAPH-001

Create Document nodes.

---

## FR-GRAPH-002

Create Clause nodes.

---

## FR-GRAPH-003

Create HAS_CLAUSE relationships.

---

## FR-GRAPH-004

Create semantic SIMILAR_TO relationships.

---

## FR-GRAPH-005

Future relationship types shall include:

- REFERS_TO
- AMENDS
- SUPERSEDES
- DEPENDS_ON
- CONFLICTS_WITH
- REQUIRES

---

# 3.8 Retrieval Module

The retrieval engine shall implement Hybrid GraphRAG.

---

## FR-RET-001

Perform semantic vector retrieval.

---

## FR-RET-002

Expand graph neighbors.

---

## FR-RET-003

Filter by metadata.

Examples:

- Jurisdiction
- Domain
- Version

---

## FR-RET-004

Assemble context for LLM reasoning.

---

# 3.9 Compliance Analysis Module

---

## FR-COMP-001

Compare policy clauses with retrieved legal clauses.

---

## FR-COMP-002

Identify compliance gaps.

---

## FR-COMP-003

Determine compliance confidence.

---

## FR-COMP-004

Generate clause-level explanations.

---

## FR-COMP-005

Generate recommendations.

---

## FR-COMP-006

Assign severity levels.

Severity levels:

- Critical
- High
- Medium
- Low

---

# 3.10 Reporting Module

Reports shall include:

- Executive Summary
- Overall Compliance Score
- Clause-wise Analysis
- Evidence
- Recommendations
- Confidence
- References

---

## FR-REPORT-001

Generate interactive report.

---

## FR-REPORT-002

Generate downloadable PDF.

---

## FR-REPORT-003

Store generated reports.

---

# 3.11 Dashboard Module

Dashboard shall display:

- Compliance Statistics
- Recent Reports
- Uploaded Policies
- Recent Legal Updates
- Graph Statistics

---

# 3.12 Search Module

Users shall search:

- Policies
- Regulations
- Clauses
- Reports

Search shall support:

- Semantic Search
- Keyword Search
- Metadata Filters

---

# 3.13 Notification Module (Future)

The platform should notify users when:

- Laws change
- Policies become outdated
- Reports complete
- New regulations affect existing policies

---

# 3.14 Audit Module

The platform shall maintain audit logs.

Audit logs shall include:

- User
- Timestamp
- Action
- IP Address
- Status

---

# 3.15 Error Handling

The system shall:

- Return meaningful API errors
- Log internal failures
- Never expose stack traces to users
- Support retry mechanisms for long-running jobs

---

# 3.16 Functional Workflow Summary

## Legal Knowledge Base

Admin

↓

Add Source

↓

Download

↓

Process

↓

MongoDB

↓

Neo4j

↓

Knowledge Base Ready

---

## Compliance Workflow

User

↓

Upload Policy

↓

Preprocess

↓

Hybrid Retrieval

↓

LLM Reasoning

↓

Gap Detection

↓

Report

---

# 3.17 Functional Acceptance Criteria

The functional implementation shall be considered complete when:

- Administrators can maintain the legal knowledge base.
- Users can upload policies.
- Documents are processed successfully.
- GraphRAG retrieves relevant legal context.
- LLM generates explainable compliance reports.
- Reports can be exported.
- Historical reports are preserved.
- All APIs function correctly.
- Security and validation requirements are satisfied.

---

End of Chapter 3