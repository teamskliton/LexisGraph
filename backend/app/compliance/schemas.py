"""
Compliance domain Pydantic schemas.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.compliance.models import ComplianceReportStatus


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
    """Schema returned by POST /compliance/analyze."""

    report_id: uuid.UUID
    status: ComplianceReportStatus


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


class ComplianceReportResponse(BaseModel):
    """Schema for returning compliance report details in API responses."""

    id: uuid.UUID
    organization_id: uuid.UUID
    regulation_id: uuid.UUID
    policy_document_id: uuid.UUID
    overall_score: float | None = None
    total_clauses: int | None = None
    compliant_clauses: int | None = None
    partial_clauses: int | None = None
    non_compliant_clauses: int | None = None
    status: ComplianceReportStatus
    report_status: ComplianceReportStatus | None = None
    summary: str | None = None
    recommendations: Any | None = None
    details: dict[str, Any] | list[Any] | None = None
    processing_time_seconds: float | None = None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
