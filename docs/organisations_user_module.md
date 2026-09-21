# Chapter 6 — Organization User Module

---

# 6.1 Introduction

The Organization User Module is the primary interface through which organizations interact with LexisGraph.

Unlike administrators, organization users do not manage legal regulations or the Legal Knowledge Base (LKB). Their sole responsibility is to upload internal organizational policies and review AI-generated compliance reports.

This module must be intuitive, secure, responsive, and designed for non-technical users such as compliance officers, legal teams, HR managers, and information security personnel.

---

# 6.2 Objectives

The Organization User Module shall allow authenticated users to:

- Register an organization
- Login securely
- Manage their profile
- Upload company policies
- Track document processing
- View compliance reports
- Download reports
- View report history
- Monitor organization compliance trends
- Manage organization settings

---

# 6.3 User Journey

The complete user workflow shall follow the sequence below.

```
Register

↓

Login

↓

Dashboard

↓

Upload Company Policy

↓

Processing

↓

Compliance Analysis

↓

View Report

↓

Download Report

↓

Report History
```

The user shall never interact with legal documents directly.

---

# 6.4 User Dashboard

Route

```
/dashboard
```

Purpose

Provide a centralized overview of the organization's compliance activities.

---

Dashboard Cards

- Total Uploaded Policies
- Total Reports
- Overall Compliance Score
- Policies Under Review
- Recent Uploads
- Recent Reports
- Last Analysis
- Latest Legal Updates (Future)

---

Dashboard Charts

- Compliance Trend
- Upload Activity
- Reports Generated
- Gap Severity Distribution
- Department-wise Compliance

---

Quick Actions

- Upload Policy
- View Reports
- View History
- Organization Settings

---

# 6.5 User Navigation

The sidebar shall contain:

```
Dashboard

Upload Policy

Reports

History

Organization

Profile

Settings
```

---

# 6.6 Registration

Route

```
/register
```

Users shall register using:

Required Fields

- Organization Name
- Full Name
- Email
- Password
- Confirm Password

Optional

- Industry
- Organization Size
- Country

---

Validation Rules

Organization Name

- Required

Email

- Valid format
- Unique

Password

Minimum

- 8 Characters

Must contain

- Uppercase
- Lowercase
- Number
- Special Character

---

Successful Registration

The system shall:

- Create Organization
- Create User
- Send Verification Email (Future)
- Redirect to Login

---

# 6.7 Login

Route

```
/login
```

Authentication Method

JWT

Required Fields

- Email
- Password

Features

- Remember Me
- Forgot Password
- Show Password

Future

- MFA
- SSO

---

# 6.8 Organization Profile

Route

```
/organization
```

Editable Fields

- Organization Name
- Industry
- Address
- Contact Email
- Logo
- Country
- Timezone

Read Only

- Organization ID
- Created Date
- Subscription (Future)

---

# 6.9 Upload Policy

Route

```
/upload
```

Purpose

Upload organizational policy documents for compliance analysis.

---

Supported Formats

Version 1

- PDF

Future

- DOCX
- TXT
- HTML

---

Upload Metadata

Required

- Policy Name
- Department
- Category

Optional

- Version
- Effective Date
- Description

---

Supported Categories

Examples

- Privacy Policy
- HR Policy
- Cyber Security Policy
- Information Security Policy
- Vendor Management
- Data Retention
- Acceptable Use Policy
- Incident Response
- Business Continuity
- Internal Governance

---

Validation

The system shall validate:

- File Type
- File Size
- Duplicate Upload
- Corrupted PDF
- Empty Document

Invalid uploads shall be rejected before processing.

---

# 6.10 Upload Workflow

```
User

↓

Upload PDF

↓

Validation

↓

Temporary Storage

↓

Processing Queue

↓

Text Extraction

↓

Clause Extraction

↓

Embedding Generation

↓

GraphRAG Retrieval

↓

LLM Analysis

↓

Compliance Report

↓

Notify User
```

The upload shall become an asynchronous processing job.

---

# 6.11 Processing Status

Users shall view processing progress.

Status Values

- Uploaded
- Validating
- Processing
- Embedding
- Retrieving Laws
- AI Analysis
- Generating Report
- Completed
- Failed

Progress shall update automatically.

---

# 6.12 Reports

Route

```
/reports
```

Purpose

Display completed compliance reports.

Displayed Information

- Report Name
- Policy
- Upload Date
- Compliance Score
- Status

Actions

- View
- Download
- Delete

---

# 6.13 Report Details

Each report shall contain:

Executive Summary

Overall Compliance Score

Compliance Percentage

Gap Summary

Clause-by-Clause Analysis

Legal References

AI Explanation

Recommendations

Confidence Score

Generation Time

Version

---

Each finding shall include:

Policy Clause

Relevant Legal Clause

Compliance Status

Severity

Explanation

Recommendation

Confidence

Source Citation

---

Compliance Status

- Compliant
- Partially Compliant
- Non-Compliant
- Review Required

---

Severity

- Critical
- High
- Medium
- Low

---

# 6.14 Compliance Score

The platform shall calculate:

Overall Score

Department Score

Policy Score

Future

Trend Analysis

Risk Index

---

Compliance Score Range

```
90–100

Excellent
```

```
75–89

Good
```

```
50–74

Needs Improvement
```

```
0–49

High Risk
```

---

# 6.15 Download Reports

Users shall download reports.

Supported Format

- PDF

Future

- Excel
- Word

Downloaded reports shall include:

- Timestamp
- Report ID
- Organization
- References
- Recommendations

---

# 6.16 Report History

Route

```
/history
```

Users shall view:

Previous Reports

Upload History

Analysis History

Historical Compliance Scores

Previous Policy Versions

---

Filtering

Date

Department

Category

Compliance Score

Severity

---

Searching

Users shall search by:

Policy Name

Department

Report ID

Keywords

---

# 6.17 Notifications

Version 1

In-App Notifications

Examples

- Processing Completed

- Processing Failed

- Report Generated

Future

Email Notifications

Legal Update Alerts

Scheduled Compliance Reviews

---

# 6.18 User Profile

Route

```
/profile
```

Users shall manage:

- Name
- Email
- Password
- Avatar

Future

- MFA
- Login History
- Active Sessions

---

# 6.19 Settings

Route

```
/settings
```

Users may configure:

Theme

Language

Notification Preferences

Timezone

Default Report Format

Privacy Preferences

---

# 6.20 User Permissions

Organization Users may

✓ Upload Policies

✓ View Reports

✓ Download Reports

✓ Delete Their Own Policies

✓ Edit Organization Profile

Organization Users shall NOT

✗ Modify Legal Knowledge Base

✗ Upload Laws

✗ View Other Organizations

✗ Modify Knowledge Graph

✗ Execute Scheduler

✗ Access Admin APIs

---

# 6.21 API Endpoints

Authentication

```
POST /api/v1/auth/register

POST /api/v1/auth/login

POST /api/v1/auth/logout

POST /api/v1/auth/refresh
```

---

Profile

```
GET /api/v1/profile

PUT /api/v1/profile
```

---

Organization

```
GET /api/v1/organization

PUT /api/v1/organization
```

---

Policy

```
POST /api/v1/policies/upload

GET /api/v1/policies

GET /api/v1/policies/{id}

DELETE /api/v1/policies/{id}
```

---

Reports

```
GET /api/v1/reports

GET /api/v1/reports/{id}

GET /api/v1/reports/{id}/download

DELETE /api/v1/reports/{id}
```

---

History

```
GET /api/v1/history
```

---

Notifications

```
GET /api/v1/notifications
```

---

# 6.22 Security Requirements

The User Module shall enforce:

- JWT Authentication
- Role-Based Authorization
- HTTPS
- Secure Password Hashing
- Upload Validation
- Input Validation
- Rate Limiting

Organization users shall only access resources belonging to their own organization.

Every request shall verify ownership before processing.

---

# 6.23 Privacy Requirements

Organization policies are confidential.

The platform shall ensure:

- Organization data isolation
- No cross-organization access
- Secure storage
- Encrypted communication
- No policy sharing

Uploaded policies shall never become part of the public Legal Knowledge Base.

Organization data shall not be used for AI model training.

---

# 6.24 Error Handling

Users shall receive clear error messages.

Examples

Upload Failed

```
The uploaded PDF could not be processed.
Please verify the file and try again.
```

Unauthorized

```
Your session has expired.
Please login again.
```

Report Failed

```
Compliance analysis could not be completed.
Please retry or contact the administrator.
```

Internal server details shall never be exposed to users.

---

# 6.25 Future Enhancements

The architecture shall support future additions without major redesign.

Future features include:

- Team collaboration
- Role-based organization members
- Shared workspaces
- Report comments
- Version comparison
- Scheduled compliance scans
- AI legal assistant
- Policy versioning
- Compliance analytics dashboard
- Multi-language support
- Multi-country regulations

---

# 6.26 Acceptance Criteria

The Organization User Module shall be considered complete when:

✓ Users can register and authenticate securely.

✓ Organizations can upload policy documents.

✓ Uploaded documents are validated and processed asynchronously.

✓ Users can monitor processing status.

✓ Compliance reports are generated successfully.

✓ Reports provide explainable AI findings with supporting legal references.

✓ Reports can be downloaded in PDF format.

✓ Historical reports are preserved.

✓ Organization data remains isolated and secure.

✓ All actions are performed through authenticated APIs.

---

# 6.27 Summary

The Organization User Module provides a secure and user-friendly interface for organizations to interact with LexisGraph. It enables users to upload internal policies, receive AI-powered compliance assessments, review explainable reports, and monitor compliance over time while ensuring strict privacy, organization-level data isolation, and a seamless user experience.

---

End of Chapter 6