# 8.3 Knowledge Representation & Storage Architecture

---

# 8.3.1 Purpose

The purpose of the Knowledge Representation Layer is to transform processed legal information into structured, queryable, and interconnected knowledge.

LexisGraph shall not treat legal documents as plain text.

Instead, every regulation shall be represented simultaneously in multiple complementary forms:

1. Original Document
2. Structured Metadata
3. Individual Legal Clauses
4. Semantic Embeddings
5. Knowledge Graph Relationships

This hybrid representation enables efficient storage, semantic search, graph traversal, and explainable AI reasoning.

---

# 8.3.2 Multi-Layer Knowledge Representation

Each legal document shall exist in five representations.

```
                 Legal PDF
                     │
─────────────────────┼─────────────────────
                     │
          Raw Document Storage
                     │
─────────────────────┼─────────────────────
                     │
           Structured Clauses
                     │
─────────────────────┼─────────────────────
          │                      │
          ▼                      ▼
 Semantic Embeddings      Knowledge Graph
          │                      │
          └──────────┬───────────┘
                     ▼
              GraphRAG Retrieval
```

Each representation serves a unique purpose.

---

# 8.3.3 Storage Responsibilities

The system shall use multiple storage technologies.

| Storage | Responsibility |
|----------|---------------|
| MongoDB | Documents, metadata, clauses, embeddings |
| Neo4j | Knowledge graph relationships |
| Object Storage | Original PDFs |
| Redis | Cache and background jobs |

No single database should perform every responsibility.

---

# 8.3.4 MongoDB Architecture

MongoDB shall store structured document data.

Collections

```
users

organizations

legal_sources

legal_documents

legal_clauses

policy_documents

policy_clauses

reports

audit_logs

jobs

embeddings
```

Collections shall remain independent.

---

# 8.3.5 Legal Document Schema

Each legal document shall contain:

```
Document ID

Title

Source

Country

Jurisdiction

Legal Domain

Version

Publication Date

Effective Date

Language

File Path

Checksum

Processing Status

Created At

Updated At
```

The document stores metadata only.

Actual legal reasoning occurs at clause level.

---

# 8.3.6 Clause Representation

Each clause becomes an independent entity.

Example

```
Clause ID

Document ID

Section Number

Clause Number

Heading

Clause Text

Keywords

Embedding ID

Metadata

Version

Created At
```

Every clause shall have a globally unique identifier.

---

# 8.3.7 Embedding Representation

Every clause shall have exactly one active embedding.

Representation

```
Embedding ID

Clause ID

Embedding Model

Vector

Dimension

Generated At

Model Version
```

Embeddings shall be regenerated whenever the embedding model changes.

---

# 8.3.8 Policy Representation

Organization policies follow the same architecture.

```
Policy

↓

Sections

↓

Clauses

↓

Embeddings
```

Policy data shall never mix with legal documents.

---

# 8.3.9 Neo4j Knowledge Graph

Neo4j stores relationships rather than documents.

The graph shall contain:

Document Nodes

Section Nodes

Clause Nodes

Keyword Nodes (Future)

Domain Nodes (Future)

Jurisdiction Nodes (Future)

---

# 8.3.10 Node Types

Initial node labels

```
Document

Section

Clause
```

Future labels

```
Organization

Policy

Keyword

Domain

Regulation

Authority

Jurisdiction

LegalConcept

Citation
```

The schema shall remain extensible.

---

# 8.3.11 Relationship Types

Version 1

```
HAS_SECTION

HAS_CLAUSE

SIMILAR_TO

REFERS_TO
```

Future

```
AMENDS

SUPERSEDES

REQUIRES

DEPENDS_ON

CONFLICTS_WITH

BELONGS_TO

REGULATED_BY

APPLIES_TO
```

Relationship types shall be versioned.

---

# 8.3.12 Graph Example

```
Document

│

HAS_SECTION

│

▼

Section 5

│

HAS_CLAUSE

│

▼

Clause 5.2

│

SIMILAR_TO

│

▼

Clause 9.1

│

REFERS_TO

│

▼

Clause 12.4
```

Graph traversal shall discover related legal knowledge.

---

# 8.3.13 Metadata Model

Each clause shall contain searchable metadata.

Required metadata

Document

Source

Country

Jurisdiction

Legal Domain

Section

Clause

Version

Publication Date

Effective Date

Keywords

Metadata shall support filtering during retrieval.

---

# 8.3.14 Version Control

Knowledge shall be version-aware.

Each clause maintains

```
Current Version

Previous Version

Effective Date

Status

Revision Number
```

Old versions remain archived.

---

# 8.3.15 Indexing Strategy

MongoDB indexes

```
Document ID

Clause ID

Jurisdiction

Domain

Source

Version

Effective Date

Keywords
```

Neo4j indexes

```
Document

Clause

Section

Relationship Type
```

Indexes shall prioritize retrieval performance.

---

# 8.3.16 Synchronization Rules

MongoDB and Neo4j must remain synchronized.

Whenever a clause changes

```
MongoDB

↓

Embedding Update

↓

Neo4j Update

↓

Index Refresh
```

Synchronization failures shall trigger retry jobs.

---

# 8.3.17 Knowledge Integrity

The platform shall guarantee:

No orphan clauses

No orphan graph nodes

No duplicate embeddings

No invalid references

Consistent metadata

Every clause shall exist in both MongoDB and Neo4j.

---

# 8.3.18 Clause Identity

Every clause receives a permanent identifier.

Example

```
LAW-IND-DPDP-2023-SEC05-CL02
```

Benefits

Stable references

Version tracking

Reliable citations

Graph consistency

---

# 8.3.19 Embedding Lifecycle

```
Clause Created

↓

Generate Embedding

↓

Store Vector

↓

Link to Clause

↓

Graph Ready
```

Whenever the embedding model changes

```
Re-embed

↓

Replace Vector

↓

Keep Clause

↓

Keep Graph
```

Only vectors change.

---

# 8.3.20 Storage Constraints

The platform shall never:

Store embeddings without source clauses

Delete previous legal versions

Break graph relationships

Modify original legal text

Every stored clause shall preserve the original wording of the regulation.

---

# 8.3.21 Future Storage Extensions

The architecture shall support:

Multiple embedding models

Knowledge graph versioning

Temporal graphs

Legal ontologies

Cross-jurisdiction relationships

Entity extraction

Knowledge graph federation

Distributed graph databases

without schema redesign.

---

# 8.3.22 Acceptance Criteria

The Knowledge Representation Layer shall be considered complete when:

✓ Legal documents are stored with metadata.

✓ Every clause has a unique identity.

✓ Every clause has an embedding.

✓ Neo4j stores graph relationships.

✓ MongoDB stores structured document data.

✓ Storage remains synchronized.

✓ Version history is preserved.

✓ Metadata supports efficient retrieval.

✓ Graph relationships remain valid.

---

# 8.3.23 Summary

LexisGraph represents legal knowledge using a hybrid storage architecture that combines document storage, semantic embeddings, and graph relationships. MongoDB manages structured documents and embeddings, while Neo4j models the relationships between legal entities. This multi-layer representation enables fast retrieval, explainable reasoning, version-aware analysis, and scalable knowledge expansion, providing the foundation for the GraphRAG retrieval pipeline described in the next section.

---

End of Section 8.3