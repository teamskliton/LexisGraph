# Information Architecture

Version: 1.0

Last Updated: August 2026

---

# Purpose

This document defines the overall structure of the LexisGraph platform, including how users, workspaces, projects, documents, analyses, and reports are organized.

It serves as the foundation for frontend development, backend architecture, API design, and future product expansion.

---

# Product Hierarchy

LexisGraph follows a multi-tenant architecture.

```
Tenant
    │
    ▼
Workspace
    │
    ▼
Projects
    │
    ├───────────────┐
    ▼               ▼
Documents      Regulations
    │               │
    └──────┬────────┘
           ▼
Knowledge Graph
           ▼
GraphRAG Retrieval
           ▼
AI Compliance Analysis
           ▼
Interactive Report
           ▼
Recommendations
           ▼
Continuous Monitoring
```

---

# Primary Entity Relationships

```
Tenant
│
├── Workspace
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
│     └── Activity Timeline
│
└── Settings
```

Every project is isolated.

Knowledge graphs, reports and analyses belong to a project.

---

# Tenant

A tenant represents the highest level of ownership.

Two tenant types are supported.

## Organization

Represents a single company.

Examples

- Startup
- SME
- Enterprise

---

## Law Firm

Represents a legal service provider managing multiple client organizations.

Example

```
ABC Legal Associates

Clients

• Infosys

• TCS

• Startup XYZ

• ABC Manufacturing
```

Each client has an isolated workspace.

---

# Workspace

A workspace is the operational environment for one organization or client.

It contains:

- Team Members
- Projects
- Documents
- Knowledge Graphs
- Compliance Analyses
- Reports
- Notifications
- Settings

Example

```
ABC Technologies Workspace
```

---

# Projects

Projects are the primary unit of work inside a workspace.

Every compliance activity happens inside a project.

Examples

```
POSH Compliance 2026

DPDP Readiness Assessment

HR Policy Review

ISO 27001 Audit

Factories Act Compliance
```

Each project contains:

- Documents
- Regulations
- AI Analyses
- Reports
- Knowledge Graph
- Timeline
- Comments
- Version History (future)

---

# Documents

Documents are uploaded by users.

Supported categories include:

Internal Policies

- HR Policy
- Leave Policy
- POSH Policy
- Data Privacy Policy
- Code of Conduct

External Regulations

- POSH Act
- DPDP Act
- Companies Act
- Labour Code
- Factories Act
- Custom Regulations

Each uploaded document belongs to exactly one project.

---

# Knowledge Graph

Every project has its own Knowledge Graph.

Purpose

Transform legal documents into structured entities and relationships.

Example

```
Policy Clause

↓

Requirement

↓

Regulation

↓

Section

↓

Compliance Status
```

The Knowledge Graph powers GraphRAG retrieval and AI reasoning.

---

# AI Compliance Analysis

An analysis compares uploaded policies against selected regulations.

Pipeline

```
Documents

↓

Clause Extraction

↓

Knowledge Graph Construction

↓

GraphRAG Retrieval

↓

LLM Analysis

↓

Gap Detection

↓

Compliance Score

↓

Interactive Report
```

Multiple analyses may exist within one project.

---

# Interactive Reports

Reports are generated after AI analysis.

Each report includes:

- Executive Summary
- Compliance Score
- Findings
- Missing Clauses
- Conflicting Clauses
- Outdated References
- Evidence
- Recommendations
- Export Options

Reports remain linked to the originating project.

---

# AI Assistant

The AI Assistant operates at the workspace level.

Capabilities include:

- Answer compliance questions
- Explain regulations
- Compare policy versions
- Summarize reports
- Suggest policy updates
- Generate compliance clauses
- Search Knowledge Graph

The AI Assistant uses GraphRAG to retrieve project-specific information.

---

# Team

Each workspace supports multiple users.

Roles

- Workspace Admin
- Legal Analyst
- Reviewer
- Viewer

Role permissions are defined in Roles_and_Permissions.md.

---

# Notifications

Notifications inform users about important events.

Examples

- Analysis completed
- Report approved
- Regulation updated
- AI recommendation generated
- Project shared
- Team invitation
- Compliance deadline approaching

Future versions may support email and in-app notifications.

---

# Dashboard

The dashboard provides an executive overview of the workspace.

Primary widgets

- AI Executive Brief
- Knowledge Graph Overview
- Compliance KPIs
- Compliance Trends
- Risk Breakdown
- Recent Reports
- Activity Timeline

Purpose

Help users understand the current compliance posture and prioritize actions.

---

# Navigation Structure

Primary navigation

```
Dashboard

Projects

Documents

Knowledge Graph

Compliance

Reports

AI Assistant

Team

Settings
```

Future navigation

```
Dashboard

Projects

Documents

Knowledge Graph

Compliance

Reports

AI Assistant

Notifications

Audit Logs

Integrations

Team

Billing

Settings
```

---

# Page Relationships

```
Dashboard
      │
      ▼
Projects
      │
      ▼
Project Overview
      │
 ┌────┼─────┐
 ▼    ▼     ▼
Docs Analysis Reports
 │      │      │
 ▼      ▼      ▼
Graph Findings Timeline
```

---

# User Journey

```
Landing Page

↓

Sign Up

↓

Create Workspace

↓

Invite Team

↓

Create Project

↓

Upload Policies

↓

Select Regulations

↓

Build Knowledge Graph

↓

Run Compliance Analysis

↓

Review Interactive Report

↓

Approve Findings

↓

Continuous Monitoring
```

---

# Data Ownership

Ownership hierarchy

```
Tenant

↓

Workspace

↓

Project

↓

Documents

↓

Knowledge Graph

↓

Analyses

↓

Reports
```

Deleting a workspace removes all associated projects and data.

Deleting a project removes only data belonging to that project.

---

# Design Principles

The information architecture follows these principles:

## Workspace-Centric

Everything belongs to a workspace.

---

## Project-Centric

Compliance work is organized into projects rather than isolated documents.

---

## Explainable AI

Every AI recommendation should link back to supporting evidence.

---

## Modular

Each module should be independently maintainable and reusable.

---

## Scalable

The architecture should support:

- Single-user startups
- Large enterprises
- Law firms managing multiple clients

without structural changes.

---

# Future Expansion

The architecture is designed to support future capabilities without major redesign.

Planned additions include:

- Version History
- Team Collaboration
- Report Approval Workflow
- Regulatory Monitoring
- Continuous Compliance
- AI Copilot
- Audit Logs
- Integrations
- Public API
- Enterprise SSO
- Multi-region deployments

---

# Summary

LexisGraph is structured as a multi-tenant AI-powered legal compliance workspace where organizations and law firms manage projects, documents, knowledge graphs, AI analyses, and reports within a unified, scalable architecture.

The information architecture is designed to provide clear ownership, modularity, explainability, and long-term scalability while supporting collaboration and AI-assisted compliance workflows.