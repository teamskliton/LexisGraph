"""
Report Pydantic schemas for request validation and response serialization.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.compliance.models import ComplianceReportStatus


class ReportBase(BaseModel):
    """Base schema containing common attributes for reports."""

    title: Optional[str] = Field(None, description="Optional title of the report")
    description: Optional[str] = Field(None, description="Optional description of the report")


class ReportCreate(ReportBase):
    """Schema for creating a new report."""

    pass


class ReportUpdate(BaseModel):
    """Schema for updating an existing report."""

    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None)


class ReportItemResponse(BaseModel):
    """Schema for report summary items returned in list/paginated endpoints."""

    id: uuid.UUID
    organization_id: uuid.UUID
    regulation_id: Optional[uuid.UUID] = None
    regulation_document_id: Optional[uuid.UUID] = None
    policy_document_id: Optional[uuid.UUID] = None
    overall_score: Optional[float] = None
    risk_level: Optional[str] = None
    total_matches: Optional[int] = None
    total_partial_matches: Optional[int] = None
    total_missing: Optional[int] = None
    report_status: ComplianceReportStatus
    created_at: datetime
    processing_time_seconds: Optional[float] = None
    processing_time_ms: Optional[float] = None
    is_deleted: bool = False
    open_count: Optional[int] = 0
    in_review_count: Optional[int] = 0
    remediation_count: Optional[int] = 0
    resolved_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ReportPaginatedResponse(BaseModel):
    """Paginated response schema for GET /reports."""

    total: int = Field(..., description="Total number of matching reports")
    page: int = Field(..., description="Current page number (1-indexed)")
    page_size: int = Field(..., description="Number of items per page")
    items: List[ReportItemResponse] = Field(..., description="List of report summary items")


class ReportDetailResponse(BaseModel):
    """Detailed response schema for GET /reports/{report_id}."""

    id: uuid.UUID
    organization_id: uuid.UUID
    regulation_id: uuid.UUID
    regulation_document_id: Optional[uuid.UUID] = None
    policy_document_id: uuid.UUID
    overall_score: Optional[float] = None
    risk_level: Optional[str] = None
    summary: Optional[str] = None
    executive_summary: Optional[str] = None
    recommendations: Optional[Any] = None
    total_clauses: Optional[int] = None
    compliant_clauses: Optional[int] = None
    partial_clauses: Optional[int] = None
    non_compliant_clauses: Optional[int] = None
    total_matches: Optional[int] = None
    total_partial_matches: Optional[int] = None
    total_missing: Optional[int] = None
    processing_time_seconds: Optional[float] = None
    processing_time_ms: Optional[float] = None
    report_json: Optional[Any] = None
    report_status: ComplianceReportStatus
    is_deleted: bool = False
    created_at: datetime
    updated_at: datetime
    open_count: Optional[int] = 0
    in_review_count: Optional[int] = 0
    remediation_count: Optional[int] = 0
    resolved_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)



# Backwards compatibility alias
ReportResponse = ReportDetailResponse
