# Implementation Plan — Sprint 7.9: Compliance Reassessment & Finding Change Detection

## Goal Description
Connect compliance findings with subsequent analysis and document/policy/regulation changes. When a previously resolved finding is affected by new analysis or document changes, mark it as `REASSESSMENT_REQUIRED` without automatically reopening it, allowing an authorized Admin to review the delta and decide whether to **[Keep Resolved]** or **[Reopen Finding]**.

---

## Proposed Changes

### 1. Database Layer (`backend/app/compliance/models.py`)
- Add reassessment metadata columns to `ReportFinding`:
  - `reassessment_trigger: str | None` (`NEW_ANALYSIS`, `DOCUMENT_UPDATE`, `POLICY_UPDATE`, `REGULATION_UPDATE`)
  - `reassessment_reason: str | None` (Text explanation)
  - `reassessment_document_id: UUID | None` (Foreign key to `documents.id`)
  - `reassessment_document_name: str | None` (Title or version of changed document)
  - `reassessment_report_id: UUID | None` (Foreign key to `compliance_reports.id`)
  - `reassessment_detected_at: datetime | None` (Timestamp when reassessment was triggered)
- Add Alembic migration `w0123x01y2z3_add_reassessment_fields_to_report_findings.py`.

### 2. Pydantic Schemas (`backend/app/schemas/finding.py`)
- Add `FindingReassessmentDetailResponse`, `FindingPreviousResolutionSummary`, `FindingCandidateAnalysisSummary`.
- Add `FindingReassessmentKeepResolvedRequest` (`admin_note: str | None`).
- Add `FindingReassessmentTriggerRequest` (`trigger: str`, `reason: str`, `document_id: UUID | None`, `document_name: str | None`, `report_id: UUID | None`).
- Add reassessment fields to `FindingItemResponse`.

### 3. Compliance Engine Integration (`backend/app/services/compliance_engine.py`)
- When compliance analysis runs on a report:
  - For evaluated clauses with `NON_COMPLIANT` or `PARTIALLY_COMPLIANT`:
  - Query existing resolved findings in the same organization matching the regulation clause / policy clause.
  - If a matching resolved finding exists:
    - Mark as `REASSESSMENT_REQUIRED` (do NOT create duplicate finding, do NOT automatically reopen).
    - Set `reassessment_trigger = "NEW_ANALYSIS"`, `reassessment_reason = "New compliance analysis detected compliance gap in associated policy."`, `reassessment_document_id = report.policy_document_id`, `reassessment_document_name = doc_name`, `reassessment_report_id = report.id`, `reassessment_detected_at = now`.
    - Idempotently emit ONE `FINDING_REASSESSMENT_REQUIRED` Activity event.
    - Idempotently emit ONE `FINDING_REASSESSMENT_REQUIRED` Notification to Org Admins.

### 4. API Endpoints (`backend/app/routes/findings.py`)
- `GET /findings/{finding_id}/reassessment`:
  - Returns structured reassessment context (trigger, reason, changed document, previous resolution info, candidate analysis details).
- `POST /findings/{finding_id}/reassessment/keep-resolved`:
  - Admin only (403 for Reviewer/Viewer).
  - Target finding must be `REASSESSMENT_REQUIRED` (409 if not).
  - Transitions `lifecycle_status` back to `"RESOLVED"`.
  - Clears active reassessment trigger while recording `FINDING_REASSESSMENT_COMPLETED` Activity event and audit log.
- `POST /findings/{finding_id}/reassessment/reopen`:
  - Admin only (403 for Reviewer/Viewer).
  - Target finding must be `REASSESSMENT_REQUIRED` (or `RESOLVED`) (409 if not).
  - Invokes Sprint 7.8 reopening workflow: `lifecycle_status = "REOPENED"`, updates resolution history, resets remediation to `IN_PROGRESS`, preserves historical cycles & evidence, emits `FINDING_REOPENED` event & notification.
- `POST /findings/{finding_id}/reassessment/trigger`:
  - Explicitly trigger reassessment for a resolved finding upon document/policy/regulation update.

### 5. Frontend Types & Services (`client/src/services/api/findings.ts`)
- Add `FindingReassessmentDetail` interface.
- Add reassessment methods: `getReassessment(findingId)`, `keepResolved(findingId, adminNote)`, `reopenFromReassessment(findingId, reopenReason)`, `triggerReassessment(findingId, data)`.
- Update `FindingDetail` and `FindingItem` with reassessment fields.

### 6. Frontend UI (`client/src/components/compliance/FindingDetailDrawer.tsx` & Workspaces)
- **Reassessment Alert Banner**: High-visibility banner when `lifecycle_status === "REASSESSMENT_REQUIRED"`. Shows Reason, Changed Document / Version, Detected timestamp, and Previous Resolution summary.
- **Reassessment Modal / Review Drawer**:
  - Modal with detailed comparison (Previous Resolution, What Changed, Changed Source Document, Candidate Analysis findings).
  - Actions: **[Keep Resolved]** (prompts for optional admin note) and **[Reopen Finding]** (prompts for reopen reason).
- **Workspace Status Badges & Filters**:
  - Include `REASSESSMENT_REQUIRED` badge ("REASSESSMENT REQUIRED", purple/amber styling).
  - Filter option "Needs Reassessment".

---

## Verification Plan

### Automated Tests
- Create `backend/tests/test_compliance_reassessment_and_change_detection.py` with 17+ comprehensive tests:
  1. `test_resolved_finding_becomes_reassessment_required`
  2. `test_unrelated_finding_not_marked_reassessment_required`
  3. `test_document_update_identifies_related_finding`
  4. `test_duplicate_trigger_does_not_create_duplicate_reassessment`
  5. `test_duplicate_trigger_does_not_create_duplicate_notification`
  6. `test_admin_can_get_reassessment_details`
  7. `test_admin_can_keep_resolved`
  8. `test_keep_resolved_returns_finding_to_resolved`
  9. `test_keep_resolved_creates_activity_event`
  10. `test_admin_can_reopen_from_reassessment`
  11. `test_reopen_follows_sprint_7_8_workflow`
  12. `test_reviewer_cannot_make_reassessment_decision` (403 Forbidden)
  13. `test_viewer_cannot_make_reassessment_decision` (403 Forbidden)
  14. `test_cross_organization_reassessment_fails` (403/404)
  15. `test_previous_resolution_remains_intact`
  16. `test_previous_remediation_history_remains_intact`
  17. `test_previous_evidence_remains_intact`
  18. `test_full_end_to_end_reassessment_workflow_both_paths` (Path A: Keep Resolved; Path B: Reopen -> Remediation -> Verify -> Approve -> Re-resolve)

### Full Regression & Build Tests
- Run `python -m pytest tests/`
- Run `npm run build` in `client/`
