import { api } from "../api";

export interface ProfileStepAnswers {
  organization_name: string;
  org_type: string;
  custom_org_type?: string;
  industry: string;
  sub_industry?: string;
  description?: string;
  products_services?: string;
  employee_count: string;
  parent_org?: string;
}

export interface JurisdictionStepAnswers {
  primary_country: string;
  state_province?: string;
  other_countries: string[];
  operating_locations?: string;
  markets_served?: string;
  regulated_activities?: string;
}

export interface ActivitiesStepAnswers {
  personal_data: boolean;
  sensitive_data: boolean;
  cloud_services: boolean;
  ai_systems: boolean;
  payments: boolean;
  employment_types: string[];
  vendors: boolean;
  physical_facilities: boolean;
  licensed_activities: boolean;
  notes?: string;
}

export interface ScopeStepAnswers {
  scope_type: string; // ORGANIZATION | BRANCH | DEPARTMENT | OTHER
  branch_name?: string;
  branch_location?: string;
  branch_activities?: string;
  has_central_policies?: boolean | null;
  follows_central_policies?: boolean | null;
  department_name?: string;
  department_activities?: string;
  other_scope_description?: string;
}

export interface ExistingPoliciesStepAnswers {
  has_existing_policies: boolean;
  starting_mode: string; // "scratch" | "build_on_existing"
  selected_policy_ids: string[];
  certifications: string[];
  commitments?: string;
  implemented_controls?: string;
  notes?: string;
}

export interface AssessmentAnswers {
  profile: ProfileStepAnswers;
  jurisdiction: JurisdictionStepAnswers;
  activities: ActivitiesStepAnswers;
  scope: ScopeStepAnswers;
  existing_policies: ExistingPoliciesStepAnswers;
}

export interface OrganizationAssessment {
  id: string;
  organization_id: string;
  created_by?: string | null;
  title: string;
  scope_type: string;
  status: "DRAFT" | "COMPLETED" | "ABANDONED" | string;
  current_step: number;
  answers: AssessmentAnswers;
  version: number;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvailablePolicyItem {
  id: string;
  title: string;
  category: string;
  uploaded_at?: string | null;
}

export interface AssessmentCreateRequest {
  title?: string;
  scope_type?: string;
  resume_if_exists?: boolean;
}

export interface AssessmentUpdateRequest {
  title?: string;
  scope_type?: string;
  current_step?: number;
  answers?: Partial<AssessmentAnswers>;
}

export const policyFormationService = {
  /**
   * List all assessments for active workspace
   */
  listAssessments: async (): Promise<OrganizationAssessment[]> => {
    const response = await api.get<OrganizationAssessment[]>("/policy-formation/assessments");
    return response.data;
  },

  /**
   * Get latest active draft assessment
   */
  getLatestDraft: async (): Promise<OrganizationAssessment | null> => {
    const response = await api.get<OrganizationAssessment | null>("/policy-formation/assessments/latest");
    return response.data;
  },

  /**
   * Get assessment by ID with server-side workspace verification
   */
  getAssessment: async (id: string): Promise<OrganizationAssessment> => {
    const response = await api.get<OrganizationAssessment>(`/policy-formation/assessments/${id}`);
    return response.data;
  },

  /**
   * Start or resume an assessment session
   */
  createOrResumeAssessment: async (
    data?: AssessmentCreateRequest
  ): Promise<OrganizationAssessment> => {
    const response = await api.post<OrganizationAssessment>(
      "/policy-formation/assessments",
      data || { resume_if_exists: true }
    );
    return response.data;
  },

  /**
   * Autosave / update assessment answers and current step
   */
  updateAssessment: async (
    id: string,
    data: AssessmentUpdateRequest
  ): Promise<OrganizationAssessment> => {
    const response = await api.put<OrganizationAssessment>(
      `/policy-formation/assessments/${id}`,
      data
    );
    return response.data;
  },

  /**
   * Validate and complete assessment
   */
  completeAssessment: async (id: string): Promise<OrganizationAssessment> => {
    const response = await api.post<OrganizationAssessment>(
      `/policy-formation/assessments/${id}/complete`
    );
    return response.data;
  },

  /**
   * Delete or abandon assessment
   */
  deleteAssessment: async (id: string): Promise<void> => {
    await api.delete(`/policy-formation/assessments/${id}`);
  },

  /**
   * Get authorized available policies from active workspace
   */
  getAvailablePolicies: async (): Promise<AvailablePolicyItem[]> => {
    const response = await api.get<AvailablePolicyItem[]>(
      "/policy-formation/assessments/policies/available"
    );
    return response.data;
  },

  /**
   * Start or retrieve existing Policy Needs Analysis for completed assessment
   */
  startOrGetAnalysis: async (assessmentId: string): Promise<PolicyNeedsAnalysis> => {
    const response = await api.post<PolicyNeedsAnalysis>(
      "/policy-formation/analyses",
      { assessment_id: assessmentId }
    );
    return response.data;
  },

  /**
   * Get latest analysis for an assessment
   */
  getAnalysisByAssessment: async (assessmentId: string): Promise<PolicyNeedsAnalysis | null> => {
    const response = await api.get<PolicyNeedsAnalysis | null>(
      `/policy-formation/analyses/assessment/${assessmentId}`
    );
    return response.data;
  },

  /**
   * Get analysis by ID
   */
  getAnalysisById: async (analysisId: string): Promise<PolicyNeedsAnalysis> => {
    const response = await api.get<PolicyNeedsAnalysis>(
      `/policy-formation/analyses/${analysisId}`
    );
    return response.data;
  },

  /**
   * Update human review decisions and priorities in the policy plan
   */
  updateDecisions: async (
    analysisId: string,
    decisions: Record<string, UserDecisionItem>,
    expectedVersion?: number
  ): Promise<PolicyNeedsAnalysis> => {
    const response = await api.put<PolicyNeedsAnalysis>(
      `/policy-formation/analyses/${analysisId}/decisions`,
      { decisions, expected_version: expectedVersion }
    );
    return response.data;
  },

  /**
   * Rerun analysis preserving previous human review decisions
   */
  rerunAnalysis: async (analysisId: string): Promise<PolicyNeedsAnalysis> => {
    const response = await api.post<PolicyNeedsAnalysis>(
      `/policy-formation/analyses/${analysisId}/rerun`
    );
    return response.data;
  },

  /**
   * Get version history snapshots for an analysis
   */
  getAnalysisHistory: async (analysisId: string): Promise<any[]> => {
    const response = await api.get<any[]>(
      `/policy-formation/analyses/${analysisId}/history`
    );
    return response.data;
  },

  /**
   * Get specific archived historical version snapshot
   */
  getAnalysisHistoryVersion: async (
    analysisId: string,
    versionNum: number
  ): Promise<any> => {
    const response = await api.get<any>(
      `/policy-formation/analyses/${analysisId}/history/${versionNum}`
    );
    return response.data;
  },

  /**
   * List all analyses for workspace
   */
  listAnalyses: async (): Promise<PolicyNeedsAnalysis[]> => {
    const response = await api.get<PolicyNeedsAnalysis[]>(
      "/policy-formation/analyses"
    );
    return response.data;
  },

  // =========================================================================
  // STAGE 4: AI POLICY DRAFTING & EDITOR
  // =========================================================================

  /**
   * Create or resume policy draft from an accepted policy need
   */
  createOrGetDraft: async (data: PolicyDraftCreateRequest): Promise<PolicyDraft> => {
    const response = await api.post<PolicyDraft>(
      "/policy-formation/drafts",
      data
    );
    return response.data;
  },

  /**
   * Create an individual policy draft directly without completing an assessment
   */
  createDirectDraft: async (
    data: PolicyDirectDraftCreateRequest
  ): Promise<PolicyDraft> => {
    const response = await api.post<PolicyDraft>(
      "/policy-formation/drafts/direct",
      data
    );
    return response.data;
  },

  /**
   * List all policy drafts in active workspace
   */
  listDrafts: async (): Promise<PolicyDraftListItem[]> => {
    const response = await api.get<PolicyDraftListItem[]>(
      "/policy-formation/drafts"
    );
    return response.data;
  },

  /**
   * Get draft by ID with full structured sections and provenance
   */
  getDraft: async (draftId: string): Promise<PolicyDraft> => {
    const response = await api.get<PolicyDraft>(
      `/policy-formation/drafts/${draftId}`
    );
    return response.data;
  },

  /**
   * Update draft with optimistic locking and automatic version archiving
   */
  updateDraft: async (
    draftId: string,
    updates: PolicyDraftUpdateRequest
  ): Promise<PolicyDraft> => {
    const response = await api.put<PolicyDraft>(
      `/policy-formation/drafts/${draftId}`,
      updates
    );
    return response.data;
  },

  /**
   * Regenerate a single section using AI while strictly preserving all other sections
   */
  regenerateDraftSection: async (
    draftId: string,
    data: PolicyDraftRegenerateSectionRequest
  ): Promise<PolicyDraft> => {
    const response = await api.post<PolicyDraft>(
      `/policy-formation/drafts/${draftId}/regenerate-section`,
      data
    );
    return response.data;
  },

  /**
   * Get version history of draft snapshots
   */
  getDraftHistory: async (draftId: string): Promise<any[]> => {
    const response = await api.get<any[]>(
      `/policy-formation/drafts/${draftId}/history`
    );
    return response.data;
  },

  /**
   * Get specific historical version snapshot of draft
   */
  getDraftHistoryVersion: async (
    draftId: string,
    versionNum: number
  ): Promise<any> => {
    const response = await api.get<any>(
      `/policy-formation/drafts/${draftId}/history/${versionNum}`
    );
    return response.data;
  },

  /**
   * Revert draft to a previous historical version
   */
  revertDraftVersion: async (
    draftId: string,
    versionNum: number
  ): Promise<PolicyDraft> => {
    const response = await api.post<PolicyDraft>(
      `/policy-formation/drafts/${draftId}/revert/${versionNum}`
    );
    return response.data;
  },

  /**
   * Delete draft
   */
  deleteDraft: async (draftId: string): Promise<void> => {
    await api.delete(`/policy-formation/drafts/${draftId}`);
  },

  // =========================================================================
  // STAGE 5: POLICY APPROVAL, VERSIONING & PUBLISHING
  // =========================================================================

  /**
   * Get members eligible to review or approve policy drafts in this workspace
   */
  getEligibleReviewers: async (): Promise<EligibleReviewerItem[]> => {
    const response = await api.get<EligibleReviewerItem[]>(
      "/policy-formation/eligible-reviewers"
    );
    return response.data;
  },

  /**
   * Submit policy draft for review and assign an eligible reviewer
   */
  submitDraftForReview: async (
    draftId: string,
    data: PolicyDraftSubmitReviewRequest
  ): Promise<PolicyDraft> => {
    const response = await api.post<PolicyDraft>(
      `/policy-formation/drafts/${draftId}/submit-review`,
      data
    );
    return response.data;
  },

  /**
   * Approve a specific immutable version of a policy draft
   */
  approveDraft: async (
    draftId: string,
    data: PolicyDraftApproveRequest
  ): Promise<PolicyDraft> => {
    const response = await api.post<PolicyDraft>(
      `/policy-formation/drafts/${draftId}/approve`,
      data
    );
    return response.data;
  },

  /**
   * Request revisions on a policy draft with mandatory reviewer feedback
   */
  requestDraftRevision: async (
    draftId: string,
    data: PolicyDraftRequestRevisionRequest
  ): Promise<PolicyDraft> => {
    const response = await api.post<PolicyDraft>(
      `/policy-formation/drafts/${draftId}/request-revision`,
      data
    );
    return response.data;
  },

  /**
   * Reject a policy draft submission with a documented reason
   */
  rejectDraft: async (
    draftId: string,
    data: PolicyDraftRejectRequest
  ): Promise<PolicyDraft> => {
    const response = await api.post<PolicyDraft>(
      `/policy-formation/drafts/${draftId}/reject`,
      data
    );
    return response.data;
  },

  /**
   * Create a new draft revision (vN+1) from an approved or published policy
   */
  createDraftRevision: async (draftId: string): Promise<PolicyDraft> => {
    const response = await api.post<PolicyDraft>(
      `/policy-formation/drafts/${draftId}/create-revision`
    );
    return response.data;
  },

  /**
   * Publish approved policy into the live production LexisGraph Policies repository
   */
  publishDraft: async (
    draftId: string,
    data: PolicyDraftPublishRequest
  ): Promise<PolicyDraft> => {
    const response = await api.post<PolicyDraft>(
      `/policy-formation/drafts/${draftId}/publish`,
      data
    );
    return response.data;
  },

  /**
   * Retrieve immutable audit trail for policy approval and publishing decisions
   */
  getApprovalHistory: async (
    draftId: string
  ): Promise<PolicyApprovalAudit[]> => {
    const response = await api.get<PolicyApprovalAudit[]>(
      `/policy-formation/drafts/${draftId}/approval-history`
    );
    return response.data;
  },

  /**
   * Retry AI LLM generation for drafts that previously fell back to template
   */
  retryAiGeneration: async (draftId: string): Promise<PolicyDraft> => {
    const response = await api.post<PolicyDraft>(
      `/policy-formation/drafts/${draftId}/retry-ai-generation`
    );
    return response.data;
  },

  /**
   * Export print-ready compliance policy PDF (draft watermark, published metadata, or historical snapshot)
   */
  downloadDraftPdf: async (
    draftId: string,
    version?: number,
    suggestedFilename?: string
  ): Promise<void> => {
    const url =
      version !== undefined
        ? `/policy-formation/drafts/${draftId}/pdf?version=${version}`
        : `/policy-formation/drafts/${draftId}/pdf`;

    const response = await api.get(url, {
      responseType: "blob",
    });

    let filename = suggestedFilename;
    const disposition = response.headers["content-disposition"];
    if (disposition) {
      const match = disposition.match(/filename=["']?([^"';]+)["']?/);
      if (match && match[1]) {
        filename = match[1].trim();
      }
    }
    if (!filename) {
      filename = `policy_${version ? `v${version}` : "draft"}.pdf`;
    }

    const blob = new Blob([response.data], { type: "application/pdf" });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  },
};


export interface RegulatoryDiscoveryItem {
  regulation_id: string;
  title: string;
  act_name?: string | null;
  legal_instrument_type?: string;
  jurisdiction: string;
  issuing_authority?: string | null;
  act_year?: number | null;
  effective_date?: string | null;
  commencement_status?: string;
  applicability_thresholds?: string | null;
  version?: string | null;
  source_domain?: string | null;
  source_reference?: string | null;
  source_origin?: "uploaded_document" | "canonical_registry_reference" | string;
  is_official_file_uploaded?: boolean;
  source_document_id?: string | null;
  relevant_provisions: string[];
  trigger_answers: string[];
  relevance_explanation: string;
  evidence_status: "verified_source_requirement" | "potentially_applicable" | "requires_verification" | "not_enough_evidence" | "not_assessed" | string;
  retrieved_at: string;
}

export interface PolicyNeedItem {
  need_id: string;
  title: string;
  category: string;
  business_rationale: string;
  linked_regulations: string[];
  linked_risks: string[];
  driver: "regulatory-driven" | "contract-driven" | "risk-driven" | "internal-governance" | string;
  suggested_priority: "Urgent" | "High" | "Medium" | "Low" | string;
  priority_rationale: string;
  recommended_owner_role: string;
  suggested_review_frequency: string;
  evidence_confidence: "High" | "Medium" | "Requires Verification" | string;
  requires_human_confirmation: boolean;
  assumptions_and_questions?: string[];
}

export interface CoverageFindingItem {
  need_id: string;
  policy_title: string;
  linked_document_id?: string | null;
  coverage_status: "Covered" | "Partially covered" | "Not found" | "Requires review" | "Not assessed" | string;
  matched_sections: string[];
  evidence_excerpt?: string | null;
  reason: string;
  limitations_note: string;
}

export interface UserDecisionItem {
  decision: "ACCEPTED" | "DEFERRED" | "REJECTED" | "REQUIRES_VERIFICATION" | string;
  priority_override?: "Urgent" | "High" | "Medium" | "Low" | null;
  notes?: string;
  updated_at?: string | null;
}

export interface PolicyNeedsAnalysisSummary {
  assessment_id: string;
  assessment_title: string;
  scope_type: string;
  total_regulatory_discoveries: number;
  total_policy_needs: number;
  coverage_breakdown: Record<string, number>;
  decision_breakdown: Record<string, number>;
  priority_breakdown: Record<string, number>;
  requires_human_review_count: number;
  high_or_urgent_count: number;
}

export interface PolicyNeedsAnalysis {
  id: string;
  organization_id: string;
  assessment_id: string;
  created_by?: string | null;
  status: "COMPLETED" | "RUNNING" | "PENDING" | "FAILED" | string;
  version: number;
  summary: PolicyNeedsAnalysisSummary;
  regulatory_discoveries: RegulatoryDiscoveryItem[];
  policy_needs: PolicyNeedItem[];
  coverage_findings: CoverageFindingItem[];
  user_decisions: Record<string, UserDecisionItem>;
  history?: any[];
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Stage 4: AI Policy Drafting & Editor Interfaces
// ---------------------------------------------------------------------------

export interface PolicySectionItem {
  section_id: string;
  section_number: string;
  heading: string;
  content: string;
  rationale?: string | null;
  source_clauses: string[];
  is_customized: boolean;
  last_regenerated_at?: string | null;
}

export interface PolicyDraftMetadataProperties {
  policy_identifier?: string;
  owner_role?: string;
  target_audience?: string;
  scope?: string;
  classification?: string;
  review_cadence?: string;
  effective_date?: string | null;
  associated_industry?: string;
  primary_jurisdiction?: string;
  [key: string]: any;
}

export interface PolicyDirectDraftCreateRequest {
  title: string;
  category: string;
  purpose: string;
  scope_type: "ORGANIZATION" | "BRANCH" | "DEPARTMENT" | string;
  branch_name?: string | null;
  department_name?: string | null;
  primary_jurisdiction?: string;
  owner_role?: string;
  review_cadence?: string;
  specific_context?: string | null;
  linked_regulations?: string[];
}

export interface PolicyDraft {
  id: string;
  organization_id: string;
  assessment_id?: string | null;
  analysis_id?: string | null;
  analysis_version?: number | null;
  need_id: string;
  created_by?: string | null;
  title: string;
  status:
    | "DRAFTING"
    | "DRAFT_SAVED"
    | "NEEDS_VERIFICATION"
    | "READY_FOR_REVIEW"
    | "REVISION_REQUESTED"
    | "APPROVED"
    | "PUBLISHED"
    | "SUPERSEDED"
    | "ARCHIVED"
    | string;
  version: number;
  metadata_properties: PolicyDraftMetadataProperties;
  sections: PolicySectionItem[];
  source_references: any[];
  unresolved_questions: string[];
  generation_metadata: Record<string, any>;
  history: any[];
  assigned_reviewer_id?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  approved_version?: number | null;
  content_hash?: string | null;
  review_comments?: string | null;
  rejection_reason?: string | null;
  published_policy_id?: string | null;
  published_at?: string | null;
  effective_date?: string | null;
  approval_history?: any[];
  created_at: string;
  updated_at: string;
}

export interface PolicyDraftListItem {
  id: string;
  organization_id: string;
  assessment_id: string;
  analysis_id: string;
  need_id: string;
  title: string;
  status: string;
  version: number;
  owner_role?: string | null;
  section_count: number;
  has_unresolved_questions: boolean;
  assigned_reviewer_id?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  published_policy_id?: string | null;
  published_at?: string | null;
  updated_at: string;
  created_at: string;
}

export interface PolicyDraftCreateRequest {
  assessment_id: string;
  analysis_id: string;
  need_id: string;
  force_preliminary?: boolean;
}

export interface PolicyDraftUpdateRequest {
  title?: string;
  status?: string;
  metadata_properties?: Record<string, any>;
  sections?: PolicySectionItem[];
  expected_version?: number;
  change_summary?: string;
}

export interface PolicyDraftRegenerateSectionRequest {
  section_id: string;
  custom_instructions?: string;
  expected_version?: number;
}

export interface EligibleReviewerItem {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
}

export interface PolicyDraftSubmitReviewRequest {
  assigned_reviewer_id?: string | null;
  notes?: string | null;
}

export interface PolicyDraftApproveRequest {
  expected_version: number;
  comments?: string | null;
}

export interface PolicyDraftRequestRevisionRequest {
  expected_version: number;
  comments: string;
}

export interface PolicyDraftRejectRequest {
  expected_version: number;
  reason: string;
}

export interface PolicyDraftPublishRequest {
  expected_version: number;
  effective_date?: string | null;
}

export interface PolicyApprovalAudit {
  id: string;
  organization_id: string;
  draft_id?: string | null;
  policy_document_id?: string | null;
  draft_version?: number | null;
  actor_id?: string | null;
  actor_name?: string | null;
  action: string;
  previous_status?: string | null;
  new_status?: string | null;
  comments?: string | null;
  content_hash?: string | null;
  metadata_snapshot?: Record<string, any>;
  created_at: string;
}




