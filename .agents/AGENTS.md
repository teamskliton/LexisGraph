# Agent Instructions & Skills - LexisGraph

This workspace contains the LexisGraph AI-powered legal compliance graph system.
All AI coding agents (Antigravity, Gemini, subagents) working on this codebase MUST strictly adhere to the instructions, layer contracts, and guidelines below.

---

## 1. Agent Operational Autonomy & Responsibilities

AI Agents working on LexisGraph are granted full operational autonomy to resolve issues, refine pipeline stages, and expand system capabilities. Agents have explicit authority to:

1. **Create and Register Custom Skills**:
   - Create new custom skills under `.agents/skills/<skill_name>/` (containing a `SKILL.md` file and optional `scripts/` or `resources/`) whenever reusable routines, verification tools, or domain-specific tools are required.
2. **Modify Code & Configurations**:
   - Perform necessary code edits, refactorings, bug fixes, schema migrations, and route enhancements across backend, database, and test suites to ensure proper pipeline function.
3. **Maintain Living Documentation**:
   - Automatically update `README.md` and `.agents/AGENTS.md` whenever new features, endpoints, environment variables, skills, or layer contracts are added or modified.
4. **Autonomous Testing & Verification**:
   - Execute verification scripts, inspect logs, validate database connections (MongoDB & Neo4j), and test API endpoints to ensure system correctness without waiting for manual prompts.

---

## 2. System Overview & Architecture

LexisGraph processes legal documents and regulations across a 3-layer pipeline (Web Scraping component is currently deferred):

```
[ User Policy Files / Domain Regulation Files (.pdf, .docx, .txt) ]
                               │
                               ▼
┌────────────────────────────────────────────────────────────────┐
│  Layer 1: Ingestion & Preprocessing                            │
│  - Text Extraction (pdfplumber / python-docx / txt)             │
│  - Cleaning (HTML/noise removal, NUMBER PRESERVATION)          │
│  - spaCy Legal Clause Filtering                                │
│  - Dependency Parsing (nsubj / ROOT verb / dobj object)        │
│  - Vector Embedding Generation (all-MiniLM-L6-v2, 384-dim)     │
└──────────────────────────────┬─────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────┐
│  Layer 2: Graph Construction & Linking                         │
│  - MongoDB Ingestion & Sync (user_documents, domain_documents) │
│  - Neo4j Node & Edge Upsert (Document, Clause, HAS_CLAUSE)     │
│  - Cosine Similarity SIMILAR_TO Edges                          │
└──────────────────────────────┬─────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────┐
│  Layer 3: Retrieval & Compliance Analysis                      │
│  - Vector + Graph Expansion Retrieval                          │
│  - Algorithmic Score Thresholding                              │
│  - OpenRouter LLM Legal Reasoning                              │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. Layer Contracts & Specifications

### Layer 1: Ingestion & Preprocessing
- **Inputs**: Raw document bytes/files (`.pdf`, `.docx`, `.txt`) uploaded for internal user policies or domain regulations. *(Web scraper ingestion is deferred for future release)*.
- **Contract / Output Fields**:
  - `id`: `C1`, `C2`...
  - `clause_id`: MD5 hash of lowercase clause text
  - `text`: Cleaned text string (**MUST preserve numbers, section numbers, dates, day counts**)
  - `type`: `prohibition` | `obligation` | `permission` | `condition` | `general`
  - `subject`: Grammatical subject extracted via spaCy `nsubj`
  - `action`: Core verb extracted via spaCy `ROOT`
  - `object`: Direct/prepositional object extracted via spaCy `dobj`/`pobj`
  - `entities`: Extracted named/legal entities
  - `embedding`: 384-dimensional list of floats (`all-MiniLM-L6-v2`)

### Layer 2: Graph Construction & Linking
- **Inputs**: MongoDB `user_documents`, `external_documents`, and `domain_documents` containing processed clause arrays.
- **Contract / Output**:
  - `Document` nodes with `id` (doc hash), `title`, `domain`
  - `Clause` nodes with `id` (clause hash), `text`, `type`, `subject`, `action`, `object`
  - `(:Document)-[:HAS_CLAUSE]->(:Clause)`
  - `(:Clause)-[:SIMILAR_TO {score}]->(:Clause)`

### Layer 3: Retrieval & Compliance Analysis
- **Inputs**: Policy clause or query string vs. MongoDB/Neo4j reference clauses.
- **Contract / Output**:
  - `policy_clause`: Policy clause under review
  - `status`: `compliant` | `gap` | `partial`
  - `confidence`: Weighted score (`0.8 * vector + 0.2 * graph`)
  - `matched_clause`: Reference regulation clause text
  - `vector_score`: Cosine similarity score
  - `graph_score`: Graph similarity neighbor score
  - `reasoning_summary`: OpenRouter LLM natural language explanation of compliance alignment or gap

---

## 4. Required Agent Skills & Tools

Agents working on this repository require the following skills and tool capabilities:

1. **spaCy Legal NLP (`en_core_web_sm`)**:
   - Used for sentence boundaries, POS tagging, and dependency parsing (`nsubj`, `ROOT`, `dobj`).
   - Command: `python -m spacy download en_core_web_sm`

2. **SentenceTransformer Vector Embeddings**:
   - Model: `all-MiniLM-L6-v2` (384-dim dense vectors).
   - Used in `backend/app/services/embedding_model.py`.

3. **MongoDB Integration**:
   - Collections: `user_documents`, `external_documents`, `domain_documents`.
   - Client singleton in `backend/app/db/mongo.py`.

4. **Neo4j Graph Database**:
   - Cypher queries for node/edge upserts and 1-hop graph neighborhood expansion.
   - Client singleton in `backend/app/db/neo4j.py`.

5. **OpenRouter API Integration**:
   - Used for LLM-assisted legal compliance reasoning in `backend/app/services/compliance.py`.

---

## 5. Key Rules for Agents

1. **Data Integrity**: NEVER strip numbers (`0-9`) or section numbers from legal text in cleaning routines.
2. **Deterministic Hash IDs**: Always generate `clause_id` using `hashlib.md5(text.lower().encode('utf-8')).hexdigest()`.
3. **No Hardcoded Caps**: Avoid low arbitrary caps like capping clause similarity linking to 20 clauses without explicit configuration flags.
4. **Deferred Web Data**: Do not rely on active web scraping (`scraper.py`) for current tests; scope ingestion to uploaded PDF/DOCX/TXT files.
5. **Documentation Updating**: Keep `README.md` and `.agents/AGENTS.md` up-to-date with any schema, endpoint, or architecture changes.
6. **Verification**: Always verify changes against backend endpoints (`/api/v1/health`, `/api/v1/compliance-check`, `/api/v1/test-neo4j`).
