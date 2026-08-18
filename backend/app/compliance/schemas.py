"""
Compliance domain Pydantic schemas.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.compliance.models import ComplianceReportStatus, ComplianceJobStatus


class ComplianceAnalyzeRequest(BaseModel):
    """Schema for initiating compliance analysis."""

    organization_id: uuid.UUID
    regulation_id: uuid.UUID | None = None
    regulation_document_id: uuid.UUID | None = None
    policy_document_id: uuid.UUID

    @model_validator(mode="before")
    @classmethod
    def populate_regulation_id(cls, data: Any) -> Any:
        if isinstance(data, dict):
            reg_id = data.get("regulation_id") or data.get("regulation_document_id")
            if reg_id:
                data["regulation_id"] = reg_id
                data["regulation_document_id"] = reg_id
        return data


class ComplianceAnalyzeResponse(BaseModel):
    """Schema returned immediately by POST /compliance/analyze (< 1 sec)."""

    job_id: uuid.UUID
    status: str
    report_id: uuid.UUID | None = None
    existing_report: bool = False


class ComplianceJobResponse(BaseModel):
    """Schema returned by GET /jobs/{job_id} and GET /jobs."""

    id: uuid.UUID
    job_id: uuid.UUID
    report_id: uuid.UUID | None = None
    organization_id: uuid.UUID
    regulation_id: uuid.UUID
    regulation_document_id: uuid.UUID | None = None
    policy_document_id: uuid.UUID
    status: ComplianceJobStatus
    progress: int
    current_step: str
    error_message: str | None = None
    processing_time_ms: float | None = None
    processing_time: float | None = None
    created_by: uuid.UUID
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def populate_job_aliases(cls, data: Any) -> Any:
        if hasattr(data, "id"):
            job_id_val = getattr(data, "id")
            ms_val = getattr(data, "processing_time_ms", None)
            reg_val = getattr(data, "regulation_id", None)
            # Set virtual attributes for alias compatibility
            setattr(data, "job_id", job_id_val)
            setattr(data, "regulation_document_id", reg_val)
            setattr(data, "processing_time", (ms_val / 1000.0) if ms_val else None)
        elif isinstance(data, dict):
            data["job_id"] = data.get("job_id") or data.get("id")
            data["regulation_document_id"] = data.get("regulation_document_id") or data.get("regulation_id")
            if data.get("processing_time_ms") and not data.get("processing_time"):
                data["processing_time"] = data["processing_time_ms"] / 1000.0
        return data

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ComplianceReportCreate(BaseModel):
    """Schema for creating/initiating a compliance report."""

    organization_id: uuid.UUID
    regulation_id: uuid.UUID
    policy_document_id: uuid.UUID


class ComplianceReportUpdate(BaseModel):
    """Schema for updating an existing compliance report."""

    overall_score: float | None = Field(default=None, ge=0.0, le=100.0)
    total_clauses: int | None = None
    compliant_clauses: int | None = None
    partial_clauses: int | None = None
    non_compliant_clauses: int | None = None
    status: ComplianceReportStatus | None = None
    summary: str | None = None
    recommendations: Any | None = None
    processing_time_seconds: float | None = None
    processing_time_ms: float | None = None
    risk_level: str | None = None
    executive_summary: str | None = None
    report_json: Any | None = None


class ComplianceReportResponse(BaseModel):
    """Schema for returning compliance report details in API responses."""

    id: uuid.UUID
    organization_id: uuid.UUID
    regulation_id: uuid.UUID
    regulation_document_id: uuid.UUID | None = None
    policy_document_id: uuid.UUID
    overall_score: float | None = None
    total_clauses: int | None = None
    compliant_clauses: int | None = None
    partial_clauses: int | None = None
    non_compliant_clauses: int | None = None
    risk_level: str | None = None
    executive_summary: str | None = None
    total_matches: int | None = None
    total_partial_matches: int | None = None
    total_missing: int | None = None
    status: ComplianceReportStatus
    report_status: ComplianceReportStatus | None = None
    summary: str | None = None
    recommendations: Any | None = None
    details: dict[str, Any] | list[Any] | None = None
    report_json: Any | None = None
    processing_time_seconds: float | None = None
    processing_time_ms: float | None = None
    is_deleted: bool = False
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ---------------------------------------------------------------------------
# Sprint 8.1: Gap Analysis Schemas
# ---------------------------------------------------------------------------

class GapAnalysisFindingInfo(BaseModel):
    """Lightweight Finding reference attached to a gap analysis clause result."""

    finding_id: uuid.UUID
    lifecycle_status: str  # OPEN, IN_REVIEW, REMEDIATION, RESOLVED, REOPENED, REASSESSMENT_REQUIRED
    severity: str          # CRITICAL, HIGH, MEDIUM, LOW
    recommendation: str | None = None

    model_config = ConfigDict(from_attributes=True)


class GapAnalysisClauseResult(BaseModel):
    """
    Per-clause result produced by the gap analysis endpoint.

    coverage_status vocabulary (Sprint 8.1 spec):
      COVERED              - maps from COMPLIANT
      PARTIALLY_COVERED    - maps from PARTIALLY_COMPLIANT
      GAP                  - maps from NON_COMPLIANT
      UNABLE_TO_DETERMINE  - NON_COMPLIANT/PARTIALLY_COMPLIANT clauses whose
                             reasoning contains the heuristic fallback marker,
                             indicating LLM was unavailable and result is uncertain.
    """

    clause_index: int
    regulation_clause_id: str
    regulation_text: str

    # Coverage result
    coverage_status: str          # COVERED | PARTIALLY_COVERED | GAP | UNABLE_TO_DETERMINE
    raw_engine_status: str        # Original engine value: COMPLIANT | PARTIALLY_COMPLIANT | NON_COMPLIANT
    similarity_score: float
    confidence: str = "HIGH"      # HIGH | MEDIUM | LOW (Sprint 8.2)
    missing_aspects: list[str] = Field(default_factory=list)  # Specific missing requirements for Partial/Gap (Sprint 8.2)
    conflicting_evidence: bool = False  # True if contradictory policy provisions were detected (Sprint 8.2)
    reasoning: str
    recommendation: str | None = None

    # Policy evidence
    policy_clause_id: str | None = None
    policy_evidence: str | None = None   # matched_policy_text from the engine
    total_policy_matches: int = 0

    # Finding linkage (only for GAP and PARTIALLY_COVERED clauses)
    finding: "GapAnalysisFindingInfo | None" = None



class GapAnalysisCoverageSummary(BaseModel):
    """Aggregate coverage counts for the gap analysis response."""

    total_requirements: int
    covered: int
    partially_covered: int
    gap: int
    unable_to_determine: int

    covered_pct: float
    partial_pct: float
    gap_pct: float
    unable_pct: float


class GapAnalysisRegulationInfo(BaseModel):
    """Regulation metadata included in the gap analysis response."""

    id: uuid.UUID
    title: str
    act_name: str | None = None
    version: str | None = None
    act_year: int | None = None
    jurisdiction: str | None = None
    original_filename: str


class GapAnalysisPolicyInfo(BaseModel):
    """Policy document metadata included in the gap analysis response."""

    id: uuid.UUID
    original_filename: str
    document_type: str
    organization_id: uuid.UUID


class GapAnalysisResponse(BaseModel):
    """
    Full gap analysis response for GET /compliance/{report_id}/gap-analysis.

    Aggregates the existing ComplianceReport + ReportFindings + report_json
    evaluated_clauses into a structured traceability view.
    """

    report_id: uuid.UUID
    organization_id: uuid.UUID
    report_status: str               # PENDING | PROCESSING | COMPLETED | FAILED
    overall_score: float | None = None
    risk_level: str | None = None

    regulation: GapAnalysisRegulationInfo | None = None
    policy: GapAnalysisPolicyInfo | None = None

    coverage_summary: GapAnalysisCoverageSummary | None = None
    clauses: list[GapAnalysisClauseResult] = []

    # Stale analysis indicator
    is_stale: bool = False
    stale_reason: str | None = None   # e.g. "Policy document has been updated since this analysis"

    # Analysis metadata
    analysis_engine: str = "HYBRID_GRAPHRAG"
    analyzed_at: datetime | None = None
    processing_time_seconds: float | None = None

    model_config = ConfigDict(from_attributes=True)
