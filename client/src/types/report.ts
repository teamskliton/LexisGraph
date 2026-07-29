export type ComplianceReportStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PENDING';

export interface ReportItemResponse {
  id: string;
  organization_id: string;
  regulation_document_id: string;
  policy_document_id: string;
  overall_score: number | null;
  report_status: ComplianceReportStatus;
  created_at: string;
  processing_time_seconds: number | null;
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
  regulation_document_id: string;
  policy_document_id: string;
  overall_score: number | null;
  summary: string | null;
  recommendations: Record<string, unknown> | Array<unknown> | null;
  total_clauses: number | null;
  compliant_clauses: number | null;
  partial_clauses: number | null;
  non_compliant_clauses: number | null;
  processing_time_seconds: number | null;
  report_status: ComplianceReportStatus;
  created_at: string;
  updated_at: string;
}

export interface ReportFilterParams {
  status?: string;
  orgSearch?: string;
  idSearch?: string;
  sortOrder?: 'newest' | 'oldest';
}
