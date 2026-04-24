# LexisGraph - AI-Powered Legal Compliance Graph System

## 1. Overview
Organizations often struggle to keep internal policies aligned with rapidly changing regulations. Manual compliance checks are slow, error-prone, and difficult to scale.

LexisGraph addresses this by combining NLP, embeddings, and graph analytics to compare internal policy clauses with external regulation clauses. The system identifies likely matches, highlights gaps, and enables faster compliance review workflows.

## 2. Architecture
LexisGraph is designed as a three-layer pipeline:

### Layer 1: Ingestion and Preprocessing
- Ingests internal policy documents from users and external legal/regulatory documents from trusted sources.
- Cleans and normalizes legal text.
- Extracts clauses from documents.
- Generates sentence embeddings for each clause using MiniLM.

### Layer 2: Graph Construction and Linking
- Builds graph entities in Neo4j Aura for documents and clauses.
- Connects documents to clauses.
- Creates semantic clause-to-clause relationships (`SIMILAR_TO`) using cosine similarity thresholds.

### Layer 3: Retrieval and Compliance Analysis
- Supports GraphRAG-style retrieval by combining embedding relevance and graph expansion.
- Runs compliance gap detection to classify policy clauses as compliant or gap based on semantic proximity to regulatory clauses.

## 3. Tech Stack
- FastAPI
- MongoDB Atlas
- Neo4j Aura
- Sentence Transformers (`all-MiniLM-L6-v2`)
- spaCy

## 4. Features Implemented
- Document ingestion pipelines
- Legal clause extraction and classification
- Embedding generation for semantic search
- Graph construction in Neo4j
- Semantic similarity linking via `SIMILAR_TO`
- Graph-based retrieval (GraphRAG pattern)
- Compliance gap detection endpoint

## 5. How to Run
### 1) Install dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2) Set environment variables
Create `backend/.env` with:
```env
MONGO_URI=your_mongodb_atlas_uri
NEO4J_URI=your_neo4j_aura_uri
NEO4J_USER=your_neo4j_user
NEO4J_PASSWORD=your_neo4j_password
```

### 3) Run backend
```bash
cd backend
python -m uvicorn app.main:app --reload
```

### 4) Run cloud initialization pipeline
```bash
cd backend
python app/scripts/cloud_init.py
```

## 6. API Endpoints
Base prefix: `/api/v1`

- `/upload`
- `/fetch-now`
- `/build-graph`
- `/build-similarity`
- `/retrieve`
- `/compliance-check`

## 7. Example Use Case
1. Upload internal policy documents.
2. Fetch or ingest external regulatory texts.
3. Run preprocessing and graph build pipeline.
4. Run compliance check.
5. Review gaps where policy clauses are weakly aligned or unmatched.

## 8. Current Status
- ✅ Data pipeline complete
- ✅ Graph system complete
- ✅ Retrieval working
- ⚠️ Gap detection improving (semantic refinement in progress)

## 9. Future Work
- Improve semantic scoring and calibration
- Add LLM-generated compliance explanations
- Build an interactive compliance dashboard
- Add real-time regulation monitoring and automatic updates

## 10. Contribution Guide
1. Clone and pull the latest repository.
2. Configure environment variables in `backend/.env`.
3. Install dependencies and run the backend.
4. Execute the cloud pipeline to seed/test the system.
5. Add modules in `backend/app/services` and `backend/app/routes` with tests.
6. Run local validation before opening a pull request.

## 11. Project Goal
To build an intelligent compliance system that leverages graph databases and embeddings to analyze policy-regulation alignment.

---
This README is intended for both developers and AI assistants, providing enough architectural and operational context to extend LexisGraph safely and efficiently.
