"""
Pydantic schemas for Policy Formation Organization Assessment.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ProfileStepAnswers(BaseModel):
    organization_name: str = Field(default="", max_length=200)
    org_type: str = Field(default="Startup")  # Startup, Established company, Nonprofit, Public-sector organization, Other
    custom_org_type: Optional[str] = Field(default=None, max_length=100)
    industry: str = Field(default="", max_length=150)
    sub_industry: Optional[str] = Field(default=None, max_length=150)
    description: Optional[str] = Field(default=None, max_length=2000)
    products_services: Optional[str] = Field(default=None, max_length=1000)
    employee_count: str = Field(default="1-10")
    parent_org: Optional[str] = Field(default=None, max_length=200)


class JurisdictionStepAnswers(BaseModel):
    primary_country: str = Field(default="", max_length=100)
    state_province: Optional[str] = Field(default=None, max_length=100)
    other_countries: List[str] = Field(default_factory=list)
    operating_locations: Optional[str] = Field(default=None, max_length=1000)
    markets_served: Optional[str] = Field(default=None, max_length=1000)
    regulated_activities: Optional[str] = Field(default=None, max_length=1000)


class ActivitiesStepAnswers(BaseModel):
    personal_data: bool = Field(default=False)
    sensitive_data: bool = Field(default=False)
    cloud_services: bool = Field(default=False)
    ai_systems: bool = Field(default=False)
    payments: bool = Field(default=False)
    employment_types: List[str] = Field(default_factory=list)  # Direct full-time, Contractors, Freelancers, Interns
    vendors: bool = Field(default=False)
    physical_facilities: bool = Field(default=False)
    licensed_activities: bool = Field(default=False)
    notes: Optional[str] = Field(default=None, max_length=2000)


class ScopeStepAnswers(BaseModel):
    scope_type: str = Field(default="ORGANIZATION")  # ORGANIZATION, BRANCH, DEPARTMENT, OTHER
    branch_name: Optional[str] = Field(default=None, max_length=200)
    branch_location: Optional[str] = Field(default=None, max_length=200)
    branch_activities: Optional[str] = Field(default=None, max_length=1000)
    has_central_policies: Optional[bool] = Field(default=None)
    follows_central_policies: Optional[bool] = Field(default=None)
    department_name: Optional[str] = Field(default=None, max_length=200)
    department_activities: Optional[str] = Field(default=None, max_length=1000)
    other_scope_description: Optional[str] = Field(default=None, max_length=1000)


class ExistingPoliciesStepAnswers(BaseModel):
    has_existing_policies: bool = Field(default=False)
    starting_mode: str = Field(default="scratch")  # scratch, build_on_existing
    selected_policy_ids: List[str] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)  # e.g. ISO 27001, SOC 2, HIPAA, GDPR, PCI-DSS
    commitments: Optional[str] = Field(default=None, max_length=1000)
    implemented_controls: Optional[str] = Field(default=None, max_length=2000)
    notes: Optional[str] = Field(default=None, max_length=2000)


class AssessmentAnswers(BaseModel):
    profile: ProfileStepAnswers = Field(default_factory=ProfileStepAnswers)
    jurisdiction: JurisdictionStepAnswers = Field(default_factory=JurisdictionStepAnswers)
    activities: ActivitiesStepAnswers = Field(default_factory=ActivitiesStepAnswers)
    scope: ScopeStepAnswers = Field(default_factory=ScopeStepAnswers)
    existing_policies: ExistingPoliciesStepAnswers = Field(default_factory=ExistingPoliciesStepAnswers)


class AssessmentCreateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    scope_type: Optional[str] = Field(default="ORGANIZATION", max_length=50)
    resume_if_exists: bool = Field(default=True, description="If true, returns existing incomplete DRAFT if one exists")


class AssessmentUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    scope_type: Optional[str] = Field(default=None, max_length=50)
    current_step: Optional[int] = Field(default=None, ge=1, le=6)
    answers: Optional[Dict[str, Any]] = None


class AssessmentResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    created_by: Optional[uuid.UUID] = None
    title: str
    scope_type: str
    status: str
    current_step: int
    answers: Dict[str, Any]
    version: int
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AvailablePolicyItem(BaseModel):
    id: str
    title: str
    category: str
    uploaded_at: Optional[str] = None


class RegulatoryDiscoveryItem(BaseModel):
    regulation_id: str
    title: str
    act_name: Optional[str] = None
    legal_instrument_type: str = "Act of Parliament"
    jurisdiction: str
    issuing_authority: Optional[str] = None
    act_year: Optional[int] = None
    effective_date: Optional[str] = None
    commencement_status: str = "In force"
    applicability_thresholds: Optional[str] = None
    version: Optional[str] = None
    source_domain: Optional[str] = None
    source_reference: Optional[str] = None
    source_origin: str = "canonical_registry_reference"  # uploaded_document | canonical_registry_reference
    is_official_file_uploaded: bool = False
    source_document_id: Optional[str] = None
    relevant_provisions: List[str] = Field(default_factory=list)
    trigger_answers: List[str] = Field(default_factory=list)
    relevance_explanation: str
    evidence_status: str  # verified_source_requirement, potentially_applicable, requires_verification, not_enough_evidence, not_assessed
    retrieved_at: str


class PolicyNeedItem(BaseModel):
    need_id: str
    title: str
    category: str
    business_rationale: str
    linked_regulations: List[str] = Field(default_factory=list)
    linked_risks: List[str] = Field(default_factory=list)
    driver: str  # regulatory-driven, contract-driven, risk-driven, internal-governance
    suggested_priority: str  # Urgent, High, Medium, Low
    priority_rationale: str
    recommended_owner_role: str
    suggested_review_frequency: str
    evidence_confidence: str  # High, Medium, Requires Verification
    requires_human_confirmation: bool


class CoverageFindingItem(BaseModel):
    need_id: str
    policy_title: str
    linked_document_id: Optional[str] = None
    coverage_status: str  # Covered, Partially covered, Not found, Requires review, Not assessed
    matched_sections: List[str] = Field(default_factory=list)
    evidence_excerpt: Optional[str] = None
    reason: str
    limitations_note: str


class UserDecisionItem(BaseModel):
    decision: str = "ACCEPTED"  # ACCEPTED, DEFERRED, REJECTED, REQUIRES_VERIFICATION
    priority_override: Optional[str] = None  # Urgent, High, Medium, Low, or None
    notes: Optional[str] = None
    updated_at: Optional[str] = None


class UpdateDecisionsRequest(BaseModel):
    decisions: Dict[str, UserDecisionItem]
    expected_version: Optional[int] = None


class PolicyNeedsAnalysisResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    assessment_id: uuid.UUID
    created_by: Optional[uuid.UUID] = None
    status: str
    version: int
    summary: Dict[str, Any]
    regulatory_discoveries: List[Dict[str, Any]]
    policy_needs: List[Dict[str, Any]]
    coverage_findings: List[Dict[str, Any]]
    user_decisions: Dict[str, Any]
    history: List[Dict[str, Any]] = Field(default_factory=list)
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Stage 4: AI Policy Drafting & Editor Schemas
# ---------------------------------------------------------------------------

class PolicySectionItem(BaseModel):
    section_id: str
    section_number: str
    heading: str
    content: str
    rationale: Optional[str] = None
    source_clauses: List[str] = Field(default_factory=list)
    is_customized: bool = False
    last_regenerated_at: Optional[str] = None


class PolicyDraftCreateRequest(BaseModel):
    assessment_id: uuid.UUID
    analysis_id: uuid.UUID
    need_id: str
    force_preliminary: Optional[bool] = False  # Set to True when drafting from REQUIRES_VERIFICATION


class PolicyDraftUpdateRequest(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None  # DRAFTING, DRAFT_SAVED, NEEDS_VERIFICATION, READY_FOR_REVIEW
    metadata_properties: Optional[Dict[str, Any]] = None
    sections: Optional[List[PolicySectionItem]] = None
    expected_version: Optional[int] = None
    change_summary: Optional[str] = None


class PolicyDraftRegenerateSectionRequest(BaseModel):
    section_id: str
    custom_instructions: Optional[str] = None
    expected_version: Optional[int] = None


class PolicyDraftResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    assessment_id: uuid.UUID
    analysis_id: uuid.UUID
    analysis_version: int
    need_id: str
    created_by: Optional[uuid.UUID] = None
    title: str
    status: str
    version: int
    metadata_properties: Dict[str, Any]
    sections: List[PolicySectionItem]
    source_references: List[Dict[str, Any]]
    unresolved_questions: List[str]
    generation_metadata: Dict[str, Any]
    history: List[Dict[str, Any]] = Field(default_factory=list)

    # Stage 5 Approval & Publishing Lifecycle Fields
    assigned_reviewer_id: Optional[uuid.UUID] = None
    approved_by: Optional[uuid.UUID] = None
    approved_at: Optional[datetime] = None
    approved_version: Optional[int] = None
    content_hash: Optional[str] = None
    review_comments: Optional[str] = None
    rejection_reason: Optional[str] = None
    published_policy_id: Optional[uuid.UUID] = None
    published_at: Optional[datetime] = None
    effective_date: Optional[datetime] = None
    approval_history: List[Dict[str, Any]] = Field(default_factory=list)

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PolicyDraftListItem(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    assessment_id: uuid.UUID
    analysis_id: uuid.UUID
    need_id: str
    title: str
    status: str
    version: int
    owner_role: Optional[str] = None
    section_count: int
    has_unresolved_questions: bool
    assigned_reviewer_id: Optional[uuid.UUID] = None
    approved_at: Optional[datetime] = None
    published_policy_id: Optional[uuid.UUID] = None
    published_at: Optional[datetime] = None
    effective_date: Optional[datetime] = None
    updated_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# STAGE 5 SCHEMAS: APPROVAL, AUDIT & PUBLISHING
# ---------------------------------------------------------------------------

class EligibleReviewerItem(BaseModel):
    user_id: uuid.UUID
    id: Optional[uuid.UUID] = None
    full_name: str
    email: str
    role: str

    model_config = {"from_attributes": True}


class PolicyDraftSubmitReviewRequest(BaseModel):
    assigned_reviewer_id: Optional[uuid.UUID] = None
    reviewer_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    submission_notes: Optional[str] = None


class PolicyDraftApproveRequest(BaseModel):
    expected_version: int
    comments: Optional[str] = None


class PolicyDraftRequestRevisionRequest(BaseModel):
    expected_version: Optional[int] = None
    comments: str = Field(..., min_length=3, description="Reviewer feedback or required changes")


class PolicyDraftRejectRequest(BaseModel):
    expected_version: Optional[int] = None
    reason: str = Field(..., min_length=3, description="Documented justification for rejection")


class PolicyDraftPublishRequest(BaseModel):
    effective_date: Optional[datetime] = None
    expected_version: int


class PolicyApprovalAuditResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    draft_id: Optional[uuid.UUID] = None
    policy_document_id: Optional[uuid.UUID] = None
    draft_version: Optional[int] = None
    actor_id: Optional[uuid.UUID] = None
    actor_name: Optional[str] = None
    action: str
    previous_status: Optional[str] = None
    new_status: str
    comments: Optional[str] = None
    content_hash: Optional[str] = None
    metadata_snapshot: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    class Config:
        from_attributes = True





