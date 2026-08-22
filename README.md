# LexisGraph

LexisGraph is an intelligent legal compliance analysis platform combining clause extraction, dense vector embeddings, Neo4j knowledge graphs, PostgreSQL relational tracking, Qdrant vector storage, Redis caching, and a Next.js frontend.

---

## Architecture Overview

- **Frontend**: Next.js 16 (React 19, Tailwind CSS) in `client/`
- **Backend API**: FastAPI service in `backend/`
- **Databases & Cache** (via Docker): PostgreSQL 16, Neo4j 5, Qdrant, Redis 7, MongoDB

---

## Prerequisites

- **Docker Desktop** (with Docker Compose)
- **Python 3.11+**
- **Node.js 18+** & `npm`
- **Git**

---

## First-Time Setup (Fresh Clone)

Follow these steps once after cloning the repository:

### 1. Start Docker Services
Start the database and cache containers in the background:
```powershell
docker compose up -d
```

### 2. Configure Backend Environment
Create the `.env` file from the example template:
```powershell
cd backend
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

*Open `backend/.env` and set a secure value for `JWT_SECRET`.*

### 3. Setup Backend Environment & Database
In the `backend/` directory:

```powershell
# 1. Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2. Install dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt

# 3. Download spaCy NLP model
python -m spacy download en_core_web_sm

# 4. Run database migrations (creates all PostgreSQL tables)
alembic upgrade head
```

### 4. Setup Frontend Client
In a new terminal, navigate to `client/` and install dependencies:

```powershell
cd client
npm install
```

---

## Daily Development Workflow

Once initial setup is done, start the application anytime using these 3 steps:

### Step 1: Ensure Docker Services Are Running
```powershell
docker compose up -d
```

### Step 2: Start Backend Server
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Step 3: Start Frontend Client
In a separate terminal:
```powershell
cd client
npm run dev
```

---

## Application Access URLs

- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive Swagger Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **System Health Check**: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

---

## Core Features & Workflow

1. **User Authentication & Organizations**: Multi-tenant workspace with role-based access control (Admin, Compliance Officer, Auditor, Viewer).
2. **Document Ingestion**: Upload internal policy documents or regulation files (PDF, DOCX, TXT) with automatic clause segmentation.
3. **Knowledge Graph Construction**: Build targeted Neo4j graph relationships linking policies, regulation standards, clauses, and legal entities.
4. **Compliance & Gap Analysis**: Evaluate clause alignment with vector similarity scoring and graph context to identify compliant, partial, and non-compliant sections.
5. **Remediation & Evidence Management**: Track corrective action workflows, cycle iterations, file evidence submissions, and reviewer verifications.
6. **Semantic Clause Retrieval**: Natural language search across legal corpus and regulations powered by dense vector embeddings.
