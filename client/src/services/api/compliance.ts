import { api } from "../api";

export type ComplianceReportStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface ComplianceAnalyzeRequest {
  organization_id: string;
  regulation_id?: string;
  regulation_document_id?: string;
  policy_document_id: string;
}

export interface ComplianceAnalyzeResponse {
  job_id: string;
  report_id?: string | null;
  status: string;
  existing_report?: boolean;
}

export interface EvaluatedClause {
  regulation_clause_id: string;
  regulation_text: string;
  matched_policy_clause_id?: string | null;
  matched_policy_text?: string | null;
  similarity_score: number;
  graph_score?: number;
  status: "COMPLIANT" | "PARTIALLY_COMPLIANT" | "NON_COMPLIANT";
  reasoning: string;
  recommendation?: string | null;
}

export interface MissingClause {
  regulation_clause_id: string;
  regulation_text: string;
  reasoning: string;
  recommendation?: string | null;
}

export interface WeakClause {
  regulation_clause_id: string;
  regulation_text: string;
  matched_policy_text?: string | null;
  similarity_score: number;
  reasoning: string;
  recommendation?: string | null;
}

export interface ComplianceReportDetails {
  overall_score: number;
  status: string;
  summary: string;
  organization_id: string;
  regulation_document_id: string;
  policy_document_id: string;
  total_regulation_clauses: number;
  compliant_count: number;
  partially_compliant_count: number;
  non_compliant_count: number;
  evaluated_clauses: EvaluatedClause[];
  missing_clauses: MissingClause[];
  weak_clauses: WeakClause[];
  recommendations: string[];
}

export interface ComplianceReport {
  id: string;
  organization_id: string;
  regulation_id?: string;
  regulation_document_id: string;
  policy_document_id: string;
  overall_score?: number | null;
  risk_level?: string | null;
  executive_summary?: string | null;
  total_matches?: number | null;
  total_partial_matches?: number | null;
  total_missing?: number | null;
  processing_time_seconds?: number | null;
  processing_time_ms?: number | null;
  open_count?: number | null;
  in_review_count?: number | null;
  remediation_count?: number | null;
  resolved_count?: number | null;
  status: ComplianceReportStatus;
  summary?: string | null;
  details?: ComplianceReportDetails | null;
  report_json?: any;
  is_deleted?: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type ComplianceJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface ComplianceJob {
  id: string;
  job_id: string;
  report_id?: string | null;
  organization_id: string;
  regulation_id: string;
  regulation_document_id?: string | null;
  policy_document_id: string;
  status: ComplianceJobStatus;
  progress: number;
  current_step: string;
  error_message?: string | null;
  processing_time_ms?: number | null;
  processing_time?: number | null;
  created_by: string;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export const complianceService = {
  analyzeCompliance: async (data: ComplianceAnalyzeRequest): Promise<ComplianceAnalyzeResponse> => {
    const regId = data.regulation_id || data.regulation_document_id || "";
    const payload = {
      organization_id: data.organization_id,
      regulation_id: regId,
      regulation_document_id: regId,
      policy_document_id: data.policy_document_id,
    };
    const response = await api.post("/compliance/analyze", payload);
    return response.data;
  },

  getComplianceReport: async (reportId: string): Promise<ComplianceReport> => {
    const response = await api.get(`/compliance/${reportId}`);
    return response.data;
  },

  listComplianceReports: async (organizationId?: string): Promise<ComplianceReport[]> => {
    if (organizationId) {
      const response = await api.get(`/reports/organization/${organizationId}`);
      return response.data;
    }
    const response = await api.get("/reports");
    return response.data?.items || response.data || [];
  },

  deleteComplianceReport: async (reportId: string): Promise<void> => {
    await api.delete(`/compliance/${reportId}`);
  },

  getComplianceJob: async (jobId: string): Promise<ComplianceJob> => {
    const response = await api.get(`/jobs/${jobId}`);
    return response.data;
  },

  listComplianceJobs: async (organizationId?: string): Promise<ComplianceJob[]> => {
    const params = organizationId ? { organization_id: organizationId } : undefined;
    const response = await api.get("/jobs", { params });
    return response.data;
  },

  cancelComplianceJob: async (jobId: string): Promise<ComplianceJob> => {
    const response = await api.delete(`/jobs/${jobId}`);
    return response.data;
  },

  downloadReportPDF: async (reportId: string): Promise<Blob> => {
    const response = await api.get(`/compliance/${reportId}/export/pdf`, {
      responseType: "blob",
    });
    return response.data;
  },

  downloadReportJSON: async (reportId: string): Promise<Blob> => {
    const response = await api.get(`/compliance/${reportId}/export/json`, {
      responseType: "blob",
    });
    return response.data;
  },

  compareReports: async (reportId1: string, reportId2: string): Promise<unknown> => {
    const response = await api.get('/reports/compare', {
      params: { report_id_1: reportId1, report_id_2: reportId2 },
    });
    return response.data;
  },

  getReportFindings: async (reportId: string): Promise<unknown[]> => {
    const response = await api.get(`/reports/${reportId}/findings`);
    return response.data;
  },

  getComplianceOverview: async (organizationId?: string): Promise<ComplianceOverviewData> => {
    const params = organizationId ? { organization_id: organizationId } : undefined;
    const response = await api.get("/compliance/overview", { params });
    return response.data;
  },

  getComplianceCalendar: async (params?: {
    organization_id?: string;
    start_date?: string;
    end_date?: string;
    assigned_to_me?: boolean;
    overdue_only?: boolean;
    severity?: string;
  }): Promise<ComplianceCalendarData> => {
    const response = await api.get("/compliance/calendar", { params });
    return response.data;
  },
};

export interface DeadlineSummary {
  overdue_count: number;
  this_week_count: number;
  next_30_days_count: number;
}

export interface ComplianceDeadlineItem {
  finding_id: string;
  report_id: string;
  regulation_title?: string | null;
  policy_filename?: string | null;
  policy_clause_id?: string | null;
  regulation_clause_id?: string | null;
  status: string;
  lifecycle_status: string;
  severity: string;
  reasoning?: string | null;
  citation?: string | null;
  remediation_due_date: string;
  is_overdue: boolean;
  days_overdue: number;
  assigned_to?: string | null;
  assignee?: { id: string; full_name: string; email: string } | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceCalendarData {
  organization_id: string;
  organization_name: string;
  summary: DeadlineSummary;
  deadlines: ComplianceDeadlineItem[];
}

export interface ComplianceOverviewSummary {
  compliance_score?: number | null;
  compliance_status: string;
  total_findings: number;
  open_findings: number;
  in_review: number;
  remediation: number;
  resolved: number;
  critical_count: number;
  high_count: number;
  overdue_count: number;
  unassigned_count: number;
}

export interface TeamWorkloadItem {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  open_count: number;
  in_review_count: number;
  remediation_count: number;
  resolved_count: number;
  total_assigned: number;
}

export interface ReportExposureItem {
  report_id: string;
  regulation_title?: string | null;
  policy_filename?: string | null;
  open_count: number;
  high_critical_count: number;
  total_findings: number;
}

export interface OverdueFindingItem {
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
  assigned_to?: string | null;
  assignee?: { id: string; full_name: string; email: string } | null;
  remediation_due_date?: string | null;
  is_overdue?: boolean;
  days_overdue: number;
  comments_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ComplianceOverviewData {
  organization_id: string;
  organization_name: string;
  summary: ComplianceOverviewSummary;
  attention_required: Array<{
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
    assigned_to?: string | null;
    assignee?: { id: string; full_name: string; email: string } | null;
    comments_count?: number;
    created_at: string;
    updated_at: string;
  }>;
  priority_attention: Array<{
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
    assigned_to?: string | null;
    assignee?: { id: string; full_name: string; email: string } | null;
    remediation_due_date?: string | null;
    is_overdue?: boolean;
    comments_count?: number;
    created_at: string;
    updated_at: string;
  }>;
  team_workload: TeamWorkloadItem[];
  unassigned_findings: Array<{
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
    comments_count?: number;
    created_at: string;
    updated_at: string;
  }>;
  overdue_findings: OverdueFindingItem[];
  report_exposure: ReportExposureItem[];
  my_work: Array<{
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
    assigned_to?: string | null;
    assignee?: { id: string; full_name: string; email: string } | null;
    comments_count?: number;
    created_at: string;
    updated_at: string;
  }>;
  recent_activity: Array<{
    id: string;
    finding_id: string;
    user_name: string;
    event_type: string;
    title: string;
    description: string;
    created_at: string;
  }>;
  recent_reports: ComplianceReport[];
}

export const complianceApi = complianceService;

