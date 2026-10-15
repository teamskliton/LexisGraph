"""
Policy Formation API Routes: Organization Assessment & Policy Needs Analysis.
Enforces strict workspace isolation and multi-tenant authorization.
"""
from __future__ import annotations

import copy
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, desc, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.dependencies import get_current_user
from app.core.workspace_context import WorkspaceContext, get_active_workspace_context
from app.db.models.document import Document, DocumentType
from app.db.models.policy_formation import (
    OrganizationAssessment,
    PolicyNeedsAnalysis,
    PolicyDraft,
    PolicyApprovalAudit,
)
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.policy_formation import (
    AssessmentAnswers,
    AssessmentCreateRequest,
    AssessmentResponse,
    AssessmentUpdateRequest,
    AvailablePolicyItem,
    PolicyNeedsAnalysisResponse,
    UpdateDecisionsRequest,
    PolicyDraftCreateRequest,
    PolicyDraftUpdateRequest,
    PolicyDraftRegenerateSectionRequest,
    PolicyDraftResponse,
    PolicyDraftListItem,
    EligibleReviewerItem,
    PolicyDraftSubmitReviewRequest,
    PolicyDraftApproveRequest,
    PolicyDraftRequestRevisionRequest,
    PolicyDraftRejectRequest,
    PolicyDraftPublishRequest,
    PolicyApprovalAuditResponse,
)
from app.services.policy_formation_service import PolicyFormationAnalysisService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/policy-formation", tags=["policy-formation"])



class StartAnalysisRequest(BaseModel):
    assessment_id: uuid.UUID


# ---------------------------------------------------------------------------
# Workspace Security Verification Helpers
# ---------------------------------------------------------------------------

def _verify_assessment_access(
    assessment_id: uuid.UUID,
    db: Session,
    ws: WorkspaceContext,
) -> OrganizationAssessment:
    """
    Verify assessment exists and belongs strictly to the authorized workspace.
    Raises 404/403 on violation.
    """
    assessment = db.get(OrganizationAssessment, assessment_id)
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment session not found.",
        )

    if assessment.organization_id != ws.organization_id:
        logger.warning(
            "User %s attempted cross-workspace access to assessment %s (workspace %s vs requested %s)",
            ws.user.id,
            assessment_id,
            assessment.organization_id,
            ws.organization_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Assessment belongs to a different workspace.",
        )

    return assessment


def _verify_analysis_access(
    analysis_id: uuid.UUID,
    db: Session,
    ws: WorkspaceContext,
) -> PolicyNeedsAnalysis:
    """
    Verify policy needs analysis exists and belongs strictly to the authorized workspace.
    Raises 404/403 on violation.
    """
    analysis = db.get(PolicyNeedsAnalysis, analysis_id)
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Policy Needs Analysis not found.",
        )

    if analysis.organization_id != ws.organization_id:
        logger.warning(
            "User %s attempted cross-workspace access to analysis %s (workspace %s vs requested %s)",
            ws.user.id,
            analysis_id,
            analysis.organization_id,
            ws.organization_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Analysis belongs to a different workspace.",
        )

    return analysis


# ---------------------------------------------------------------------------
# Assessment Routes (/policy-formation/assessments/...)
# ---------------------------------------------------------------------------

@router.get("/assessments", response_model=List[AssessmentResponse], summary="List assessments for active workspace")
def list_assessments(
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> List[AssessmentResponse]:
    """Return all assessments belonging to the active workspace."""
    assessments = db.execute(
        select(OrganizationAssessment)
        .where(OrganizationAssessment.organization_id == ws.organization_id)
        .order_by(desc(OrganizationAssessment.updated_at))
    ).scalars().all()

    return [AssessmentResponse.model_validate(a) for a in assessments]


@router.post("/assessments", response_model=AssessmentResponse, status_code=status.HTTP_201_CREATED, summary="Create or resume assessment")
def create_or_resume_assessment(
    payload: Optional[AssessmentCreateRequest] = None,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> AssessmentResponse:
    """
    Start a new assessment or resume existing incomplete DRAFT if requested.
    """
    if payload is None:
        payload = AssessmentCreateRequest()

    if payload.resume_if_exists:
        # Check for latest active DRAFT
        existing_draft = db.execute(
            select(OrganizationAssessment)
            .where(
                and_(
                    OrganizationAssessment.organization_id == ws.organization_id,
                    OrganizationAssessment.status == "DRAFT",
                )
            )
            .order_by(desc(OrganizationAssessment.updated_at))
        ).scalars().first()

        if existing_draft:
            return AssessmentResponse.model_validate(existing_draft)

    # Initialize default answers with workspace name pre-filled
    initial_answers = AssessmentAnswers()
    initial_answers.profile.organization_name = ws.organization.name or ""
    if ws.organization.industry:
        initial_answers.profile.industry = ws.organization.industry

    title = payload.title or f"{ws.organization.name or 'Organization'} Policy Assessment"
    scope_type = payload.scope_type or "ORGANIZATION"

    new_assessment = OrganizationAssessment(
        organization_id=ws.organization_id,
        created_by=ws.user.id,
        title=title,
        scope_type=scope_type,
        status="DRAFT",
        current_step=1,
        answers=initial_answers.model_dump(),
        version=1,
    )

    db.add(new_assessment)
    db.commit()
    db.refresh(new_assessment)

    logger.info(
        "Created new Policy Formation Assessment %s for organization %s by user %s",
        new_assessment.id,
        ws.organization_id,
        ws.user.id,
    )
    return AssessmentResponse.model_validate(new_assessment)


@router.get("/assessments/latest", response_model=Optional[AssessmentResponse], summary="Get latest incomplete draft")
def get_latest_draft(
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> Optional[AssessmentResponse]:
    """Return the most recently edited incomplete DRAFT assessment for this workspace."""
    draft = db.execute(
        select(OrganizationAssessment)
        .where(
            and_(
                OrganizationAssessment.organization_id == ws.organization_id,
                OrganizationAssessment.status == "DRAFT",
            )
        )
        .order_by(desc(OrganizationAssessment.updated_at))
    ).scalars().first()

    if not draft:
        return None

    return AssessmentResponse.model_validate(draft)


@router.get("/assessments/policies/available", response_model=List[AvailablePolicyItem], summary="List workspace policies for assessment selection")
def get_available_workspace_policies(
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> List[AvailablePolicyItem]:
    """
    Return policies belonging strictly to the active workspace for selection in Step 5.
    """
    docs = db.execute(
        select(Document)
        .where(
            and_(
                Document.organization_id == ws.organization_id,
                Document.document_type == DocumentType.POLICY,
            )
        )
        .order_by(desc(Document.created_at))
    ).scalars().all()

    return [
        AvailablePolicyItem(
            id=str(d.id),
            title=getattr(d, "title", None) or getattr(d, "original_filename", None) or "Untitled Policy",
            category="Policy",
            uploaded_at=d.created_at.isoformat() if d.created_at else None,
        )
        for d in docs
    ]


@router.get("/assessments/{assessment_id}", response_model=AssessmentResponse, summary="Get assessment by ID")
def get_assessment(
    assessment_id: uuid.UUID,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> AssessmentResponse:
    """Retrieve an assessment session with verified workspace isolation."""
    assessment = _verify_assessment_access(assessment_id, db, ws)
    return AssessmentResponse.model_validate(assessment)


@router.put("/assessments/{assessment_id}", response_model=AssessmentResponse, summary="Autosave and update assessment answers")
def update_assessment(
    assessment_id: uuid.UUID,
    payload: AssessmentUpdateRequest,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> AssessmentResponse:
    """
    Autosave/update current step, answers, title, or scope type.
    Rejects modification if assessment is already COMPLETED.
    """
    assessment = _verify_assessment_access(assessment_id, db, ws)

    if assessment.status == "COMPLETED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completed assessments cannot be modified. Start a Policy Needs Analysis or create a new assessment.",
        )

    if payload.title is not None:
        assessment.title = payload.title.strip()

    if payload.scope_type is not None:
        assessment.scope_type = payload.scope_type.strip()

    if payload.current_step is not None:
        assessment.current_step = payload.current_step

    if payload.answers is not None:
        # Merge or update answers
        existing_answers = copy.deepcopy(assessment.answers or {})
        for section_key, section_data in payload.answers.items():
            if isinstance(section_data, dict) and isinstance(existing_answers.get(section_key), dict):
                existing_answers[section_key].update(section_data)
            else:
                existing_answers[section_key] = section_data
        assessment.answers = existing_answers
        flag_modified(assessment, "answers")

    assessment.version += 1
    assessment.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(assessment)

    return AssessmentResponse.model_validate(assessment)


@router.post("/assessments/{assessment_id}/complete", response_model=AssessmentResponse, summary="Complete assessment")
def complete_assessment(
    assessment_id: uuid.UUID,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> AssessmentResponse:
    """
    Validate and mark assessment as COMPLETED.
    """
    assessment = _verify_assessment_access(assessment_id, db, ws)

    answers = assessment.answers or {}
    profile = answers.get("profile", {})
    org_name = profile.get("organization_name", "").strip()

    if not org_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot complete assessment: Organization name in Step 1 is required.",
        )

    assessment.status = "COMPLETED"
    assessment.completed_at = datetime.now(timezone.utc)
    assessment.updated_at = datetime.now(timezone.utc)
    assessment.version += 1

    db.commit()
    db.refresh(assessment)

    logger.info(
        "Assessment %s completed for organization %s by user %s",
        assessment.id,
        ws.organization_id,
        ws.user.id,
    )
    return AssessmentResponse.model_validate(assessment)


@router.delete("/assessments/{assessment_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete or abandon assessment")
def delete_assessment(
    assessment_id: uuid.UUID,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> None:
    """Delete an assessment session with verified workspace isolation."""
    assessment = _verify_assessment_access(assessment_id, db, ws)
    # Explicitly remove associated analyses to ensure zero orphaned records across all DB backends
    db.query(PolicyNeedsAnalysis).filter_by(assessment_id=assessment.id).delete()
    db.delete(assessment)
    db.commit()
    logger.info("Assessment %s deleted from workspace %s", assessment_id, ws.organization_id)


# ---------------------------------------------------------------------------
# Policy Needs Analysis Routes (/policy-formation/analyses/...)
# ---------------------------------------------------------------------------

@router.post("/analyses", response_model=PolicyNeedsAnalysisResponse, summary="Run or retrieve Policy Needs Analysis for completed assessment")
def start_or_get_analysis(
    payload: StartAnalysisRequest,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyNeedsAnalysisResponse:
    """
    Start or retrieve Policy Needs Analysis for a completed assessment.
    Rejects incomplete (DRAFT) assessments with HTTP 400.
    Reuses existing analysis if already performed, preventing duplicate runs.
    """
    assessment = _verify_assessment_access(payload.assessment_id, db, ws)

    if assessment.status != "COMPLETED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot analyze an incomplete assessment. Please complete the assessment before running analysis.",
        )

    # Check for existing analysis
    existing_analysis = db.execute(
        select(PolicyNeedsAnalysis)
        .where(
            and_(
                PolicyNeedsAnalysis.organization_id == ws.organization_id,
                PolicyNeedsAnalysis.assessment_id == assessment.id,
            )
        )
        .order_by(desc(PolicyNeedsAnalysis.version))
    ).scalars().first()

    if existing_analysis:
        return PolicyNeedsAnalysisResponse.model_validate(existing_analysis)

    # Execute fresh analysis
    analysis = PolicyFormationAnalysisService.run_analysis(
        assessment=assessment,
        db=db,
        ws=ws,
    )
    return PolicyNeedsAnalysisResponse.model_validate(analysis)


@router.get("/analyses", response_model=List[PolicyNeedsAnalysisResponse], summary="List all policy analyses for active workspace")
def list_analyses(
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> List[PolicyNeedsAnalysisResponse]:
    """Return all policy analyses belonging strictly to the active workspace."""
    analyses = db.execute(
        select(PolicyNeedsAnalysis)
        .where(PolicyNeedsAnalysis.organization_id == ws.organization_id)
        .order_by(desc(PolicyNeedsAnalysis.updated_at))
    ).scalars().all()

    return [PolicyNeedsAnalysisResponse.model_validate(a) for a in analyses]


@router.get("/analyses/assessment/{assessment_id}", response_model=Optional[PolicyNeedsAnalysisResponse], summary="Get analysis by assessment ID")
def get_analysis_by_assessment(
    assessment_id: uuid.UUID,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> Optional[PolicyNeedsAnalysisResponse]:
    """Retrieve the latest analysis for an assessment in the active workspace."""
    # Verify assessment access first
    _verify_assessment_access(assessment_id, db, ws)

    analysis = db.execute(
        select(PolicyNeedsAnalysis)
        .where(
            and_(
                PolicyNeedsAnalysis.organization_id == ws.organization_id,
                PolicyNeedsAnalysis.assessment_id == assessment_id,
            )
        )
        .order_by(desc(PolicyNeedsAnalysis.version))
    ).scalars().first()

    if not analysis:
        return None

    return PolicyNeedsAnalysisResponse.model_validate(analysis)


@router.get("/analyses/{analysis_id}", response_model=PolicyNeedsAnalysisResponse, summary="Get analysis by ID")
def get_analysis_by_id(
    analysis_id: uuid.UUID,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyNeedsAnalysisResponse:
    """Retrieve a policy needs analysis by ID with workspace isolation."""
    analysis = _verify_analysis_access(analysis_id, db, ws)
    return PolicyNeedsAnalysisResponse.model_validate(analysis)


@router.put("/analyses/{analysis_id}/decisions", response_model=PolicyNeedsAnalysisResponse, summary="Update user review decisions and plan priorities")
def update_analysis_decisions(
    analysis_id: uuid.UUID,
    payload: UpdateDecisionsRequest,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyNeedsAnalysisResponse:
    """
    Save user review decisions, status markings, priority overrides, and reviewer notes.
    Recalculates summary metrics accordingly.
    """
    analysis = _verify_analysis_access(analysis_id, db, ws)

    if payload.expected_version is not None and payload.expected_version != analysis.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflict: Analysis has been modified (current version {analysis.version}, expected {payload.expected_version}). Please refresh to load the latest plan.",
        )

    current_decisions = copy.deepcopy(analysis.user_decisions or {})
    now_str = datetime.now(timezone.utc).isoformat()

    for need_id, item in payload.decisions.items():
        current_decisions[need_id] = {
            "decision": item.decision,
            "priority_override": item.priority_override,
            "notes": item.notes or "",
            "updated_at": now_str,
        }

    analysis.user_decisions = current_decisions
    flag_modified(analysis, "user_decisions")

    # Recalculate summary metrics
    assessment = db.get(OrganizationAssessment, analysis.assessment_id)
    if assessment:
        analysis.summary = PolicyFormationAnalysisService._compute_summary(
            assessment=assessment,
            discoveries=analysis.regulatory_discoveries,
            policy_needs=analysis.policy_needs,
            coverage_findings=analysis.coverage_findings,
            user_decisions=analysis.user_decisions,
        )
        flag_modified(analysis, "summary")

    analysis.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(analysis)

    return PolicyNeedsAnalysisResponse.model_validate(analysis)


@router.post("/analyses/{analysis_id}/rerun", response_model=PolicyNeedsAnalysisResponse, summary="Rerun analysis preserving review decisions")
def rerun_analysis(
    analysis_id: uuid.UUID,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyNeedsAnalysisResponse:
    """
    Rerun regulatory discovery, policy needs generation, and workspace coverage.
    Preserves all previous human review decisions, notes, and priority overrides.
    Archives previous version to history so earlier results remain 100% recoverable.
    """
    analysis = _verify_analysis_access(analysis_id, db, ws)
    assessment = _verify_assessment_access(analysis.assessment_id, db, ws)

    try:
        updated_analysis = PolicyFormationAnalysisService.run_analysis(
            assessment=assessment,
            db=db,
            ws=ws,
            existing_decisions=analysis.user_decisions,
            analysis_id=analysis.id,
        )
        return PolicyNeedsAnalysisResponse.model_validate(updated_analysis)
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to rerun analysis %s: %s", analysis_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis rerun failed: {str(exc)}. Previous analysis version {analysis.version} preserved intact.",
        )


@router.get("/analyses/{analysis_id}/history", response_model=List[Dict[str, Any]], summary="Get version history snapshots of analysis")
def get_analysis_history(
    analysis_id: uuid.UUID,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> List[Dict[str, Any]]:
    """Retrieve list of earlier archived snapshots for this analysis."""
    analysis = _verify_analysis_access(analysis_id, db, ws)
    return analysis.history or []


@router.get("/analyses/{analysis_id}/history/{version_num}", response_model=Dict[str, Any], summary="Get specific historic version snapshot")
def get_analysis_history_version(
    analysis_id: uuid.UUID,
    version_num: int,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> Dict[str, Any]:
    """Retrieve specific historical version snapshot."""
    analysis = _verify_analysis_access(analysis_id, db, ws)
    for snap in (analysis.history or []):
        if snap.get("version") == version_num:
            return snap

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Historical version {version_num} not found in analysis archive.",
    )


@router.delete("/analyses/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete analysis")
def delete_analysis(
    analysis_id: uuid.UUID,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> None:
    """Delete a policy needs analysis with workspace isolation."""
    analysis = _verify_analysis_access(analysis_id, db, ws)
    db.delete(analysis)
    db.commit()
    logger.info("Policy Needs Analysis %s deleted from workspace %s", analysis_id, ws.organization_id)


# ---------------------------------------------------------------------------
# Stage 4: AI Policy Drafting & Editor Routes (/policy-formation/drafts/...)
# ---------------------------------------------------------------------------

def _verify_draft_access(draft_id: uuid.UUID, db: Session, ws: WorkspaceContext) -> PolicyDraft:
    """Verify that the policy draft belongs to the caller's active workspace context."""
    draft = db.query(PolicyDraft).filter(
        PolicyDraft.id == draft_id,
        PolicyDraft.organization_id == ws.organization_id,
    ).first()
    if not draft:
        logger.warning(
            "User %s attempted cross-workspace access to draft %s (workspace %s)",
            ws.user.id,
            draft_id,
            ws.organization_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Draft not found in active workspace.",
        )
    return draft


@router.post("/drafts", response_model=PolicyDraftResponse, status_code=status.HTTP_201_CREATED, summary="Create or resume policy draft")
def create_or_get_draft(
    payload: PolicyDraftCreateRequest,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyDraftResponse:
    """Create a new grounded draft from an accepted policy need, or return existing active draft."""
    try:
        draft = PolicyFormationAnalysisService.create_or_get_draft(
            assessment_id=payload.assessment_id,
            analysis_id=payload.analysis_id,
            need_id=payload.need_id,
            force_preliminary=payload.force_preliminary or False,
            user_id=ws.user.id,
            db=db,
            ws=ws,
        )
        return PolicyDraftResponse.model_validate(draft)
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )


@router.get("/drafts", response_model=List[PolicyDraftListItem], summary="List all policy drafts in active workspace")
def list_drafts(
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> List[PolicyDraftListItem]:
    """Retrieve all policy drafts for the active workspace."""
    drafts = PolicyFormationAnalysisService.list_drafts(db=db, ws=ws)
    items = []
    for d in drafts:
        items.append(
            PolicyDraftListItem(
                id=d.id,
                organization_id=d.organization_id,
                assessment_id=d.assessment_id,
                analysis_id=d.analysis_id,
                need_id=d.need_id,
                title=d.title,
                status=d.status,
                version=d.version,
                owner_role=d.metadata_properties.get("owner_role") if d.metadata_properties else None,
                section_count=len(d.sections or []),
                has_unresolved_questions=bool(d.unresolved_questions and len(d.unresolved_questions) > 0),
                updated_at=d.updated_at,
                created_at=d.created_at,
            )
        )
    return items


@router.get("/drafts/{draft_id}", response_model=PolicyDraftResponse, summary="Get policy draft by ID")
def get_draft(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyDraftResponse:
    """Get complete policy draft details including structured sections and provenance."""
    draft = _verify_draft_access(draft_id, db, ws)
    return PolicyDraftResponse.model_validate(draft)


@router.put("/drafts/{draft_id}", response_model=PolicyDraftResponse, summary="Update policy draft content or metadata")
def update_draft(
    draft_id: uuid.UUID,
    payload: PolicyDraftUpdateRequest,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyDraftResponse:
    """Update title, status, metadata, or sections with optimistic concurrency control."""
    _verify_draft_access(draft_id, db, ws)
    try:
        updated = PolicyFormationAnalysisService.update_draft(
            draft_id=draft_id,
            updates=payload,
            user_id=ws.user.id,
            db=db,
            ws=ws,
        )
        return PolicyDraftResponse.model_validate(updated)
    except ValueError as val_err:
        msg = str(val_err)
        if "conflict" in msg.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


@router.post("/drafts/{draft_id}/regenerate-section", response_model=PolicyDraftResponse, summary="Regenerate single section with AI")
def regenerate_section(
    draft_id: uuid.UUID,
    payload: PolicyDraftRegenerateSectionRequest,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyDraftResponse:
    """Regenerate a specific section using AI while strictly preserving all other sections."""
    _verify_draft_access(draft_id, db, ws)
    try:
        updated = PolicyFormationAnalysisService.regenerate_draft_section(
            draft_id=draft_id,
            section_id=payload.section_id,
            custom_instructions=payload.custom_instructions,
            expected_version=payload.expected_version,
            db=db,
            ws=ws,
        )
        return PolicyDraftResponse.model_validate(updated)
    except ValueError as val_err:
        msg = str(val_err)
        if "conflict" in msg.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


@router.get("/drafts/{draft_id}/history", response_model=List[Dict[str, Any]], summary="Get version history of policy draft")
def get_draft_history(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> List[Dict[str, Any]]:
    """Retrieve list of earlier version snapshots for this draft."""
    _verify_draft_access(draft_id, db, ws)
    return PolicyFormationAnalysisService.get_draft_history(draft_id=draft_id, db=db, ws=ws)


@router.get("/drafts/{draft_id}/history/{version_num}", response_model=Dict[str, Any], summary="Get specific historical version snapshot")
def get_draft_history_version(
    draft_id: uuid.UUID,
    version_num: int,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> Dict[str, Any]:
    """Retrieve specific historical version snapshot."""
    _verify_draft_access(draft_id, db, ws)
    try:
        return PolicyFormationAnalysisService.get_draft_history_version(
            draft_id=draft_id, version_num=version_num, db=db, ws=ws
        )
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))


@router.post("/drafts/{draft_id}/revert/{version_num}", response_model=PolicyDraftResponse, summary="Revert draft to a prior version")
def revert_draft_version(
    draft_id: uuid.UUID,
    version_num: int,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyDraftResponse:
    """Revert draft sections and metadata to a historical snapshot."""
    _verify_draft_access(draft_id, db, ws)
    try:
        reverted = PolicyFormationAnalysisService.revert_draft_version(
            draft_id=draft_id, version_num=version_num, db=db, ws=ws
        )
        return PolicyDraftResponse.model_validate(reverted)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))


@router.delete("/drafts/{draft_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete policy draft")
def delete_draft(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> None:
    """Delete policy draft with verified workspace isolation."""
    _verify_draft_access(draft_id, db, ws)
    try:
        PolicyFormationAnalysisService.delete_draft(draft_id=draft_id, db=db, ws=ws)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))


# ---------------------------------------------------------------------------
# Stage 5: Policy Approval, Versioning & Publishing Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/eligible-reviewers",
    response_model=List[EligibleReviewerItem],
    summary="Get eligible reviewers in active workspace",
)
def get_eligible_reviewers(
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> List[EligibleReviewerItem]:
    """List members of this workspace authorized to review or approve policy drafts."""
    reviewers = PolicyFormationAnalysisService.get_eligible_reviewers(ws=ws, db=db)
    return [EligibleReviewerItem.model_validate(r) for r in reviewers]


@router.post(
    "/drafts/{draft_id}/submit-review",
    response_model=PolicyDraftResponse,
    summary="Submit draft for review",
)
def submit_draft_for_review(
    draft_id: uuid.UUID,
    body: PolicyDraftSubmitReviewRequest,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyDraftResponse:
    """Submit a policy draft for formal review and assign an eligible reviewer."""
    _verify_draft_access(draft_id, db, ws)
    try:
        reviewer_id = getattr(body, "assigned_reviewer_id", None) or getattr(body, "reviewer_id", None)
        notes = getattr(body, "notes", None) or getattr(body, "submission_notes", None)
        updated = PolicyFormationAnalysisService.submit_for_review(
            draft_id=draft_id,
            reviewer_id=reviewer_id,
            notes=notes,
            db=db,
            ws=ws,
        )
        return PolicyDraftResponse.model_validate(updated)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))


@router.post(
    "/drafts/{draft_id}/approve",
    response_model=PolicyDraftResponse,
    summary="Approve policy draft version",
)
def approve_policy_draft(
    draft_id: uuid.UUID,
    body: PolicyDraftApproveRequest,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyDraftResponse:
    """Approve a submitted policy draft version with immutable content hashing."""
    _verify_draft_access(draft_id, db, ws)
    try:
        approved = PolicyFormationAnalysisService.approve_draft(
            draft_id=draft_id,
            expected_version=body.expected_version,
            comments=body.comments,
            db=db,
            ws=ws,
        )
        return PolicyDraftResponse.model_validate(approved)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))


@router.post(
    "/drafts/{draft_id}/request-revision",
    response_model=PolicyDraftResponse,
    summary="Request revisions on draft",
)
def request_draft_revision(
    draft_id: uuid.UUID,
    body: PolicyDraftRequestRevisionRequest,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyDraftResponse:
    """Reviewer requests modifications with mandatory feedback."""
    draft = _verify_draft_access(draft_id, db, ws)
    try:
        expected_version = body.expected_version if body.expected_version is not None else draft.version
        rev_draft = PolicyFormationAnalysisService.request_revision(
            draft_id=draft_id,
            expected_version=expected_version,
            comments=body.comments,
            db=db,
            ws=ws,
        )
        return PolicyDraftResponse.model_validate(rev_draft)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))


@router.post(
    "/drafts/{draft_id}/reject",
    response_model=PolicyDraftResponse,
    summary="Reject policy draft submission",
)
def reject_policy_draft(
    draft_id: uuid.UUID,
    body: PolicyDraftRejectRequest,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyDraftResponse:
    """Reject a submitted policy draft with a documented reason."""
    draft = _verify_draft_access(draft_id, db, ws)
    try:
        expected_version = body.expected_version if body.expected_version is not None else draft.version
        rejected = PolicyFormationAnalysisService.reject_draft(
            draft_id=draft_id,
            expected_version=expected_version,
            reason=body.reason,
            db=db,
            ws=ws,
        )
        return PolicyDraftResponse.model_validate(rejected)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))



@router.post(
    "/drafts/{draft_id}/create-revision",
    response_model=PolicyDraftResponse,
    summary="Create new revision from approved or published draft",
)
def create_draft_revision(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyDraftResponse:
    """Branch a new editable draft version (vN+1) from an approved or published policy."""
    _verify_draft_access(draft_id, db, ws)
    try:
        new_rev = PolicyFormationAnalysisService.create_revision(
            draft_id=draft_id,
            db=db,
            ws=ws,
        )
        return PolicyDraftResponse.model_validate(new_rev)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))


@router.post(
    "/drafts/{draft_id}/publish",
    response_model=PolicyDraftResponse,
    summary="Publish approved policy into Policies repository",
)
def publish_policy_draft(
    draft_id: uuid.UUID,
    body: PolicyDraftPublishRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyDraftResponse:
    """
    Publish an approved policy draft into the live LexisGraph Policies repository (Document table).
    Triggers text extraction, embedding, Qdrant indexing, and knowledge graph construction.
    """
    _verify_draft_access(draft_id, db, ws)
    try:
        draft, doc = PolicyFormationAnalysisService.publish_draft(
            draft_id=draft_id,
            expected_version=body.expected_version,
            effective_date=body.effective_date,
            background_tasks=background_tasks,
            db=db,
            ws=ws,
        )
        return PolicyDraftResponse.model_validate(draft)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))


@router.get(
    "/drafts/{draft_id}/approval-history",
    response_model=List[PolicyApprovalAuditResponse],
    summary="Get policy approval and publishing audit trail",
)
def get_draft_approval_history(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> List[PolicyApprovalAuditResponse]:
    """Retrieve immutable audit records for all review, approval, rejection, and publishing events."""
    _verify_draft_access(draft_id, db, ws)
    records = PolicyFormationAnalysisService.get_approval_history(
        draft_id=draft_id,
        db=db,
        ws=ws,
    )
    return [PolicyApprovalAuditResponse.model_validate(r) for r in records]


@router.post(
    "/drafts/{draft_id}/retry-ai-generation",
    response_model=PolicyDraftResponse,
    summary="Retry AI LLM generation for template fallback drafts",
)
def retry_draft_ai_generation(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    ws: WorkspaceContext = Depends(get_active_workspace_context),
) -> PolicyDraftResponse:
    """Retry AI LLM enrichment on a draft generated via deterministic template fallback."""
    _verify_draft_access(draft_id, db, ws)
    try:
        updated = PolicyFormationAnalysisService.retry_ai_generation(
            draft_id=draft_id,
            db=db,
            ws=ws,
        )
        return PolicyDraftResponse.model_validate(updated)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))



