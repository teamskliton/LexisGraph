import { api } from "../api";
import { RemediationEvidenceItem } from "./remediations";

export interface FindingVerificationSummary {
  verification_status: string;
  verified_by?: string | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  verification_note?: string | null;
  cycle_number?: number | null;
}

export interface FindingResolutionProof {
  finding_id: string;
  finding_clause_id?: string | null;
  severity?: string | null;
  lifecycle_status: string;
  resolved_by?: string | null;
  resolved_by_name?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
  approved_cycle_number?: number | null;
  verification?: FindingVerificationSummary | null;
  supporting_evidence: RemediationEvidenceItem[];
  historical_evidence: RemediationEvidenceItem[];
  historical_resolutions: FindingResolutionHistory[];
  reassessment_info?: {
    reassessment_trigger?: string | null;
    reassessment_reason?: string | null;
    reassessment_document_id?: string | null;
    reassessment_document_name?: string | null;
    reassessment_report_id?: string | null;
    reassessment_detected_at?: string | null;
  } | null;
  has_supporting_evidence: boolean;
}

export interface FindingAssignee {
  id: string;
  full_name: string;
  email: string;
}

export interface FindingComment {
  id: string;
  finding_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_role?: string | null;
  content: string;
  parent_id?: string | null;
  is_resolved?: boolean;
  resolved_by?: string | null;
  resolved_by_name?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
  replies?: FindingComment[];
}

export interface FindingActivityActor {
  id: string;
  full_name: string;
  email: string;
  role?: string | null;
}

export interface FindingActivity {
  id: string;
  finding_id: string;
  organization_id?: string | null;
  event_type: string;
  category: string;
  title: string;
  description: string;
  icon_type?: string;
  user_name: string;
  actor?: FindingActivityActor | null;
  created_at: string;
  metadata?: Record<string, any> | null;
}

export interface FindingActivityPaginatedResponse {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  has_more: boolean;
  items: FindingActivity[];
}

export interface FindingResolutionHistory {
  id: string;
  finding_id: string;
  organization_id?: string | null;
  resolution_number: number;
  resolved_at: string;
  resolved_by?: string | null;
  resolved_by_name?: string | null;
  resolution_note?: string | null;
  reopened_at?: string | null;
  reopened_by?: string | null;
  reopened_by_name?: string | null;
  reopen_reason?: string | null;
  status: string;
  created_at?: string | null;
}

export interface FindingPreviousResolutionSummary {
  resolution_number: number;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolver_name?: string | null;
  resolution_note?: string | null;
}

export interface FindingCandidateAnalysisSummary {
  report_id: string;
  title?: string | null;
  evaluated_at?: string | null;
  similarity_score?: number | null;
  calculated_risk?: string | null;
  findings_detected?: number | null;
}

export interface FindingReassessmentDetail {
  finding_id: string;
  lifecycle_status: string;
  reassessment_trigger?: string | null;
  reassessment_reason?: string | null;
  reassessment_document_id?: string | null;
  reassessment_document_name?: string | null;
  reassessment_report_id?: string | null;
  reassessment_detected_at?: string | null;
  previous_resolution?: FindingPreviousResolutionSummary | null;
  candidate_analysis?: FindingCandidateAnalysisSummary | null;
}

export interface FindingDetail {
  id: string;
  report_id: string;
  policy_clause_id?: string | null;
  regulation_clause_id?: string | null;
  status: string;
  lifecycle_status: string;
  confidence?: number;
  severity: string;
  reasoning?: string | null;
  recommendation?: string | null;
  citation?: string | null;
  matched_policy_text?: string | null;
  graph_path?: Record<string, unknown> | Array<unknown> | null;
  assigned_to?: string | null;
  assignee?: FindingAssignee | null;
  resolution_note?: string | null;
  resolved_by?: string | null;
  resolved_by_name?: string | null;
  resolved_at?: string | null;
  reopened_by?: string | null;
  reopened_by_name?: string | null;
  reopened_at?: string | null;
  reopen_reason?: string | null;
  reassessment_trigger?: string | null;
  reassessment_reason?: string | null;
  reassessment_document_id?: string | null;
  reassessment_document_name?: string | null;
  reassessment_report_id?: string | null;
  reassessment_detected_at?: string | null;
  remediation_due_date?: string | null;
  is_overdue?: boolean;
  comments_count?: number;
  organization_id?: string | null;
  resolution_history?: FindingResolutionHistory[];
  created_at: string;
  updated_at: string;
}

export interface PaginatedFindingsResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  items: FindingDetail[];
}

export interface FindingsFilterParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  lifecycle_status?: string;
  severity?: string;
  assigned_to?: string;
  policy_document_id?: string;
  regulation_id?: string;
  report_id?: string;
  overdue_only?: boolean;
}

export const findingsService = {
  listFindings: async (
    organizationId?: string,
    params?: FindingsFilterParams
  ): Promise<PaginatedFindingsResponse> => {
    const response = await api.get<PaginatedFindingsResponse>("/findings", {
      params: { ...(organizationId ? { organization_id: organizationId } : {}), ...params },
    });
    return response.data;
  },

  getMyWork: async (
    organizationId?: string,
    params?: { lifecycle_status?: string; severity?: string; overdue_only?: boolean }
  ): Promise<FindingDetail[]> => {
    const response = await api.get<FindingDetail[]>("/findings/my-work", {
      params: { organization_id: organizationId, ...params },
    });
    return response.data;
  },

  updateRemediationDueDate: async (findingId: string, dueDate: string | null): Promise<FindingDetail> => {
    const response = await api.patch<FindingDetail>(`/findings/${findingId}/remediation`, {
      due_date: dueDate,
    });
    return response.data;
  },

  getFinding: async (findingId: string): Promise<FindingDetail> => {
    const response = await api.get<FindingDetail>(`/findings/${findingId}`);
    return response.data;
  },

  updateStatus: async (findingId: string, lifecycleStatus: string): Promise<FindingDetail> => {
    const response = await api.patch<FindingDetail>(`/findings/${findingId}/status`, {
      lifecycle_status: lifecycleStatus,
    });
    return response.data;
  },

  submitForAdminReview: async (findingId: string, submissionNote?: string): Promise<FindingDetail> => {
    const response = await api.post<FindingDetail>(`/findings/${findingId}/submit-for-review`, {
      submission_note: submissionNote,
    });
    return response.data;
  },

  rejectFalsePositive: async (findingId: string, rejectionReason?: string): Promise<FindingDetail> => {
    const response = await api.post<FindingDetail>(`/findings/${findingId}/reject-false-positive`, {
      rejection_reason: rejectionReason,
    });
    return response.data;
  },

  assignFinding: async (findingId: string, assigneeId: string | null): Promise<FindingDetail> => {
    const response = await api.post<FindingDetail>(`/findings/${findingId}/assign`, {
      assignee_id: assigneeId,
    });
    return response.data;
  },

  resolveFinding: async (findingId: string, resolutionNote?: string): Promise<FindingDetail> => {
    const response = await api.post<FindingDetail>(`/findings/${findingId}/resolve`, {
      resolution_note: resolutionNote,
    });
    return response.data;
  },

  reopenFinding: async (findingId: string, reopenReason: string): Promise<FindingDetail> => {
    const response = await api.post<FindingDetail>(`/findings/${findingId}/reopen`, {
      reopen_reason: reopenReason,
    });
    return response.data;
  },

  getReassessment: async (findingId: string): Promise<FindingReassessmentDetail> => {
    const response = await api.get<FindingReassessmentDetail>(`/findings/${findingId}/reassessment`);
    return response.data;
  },

  keepResolved: async (findingId: string, adminNote?: string): Promise<FindingDetail> => {
    const response = await api.post<FindingDetail>(`/findings/${findingId}/reassessment/keep-resolved`, {
      admin_note: adminNote,
    });
    return response.data;
  },

  reopenFromReassessment: async (findingId: string, reopenReason: string): Promise<FindingDetail> => {
    const response = await api.post<FindingDetail>(`/findings/${findingId}/reassessment/reopen`, {
      reopen_reason: reopenReason,
    });
    return response.data;
  },

  triggerReassessment: async (
    findingId: string,
    payload: {
      trigger: string;
      reason: string;
      document_id?: string;
      document_name?: string;
      report_id?: string;
    }
  ): Promise<FindingDetail> => {
    const response = await api.post<FindingDetail>(`/findings/${findingId}/reassessment/trigger`, payload);
    return response.data;
  },

  getFindingResolutions: async (findingId: string): Promise<FindingResolutionHistory[]> => {
    const response = await api.get<FindingResolutionHistory[]>(`/findings/${findingId}/resolutions`);
    return response.data;
  },

  getComments: async (findingId: string): Promise<FindingComment[]> => {
    const response = await api.get<FindingComment[]>(`/findings/${findingId}/comments`);
    return response.data;
  },

  addComment: async (
    findingId: string,
    content: string,
    parentId?: string,
    mentionedUserIds?: string[]
  ): Promise<FindingComment> => {
    const response = await api.post<FindingComment>(`/findings/${findingId}/comments`, {
      content,
      parent_id: parentId || null,
      mentioned_user_ids: mentionedUserIds || null,
    });
    return response.data;
  },

  postComment: async (
    findingId: string,
    content: string,
    parentId?: string,
    mentionedUserIds?: string[]
  ): Promise<FindingComment> => {
    const response = await api.post<FindingComment>(`/findings/${findingId}/comments`, {
      content,
      parent_id: parentId || null,
      mentioned_user_ids: mentionedUserIds || null,
    });
    return response.data;
  },

  resolveComment: async (
    findingId: string,
    commentId: string,
    isResolved: boolean = true
  ): Promise<FindingComment> => {
    const response = await api.patch<FindingComment>(`/findings/${findingId}/comments/${commentId}/resolve`, {
      is_resolved: isResolved,
    });
    return response.data;
  },

  deleteComment: async (findingId: string, commentId: string): Promise<void> => {
    await api.delete(`/findings/${findingId}/comments/${commentId}`);
  },

  getActivity: async (
    findingId: string,
    params?: { category?: string; page?: number; limit?: number }
  ): Promise<FindingActivityPaginatedResponse> => {
    const response = await api.get<FindingActivityPaginatedResponse>(`/findings/${findingId}/activity`, {
      params,
    });
    return response.data;
  },

  getResolutionProof: async (findingId: string): Promise<FindingResolutionProof> => {
    const response = await api.get<FindingResolutionProof>(`/findings/${findingId}/resolution-proof`);
    return response.data;
  },

  getAnalytics: async (params: FindingAnalyticsParams): Promise<FindingAnalyticsResponse> => {
    const response = await api.get<FindingAnalyticsResponse>("/findings/analytics", {
      params,
    });
    return response.data;
  },
};

export interface ComplianceHealthSummary {
  total_findings: number;
  open_findings: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  in_review: number;
  in_remediation: number;
  reassessment_required: number;
  resolved: number;
  reopened_count: number;
  summary_bullets: string[];
}

export interface StatusDistributionItem {
  status: string;
  count: number;
  percentage: number;
}

export interface SeverityDistributionItem {
  severity: string;
  count: number;
  percentage: number;
}

export interface FindingTrendPoint {
  period: string;
  created_count: number;
  date: string;
}

export interface ResolutionTrendPoint {
  period: string;
  resolved_count: number;
  date: string;
}

export interface RemediationPerformanceMetrics {
  average_cycles_per_resolved: number;
  resolved_first_cycle_count: number;
  resolved_multiple_cycles_count: number;
  rejected_remediation_count: number;
  pending_remediation_count: number;
  remediation_success_rate: number;
}

export interface HighRiskFindingItem {
  id: string;
  clause_id?: string | null;
  severity: string;
  lifecycle_status: string;
  reasoning?: string | null;
  created_at: string;
  age_days: number;
  is_reopened: boolean;
  document_name?: string | null;
}

export interface AgingFindingItem {
  id: string;
  clause_id?: string | null;
  severity: string;
  lifecycle_status: string;
  created_at: string;
  age_days: number;
  is_reopened: boolean;
  reopened_at?: string | null;
  document_name?: string | null;
}

export interface FindingAnalyticsResponse {
  organization_id: string;
  health_summary: ComplianceHealthSummary;
  status_distribution: StatusDistributionItem[];
  severity_distribution: SeverityDistributionItem[];
  open_finding_trend: FindingTrendPoint[];
  resolution_trend: ResolutionTrendPoint[];
  remediation_performance: RemediationPerformanceMetrics;
  needs_reassessment_count: number;
  reopened_findings_count: number;
  high_risk_findings: HighRiskFindingItem[];
  aging_findings: AgingFindingItem[];
  filter_applied: {
    date_range: string;
    from_date?: string | null;
    to_date?: string | null;
    policy_document_id?: string | null;
    regulation_id?: string | null;
    severity?: string | null;
    status?: string | null;
  };
}

export interface FindingAnalyticsParams {
  organization_id: string;
  date_range?: string;
  from_date?: string;
  to_date?: string;
  policy_document_id?: string;
  regulation_id?: string;
  severity?: string;
  status?: string;
}
