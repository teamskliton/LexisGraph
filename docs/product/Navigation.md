# Navigation

Version: 1.0

Last Updated: August 2026

---

# Purpose

This document defines the complete navigation system for LexisGraph.

It standardizes:

- Sidebar navigation
- Header navigation
- Breadcrumbs
- Route hierarchy
- Context switching
- Navigation behavior
- User role visibility

The goal is to create a predictable, scalable, and enterprise-grade user experience.

---

# Navigation Principles

LexisGraph follows these principles:

- Workspace-first navigation
- Project-centric workflows
- Minimal cognitive load
- Consistent page hierarchy
- Role-based visibility
- Fast access to frequently used features

---

# Navigation Structure

```
Workspace
│
├── Dashboard
├── Projects
├── Documents
├── Knowledge Graph
├── Compliance
├── Reports
├── AI Assistant
├── Team
└── Settings
```

Future additions

```
Notifications

Audit Logs

Billing

Integrations
```

---

# Primary Sidebar

The sidebar is the main navigation throughout the application.

```
LOGO

Workspace Name

---------------------

Dashboard

Projects

Documents

Knowledge Graph

Compliance

Reports

AI Assistant

---------------------

Team

Settings

---------------------

Profile

Logout
```

---

# Workspace Switcher

Located at the top of the sidebar.

Displays

Workspace Logo

Workspace Name

Workspace Type

Examples

```
ABC Technologies

Organization
```

or

```
ABC Legal Associates

Law Firm
```

Law firms can switch between client workspaces.

```
ABC Legal Associates

▼

Infosys

TCS

Startup XYZ

ABC Manufacturing
```

---

# Dashboard

Route

```
/
```

Purpose

Executive overview of the workspace.

Contains

- AI Executive Brief
- Knowledge Graph Overview
- KPIs
- Compliance Trends
- Risk Summary
- Recent Reports
- Activity Timeline

Primary CTA

New Analysis

---

# Projects

Route

```
/projects
```

Purpose

Central hub for all compliance initiatives.

Each project displays

- Status
- Compliance Score
- Last Analysis
- Documents
- Reports
- Assigned Members

Actions

- Create Project
- Search
- Filter
- Archive

---

# Project Details

Route

```
/projects/:projectId
```

Tabs

```
Overview

Documents

Regulations

Analysis

Knowledge Graph

Reports

Timeline

Settings
```

---

# Documents

Route

```
/documents
```

Purpose

Manage uploaded documents.

Sections

Policies

Regulations

Recently Uploaded

Actions

Upload

Preview

Download

Delete

Version History (Future)

---

# Knowledge Graph

Route

```
/knowledge-graph
```

Purpose

Visualize relationships extracted from documents.

Capabilities

Search

Zoom

Filters

Entity Explorer

Relationship Viewer

Evidence Panel

---

# Compliance

Route

```
/compliance
```

Purpose

Run and monitor AI compliance analyses.

Contains

Analysis Queue

Current Analyses

Completed Analyses

History

Primary CTA

Run Analysis

---

# Reports

Route

```
/reports
```

Purpose

Browse generated compliance reports.

Views

Grid

List

Report Details

Actions

Open

Export PDF

Export DOCX

Share

Archive

---

# AI Assistant

Route

```
/assistant
```

Purpose

Workspace-wide AI legal assistant.

Examples

```
Show missing clauses.

Explain DPDP findings.

Compare policies.

Summarize report.

Generate compliant clause.
```

Conversation history should be saved per workspace.

---

# Team

Route

```
/team
```

Purpose

Manage workspace members.

Displays

Avatar

Role

Status

Last Active

Actions

Invite

Change Role

Remove

Deactivate

---

# Settings

Route

```
/settings
```

Sections

Workspace

Security

Notifications

API Keys (Future)

Billing (Future)

Integrations (Future)

---

# Header Navigation

The header remains visible across all pages.

```
Breadcrumbs

Search

Notifications

Theme Toggle

Profile Menu
```

---

# Global Search

Shortcut

```
Ctrl + K
```

Searches across

Projects

Documents

Reports

Knowledge Graph

Regulations

Policies

AI Conversations (Future)

---

# Breadcrumbs

Every page should display breadcrumbs.

Example

```
Dashboard

↓

Projects

↓

POSH Compliance 2026

↓

Reports

↓

Compliance Report
```

---

# Page Actions

Every major page has a primary CTA.

Dashboard

```
New Analysis
```

Projects

```
Create Project
```

Documents

```
Upload Documents
```

Knowledge Graph

```
Explore Graph
```

Compliance

```
Run Analysis
```

Reports

```
Export Report
```

Team

```
Invite Member
```

---

# Role-Based Navigation

## Workspace Admin

Visible

- Dashboard
- Projects
- Documents
- Knowledge Graph
- Compliance
- Reports
- AI Assistant
- Team
- Settings

---

## Legal Analyst

Visible

- Dashboard
- Projects
- Documents
- Knowledge Graph
- Compliance
- Reports
- AI Assistant

Hidden

Settings

Billing

---

## Reviewer

Visible

- Dashboard
- Reports
- Knowledge Graph
- AI Assistant

Hidden

Projects

Documents

Team

Settings

---

## Viewer

Visible

- Dashboard
- Reports

Hidden

Projects

Documents

Compliance

Knowledge Graph

Team

Settings

---

# Mobile Navigation

Desktop

Persistent sidebar.

Tablet

Collapsible sidebar.

Mobile

Bottom navigation.

```
Dashboard

Projects

Reports

AI

More
```

The "More" menu contains

- Documents
- Knowledge Graph
- Team
- Settings

---

# Navigation States

Each navigation item supports

Default

Hover

Active

Disabled

Loading

Active state should use the existing LexisGraph design tokens.

---

# Route Naming Convention

```
/

/projects

/projects/:projectId

/projects/:projectId/documents

/projects/:projectId/analysis

/projects/:projectId/reports

/projects/:projectId/knowledge-graph

/documents

/compliance

/reports

/assistant

/team

/settings
```

Use kebab-case for multi-word routes.

Avoid abbreviations.

---

# Future Navigation

The navigation is designed to support additional enterprise modules.

Examples

```
Notifications

Audit Logs

Integrations

Billing

Marketplace

API Management

Continuous Monitoring

Policy Library
```

These modules can be added without restructuring the existing navigation.

---

# Summary

The LexisGraph navigation system is designed around workspaces and projects, enabling users to move naturally from executive dashboards to detailed compliance workflows. It emphasizes consistency, scalability, and role-based access while leaving room for future enterprise capabilities such as audit logs, integrations, and continuous monitoring.