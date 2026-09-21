# 13.6 Embedding Generation & Vector Storage (Qdrant)

---

# 13.6.1 Purpose

The Embedding Generation & Vector Storage module converts structured legal clauses into high-dimensional semantic vectors and stores them in the vector database.

These embeddings enable semantic similarity search during GraphRAG retrieval, allowing the system to locate legally relevant clauses even when wording differs between organizational policies and regulations.

The vector database complements the Neo4j Knowledge Graph by providing semantic retrieval capabilities.

---

# 13.6.2 Objectives

The module shall:

✓ Generate clause-level embeddings

✓ Store embeddings with metadata

✓ Support hybrid retrieval

✓ Enable metadata filtering

✓ Preserve embedding versions

✓ Support incremental indexing

✓ Optimize retrieval performance

✓ Maintain traceability

---

# 13.6.3 Architecture

```
Parsed Clauses

↓

Text Normalization

↓

Embedding Model

↓

Vector Generation

↓

Metadata Attachment

↓

Qdrant Collection

↓

Hybrid Retrieval Engine
```

Every stored vector shall correspond to a single legal clause or logical sub-clause.

---

# 13.6.4 Embedding Model

Recommended default model

```
BAAI BGE-M3
```

Reasons

- Excellent multilingual performance
- Strong retrieval accuracy
- Suitable for long legal text
- Supports dense retrieval
- Efficient inference

The embedding model shall be configurable to allow future upgrades without redesigning the architecture.

---

# 13.6.5 Embedding Unit

The primary embedding unit shall be:

```
Legal Clause
```

Hierarchy

```
Document

↓

Chapter

↓

Section

↓

Clause

↓

Embedding
```

Very large clauses may be divided into logical sub-clauses while preserving parent-child relationships.

Arbitrary fixed-size text chunking shall not be used.

---

# 13.6.6 Preprocessing

Before embedding generation, the system shall:

Normalize Unicode

Normalize whitespace

Preserve legal numbering

Preserve references

Remove duplicate whitespace

Retain punctuation that affects legal meaning

Avoid altering statutory language

The preprocessing pipeline shall be deterministic.

---

# 13.6.7 Metadata Schema

Every vector shall store metadata.

Required fields

```
Embedding ID

Clause ID

Document ID

Document Title

Jurisdiction

Legal Domain

Issuing Authority

Section Number

Clause Number

Effective Date

Knowledge Base Version

Embedding Model

Embedding Version

Language

Source URL

Created Timestamp
```

Optional fields

```
Keywords

Organization Type

Industry

Tags

Cross References

Confidence Score
```

Metadata shall be indexed to support efficient filtering.

---

# 13.6.8 Qdrant Collection Design

Example collection

```
legal_clauses
```

Each point shall contain:

```
Vector

↓

Payload (Metadata)

↓

Unique Identifier
```

The collection shall support filtering by metadata before similarity search.

---

# 13.6.9 Similarity Metric

The default similarity metric shall be:

```
Cosine Similarity
```

Future support may include:

```
Dot Product

Euclidean Distance
```

The similarity metric shall be configurable.

---

# 13.6.10 Vector Lifecycle

```
Clause Created

↓

Embedding Generated

↓

Stored

↓

Indexed

↓

Retrieved

↓

Archived

↓

Deleted (if applicable)
```

Embeddings shall remain synchronized with Knowledge Base versions.

---

# 13.6.11 Versioning

Every embedding shall include:

```
Embedding Model

Model Version

Knowledge Base Version

Generation Timestamp

Embedding Schema Version
```

Historical embeddings shall remain available for reproducing past analyses.

---

# 13.6.12 Incremental Updates

When a legal document changes:

```
Detect Modified Clauses

↓

Regenerate Only Affected Embeddings

↓

Update Qdrant

↓

Increment Embedding Version
```

Full collection rebuilds shall be avoided unless required.

---

# 13.6.13 Hybrid Retrieval Preparation

Vectors shall support metadata filtering using:

```
Jurisdiction

Legal Domain

Effective Date

Document Status

Organization Type

Language

Knowledge Base Version
```

Metadata filtering shall occur before similarity ranking wherever possible.

---

# 13.6.14 Retrieval Optimization

The retrieval engine shall support:

Approximate Nearest Neighbor (ANN)

Top-K search

Metadata filtering

Score thresholding

Result deduplication

Candidate reranking

These techniques improve latency while maintaining retrieval quality.

---

# 13.6.15 Storage Strategy

Qdrant shall store:

```
Vectors

Metadata

Embedding Versions

Collection Statistics
```

Neo4j shall store:

```
Relationships

Hierarchy

Legal Concepts

Cross References
```

MongoDB shall store:

```
Analysis Results

Processing Metadata

Audit Records

User Reports
```

Each database shall maintain a clearly defined responsibility.

---

# 13.6.16 Quality Validation

Generated embeddings shall be validated for:

Successful generation

Correct vector dimensions

Metadata completeness

Valid document references

Duplicate detection

Embedding model consistency

Invalid vectors shall not be indexed.

---

# 13.6.17 Performance Goals

Embedding generation

```
≤ 100 ms per clause (average)
```

Bulk indexing

```
≤ 5 minutes for a typical legal document
```

Top-K similarity search

```
≤ 500 ms
```

Metadata filtering

```
≤ 100 ms
```

Performance goals depend on hardware and collection size.

---

# 13.6.18 Monitoring

The system shall monitor:

```
Embedding Count

Collection Size

Average Generation Time

Average Retrieval Latency

Failed Generations

Collection Health

Index Status
```

Metrics shall be available through the Administration Dashboard.

---

# 13.6.19 Security

The vector database shall:

Allow writes only from ingestion services

Provide read access only to retrieval services

Restrict administrative operations

Encrypt network communication

Protect metadata from unauthorized modification

Maintain audit logs for indexing operations

---

# 13.6.20 Future Enhancements

The architecture shall support:

Hybrid dense + sparse embeddings

Cross-encoder reranking

Domain-specific legal embedding models

Multilingual embeddings

Multi-vector representations

Automatic embedding quality evaluation

Semantic clustering of regulations

---

# 13.6.21 Acceptance Criteria

The Embedding Generation & Vector Storage module shall be considered complete when:

✓ Clause-level embeddings are generated.

✓ Metadata accompanies every vector.

✓ Qdrant collections support metadata filtering.

✓ Embedding versions are tracked.

✓ Incremental updates are supported.

✓ Similarity search meets performance targets.

✓ Embedding quality validation succeeds.

✓ Historical embeddings remain reproducible.

---

# 13.6.22 Summary

The Embedding Generation & Vector Storage module provides the semantic retrieval layer of LexisGraph by transforming legal clauses into searchable vector representations enriched with comprehensive metadata. Through clause-level embeddings, metadata-aware filtering, versioned indexing, and efficient storage in Qdrant, the platform delivers fast and accurate semantic retrieval that complements Neo4j's relationship-based reasoning, enabling high-quality hybrid GraphRAG workflows.

---

End of Section 13.6