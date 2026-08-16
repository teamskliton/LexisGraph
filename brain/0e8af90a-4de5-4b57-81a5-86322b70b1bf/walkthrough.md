# Walkthrough — Sprint 7.8: Resolved Finding Reopening & Continuous Compliance Control

Sprint 7.8 introduces controlled, multi-period reopening of previously resolved findings in LexisGraph to enforce continuous compliance.

---

## Key Changes Delivered

### 1. Database Layer (`backend/app/compliance/models.py`, `backend/app/db/models/__init__.py`)
- **`FindingResolutionHistory` Model**:
  - `id`: UUID Primary Key
  - `finding_id`: Foreign Key referencing `report_findings.id` (Indexed, CASCADE)
  - `organization_id`: Foreign Key referencing `organizations.id` (Multi-tenant isolation)
  - `resolution_number`: Sequential integer tracking resolution periods (1, 2, 3, ...)
  - `resolved_at`: Datetime when resolution occurred
  - `resolved_by`: User UUID who resolved the finding
  - `resolution_note`: Text justification for resolution
  - `reopened_at`: Datetime when reopened
  - `reopened_by`: User UUID who reopened the finding
  - `reopen_reason`: Mandatory reason why finding was reopened
  - `status`: Lifecycle snapshot (`RESOLVED` or `REOPENED`)
  - Relationships to `ReportFinding`, resolver `User`, and reopener `User`.
- **`ReportFinding` Model**:
  - Added `reopened_by`, `reopened_at`, `reopener` relationship, and `resolutions` relationship ordered by `resolution_number.asc()`.

---

### 2. Schemas & DTOs (`backend/app/schemas/finding.py`)
- **`FindingReopenRequest`**: Enforces non-empty mandatory `reopen_reason` (`min_length=1`).
- **`FindingResolutionHistoryItem`**: Serializes resolution periods including resolved/reopened timestamps, actor names, notes, and reasons.
- **`FindingItemResponse`**: Serializes `reopened_by`, `reopened_by_name`, `reopened_at`, `reopen_reason`, and `resolution_history: List[FindingResolutionHistoryItem]`.

---

### 3. API Endpoints & State Machine (`backend/app/routes/findings.py`)
- **`POST /findings/{id}/reopen`**:
  - Enforces Organization Admin authorization (403 Forbidden for Reviewers/Viewers/Cross-org).
  - Enforces current status must be `RESOLVED` (409 Conflict if not resolved).
  - Uses `with_for_update()` database row locking to guarantee atomic concurrency protection.
  - Updates latest `FindingResolutionHistory` record with `reopened_at`, `reopened_by`, `reopen_reason`, and `status="REOPENED"`.
  - Transitions Finding `lifecycle_status` to `"REOPENED"`.
  - Resets `FindingRemediation.status` to `"IN_PROGRESS"` while preserving all historical remediation cycles, evidence attachments, and reviews.
  - Emits exactly 1 `FINDING_REOPENED` audit event and 1 in-app `FINDING_REOPENED` notification.
- **`POST /findings/{id}/resolve`**:
  - Automatically records/appends sequential `FindingResolutionHistory` entries with incrementing `resolution_number`.
  - Preserves multi-period resolution audit records across successive remediation/reopen cycles.
- **`GET /findings/{id}/resolutions`**:
  - Returns chronological resolution history periods for any finding.

---

### 4. Remediation Workflow Continuation (`backend/app/routes/remediations.py`)
- When a reopened finding is remediated and re-submitted:
  - `submit_remediation_for_review` queries the latest `RemediationCycle` and increments `cycle_number` (e.g. Cycle 4 follows Cycle 3).
  - All past cycles, evidence snapshots, and rejection/verification notes remain intact and accessible.

---

### 5. Frontend UI & UX (`client/src/`)
- **`services/api/findings.ts`**:
  - Added `FindingResolutionHistory` interface.
  - Updated `FindingDetail` and `FindingItem` with `reopened_by`, `reopened_by_name`, `reopened_at`, and `resolution_history`.
  - Updated `reopenFinding(findingId, reopenReason)` and added `getFindingResolutions(findingId)`.
- **`FindingDetailDrawer.tsx`**:
  - **Reopened Status Banner**: Clear amber banner showing "Finding Reopened — Active Remediation Required", reopener name, timestamp, and reopen reason.
  - **Resolution History Section**: Dedicated multi-period card displaying chronological resolution periods, showing Resolution #, Resolved at/by, notes, Reopened at/by, and reopen reasons.
  - **Reopen Confirmation Modal**: Enforces mandatory reason, displays finding ID & status summary snapshot, and shows loading spinner.
  - **Resolved Controls**: Only Organization Admins see the `[Reopen Finding]` button.

---

## Verification & Test Results

### 1. Dedicated Sprint 7.8 Backend Test Suite (`test_finding_reopening_and_continuous_compliance.py`)
**15 passed out of 15 tests (100% pass rate):**
- `test_1_resolved_finding_can_be_reopened_by_admin`: PASS
- `test_2_reviewer_cannot_reopen_finding` (403): PASS
- `test_3_viewer_cannot_reopen_finding` (403): PASS
- `test_4_non_resolved_finding_cannot_be_reopened` (409): PASS
- `test_5_reopen_requires_mandatory_reason` (422/400): PASS
- `test_6_reopen_creates_exactly_one_activity_event`: PASS
- `test_7_reopen_creates_exactly_one_notification`: PASS
- `test_8_repeated_reopen_request_is_rejected` (409): PASS
- `test_9_concurrent_reopen_requests_produce_one_transition`: PASS
- `test_10_previous_resolution_history_remains_unchanged`: PASS
- `test_11_previous_remediation_cycles_remain_unchanged`: PASS
- `test_12_new_remediation_cycle_continues_sequential_numbering` (Cycle 3 follows Cycle 2): PASS
- `test_13_cross_organization_reopen_fails`: PASS
- `test_14_previous_evidence_remains_available`: PASS
- `test_15_full_end_to_end_reopen_and_re_resolution_workflow` (Multi-period resolution): PASS

```
======================= 15 passed in 3.31s =======================
```

### 2. Full Test Suite Regression Pass
- **288 backend tests passed** across all lifecycle, RBAC, remediation, notification, and audit modules.
- **Frontend Turbopack build succeeded with 0 errors** (`npm run build`).
