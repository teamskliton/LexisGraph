# LexisGraph

LexisGraph is a legal compliance analysis platform built around clause extraction, embeddings, MongoDB document storage, Neo4j graph storage, compliance scoring, semantic retrieval, and a React frontend.

The current version is no longer a basic similarity-graph prototype. It now includes a focused Neo4j knowledge-graph workflow, a redesigned frontend, stable backend/frontend API contracts, graph history management, and stronger fallback behavior when optional LLM reasoning providers fail.

This README reflects the project state as of **July 22, 2026**.

## What The Project Does

LexisGraph compares one uploaded user policy document against one or more selected regulation or domain documents.

The pipeline is:

1. Upload and extract text from policy or domain files.
2. Break text into clauses.
3. Generate embeddings for clause-level similarity.
4. Store processed documents and clauses in MongoDB.
5. Build a Neo4j graph for document, clause, entity, and match relationships.
6. Run compliance scoring using vector similarity plus graph context.
7. Expose retrieval, compliance, graph, export, and status views in the frontend.

## Current Architecture

### Backend

The backend is a FastAPI service in [backend/app/main.py](/C:/Future/Lexi_Final/backend/app/main.py).

Main backend areas:

- [backend/app/routes/upload.py](/C:/Future/Lexi_Final/backend/app/routes/upload.py): user policy upload pipeline
- [backend/app/routes/domain.py](/C:/Future/Lexi_Final/backend/app/routes/domain.py): domain document upload and status
- [backend/app/routes/graph.py](/C:/Future/Lexi_Final/backend/app/routes/graph.py): graph build, graph explorer, graph history, reset
- [backend/app/routes/compliance.py](/C:/Future/Lexi_Final/backend/app/routes/compliance.py): compliance analysis
- [backend/app/routes/retrieval.py](/C:/Future/Lexi_Final/backend/app/routes/retrieval.py): semantic retrieval
- [backend/app/routes/export.py](/C:/Future/Lexi_Final/backend/app/routes/export.py): report export

Core backend services:

- [backend/app/services/preprocessing.py](/C:/Future/Lexi_Final/backend/app/services/preprocessing.py)
- [backend/app/services/embedding_model.py](/C:/Future/Lexi_Final/backend/app/services/embedding_model.py)
- [backend/app/services/compliance.py](/C:/Future/Lexi_Final/backend/app/services/compliance.py)
- [backend/app/services/retrieval.py](/C:/Future/Lexi_Final/backend/app/services/retrieval.py)
- [backend/app/services/knowledge_graph.py](/C:/Future/Lexi_Final/backend/app/services/knowledge_graph.py)
- [backend/app/services/graph_explorer.py](/C:/Future/Lexi_Final/backend/app/services/graph_explorer.py)
- [backend/app/services/llm_reasoning.py](/C:/Future/Lexi_Final/backend/app/services/llm_reasoning.py)
- [backend/app/services/health.py](/C:/Future/Lexi_Final/backend/app/services/health.py)

### Frontend

The frontend is a Vite + React application rooted at [frontend/src/App.jsx](/C:/Future/Lexi_Final/frontend/src/App.jsx).

Main pages:

- Dashboard
- Upload Documents
- Graph Explorer
- Compliance Check
- Semantic Retrieval
- Domain Pipeline
- Export & Reports
- Settings

The frontend now uses a top navigation layout and a consistent light SaaS-style UI instead of the older sidebar-heavy admin look.

## What Is Working

### 1. Upload and Processing

User upload and domain upload both work end-to-end:

- file intake
- text extraction
- clause preprocessing
- embedding generation
- MongoDB persistence

The upload flow returns stable metadata including document id, stored status, hash, paths, and clause count.

### 2. Compliance Analysis

Compliance analysis is live and uses a stable response contract:

```json
{
  "results": [
    {
      "policy_clause": "...",
      "status": "partial",
      "confidence": 0.58,
      "matched_clause": "...",
      "vector_score": 0.61,
      "graph_score": 0.44,
      "reasoning_summary": "..."
    }
  ]
}
```

Current compliance behavior:

- deterministic clause-to-clause comparison
- vector score plus graph score
- status classification as `compliant`, `partial`, or `gap`
- optional reasoning summary

Important note:

This is still a scoring-and-alignment system, not a full legal reasoning engine.

### 3. Semantic Retrieval

Retrieval is working through `/api/v1/retrieve`.

Current retrieval behavior:

- embeds the query
- retrieves relevant stored clauses
- returns top matches
- includes related graph-backed clause context

### 4. Neo4j Knowledge Graph

The project now includes a focused knowledge-graph workflow built from:

- exactly one selected user policy document
- one or more selected domain documents

This graph is not built from every uploaded document anymore.

Current knowledge graph model includes:

- `UserDocument`
- `PolicyClause`
- `DomainDocument`
- `RegulationClause`
- `Entity`

Relationships include:

- `HAS_CLAUSE`
- `BELONGS_TO`
- `HAS_ENTITY`
- `MATCH`
- `PARTIAL_MATCH`
- `MISSING`

There is also graph history support, graph reset support, and lazy graph expansion support for the explorer UI.

### 5. Graph Explorer

The graph explorer now works against real backend data instead of frontend-only placeholder links.

Current graph explorer behavior:

- build graph from selected documents
- load graph root
- lazily expand policy clauses
- lazily expand regulation clauses
- show history of previous builds
- open a previous graph build
- delete a previous graph build
- reset the active graph
- search visible nodes
- fit, center, refresh, zoom, expand, and collapse the view

The graph view is intentionally limited to keep it responsive:

- policy clause expansion limit
- regulation match limit per clause
- entity limit per selected regulation clause

### 6. Frontend Navigation and UI

The frontend has been substantially improved:

- top navigation instead of the large left sidebar
- professional light theme
- consistent cards, spacing, typography, and controls
- redesigned graph explorer layout
- improved upload, dashboard, settings, export, domain pipeline, retrieval, and compliance pages
- better route behavior and route error recovery
- automatic scroll reset on page change

## What Is Still Partial Or Prototype-Level

- long-running operations still execute inside request flow rather than a durable worker queue
- graph job tracking is still in-memory
- domain upload progress is still in-memory
- external ingestion depends on outside sources and valid provider access
- no authentication or user management exists
- no persistent background job system exists
- no full browser end-to-end test suite exists
- LLM reasoning is optional and provider-dependent

## LLM Reasoning Provider Status

The project contains configuration for both OpenRouter and Gemini, but only one provider should be considered active at a time through `LLM_REASONING_PROVIDER`.

Current reasoning behavior:

- if `LLM_REASONING_PROVIDER=openrouter`, OpenRouter is used intentionally
- if an OpenRouter model returns a 404 or becomes unavailable, fallback model handling is applied
- if provider-based reasoning fails, the system falls back to deterministic reasoning text instead of crashing

That means Gemini is not required unless you explicitly want Gemini as the active provider.

## API Summary

Base path: `/api/v1`

Main routes:

- `POST /upload`
- `GET /fetch-now`
- `POST /build-graph`
- `POST /build-similarity`
- `POST /build-knowledge-graph`
- `POST /reset-knowledge-graph`
- `GET /graph-view`
- `GET /graph/root`
- `GET /graph/document/{document_id}`
- `GET /graph/clause/{clause_id}`
- `GET /graph/regulation/{regulation_id}`
- `GET /graph-documents`
- `GET /graph-history`
- `POST /graph-history/{build_id}/activate`
- `DELETE /graph-history/{build_id}`
- `GET /graph-jobs/latest`
- `GET /retrieve`
- `GET /compliance-check`
- `GET /debug/user-documents`
- `GET /debug/external-documents`
- `GET /debug/stats`
- `GET /test-neo4j`
- `GET /test-mongo`
- `GET /export/user`
- `GET /export/external`

System route:

- `GET /health`

## Health Checks

The health endpoint now reports subsystem-level status rather than a single generic response.

Current health coverage:

- API
- MongoDB
- Neo4j
- embedding model

This makes local debugging much easier when only one dependency is failing.

## Tests

Contract tests are in [backend/tests/test_api_contracts.py](/C:/Future/Lexi_Final/backend/tests/test_api_contracts.py).

These currently validate:

- compliance response shape
- retrieval response shape
- graph view response shape
- knowledge graph build response shape
- lazy graph endpoint response shapes
- graph reset and history response shapes
- upload response shape

This gives good contract protection, but it is not yet a full integration suite.

## Local Setup

### Backend

```bash
cd backend
pip install -r requirements.txt
python -m spacy download en_core_web_sm
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend default URL:

- `http://127.0.0.1:5173`

Backend docs:

- `http://127.0.0.1:8001/docs`

## Environment Notes

Use [backend/.env.example](/C:/Future/Lexi_Final/backend/.env.example) as the template.

Important environment groups:

- MongoDB settings
- Neo4j settings
- CORS and environment settings
- graph similarity tuning
- OpenRouter settings
- Gemini settings
- external fetch settings

## Recommended Manual Verification

Before pushing or demoing, the best verification order is:

1. Start backend and frontend.
2. Confirm `/health` reports API, MongoDB, Neo4j, and embedding model status.
3. Upload one user policy document.
4. Upload or fetch one or more domain/regulation documents.
5. Build the focused knowledge graph from the selected documents.
6. Open Graph Explorer and verify nodes, edges, summary cards, history, reset, and lazy expansion.
7. Run Semantic Retrieval and verify top results render.
8. Run Compliance Check and verify rows, scores, and reasoning render.
9. Verify export actions.

## Honest Positioning

The most accurate description of LexisGraph today is:

> A graph-assisted legal clause alignment and compliance analysis platform using clause extraction, embeddings, MongoDB document storage, Neo4j relationship modeling, deterministic compliance scoring, optional LLM explanation, and a modern React frontend.

What it is not yet:

- a production-hardened multi-tenant SaaS
- a complete legal reasoning engine
- a full multi-hop GraphRAG reasoning platform
- a durable background-job architecture

## Changes In This Version

The following changes were added compared with the previous project version:

### Backend and Data Flow

- standardized the compliance API response so frontend and backend both use the `results` key
- added the focused knowledge graph build flow through `POST /api/v1/build-knowledge-graph`
- added graph reset support through `POST /api/v1/reset-knowledge-graph`
- added graph history support:
  - `GET /api/v1/graph-history`
  - `POST /api/v1/graph-history/{build_id}/activate`
  - `DELETE /api/v1/graph-history/{build_id}`
- added lazy graph explorer endpoints:
  - `GET /api/v1/graph/root`
  - `GET /api/v1/graph/document/{id}`
  - `GET /api/v1/graph/clause/{id}`
  - `GET /api/v1/graph/regulation/{id}`
- added graph document selection endpoint `GET /api/v1/graph-documents`
- kept the older graph and similarity build endpoints for compatibility
- improved LLM reasoning fallback so OpenRouter failures do not break compliance output
- added or expanded backend contract tests for the newer graph and history endpoints

### Graph and Neo4j

- moved from a loose similarity-only graph concept to a proper document-clause-regulation-entity knowledge graph
- graph builds are now generated from selected documents instead of all uploaded user documents
- graph explorer now loads real graph evidence rather than fake browser-generated similarity links
- previous graph builds can now be reopened or deleted
- active graph can now be reset directly from the UI

### Frontend

- replaced the old sidebar layout with a professional top navigation bar
- redesigned the full frontend into a cleaner light AI SaaS style
- improved the dashboard layout and fixed the compliance overview alignment issue
- redesigned the graph explorer to better match the intended Neo4j knowledge-graph presentation
- moved graph actions into the graph viewport area for easier use
- improved graph responsiveness with smaller initial graph scope and lazy expansion
- added graph history modal and reset controls
- improved semantic retrieval page layout and search bar behavior
- improved upload, export, settings, compliance, and domain pipeline pages for consistency
- fixed route issues that could leave pages stuck or blank:
  - route error boundary resets on page change
  - automatic scroll reset on navigation
  - dashboard hard navigations replaced with router navigation

### Project Hygiene

- expanded documentation to reflect the current real implementation instead of the earlier prototype framing
- prepared the project for GitHub push by cleaning generated local artifacts and caches before commit
