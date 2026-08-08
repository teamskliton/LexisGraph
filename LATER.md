# LEXISGRAPH — PROJECT DEFERRED WORK REGISTER

This file is the official deferred-work register for LexisGraph.

> **IMPORTANT:**
> Do **NOT** implement the items listed below now.
> Only document them.
> The purpose is to prevent AI development agents from prematurely implementing future functionality.

---

## CURRENT PRODUCT PRINCIPLE

LexisGraph already has:

**Frontend:**
- Next.js
- Tailwind CSS
- shadcn/ui
- Existing LexisGraph design system

**Backend:**
- Existing working backend

**Databases:**
- PostgreSQL
- Qdrant
- Neo4j

These systems are already being used locally through Docker.

- Do not replace existing architecture.
- Do not introduce duplicate infrastructure.

---

## DEFERRED FEATURES

### 1. Advanced Real-Time Analysis Events

**Future capability:**
Backend should emit granular analysis events such as:
- Analysis submitted
- Document parsing started
- Document parsing completed
- Clause extraction started
- Clause extraction completed
- Embedding generation
- Knowledge graph update
- GraphRAG retrieval
- Gap detection
- Recommendation generation
- Report generation
- Analysis completed

**Potential implementation:**
`analysis_events` table or event stream.

*Do NOT implement now. Current implementation should use existing analysis/job status APIs.*

---

### 2. Advanced Live Analysis Progress

**Future capability:**
Real percentage-based progress based on actual backend pipeline stages.

- Do NOT simulate percentages.
- Do NOT implement fake progress.
- Only implement when backend provides reliable progress information.

---

### 3. Report Version Comparison

**Future capability:**
Compare two compliance reports.

*Example:*
Report 2026-01 vs Report 2026-06

*Show:*
- New findings
- Resolved findings
- Changed clauses
- Risk changes
- Compliance score changes

*Do NOT implement until backend provides reliable historical comparison data.*

---

### 4. Finding Approval Workflow

**Future capability:**
Reviewer can:
- Approve finding
- Reject finding
- Mark as accepted risk
- Assign finding
- Add resolution status

*Do NOT implement unless backend supports persistent finding-review state.*

---

### 5. Comments and Mentions

**Future capability:**
Users can comment on:
- Findings
- Reports
- Policies
- Analysis results

*Support:*
- @mentions
- Replies
- Resolved comments

*Do NOT implement until backend collaboration APIs exist.*

---

### 6. Advanced Report Collaboration

**Future capability:**
Multiple legal users collaboratively review a report.

*Potential capabilities:*
- Assign reviewer
- Review status
- Approval workflow
- Review history
- Notifications

*Do NOT implement now.*

---

### 7. Regulatory Change Monitoring

**Future capability:**
Detect regulation changes automatically.

*Workflow:*
`Regulation updated` ➔ `Affected policies detected` ➔ `Affected organizations identified` ➔ `Legal team notified` ➔ `Re-analysis suggested`

*Do NOT implement until backend monitoring infrastructure exists.*

---

### 8. Law Firm Multi-Client Management

**Future capability:**
Law firm workspace:
```
Law Firm
├── Client A
├── Client B
├── Client C
└── Client D
```

Each client must have isolated:
- Policies
- Analyses
- Reports
- Compliance history
- Knowledge graph context

*Do NOT implement until the current organization model is audited and the required tenant architecture is confirmed.*

---

### 9. Advanced Organization Roles

**Future capability:**
Fine-grained RBAC.

*Roles:*
- Admin
- Legal Analyst
- Reviewer
- Viewer

*Possible permissions:*
- `upload_policy`
- `run_analysis`
- `view_reports`
- `approve_findings`
- `manage_team`
- `manage_settings`

*Do NOT invent frontend-only permissions. Implement only when backend authorization supports them.*

---

### 10. Enterprise SSO

**Future capability:**
- Microsoft Entra ID / Azure AD
- SAML
- OIDC
- Enterprise identity management

*Do NOT implement now.*

---

### 11. Regulatory Notifications

**Future capability:**
Notification center for:
- New regulations
- Regulation updates
- Affected policies
- Failed analyses
- Completed analyses
- Review assignments

*Do NOT implement until notification backend exists.*

---

### 12. Advanced AI Assistant Memory

**Future capability:**
Persistent conversations.

*Potential:*
- Conversation history
- Saved conversations
- Organization context
- Analysis context
- Report context
- User context

*Do NOT implement until the AI assistant architecture supports persistence.*

---

### 13. Advanced Knowledge Graph Analytics

**Future capability:**
- Graph analytics
- Impact analysis
- Regulation dependency analysis
- Policy coverage analysis
- Graph path explanations
- Graph snapshots

*Do NOT implement now.*

---

### 14. Billing and Subscription Management

**Future capability:**
- Plans
- Usage limits
- Invoices
- Payment processing
- Subscription management

*Do NOT implement now.*

---

### 15. Audit Log

**Future capability:**
Immutable organization activity history.

*Examples:*
- User logged in
- Policy uploaded
- Analysis started
- Report exported
- Finding approved
- Member invited

*Do NOT implement until backend audit infrastructure exists.*

---

### 16. Production Infrastructure

**Future:**
- PostgreSQL managed deployment
- Qdrant production deployment
- Neo4j production deployment
- Object storage
- Redis
- Background workers
- Queue infrastructure
- Observability
- Centralized logging
- Error tracking
- Backups
- Disaster recovery

*Do NOT implement during frontend product development unless explicitly requested.*

---

### 17. Finding Lifecycle State Mutations & Assignments

**Future capability:**
- Finding lifecycle state machine transition mutations (`OPEN` → `UNDER_REVIEW` → `RESOLVED` → `ACCEPTED_RISK`).
- Legal reviewer assignment to specific findings (`assigned_to_user_id`).
- Finding remediation comment threads & internal discussion logs.
- Finding batch status update actions.

*Do NOT implement now. Current Findings Workspace is read-only based on compliance audit evaluation outputs.*

---

### 18. Recommendation Remediation Workflows & Status Mutations

**Future capability:**
- Recommendation status lifecycle state transitions (`OPEN` → `REVIEWED` → `COMPLETED` → `DISMISSED`).
- Automated policy clause amendment generator based on recommendations.
- Recommendation owner assignment & deadline tracking.

*Do NOT implement now. Recommendations Workspace is read-only based on compliance audit evaluation outputs.*

---

### 19. Native DOCX Export & Signed Shareable Links

**Future capability:**
- Native DOCX document generation architecture for compliance reports (`.docx`).
- Time-limited signed URL generation for external auditor downloads.
- Watermarking & digital signature verification for exported PDF/DOCX files.

*Do NOT implement now. PDF export is fully supported via reportService.downloadReportPdf.*

---

## RULE FOR FUTURE AI AGENTS

Before implementing any feature:

1. Check `LATER.md`.
2. If the requested feature appears here, do not automatically implement it.
3. Determine whether the current sprint explicitly requires it.
4. If not required, leave it deferred.
5. If a current feature depends on it, report the dependency before modifying architecture.
6. Never create fake backend capabilities merely to make the UI appear functional.

---

## UPDATE POLICY

AI agents may append new future work to this file when they discover:
- Missing backend capabilities
- Architecture improvements
- Non-MVP features
- Future enterprise requirements
- Performance improvements that are not currently necessary

They must **NOT** silently remove deferred items.

Keep this file concise and organized.
