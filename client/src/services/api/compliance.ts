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

  compareReports: async (reportId1: string, reportId2: string): Promise<any> => {
    const response = await api.get('/reports/compare', {
      params: { report_id_1: reportId1, report_id_2: reportId2 },
    });
    return response.data;
  },

  getReportFindings: async (reportId: string): Promise<any[]> => {
    const response = await api.get(`/reports/${reportId}/findings`);
    return response.data;
  },
};

export const complianceApi = complianceService;

