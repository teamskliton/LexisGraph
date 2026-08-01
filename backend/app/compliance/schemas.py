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
