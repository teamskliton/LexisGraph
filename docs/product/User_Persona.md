# User Personas

Version: 1.0

Last Updated: August 2026

---

# Overview

LexisGraph is designed as a multi-tenant AI-powered legal compliance platform that serves both organizations and law firms. Each tenant operates within an isolated workspace containing projects, documents, knowledge graphs, compliance analyses, and reports.

Users interact with the platform based on role-based permissions, ensuring secure collaboration while maintaining data integrity.

---

# Tenant Types

LexisGraph supports two primary tenant types.

## 1. Organization

An Organization represents a single company managing its own legal compliance activities.

Examples:

- Startup
- Small & Medium Enterprise (SME)
- Enterprise

Each organization has:

- One workspace
- Multiple users
- Multiple projects
- Organization-specific documents
- Knowledge Graph
- Compliance reports

---

## Organization Goals

Organizations use LexisGraph to:

- Maintain regulatory compliance
- Upload and manage company policies
- Compare internal policies against regulations
- Detect compliance gaps
- Generate AI-assisted reports
- Track compliance over time

---

## Example Workspace

```
ABC Technologies

Workspace

Projects
├── POSH Compliance 2026
├── DPDP Audit
├── HR Policy Review

Documents

Knowledge Graph

Compliance Reports

Team
```

---

# 2. Law Firm

A Law Firm manages compliance for multiple client organizations from a single account.

Each client has an isolated workspace while the law firm maintains centralized access.

---

## Law Firm Goals

Law firms use LexisGraph to:

- Manage multiple client organizations
- Run compliance analyses for clients
- Generate client-specific reports
- Track regulatory obligations
- Collaborate internally
- Maintain separate compliance histories

---

## Example

```
ABC Legal Associates

Clients

├── Infosys
├── TCS
├── Startup XYZ
├── ABC Manufacturing

Each client has:

Workspace

Projects

Documents

Knowledge Graph

Reports

Compliance History
```

---

# User Roles

LexisGraph currently supports four primary roles.

---

# 1. Workspace Admin

## Description

The Workspace Admin manages the entire workspace, users, subscriptions, and compliance projects.

Typical users:

- Founder
- Head of Legal
- Compliance Manager
- General Counsel

---

## Goals

- Manage compliance operations
- Oversee projects
- Invite team members
- Monitor compliance health
- Review AI-generated insights

---

## Permissions

Can:

- Manage workspace
- Invite/remove users
- Assign roles
- Create projects
- Upload documents
- Upload regulations
- Run compliance analysis
- View all reports
- Export reports
- Manage integrations
- Configure workspace settings
- Manage subscription

Cannot:

- Access another organization's workspace

---

## Primary Screens

- Dashboard
- Projects
- Documents
- Knowledge Graph
- Compliance
- Reports
- Team
- Settings

---

# 2. Legal Analyst

## Description

The Legal Analyst is the primary day-to-day user responsible for preparing compliance analyses.

Typical users:

- Legal Associate
- Compliance Executive
- HR Compliance Officer

---

## Goals

- Upload company policies
- Upload regulations
- Run AI analyses
- Review compliance findings
- Prepare reports

---

## Permissions

Can:

- Create projects
- Upload documents
- Run analyses
- View Knowledge Graph
- Review AI findings
- Ask AI Assistant
- Export reports

Cannot:

- Manage users
- Change workspace settings
- Manage billing

---

## Primary Screens

- Dashboard
- Projects
- Documents
- Compliance
- Reports
- AI Assistant

---

# 3. Reviewer

## Description

The Reviewer validates AI-generated findings before reports are finalized.

Typical users:

- Senior Legal Counsel
- Compliance Lead
- External Auditor

---

## Goals

- Review findings
- Verify compliance gaps
- Approve reports
- Add comments
- Request revisions

---

## Permissions

Can:

- Review reports
- Approve reports
- Reject reports
- Add comments
- View Knowledge Graph
- Export reports

Cannot:

- Upload documents
- Run analyses
- Manage workspace

---

## Primary Screens

- Dashboard
- Reports
- Compliance
- Knowledge Graph

---

# 4. Viewer

## Description

The Viewer consumes compliance information without modifying data.

Typical users:

- CEO
- Founder
- Board Member
- Department Head

---

## Goals

- Monitor compliance
- Track progress
- Review executive summaries
- Download reports

---

## Permissions

Can:

- View dashboard
- View reports
- Download reports
- View compliance score

Cannot:

- Edit projects
- Upload documents
- Run analysis
- Manage users

---

## Primary Screens

- Dashboard
- Reports

---

# Role Comparison

| Feature | Admin | Legal Analyst | Reviewer | Viewer |
|----------|:----:|:-------------:|:--------:|:------:|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Create Project | ✅ | ✅ | ❌ | ❌ |
| Upload Documents | ✅ | ✅ | ❌ | ❌ |
| Upload Regulations | ✅ | ✅ | ❌ | ❌ |
| Run Compliance Analysis | ✅ | ✅ | ❌ | ❌ |
| View Knowledge Graph | ✅ | ✅ | ✅ | ❌ |
| AI Assistant | ✅ | ✅ | View Only | ❌ |
| Review Reports | ✅ | ✅ | ✅ | View Only |
| Approve Reports | ✅ | ❌ | ✅ | ❌ |
| Export Reports | ✅ | ✅ | ✅ | ✅ |
| Invite Team Members | ✅ | ❌ | ❌ | ❌ |
| Manage Roles | ✅ | ❌ | ❌ | ❌ |
| Workspace Settings | ✅ | ❌ | ❌ | ❌ |
| Billing | ✅ | ❌ | ❌ | ❌ |

---

# Collaboration Workflow

```
Workspace Admin
        │
        ▼
Create Project
        │
        ▼
Legal Analyst
        │
Upload Policies
        │
Run AI Analysis
        │
        ▼
Reviewer
        │
Review Findings
Approve / Request Changes
        │
        ▼
Viewer
        │
Monitor Dashboard
Download Reports
```

---

# Future Roles (Planned)

These roles are outside the current MVP but considered for future releases.

## Super Admin

Platform-wide administrator responsible for managing tenants, system health, subscriptions, and support.

---

## Client User

For law firms, a client representative with read-only access to reports, dashboards, and compliance status for their own organization.

---

## External Auditor

Temporary access for independent auditors to review reports, findings, and supporting evidence without modifying workspace data.

---

# Design Principles

When designing features for LexisGraph:

- Follow the principle of least privilege (users only see what they need).
- Keep workflows simple and role-appropriate.
- Surface executive insights for Viewers and Admins.
- Provide detailed analysis tools for Legal Analysts.
- Enable structured review and approval for Reviewers.
- Ensure complete isolation between workspaces in a multi-tenant environment.
