export type ComplianceReportStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PENDING';

export interface ReportItemResponse {
  id: string;
  organization_id: string;
  regulation_id?: string;
  regulation_document_id: string;
  policy_document_id: string;
  overall_score: number | null;
  risk_level?: string | null;
  total_matches?: number | null;
  total_partial_matches?: number | null;
  total_missing?: number | null;
  report_status: ComplianceReportStatus;
  created_at: string;
  processing_time_seconds: number | null;
  processing_time_ms?: number | null;
  is_deleted?: boolean;
  report_title?: string;
  regulation_name?: string | null;
  policy_name?: string | null;
  organization_name?: string | null;
}

export interface ReportPaginatedResponse {
  total: number;
  page: number;
  page_size: number;
  items: ReportItemResponse[];
}

export interface ReportDetailResponse {
  id: string;
  organization_id: string;
  regulation_id?: string;
  regulation_document_id: string;
  policy_document_id: string;
  overall_score: number | null;
  risk_level?: string | null;
  summary: string | null;
  executive_summary?: string | null;
  recommendations: Record<string, unknown> | Array<unknown> | null;
  total_clauses: number | null;
  compliant_clauses: number | null;
  partial_clauses: number | null;
  non_compliant_clauses: number | null;
  total_matches?: number | null;
  total_partial_matches?: number | null;
  total_missing?: number | null;
  processing_time_seconds: number | null;
  processing_time_ms?: number | null;
  report_json?: any;
  report_status: ComplianceReportStatus;
  is_deleted?: boolean;
  created_at: string;
  updated_at: string;
  report_title?: string;
  regulation_name?: string | null;
  policy_name?: string | null;
  organization_name?: string | null;
}

export interface OrganizationReportSummary {
  total_reports: number;
  latest_score: number | null;
  latest_report_date: string | null;
  latest_risk_level: string | null;
  average_score: number | null;
  high_risk_count: number;
}

export interface ReportFilterParams {
  search?: string;
  status?: string;
  risk_level?: string;
  regulation_id?: string;
  start_date?: string;
  end_date?: string;
  idSearch?: string;
  sort_by?: 'newest' | 'oldest' | 'highest_score' | 'lowest_score';
}

