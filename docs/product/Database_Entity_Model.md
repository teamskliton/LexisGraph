# Database Entity Model

Version: 1.0

Last Updated: August 2026

---

# Purpose

This document defines the core entities, their relationships, ownership, and lifecycle within the LexisGraph platform.

It serves as the single source of truth for:

- Database design
- Backend APIs
- Frontend state management
- Access control
- Future scalability

---

# Entity Hierarchy

```
Tenant
│
└── Workspace
    │
    ├── Users
    │
    ├── Projects
    │     │
    │     ├── Documents
    │     ├── Regulations
    │     ├── Knowledge Graph
    │     ├── Analyses
    │     ├── Reports
    │     ├── Comments
    │     └── Timeline Events
    │
    └── Settings
```

---

# Workspace

Represents an organization or a law firm's client workspace.

## Fields

- Workspace ID
- Name
- Type (Organization / Law Firm Client)
- Industry
- Company Size
- Logo
- Created By
- Created At
- Updated At

## Relationships

Workspace

→ Many Users

→ Many Projects

→ One Settings

---

# User

Represents a workspace member.

## Fields

- User ID
- First Name
- Last Name
- Email
- Role
- Avatar
- Status
- Last Login
- Created At

## Relationships

User

→ Belongs to Workspace

→ Creates Projects

→ Uploads Documents

→ Runs Analyses

→ Creates Comments

---

# Project

The primary working entity.

## Fields

- Project ID
- Name
- Description
- Status
- Owner
- Department
- Due Date
- Compliance Score
- Created At
- Updated At

## Relationships

Project

→ Many Documents

→ Many Regulations

→ One Knowledge Graph

→ Many Analyses

→ Many Reports

→ Many Timeline Events

→ Many Comments

---

# Document

Uploaded file.

## Fields

- Document ID
- File Name
- Type
- Category
- Size
- Version
- Upload Date
- Uploaded By

## Categories

Internal

- HR Policy
- POSH Policy
- Leave Policy
- Privacy Policy
- Code of Conduct

External

- Regulation
- Act
- Rule
- Notification

## Relationships

Document

→ Belongs to Project

→ Used in Analyses

---

# Regulation

Represents a law or regulatory document.

## Fields

- Regulation ID
- Name
- Jurisdiction
- Version
- Effective Date
- Source
- Status

## Relationships

Regulation

→ Belongs to Project

→ Referenced by Analyses

---

# Knowledge Graph

Represents structured entities and relationships extracted from project documents.

## Fields

- Graph ID
- Status
- Node Count
- Relationship Count
- Generated At
- Last Updated

## Relationships

Knowledge Graph

→ One Project

→ Many Nodes

→ Many Relationships

---

# Graph Node

Represents an extracted legal entity.

## Fields

- Node ID
- Label
- Entity Type
- Source Document
- Confidence Score

Examples

- Clause
- Policy
- Requirement
- Regulation
- Section
- Obligation

---

# Graph Relationship

Represents a connection between two nodes.

## Fields

- Relationship ID
- Source Node
- Target Node
- Relationship Type
- Confidence

Examples

- REFERENCES
- SATISFIES
- VIOLATES
- DEPENDS_ON
- RELATES_TO

---

# Analysis

Represents one AI compliance run.

## Fields

- Analysis ID
- Status
- Started At
- Completed At
- Triggered By
- Processing Time
- AI Model
- Compliance Score

## Status

Pending

Running

Completed

Failed

Cancelled

---

# Report

Generated from an Analysis.

## Fields

- Report ID
- Report Name
- Compliance Score
- Risk Level
- Executive Summary
- Created At
- Approved At
- Export Count

## Relationships

Report

→ One Analysis

→ One Project

---

# Finding

Represents an individual compliance issue.

## Fields

- Finding ID
- Type
- Severity
- Description
- Recommendation
- Evidence
- Status

Examples

Missing Clause

Outdated Reference

Conflict

Partial Compliance

Observation

---

# Comment

Supports collaboration.

## Fields

- Comment ID
- Author
- Message
- Created At
- Edited At

## Relationships

Comment

→ One Project

→ One Report

---

# Timeline Event

Records project activity.

## Fields

- Event ID
- Event Type
- User
- Timestamp
- Metadata

Examples

Project Created

Document Uploaded

Analysis Started

Graph Generated

Report Approved

---

# Notification

Workspace notifications.

## Fields

- Notification ID
- Type
- Title
- Message
- Status
- Created At

Examples

Analysis Completed

New Regulation

Project Shared

Review Requested

---

# AI Conversation

Stores AI Assistant sessions.

## Fields

- Conversation ID
- Project
- User
- Messages
- Started At
- Updated At

Future

Conversation summaries

Pinned chats

Shared conversations

---

# Settings

Workspace configuration.

## Fields

- Branding
- Notification Preferences
- Default AI Model
- Default Regulations
- Security Options

---

# Entity Relationships

```
Workspace
│
├── Users
│
├── Projects
│     │
│     ├── Documents
│     ├── Regulations
│     ├── Knowledge Graph
│     ├── Analyses
│     │      │
│     │      ▼
│     │   Reports
│     │      │
│     │      ▼
│     │   Findings
│     │
│     ├── Timeline
│     └── Comments
│
└── Notifications
```

---

# Ownership Rules

Workspace owns

- Users
- Projects
- Settings

Project owns

- Documents
- Regulations
- Knowledge Graph
- Analyses
- Reports
- Comments
- Timeline

Analysis owns

- Findings

Reports reference

- Analysis
- Findings

---

# Lifecycle

Workspace

Create

↓

Invite Users

↓

Create Projects

↓

Upload Documents

↓

Generate Graph

↓

Run Analysis

↓

Generate Report

↓

Approve Report

↓

Archive Project

---

# Soft Delete Policy

Instead of permanent deletion:

Workspace

Archived

Project

Archived

Documents

Archived

Reports

Archived

This preserves audit history.

---

# Audit Fields

Every entity should include:

- ID
- Created At
- Updated At
- Created By
- Updated By
- Status

---

# Design Principles

The data model follows these principles:

- Workspace-first ownership
- Project-centric organization
- Immutable analysis history
- Explainable AI outputs
- Strong auditability
- Multi-tenant isolation
- Enterprise scalability

---

# Summary

The LexisGraph entity model is designed around a project-centric architecture. Every compliance activity—documents, regulations, Knowledge Graphs, AI analyses, reports, findings, and collaboration—is contained within a project, while workspaces provide secure multi-tenant isolation and user management.