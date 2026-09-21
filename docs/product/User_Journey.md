# User Journey

Version: 1.0

Last Updated: August 2026

---

# Purpose

This document describes the complete end-to-end journey of users interacting with LexisGraph. It defines how organizations and law firms onboard, create projects, perform AI-powered compliance analyses, collaborate on findings, and maintain continuous compliance over time.

---

# Journey Overview

```
Landing Page
      │
      ▼
Authentication
      │
      ▼
Workspace Creation
      │
      ▼
Team Invitation (Optional)
      │
      ▼
Create First Project
      │
      ▼
Upload Company Documents
      │
      ▼
Select Applicable Regulations
      │
      ▼
AI Knowledge Graph Generation
      │
      ▼
Run Compliance Analysis
      │
      ▼
Review Interactive Report
      │
      ▼
Approve & Export
      │
      ▼
Continuous Monitoring
```

---

# Phase 1 – Discovery

## Goal

Introduce visitors to LexisGraph and communicate its value.

### Landing Page

Sections

- Hero
- Product Overview
- Key Features
- AI & Knowledge Graph
- Use Cases
- Customer Benefits
- Pricing (Future)
- FAQ
- Footer

Primary CTAs

- Get Started
- Book Demo
- Sign In

---

# Phase 2 – Authentication

Users can create an account or sign in.

Supported methods

- Email & Password
- Google
- Microsoft (Azure AD)

---

## Sign Up

Information collected

Required

- First Name
- Last Name
- Work Email
- Password

Optional during sign-up

- Company Name
- Organization Type

Additional details are collected during onboarding to reduce signup friction.

---

## Login

Returning users authenticate and are redirected to their workspace.

---

# Phase 3 – Workspace Onboarding

New users complete a guided onboarding experience.

---

## Step 1 – Create Workspace

Choose workspace type

- Organization
- Law Firm

Workspace details

- Workspace Name
- Industry
- Company Size

---

## Step 2 – Invite Team (Optional)

Invite team members by email.

Assign roles

- Workspace Admin
- Legal Analyst
- Reviewer
- Viewer

Users can skip this step.

---

## Step 3 – Create First Project

Examples

- POSH Compliance 2026
- DPDP Assessment
- Labour Code Review
- HR Policy Audit

Project information

- Name
- Description
- Applicable Regulation
- Department (optional)

---

## Step 4 – Upload Documents

Supported document categories

Internal

- HR Policy
- POSH Policy
- Leave Policy
- Code of Conduct
- Data Privacy Policy

External

- Acts
- Rules
- Notifications
- Regulations

Users can upload multiple files.

---

## Step 5 – Select Regulations

Choose one or more applicable regulations.

Examples

- POSH Act
- DPDP Act
- Companies Act
- Labour Code
- Factories Act

Future

- AI regulation recommendations

---

## Step 6 – AI Processing

After upload, LexisGraph automatically starts processing.

Pipeline

```
Upload Complete

↓

Extract Clauses

↓

Generate Embeddings

↓

Build Knowledge Graph

↓

GraphRAG Indexing

↓

AI Compliance Analysis

↓

Generate Report
```

A live progress screen displays the current stage.

---

# Phase 4 – Dashboard

After onboarding, users arrive at the Dashboard.

Purpose

Provide an executive overview of compliance health.

Widgets

- AI Executive Brief
- Knowledge Graph Overview
- Compliance KPIs
- Compliance Trends
- Risk Breakdown
- Recent Reports
- Activity Timeline

Primary actions

- Create Project
- Upload Documents
- Run Analysis

---

# Phase 5 – Project Workspace

Projects are the central workspace for compliance activities.

Each project contains

- Overview
- Documents
- Regulations
- Knowledge Graph
- Analyses
- Reports
- Timeline
- Comments (Future)

Typical workflow

```
Open Project

↓

Upload Documents

↓

Run Analysis

↓

Review Findings

↓

Approve Report
```

---

# Phase 6 – AI Compliance Analysis

Users initiate a compliance analysis.

Flow

```
Select Project

↓

Choose Documents

↓

Choose Regulations

↓

Start Analysis

↓

Background Processing

↓

Interactive Report
```

Analysis stages

- Document Parsing
- Clause Extraction
- Entity Recognition
- Knowledge Graph Construction
- GraphRAG Retrieval
- LLM Analysis
- Gap Detection
- Report Generation

---

# Phase 7 – Interactive Report

Reports present AI-generated findings in a structured format.

Sections

- Executive Summary
- Compliance Score
- Findings
- Missing Clauses
- Conflicting Clauses
- Outdated References
- Supporting Evidence
- Recommendations

Actions

- View Graph
- Download PDF
- Export DOCX
- Share Report

---

# Phase 8 – Knowledge Graph

Users can explore relationships extracted during analysis.

Capabilities

- Search
- Zoom
- Filter
- View connected entities
- Navigate relationships

Selecting a finding highlights the related graph nodes and source documents.

---

# Phase 9 – AI Assistant

Users interact with the AI Assistant using natural language.

Example questions

- Which policies violate DPDP?
- Explain this compliance gap.
- Summarize this report.
- Show missing clauses.
- Generate a compliant policy clause.
- Compare two policy versions.

Responses include supporting evidence from the Knowledge Graph.

---

# Phase 10 – Collaboration

Team members collaborate within projects.

Supported actions

- Comment
- Mention teammates
- Review findings
- Approve reports
- Request changes

Future

- Version comparison
- Assignments
- Approval workflows

---

# Phase 11 – Export & Share

Users can distribute compliance reports.

Export options

- PDF
- DOCX

Future

- Secure Share Link
- Email Reports
- Scheduled Reports

---

# Phase 12 – Continuous Monitoring

LexisGraph continuously monitors regulatory changes.

Future capabilities

- Regulation alerts
- Compliance reminders
- Automatic re-analysis
- Risk notifications

Example workflow

```
New Regulation Published

↓

Affected Projects Identified

↓

Notify Users

↓

Run AI Re-analysis

↓

Generate Updated Report
```

---

# Returning User Journey

Returning users follow a shorter workflow.

```
Login

↓

Dashboard

↓

Open Project

↓

Continue Analysis

↓

Review Reports

↓

AI Assistant

↓

Logout
```

---

# Law Firm Journey

Law firms manage multiple client organizations.

```
Login

↓

Select Client Workspace

↓

Open Client Project

↓

Upload Client Documents

↓

Run Compliance Analysis

↓

Generate Client Report

↓

Export & Share
```

Each client remains fully isolated.

---

# Success Indicators

A successful user journey should enable users to:

- Create a workspace within minutes.
- Upload documents without confusion.
- Run compliance analyses with minimal setup.
- Understand AI-generated findings.
- Collaborate with teammates.
- Export reports confidently.
- Monitor compliance continuously.

---

# Journey Principles

Every interaction within LexisGraph should follow these principles.

## Simplicity

Reduce unnecessary steps while keeping workflows clear.

---

## Explainability

AI outputs must always provide supporting evidence.

---

## Transparency

Users should know what the AI is doing during processing.

---

## Collaboration

Support teamwork through shared projects and structured review.

---

## Scalability

The same journey should work for startups, enterprises, and law firms managing multiple clients.

---

# Summary

The LexisGraph user journey is designed to guide users from initial onboarding to long-term compliance management through a structured, AI-assisted workflow. By organizing work around projects and combining Knowledge Graphs, GraphRAG, and explainable AI, the platform enables organizations and law firms to manage compliance efficiently, collaborate effectively, and adapt to evolving regulations.