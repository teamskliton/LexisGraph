# Project Structure

Version: 1.0

Last Updated: August 2026

---

# Purpose

Projects are the central unit of work within LexisGraph.

Every compliance assessment, document, regulation, AI analysis, knowledge graph, report, and collaboration activity belongs to a project.

This document defines the lifecycle, structure, and relationships of projects across the platform.

---

# Why Projects?

Organizations conduct multiple compliance initiatives simultaneously.

Examples include:

- POSH Compliance Audit
- DPDP Readiness Assessment
- Companies Act Review
- Labour Law Compliance
- Internal Governance Review

Keeping each initiative in a separate project provides:

- Clear ownership
- Better collaboration
- Independent compliance history
- Separate reports
- Separate Knowledge Graphs
- Better scalability

---

# Project Hierarchy

```
Tenant
│
▼
Workspace
│
▼
Projects
│
├── Documents
├── Regulations
├── Knowledge Graph
├── AI Analyses
├── Reports
├── Timeline
├── Comments
└── Settings
```

---

# Project Information

Each project stores:

Project Name

Description

Workspace

Owner

Created By

Created Date

Last Updated

Status

Applicable Regulations

Department (Optional)

Due Date (Optional)

Tags (Optional)

---

# Example Project

```
Project

Name
POSH Compliance Audit 2026

Owner
Legal Department

Status
Active

Compliance Score
87%

Applicable Regulation

POSH Act 2013

Created

12 July 2026
```

---

# Project Status

Projects progress through defined lifecycle stages.

Draft

Project created but work has not started.

---

Active

Documents are being uploaded or analysed.

---

In Review

Compliance report is awaiting review.

---

Completed

Report approved and analysis finished.

---

Archived

Historical project retained for reference.

---

Cancelled

Project discontinued before completion.

---

# Project Lifecycle

```
Create Project

↓

Upload Documents

↓

Select Regulations

↓

Generate Knowledge Graph

↓

Run AI Analysis

↓

Review Findings

↓

Approve Report

↓

Export Report

↓

Archive Project
```

---

# Documents

Every document belongs to exactly one project.

Document Categories

Internal

- HR Policy
- POSH Policy
- Leave Policy
- Privacy Policy
- Code of Conduct

External

- Acts
- Rules
- Regulations
- Notifications
- Circulars

---

# Regulations

Each project may reference one or more regulations.

Examples

- POSH Act
- DPDP Act
- Companies Act
- Labour Code
- Factories Act

Future versions may automatically recommend relevant regulations.

---

# Knowledge Graph

Every project has an independent Knowledge Graph.

Purpose

Convert uploaded documents into structured entities and relationships.

The graph powers:

- AI Assistant
- GraphRAG Retrieval
- Compliance Analysis
- Evidence Mapping

Knowledge graphs are automatically regenerated when documents change.

---

# AI Compliance Analysis

Projects may contain multiple analyses.

Examples

Initial Review

↓

Updated Policy Review

↓

Quarterly Reassessment

↓

Annual Audit

Each analysis is stored with its own timestamp and history.

---

# Reports

Reports are generated from analyses.

Each report contains:

- Executive Summary
- Compliance Score
- Findings
- Evidence
- Missing Clauses
- Recommendations
- Export History

Reports remain permanently linked to the project.

---

# Timeline

Every important event appears in the project timeline.

Examples

Project Created

↓

Policy Uploaded

↓

Analysis Started

↓

Knowledge Graph Generated

↓

Report Approved

↓

Exported PDF

↓

Project Archived

---

# Team Collaboration

Project members may:

Comment

Mention teammates

Review findings

Approve reports

Assign follow-up tasks (Future)

Compare report versions (Future)

---

# AI Assistant

The AI Assistant understands project context.

Example questions

"Summarize this project."

"Which clauses violate DPDP?"

"What changed since the last analysis?"

"Generate a remediation checklist."

Responses are limited to the selected project.

---

# Dashboard Relationship

Workspace Dashboard

↓

Project List

↓

Project Overview

↓

Documents

↓

Analysis

↓

Knowledge Graph

↓

Reports

Projects should always be the primary navigation path after the dashboard.

---

# Project Dashboard

Each project should have its own dashboard.

Suggested widgets

Project Status

Compliance Score

Recent Documents

Knowledge Graph Overview

Latest Analysis

Pending Reviews

Timeline

Recent AI Recommendations

---

# Version History (Future)

Track

Document revisions

Analysis history

Report versions

Knowledge Graph rebuilds

Policy updates

Users can compare versions before approving reports.

---

# Notifications

Project-specific notifications include:

Analysis completed

Report approved

New regulation detected

Document uploaded

Knowledge Graph updated

Comment added

Deadline approaching

---

# Project Settings

Each project stores configurable settings.

Applicable regulations

Assigned team members

Analysis preferences

Notification preferences

Retention policy

Export options

---

# Best Practices

Projects should represent a single compliance objective.

Keep related documents together.

Reuse regulations across projects where applicable.

Archive completed projects instead of deleting them.

Maintain a complete audit trail.

---

# Future Enhancements

Project templates

Recurring compliance projects

Cross-project analytics

Compliance calendars

Risk scoring trends

Automated reassessments

Approval workflows

Task management

External reviewer access

---

# Summary

Projects are the operational core of LexisGraph.

Every compliance activity—from document upload and Knowledge Graph generation to AI analysis and reporting—takes place within a project. This structure keeps work organized, supports collaboration, preserves historical context, and allows the platform to scale from a single startup to large enterprises and law firms managing hundreds of compliance initiatives.