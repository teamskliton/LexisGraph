# 8.4 Evidence Retrieval Engine (Hybrid GraphRAG)

---

# 8.4.1 Purpose

The Evidence Retrieval Engine is responsible for retrieving the most relevant legal evidence for every company policy clause before AI reasoning begins.

Unlike traditional Retrieval-Augmented Generation (RAG), which relies only on vector similarity, LexisGraph implements a **Hybrid GraphRAG Retrieval Engine** that combines semantic search, knowledge graph traversal, metadata filtering, and neural re-ranking.

The objective is to provide the LLM with the most relevant, trustworthy, and explainable legal context while minimizing hallucinations.

The LLM shall never reason directly over the entire legal knowledge base.

Instead, it shall reason only over curated evidence retrieved by this engine.

---

# 8.4.2 Retrieval Philosophy

LexisGraph follows four retrieval principles.

## Principle 1

Retrieve before reasoning.

The LLM shall never answer without retrieved evidence.

---

## Principle 2

Prefer precision over quantity.

Providing fewer highly relevant legal clauses is preferable to supplying hundreds of loosely related clauses.

---

## Principle 3

Relationships matter.

Legal documents contain dependencies, references, amendments, and contextual links.

The retrieval engine must consider these relationships.

---

## Principle 4

Every retrieved clause must be traceable.

Every piece of evidence shall reference:

- Document
- Section
- Clause
- Version
- Source

---

# 8.4.3 Retrieval Pipeline

Every uploaded policy clause follows the same retrieval pipeline.

```
Company Policy Clause

↓

Embedding Generation

↓

Semantic Vector Search

↓

Graph Expansion

↓

Metadata Filtering

↓

Cross-Encoder Re-ranking

↓

Evidence Ranking

↓

Context Assembly

↓

LLM
```

Each stage refines the quality of retrieved evidence.

---

# 8.4.4 Stage 1 — Policy Clause Embedding

Each extracted company policy clause shall be converted into a semantic vector.

```
Policy Clause

↓

Embedding Model

↓

Vector
```

The same embedding model used for legal clauses must be used for policy clauses to ensure vector compatibility.

---

# 8.4.5 Stage 2 — Semantic Vector Search

The vector database performs nearest-neighbor search.

Input

```
Policy Embedding
```

Output

```
Top K Similar Legal Clauses
```

Default

```
K = 25
```

Search Criteria

- Semantic similarity
- Embedding distance
- Minimum similarity threshold

Vector search provides broad semantic recall.

---

# 8.4.6 Stage 3 — Graph Expansion

Vector search alone is insufficient because many legal obligations are connected through references.

The engine expands retrieved clauses using Neo4j.

Relationships traversed include:

HAS_SECTION

HAS_CLAUSE

REFERS_TO

SIMILAR_TO

AMENDS

SUPERSEDES

DEPENDS_ON

REQUIRES

Traversal depth

Default

```
2 hops
```

Graph expansion discovers supporting legal evidence not directly returned by vector search.

---

# 8.4.7 Stage 4 — Metadata Filtering

Retrieved clauses shall be filtered using metadata.

Supported filters

Country

Jurisdiction

Legal Domain

Version

Effective Date

Source

Example

```
India

↓

DPDP Act

↓

Latest Version
```

Outdated regulations shall not be prioritized.

---

# 8.4.8 Stage 5 — Cross-Encoder Re-ranking

Semantic retrieval provides high recall but may return loosely related clauses.

A Cross-Encoder shall score each retrieved clause against the policy clause.

Example models

- BAAI/bge-reranker-v2-m3
- cross-encoder/ms-marco-MiniLM-L-6-v2

Pipeline

```
Policy Clause

+

Retrieved Clause

↓

Cross Encoder

↓

Relevance Score
```

Only the highest-ranked evidence proceeds.

Default

```
Top 8–10 clauses
```

---

# 8.4.9 Evidence Ranking

Each retrieved clause receives a final relevance score.

The ranking score combines:

Semantic Similarity

Graph Importance

Cross-Encoder Score

Metadata Match

Document Authority

Recency

Example

```
Final Score

=

0.35 Semantic

+

0.25 Graph

+

0.25 Cross Encoder

+

0.10 Metadata

+

0.05 Authority
```

Weights should remain configurable.

---

# 8.4.10 Context Assembly

After ranking, evidence is assembled into the final LLM context.

The context includes:

Relevant legal clauses

Referenced clauses

Graph relationships

Metadata

Document titles

Section numbers

Effective dates

Duplicate evidence shall be removed.

---

# 8.4.11 Token Budget Management

Large legal contexts may exceed the LLM context window.

The Context Builder shall:

Remove duplicates

Merge similar clauses

Prioritize high-confidence evidence

Respect model token limits

Never truncate a legal clause in the middle of a sentence.

---

# 8.4.12 Retrieval Quality Controls

The engine shall reject:

Duplicate clauses

Incomplete clauses

Outdated versions

Low-confidence matches

Broken graph references

Only validated evidence shall reach the LLM.

---

# 8.4.13 Explainable Retrieval

Every retrieved clause shall retain provenance.

Example

```
Document

DPDP Act 2023

↓

Section

8

↓

Clause

8(2)

↓

Similarity

0.93

↓

Graph Distance

1 Hop
```

This enables transparent compliance reports.

---

# 8.4.14 Multi-Clause Retrieval

Organization policies contain multiple clauses.

The engine shall process each clause independently.

```
Policy

↓

Clause 1

↓

Evidence

----------------

Clause 2

↓

Evidence

----------------

Clause 3

↓

Evidence
```

Results are merged only during report generation.

---

# 8.4.15 Retrieval Caching

Frequently retrieved legal clauses may be cached.

Cache may store:

Embeddings

Top retrieval results

Graph neighborhoods

Metadata

The cache must invalidate when legal documents are updated.

---

# 8.4.16 Failure Handling

If retrieval fails

Vector Search Failure

↓

Retry

Graph Failure

↓

Use Vector Results

Cross Encoder Failure

↓

Skip Re-ranking

Metadata Failure

↓

Continue with available metadata

The platform should degrade gracefully rather than terminate analysis.

---

# 8.4.17 Performance Goals

Target retrieval latency

Embedding Generation

< 300 ms

Vector Search

< 1 second

Graph Expansion

< 2 seconds

Re-ranking

< 2 seconds

Context Assembly

< 1 second

Total Retrieval Pipeline

Target

< 5 seconds

---

# 8.4.18 Future Enhancements

The retrieval engine shall support:

Hybrid keyword + semantic search

Sparse embeddings

Dense + sparse fusion

Knowledge graph embeddings

Temporal retrieval

Jurisdiction-aware ranking

Citation-aware retrieval

Legal ontology reasoning

Agentic retrieval planning

---

# 8.4.19 Acceptance Criteria

The Evidence Retrieval Engine shall be considered complete when:

✓ Policy clauses are embedded successfully.

✓ Semantic retrieval returns relevant legal clauses.

✓ Graph traversal expands related legal knowledge.

✓ Metadata filtering excludes irrelevant evidence.

✓ Cross-Encoder improves ranking quality.

✓ Context respects LLM token limits.

✓ Retrieved evidence remains traceable.

✓ Retrieval latency meets performance goals.

✓ Every LLM prompt is built only from retrieved evidence.

---

# 8.4.20 Summary

The Evidence Retrieval Engine is the intelligence gateway of LexisGraph. By combining semantic vector search, graph traversal, metadata filtering, neural re-ranking, and structured context assembly, it ensures that the LLM reasons only over high-quality, explainable, and authoritative legal evidence. This hybrid GraphRAG approach significantly improves retrieval precision, reduces hallucinations, and forms the foundation for reliable compliance analysis.

---

End of Section 8.4