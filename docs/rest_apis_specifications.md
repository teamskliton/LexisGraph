# Chapter 11 — REST API Specification

---

# 11.1 Purpose

The REST API Specification defines all HTTP endpoints exposed by the LexisGraph backend.

The API serves as the communication layer between the frontend, backend services, and external integrations.

The API shall provide secure, versioned, stateless endpoints for all platform functionality.

---

# 11.2 API Design Principles

The API shall follow these principles:

✓ RESTful resource design

✓ Stateless communication

✓ JSON request/response bodies

✓ Predictable URL structure

✓ Versioned endpoints

✓ Standard HTTP methods

✓ Consistent error handling

✓ Role-based authorization

✓ Pagination for list endpoints

✓ Idempotent operations where applicable

---

# 11.3 Base URL

Development

```
http://localhost:8000/api/v1
```

Production

```
https://api.lexisgraph.com/api/v1
```

All endpoints shall be versioned.

---

# 11.4 Authentication

Protected endpoints require:

```
Authorization: Bearer <JWT_TOKEN>
```

Unauthenticated requests shall return:

```
401 Unauthorized
```

Insufficient permissions shall return:

```
403 Forbidden
```

---

# 11.5 Standard Response Format

Success

```json
{
  "success": true,
  "message": "Operation completed successfully.",
  "data": {}
}
```

Error

```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Requested resource does not exist."
  }
}
```

---

# 11.6 HTTP Status Codes

```
200 OK

201 Created

202 Accepted

204 No Content

400 Bad Request

401 Unauthorized

403 Forbidden

404 Not Found

409 Conflict

422 Unprocessable Entity

429 Too Many Requests

500 Internal Server Error
```

---

# 11.7 Authentication APIs

Base Route

```
/auth
```

Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| POST | /register | Register organization & admin |
| POST | /login | Authenticate user |
| POST | /logout | Logout current session |
| POST | /refresh | Refresh JWT token |
| POST | /forgot-password | Send reset email |
| POST | /reset-password | Reset password |
| POST | /verify-email | Verify email address |
| GET | /me | Current authenticated user |

---

# 11.8 Organization APIs

Base Route

```
/organizations
```

Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | / | Get organization details |
| PATCH | / | Update organization |
| GET | /settings | Get settings |
| PATCH | /settings | Update settings |

Only Organization Admins may update organization settings.

---

# 11.9 User Management APIs

Base Route

```
/users
```

Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | / | List users |
| POST | / | Invite user |
| GET | /{user_id} | User details |
| PATCH | /{user_id} | Update user |
| DELETE | /{user_id} | Disable user |
| PATCH | /{user_id}/role | Change role |

---

# 11.10 Policy Management APIs

Base Route

```
/policies
```

Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| POST | /upload | Upload policy PDF |
| GET | / | List policies |
| GET | /{policy_id} | Policy metadata |
| GET | /{policy_id}/status | Processing status |
| DELETE | /{policy_id} | Archive policy |
| POST | /{policy_id}/reanalyze | Trigger new analysis |
| GET | /{policy_id}/clauses | Extracted clauses |

Uploads shall use multipart/form-data.

---

# 11.11 Policy Processing APIs

Base Route

```
/processing
```

Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | /jobs | Processing jobs |
| GET | /jobs/{job_id} | Job status |
| POST | /jobs/{job_id}/retry | Retry failed job |

These endpoints primarily support background processing monitoring.

---

# 11.12 Compliance Analysis APIs

Base Route

```
/analysis
```

Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| POST | /start/{policy_id} | Start compliance analysis |
| GET | /status/{analysis_id} | Analysis status |
| GET | /results/{analysis_id} | Analysis results |

Analysis requests shall be executed asynchronously.

---

# 11.13 Report APIs

Base Route

```
/reports
```

Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | / | List reports |
| GET | /{report_id} | Report details |
| GET | /{report_id}/findings | Findings |
| GET | /{report_id}/recommendations | Recommendations |
| GET | /{report_id}/citations | Legal citations |
| GET | /{report_id}/export/pdf | Download PDF |

Reports are immutable after creation.

---

# 11.14 Dashboard APIs

Base Route

```
/dashboard
```

Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | /overview | Compliance overview |
| GET | /risk-summary | Risk metrics |
| GET | /recent-reports | Recent analyses |
| GET | /processing | Active processing jobs |

Dashboard endpoints return aggregated data.

---

# 11.15 Knowledge Base Administration APIs

Restricted to Platform Administrators.

Base Route

```
/knowledge
```

Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| POST | /sources | Register legal source |
| POST | /documents | Upload legal document |
| POST | /ingest | Trigger ingestion |
| GET | /documents | List legal documents |
| PATCH | /documents/{id} | Update metadata |
| POST | /reindex | Rebuild embeddings/indexes |

These endpoints shall not be accessible to organization users.

---

# 11.16 Audit APIs

Base Route

```
/audit
```

Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | /logs | Audit events |
| GET | /logs/{id} | Audit event details |

Audit records are read-only.

---

# 11.17 Health & Monitoring APIs

Base Route

```
/system
```

Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | /health | Service health |
| GET | /ready | Readiness check |
| GET | /metrics | Operational metrics (protected) |

---

# 11.18 Pagination

List endpoints shall support:

```
?page=1

&page_size=20

&sort=created_at

&order=desc
```

Response Example

```json
{
  "page": 1,
  "page_size": 20,
  "total": 125,
  "total_pages": 7,
  "items": []
}
```

---

# 11.19 Filtering

Supported query parameters may include:

```
status

category

severity

department

date_from

date_to

jurisdiction
```

Filtering shall be composable.

---

# 11.20 Rate Limiting

Default limits

Authentication

```
10 requests/minute/IP
```

Policy Upload

```
20 uploads/hour/organization
```

Analysis

```
10 concurrent analyses/organization
```

Limits shall be configurable.

---

# 11.21 File Upload Requirements

Supported formats

```
PDF
```

Future

```
DOCX

TXT
```

Maximum upload size shall be configurable.

Uploaded files shall undergo:

- File type validation
- Malware scanning
- Checksum generation

---

# 11.22 API Security

The API shall implement:

JWT authentication

RBAC authorization

HTTPS enforcement

CORS configuration

Request validation

Response sanitization

Input size limits

Rate limiting

Audit logging

---

# 11.23 API Documentation

The backend shall expose OpenAPI documentation.

Development

```
/docs
```

OpenAPI JSON

```
/openapi.json
```

Interactive documentation shall be disabled or protected in production unless explicitly required.

---

# 11.24 Future APIs

The architecture shall support:

Webhook integrations

GraphQL gateway

Bulk uploads

Public API keys

Partner APIs

Compliance webhooks

Real-time notifications

AI chat assistant endpoints

---

# 11.25 Acceptance Criteria

The REST API shall be considered complete when:

✓ All core platform modules expose versioned REST endpoints.

✓ Authentication and authorization are enforced.

✓ Responses follow a consistent schema.

✓ Errors use standard HTTP status codes.

✓ Pagination and filtering are implemented.

✓ Upload endpoints validate files.

✓ Long-running operations execute asynchronously.

✓ OpenAPI documentation is generated.

✓ APIs remain backward compatible within a version.

---

# 11.26 Summary

The REST API Specification defines the communication contract for LexisGraph, providing secure, versioned, and consistent interfaces between the frontend, backend, and future integrations. By standardizing endpoint design, authentication, error handling, pagination, and asynchronous workflows, the API layer ensures maintainability, scalability, and interoperability while enabling efficient implementation of both the Next.js frontend and FastAPI backend.

---

End of Chapter 11