# 9.3 Legal Knowledge Base Data Model

---

# 9.3.1 Purpose

The Legal Knowledge Base (LKB) is the authoritative repository of all legal information used by LexisGraph.

Its purpose is to store legal regulations in a structured, searchable, version-controlled, and explainable format suitable for semantic retrieval and graph-based reasoning.

Unlike traditional document repositories, the Legal Knowledge Base represents regulations as interconnected legal entities rather than static PDF files.

The Legal Knowledge Base shall serve as the single source of truth for all compliance analysis.

---

# 9.3.2 Objectives

The Legal Knowledge Base shall:

✓ Store official legal regulations

✓ Preserve document versions

✓ Support semantic search

✓ Support graph traversal

✓ Enable explainable AI

✓ Maintain legal citations

✓ Track regulation history

✓ Support multiple jurisdictions

✓ Allow future ontology expansion

---

# 9.3.3 Architecture

```
Official Sources

↓

Legal Source

↓

Legal Document

↓

Sections

↓

Legal Clauses

↓

Embeddings

↓

Neo4j Knowledge Graph

↓

GraphRAG Retrieval
```

Each layer stores progressively more structured legal knowledge.

---

# 9.3.4 Collections

MongoDB Collections

```
legal_sources

legal_documents

legal_sections

legal_clauses

embeddings
```

Neo4j

```
Document

Section

Clause

Relationships
```

---

# 9.3.5 Legal Sources Collection

Collection

```
legal_sources
```

Purpose

Stores information about trusted legal publishers.

Example Sources

Government Gazette

Parliament

Official Government Portal

Regulatory Authority

Supreme Court

Standards Body

---

Required Fields

```
source_id

name

country

jurisdiction

authority

website

trust_level

status

created_at
```

---

Example

```json
{
  "source_id": "SRC-001",
  "name": "Ministry of Electronics and Information Technology",
  "country": "IN",
  "jurisdiction": "India",
  "authority": "Government",
  "website": "https://www.meity.gov.in",
  "trust_level": "OFFICIAL",
  "status": "ACTIVE"
}
```

---

# 9.3.6 Legal Documents Collection

Collection

```
legal_documents
```

Purpose

Stores metadata for each legal document.

Required Fields

```
document_id

source_id

title

short_title

jurisdiction

country

domain

publication_date

effective_date

version

status

language

checksum

file_path

created_at
```

---

Example

```json
{
  "document_id": "LAW-DPDP-2023",
  "title": "Digital Personal Data Protection Act, 2023",
  "country": "IN",
  "jurisdiction": "India",
  "domain": "Data Privacy",
  "version": "1.0"
}
```

---

# 9.3.7 Legal Sections Collection

Collection

```
legal_sections
```

Purpose

Represents logical document sections.

Example

```
Chapter I

↓

Section 8

↓

Clauses
```

Required Fields

```
section_id

document_id

section_number

title

order

created_at
```

---

# 9.3.8 Legal Clauses Collection

Collection

```
legal_clauses
```

Purpose

Stores the smallest searchable legal unit.

Each clause shall represent one legal obligation or provision.

---

Required Fields

```
clause_id

document_id

section_id

clause_number

text

keywords

version

effective_date

status

created_at

updated_at
```

---

Field Definitions

| Field | Description |
|---------|-------------|
| clause_id | Permanent identifier |
| document_id | Parent document |
| section_id | Parent section |
| clause_number | Official clause number |
| text | Original legal wording |
| keywords | Extracted search terms |
| version | Legal version |
| effective_date | Effective date |
| status | Active / Superseded |

---

Example

```json
{
  "clause_id": "LAW-DPDP-SEC08-CL02",
  "document_id": "LAW-DPDP-2023",
  "section_id": "SEC08",
  "clause_number": "8(2)",
  "text": "The Data Fiduciary shall...",
  "version": "1.0",
  "status": "ACTIVE"
}
```

---

# 9.3.9 Embeddings Collection

Collection

```
embeddings
```

Purpose

Stores semantic vectors independently from legal clauses.

Required Fields

```
embedding_id

entity_type

entity_id

model

dimension

vector

created_at

model_version
```

Entity Type

```
LEGAL_CLAUSE

POLICY_CLAUSE
```

This architecture allows multiple embedding models to coexist.

---

# 9.3.10 Neo4j Node Schema

The Knowledge Graph shall contain:

```
(:Document)

(:Section)

(:Clause)
```

Future Nodes

```
(:LegalConcept)

(:Authority)

(:Jurisdiction)

(:Organization)

(:Policy)

(:Keyword)
```

---

# 9.3.11 Neo4j Relationship Types

Core Relationships

```
(:Document)-[:HAS_SECTION]->(:Section)

(:Section)-[:HAS_CLAUSE]->(:Clause)

(:Clause)-[:REFERS_TO]->(:Clause)

(:Clause)-[:SIMILAR_TO]->(:Clause)
```

Future Relationships

```
AMENDS

SUPERSEDES

DEPENDS_ON

CONFLICTS_WITH

BELONGS_TO_DOMAIN

REGULATED_BY

DEFINED_BY

APPLIES_TO
```

---

# 9.3.12 Graph Example

```
DPDP Act

│

HAS_SECTION

│

▼

Section 8

│

HAS_CLAUSE

│

▼

Clause 8(2)

│

REFERS_TO

│

▼

Clause 12(1)
```

---

# 9.3.13 Versioning

Every legal entity shall maintain version history.

Fields

```
version

previous_version

effective_date

superseded_date

status
```

Legal history shall never be deleted.

---

# 9.3.14 Metadata Model

Each legal clause shall include metadata.

```
Country

Jurisdiction

Legal Domain

Language

Authority

Document

Section

Version

Keywords

Effective Date
```

Metadata supports retrieval filtering.

---

# 9.3.15 Indexing Strategy

Indexes

Legal Documents

```
document_id

country

jurisdiction

domain
```

Legal Clauses

```
clause_id

document_id

section_id

keywords

effective_date
```

Embeddings

```
entity_id

entity_type

model
```

Neo4j indexes shall be created for node identifiers and frequently traversed relationships.

---

# 9.3.16 Synchronization

MongoDB and Neo4j shall remain synchronized.

```
Legal Clause

↓

MongoDB

↓

Embedding Generation

↓

Neo4j Update

↓

Retrieval Ready
```

Synchronization failures shall trigger retry jobs.

---

# 9.3.17 Data Integrity Rules

The Legal Knowledge Base shall guarantee:

✓ No orphan sections

✓ No orphan clauses

✓ No duplicate clause identifiers

✓ Immutable legal text

✓ Version consistency

✓ Valid graph relationships

---

# 9.3.18 Security

Only platform administrators may modify the Legal Knowledge Base.

Organizations shall have read-only access through retrieval APIs.

Every modification shall be recorded in the audit log.

---

# 9.3.19 Future Enhancements

The architecture shall support:

Legal ontologies

Case law integration

Cross-jurisdiction mappings

Citation graphs

Temporal knowledge graphs

Knowledge graph embeddings

Automatic entity extraction

Multilingual legal content

---

# 9.3.20 Acceptance Criteria

The Legal Knowledge Base shall be considered complete when:

✓ Trusted legal sources are stored.

✓ Legal documents are version-controlled.

✓ Clauses are independently searchable.

✓ Embeddings are stored separately.

✓ Neo4j models legal relationships.

✓ Metadata supports filtering.

✓ MongoDB and Neo4j remain synchronized.

✓ Legal history is preserved.

---

# 9.3.21 Summary

The Legal Knowledge Base forms the foundation of LexisGraph by transforming official legal documents into structured, version-controlled, graph-connected knowledge. Through the combination of MongoDB for document storage, Neo4j for relationship modeling, and a dedicated embeddings collection for semantic retrieval, the architecture enables scalable GraphRAG retrieval, explainable AI reasoning, and long-term maintainability while remaining extensible to future legal domains and jurisdictions.

---

End of Section 9.3