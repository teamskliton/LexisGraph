# LexisGraph - AI-Powered Legal Compliance Graph System

## 1. Overview
Organizations often struggle to keep internal policies aligned with rapidly changing regulations. Manual compliance checks are slow, error-prone, and difficult to scale.

LexisGraph addresses this by combining NLP, embeddings, and graph analytics to compare internal policy clauses with external regulation clauses. The system identifies likely matches, highlights gaps, and enables faster compliance review workflows.

## 2. Project Objectives
- Build a practical 3-layer legal intelligence pipeline.
- Store normalized legal clauses in MongoDB Atlas for flexible ingestion and retrieval.
- Build a relationship graph in Neo4j Aura for graph-enhanced search and reasoning.
- Produce compliance-gap outputs that combine vector similarity and graph context.
- Provide a lightweight web tester UI for backend validation before final product frontend.

## 3. End-to-End Architecture

### Layer 1: Ingestion and Preprocessing
- Inputs: user uploads, external legal/news/gazette sources, domain-specific uploads.
- Processing:
	- text extraction from files/pages,
	- text cleaning and noise removal,
	- clause extraction using spaCy sentence flow + legal filters,
	- embedding generation using `all-MiniLM-L6-v2`.
- Outputs:
	- raw artifacts in `backend/data/raw/...`,
	- processed JSON in `backend/data/processed/...`,
	- document records in MongoDB (`user_documents`, `external_documents`).

### Layer 2: Graph Construction and Linking
- Reads processed clauses from MongoDB.
- Builds/merges `Document` and `Clause` nodes in Neo4j.
- Creates `HAS_CLAUSE` edges.
- Creates semantic `SIMILAR_TO` edges between clauses using cosine similarity.

### Layer 3: Retrieval and Compliance Analysis
- Retrieval:
	- gets top vector matches from clause embeddings,
	- expands with graph neighbors from Neo4j (`SIMILAR_TO`).
- Compliance:
	- compares user clauses to external clauses,
	- combines vector and graph scores,
	- labels each clause as `compliant` or `gap`.

## 4. Current Technical Reality (Important)
- Backend Layer 1/2/3 pipeline is operational.
- OpenRouter key connectivity is validated from environment.
- Current Layer 3 compliance response is algorithmic (vector + graph scores).
- OpenRouter is currently available but not yet wired into compliance endpoint response text generation.

## 5. Full Directory Structure (System Directory)

```text
LexisGraph/
	.gitignore
	README.md

	backend/
		.env
		.env.example
		requirements.txt
		test_pipeline.py

		app/
			__init__.py
			main.py

			db/
				__init__.py
				mongo.py
				neo4j.py

			models/
				__init__.py

			routes/
				__init__.py
				compliance.py
				debug.py
				domain.py
				export.py
				fetch.py
				graph.py
				neo4j_test.py
				retrieval.py
				upload.py

			scripts/
				cloud_init.py
				reset_and_seed.py
				reset_rebuild_pipeline.py

			services/
				__init__.py
				compliance.py
				embedding_model.py
				export_service.py
				graph_builder.py
				preprocessing.py
				retrieval.py
				scraper.py
				similarity.py

			utils/
				__init__.py
				file_handler.py
				hash.py

		data/
			domain_documents/
				EDUCATION/
					raw/
					processed/
				HEALTHCARE/
					raw/
					processed/
				IT/
					raw/
					processed/
			raw/
				external/
				user/
			processed/
				external/
				user/

	data/
		external/
		processed/
			external/
			user/
		raw/
			external/
			user/
		user/

	frontend/
		index.html
```

## 6. Module-by-Module Analysis

### `backend/app/main.py`
- FastAPI app factory.
- Startup checks:
	- Mongo connectivity ping,
	- Neo4j connectivity test,
	- embedding model preload.
- Scheduler:
	- periodic external ingestion every 6 hours.
- Middleware:
	- request start/end logging with duration.
- CORS:
	- currently open (`allow_origins=["*"]`) for local/testing flexibility.

### `backend/app/db/mongo.py`
- Mongo client singleton.
- Loads `.env` and reads:
	- `MONGO_URI`,
	- `MONGO_DB_NAME`.
- Collection helpers for `user_documents` and `external_documents`.
- Duplicate protection via hash checks and unique index behavior.

### `backend/app/db/neo4j.py`
- Neo4j driver singleton.
- Loads `.env` and supports both direct and alias env names.
- `run_query` helper for all graph operations.
- `test_connection` utility endpoint backend support.

### `backend/app/services/preprocessing.py`
- Core text normalization and legal clause extraction.
- Uses `en_core_web_sm` spaCy model.
- Removes navigation/noise and invalid patterns.
- Applies legal-keyword filtering and metadata extraction.
- Embeds retained clauses using shared embedding model.

### `backend/app/services/embedding_model.py`
- Shared singleton `SentenceTransformer` loader.
- Uses `all-MiniLM-L6-v2` for embeddings.

### `backend/app/services/scraper.py`
- Pulls external records from Gazette/News/other legal sources.
- Normalizes and preprocesses external content before storage.
- Integrates with Layer 1 Mongo storage and processed JSON persistence.

### `backend/app/services/graph_builder.py`
- Builds graph from Mongo collections (`user_documents`, `external_documents`).
- Enforces Neo4j constraints for uniqueness.
- Creates:
	- `Document` nodes,
	- `Clause` nodes,
	- `HAS_CLAUSE` edges.
- Similarity builder creates `SIMILAR_TO` edges.

### `backend/app/services/retrieval.py`
- Embedding-based top-k match retrieval (top 3).
- Graph expansion from top match node neighbors (`SIMILAR_TO`, top 3).
- Returns query match + related clauses.

### `backend/app/services/compliance.py`
- Compliance score formula:
	- vector score weight: `0.8`,
	- graph score weight: `0.2`,
	- threshold: `0.65`.
- Output fields per policy clause:
	- `status`, `confidence`, `matched_clause`, `vector_score`, `graph_score`.

### Routes Summary (`backend/app/routes/*`)
- `upload.py`: user document ingestion.
- `fetch.py`: external fetch + ingest triggers.
- `graph.py`: graph and similarity builders (POST).
- `retrieval.py`: retrieval API.
- `compliance.py`: compliance API.
- `neo4j_test.py`: Neo4j health check.
- `debug.py`: quick inspection endpoints.
- `domain.py`: domain upload/status/list APIs.
- `export.py`: PDF/Excel export from Mongo.

### `frontend/index.html`
- Single-page backend tester.
- Supports upload, fetch, debug, export, domain upload status polling.
- Uses backend health discovery against candidate local ports.
- Designed as QA/testing dashboard, not final production frontend.

## 7. API Endpoint Catalog

Base prefix: `/api/v1`

### Core
- `POST /upload`
- `GET /fetch`
- `GET /fetch-now`
- `POST /build-graph`
- `POST /build-similarity`
- `GET /retrieve?query=...`
- `GET /compliance-check`
- `GET /test-neo4j`

### Debug and Export
- `GET /debug/user-documents`
- `GET /debug/external-documents`
- `GET /debug/stats`
- `GET /export/user?format=pdf|excel`
- `GET /export/external?format=pdf|excel`

### Domain Pipeline
- `POST /domain/upload?domain=IT|...`
- `GET /domain/status?hash=...`
- `GET /domain/status/latest`
- `GET /domain/list?domain=...`

### System
- `GET /health`

## 8. Data Flow (Detailed)

1. Input received (user file, external content, or domain upload).
2. Raw artifact saved.
3. Text extracted and cleaned.
4. Clauses filtered/classified and embedded.
5. Processed JSON saved to disk.
6. Document stored in MongoDB.
7. Graph build reads Mongo and upserts Neo4j nodes/edges.
8. Similarity edges created among clauses.
9. Retrieval/compliance query combines vector + graph context.

## 9. Environment Configuration

Create `backend/.env` using `backend/.env.example` as reference.

Typical keys:

```env
MONGO_URI=...
MONGO_DB_NAME=lexisgraph

NEO4J_URI=...
NEO4J_USER=...
NEO4J_PASSWORD=...
NEO4J_DATABASE=...

NEWSAPI_KEY=...

OPENROUTER_API_KEY=...
OPENROUTER_TIMEOUT_SECONDS=20
OPENROUTER_RETRY_ATTEMPTS=2
OPENROUTER_RETRY_BACKOFF_SECONDS=0.6
```

## 10. Setup and Run

### Install

```bash
cd backend
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

### Run Backend

```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

### Open API Docs
- `http://127.0.0.1:8001/docs`

## 11. Verification Checklist

### Layer 1 checks
- `GET /api/v1/debug/stats`
- `POST /api/v1/upload` (file upload)
- `GET /api/v1/fetch-now?max_items=...`

Expected:
- Mongo counts increase or duplicates are reported.
- Raw and processed files are created.

### Layer 2 checks
- `GET /api/v1/test-neo4j`
- `POST /api/v1/build-graph`
- `POST /api/v1/build-similarity`

Expected:
- Neo4j success response.
- Graph builder returns processed document/clause counts.
- Similarity builder returns upsert counts.

### Layer 3 checks
- `GET /api/v1/retrieve?query=...`
- `GET /api/v1/compliance-check`

Expected:
- Retrieval returns top matches with optional related clauses.
- Compliance returns clause-wise status and confidence with vector/graph components.

### OpenRouter connectivity check
- Direct API call using `OPENROUTER_API_KEY` should return valid completion response.

## 12. Strengths
- Clear layer separation and practical API design.
- Deterministic compliance scoring with explainable components.
- Good operational logging and startup diagnostics.
- Domain-specific pipeline and progress/status handling.
- Data export support for PDF/Excel.

## 13. Current Limitations and Risks
- OpenRouter not yet integrated into compliance endpoint output generation.
- `build-graph` can be slow for larger datasets and may exceed short request timeouts.
- Similarity builder default clause cap can limit graph coverage in large corpora.
- CORS is wide open for development; production should restrict origins.
- Domain upload status is in-memory; restart clears status history.
- Some noisy long clauses from scraped content can reduce match quality.

## 14. Recommended Next Steps
1. Integrate OpenRouter into Layer 3 response generation for natural-language reasoning per clause.
2. Add async background job tracking for heavy graph build operations.
3. Add stronger clause quality filters and document-type specific preprocess profiles.
4. Add authentication/authorization and tighten CORS for production.
5. Build final product frontend (multi-page UX) on top of current validated APIs.
6. Add test coverage for ingestion, graph build, retrieval, and compliance scoring.

## 15. Frontend Readiness Summary
- Backend APIs are ready for frontend integration.
- Current `frontend/index.html` can be used for QA/regression testing.
- Final frontend can now focus on:
	- workflow screens,
	- compliance dashboards,
	- graph/reasoning explainability UX,
	- export and audit experiences.

## 16. Contribution Guide
1. Clone and pull latest code.
2. Configure `backend/.env`.
3. Install dependencies and run backend.
4. Validate Layer 1/2/3 with checklist above.
5. Keep route/service responsibilities separated.
6. Add/update tests with any behavior change.

## 17. Final Project Goal
Build a robust legal compliance intelligence platform that combines NLP preprocessing, graph analytics, and model-assisted reasoning to evaluate policy-regulation alignment at scale.

---
This README is intentionally detailed for both engineering and product teams, and for AI-assisted development workflows.
