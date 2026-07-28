import { api } from "../api";

export type ComplianceReportStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface ComplianceAnalyzeRequest {
  organization_id: string;
  regulation_document_id: string;
  policy_document_id: string;
}

export interface ComplianceAnalyzeResponse {
  report_id: string;
  status: ComplianceReportStatus;
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
  regulation_document_id: string;
  policy_document_id: string;
  overall_score?: number | null;
  status: ComplianceReportStatus;
  summary?: string | null;
  details?: ComplianceReportDetails | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const complianceService = {
  analyzeCompliance: async (data: ComplianceAnalyzeRequest): Promise<ComplianceAnalyzeResponse> => {
    const response = await api.post("/compliance/analyze", data);
    return response.data;
  },

  getComplianceReport: async (reportId: string): Promise<ComplianceReport> => {
    const response = await api.get(`/compliance/${reportId}`);
    return response.data;
  },

  listComplianceReports: async (organizationId?: string): Promise<ComplianceReport[]> => {
    const params = organizationId ? { organization_id: organizationId } : undefined;
    const response = await api.get("/compliance/reports", { params });
    return response.data;
  },

  deleteComplianceReport: async (reportId: string): Promise<void> => {
    await api.delete(`/compliance/${reportId}`);
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
};

