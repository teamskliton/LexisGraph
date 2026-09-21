# Sprint 3 — Document Management System

## Status

🚧 In Progress

Sprint 3 introduces the complete Document Management layer for LexisGraph.

This sprint is responsible for allowing authenticated users to upload legal documents (Regulations & Policies), storing them securely, tracking metadata inside PostgreSQL, and preparing them for future AI processing.

---

# Goal

Build a production-ready document upload pipeline.

Current sprint does **NOT** implement GraphRAG or document parsing.

Those belong to later sprints.

---

# Completed

## 1. Database Model

Created SQLAlchemy 2.0 model:

```
Document
```

Table:

```
documents
```

Fields

- id (UUID)
- organization_id
- uploaded_by
- original_filename
- stored_filename
- file_path
- file_size
- mime_type
- checksum
- document_type
- processing_status
- created_at
- updated_at

Enums

DocumentType

- REGULATION
- POLICY

ProcessingStatus

- UPLOADED
- PROCESSING
- PROCESSED
- FAILED

Relationships

Organization

```
Organization
    └── documents[]
```

User

```
User
    └── uploaded documents[]
```

Document

```
belongs to

Organization

User
```

---

## 2. Alembic Migration

Migration created

```
add_documents_table
```

Creates

- documents table
- indexes
- foreign keys
- enums

---

## 3. Local Storage Service

Reusable storage service created.

Location

```
backend/app/services/storage.py
```

Storage structure

```
backend/storage/

    uploads/

        regulations/

        policies/
```

Features

✔ UUID filenames

✔ Preserve original extension

✔ SHA256 checksum

✔ Detect MIME type

✔ Return metadata

```
original filename

stored filename

path

checksum

size

mime type
```

Validation

Only

```
application/pdf
```

Maximum

```
50 MB
```

Errors

```
StorageError

InvalidMimeTypeError

FileTooLargeError
```

---

# Frontend

Work Started

Upload page

```
/upload
```

Planned UI

- Drag & Drop upload
- File picker
- Organization selector
- Document Type selector
- Upload progress
- Success toast
- Error toast
- Loading state
- Responsive
- Dark mode
- Axios integration

UI Library

```
Base UI

NOT Radix UI
```

---

# Current Architecture

```
Frontend

↓

Axios

↓

FastAPI

↓

Storage Service

↓

Filesystem

↓

PostgreSQL Metadata
```

---

# Remaining Work

## Backend

### POST /documents/upload

Multipart endpoint

Responsibilities

- authenticate user
- validate PDF
- validate size
- save file
- compute checksum
- create database record
- return metadata

Response

```
{
    id,
    filename,
    status,
    organization_id,
    checksum
}
```

---

### GET /documents

List documents

Filters

- organization
- type
- status

Pagination

---

### GET /documents/{id}

Return

- metadata
- uploader
- organization
- processing status

---

### DELETE /documents/{id}

Delete

- database record

- physical file

---

### Download endpoint

```
GET /documents/{id}/download
```

---

## Frontend

Complete Upload page

Components

```
UploadDropzone

UploadProgress

OrganizationSelect

DocumentTypeSelect

DocumentCard

DocumentList
```

API

```
POST /documents/upload

GET /documents

DELETE /documents/{id}
```

---

# Not Included In Sprint 3

❌ OCR

❌ Text extraction

❌ Embeddings

❌ Neo4j

❌ GraphRAG

❌ LLM

❌ Vector Search

❌ Chunking

❌ AI Processing

Those begin in Sprint 4.

---

# Tech Stack

Backend

- FastAPI
- SQLAlchemy 2.0
- PostgreSQL
- Alembic
- Local Storage
- Python

Frontend

- Next.js 15
- TypeScript
- Tailwind CSS
- Base UI
- Axios
- React Hook Form
- Sonner Toast

---

# Folder Structure

```
backend/

    app/

        db/

            models/

                document.py

        services/

            storage.py

    storage/

        uploads/

            regulations/

            policies/

    alembic/

        versions/

            add_documents_table.py
```

---

# Sprint Progress

| Task | Status |
|-------|--------|
| Document Model | ✅ |
| Relationships | ✅ |
| Alembic Migration | ✅ |
| Storage Service | ✅ |
| Upload API | 🚧 |
| Document CRUD APIs | ⏳ |
| Upload Frontend | 🚧 |
| Download API | ⏳ |
| Delete API | ⏳ |

---

# Next Sprint

Sprint 4

Document Processing Pipeline

Planned

- OCR
- PDF Parsing
- Chunking
- Metadata Extraction
- NER
- GraphRAG Integration
- Neo4j Ingestion
- Embedding Generation
- AI Processing Queue