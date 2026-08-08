import { api } from "./api";
import {
  ReportDetailResponse,
  ReportItemResponse,
  ReportPaginatedResponse,
} from "@/types/report";

export const reportService = {
  /**
   * Fetch paginated list of reports from backend GET /reports
   */
  getReports: async (params?: {
    page?: number;
    page_size?: number;
    organization_id?: string;
    regulation_id?: string;
    status?: string;
    risk_level?: string;
    start_date?: string;
    end_date?: string;
    report_id?: string;
    policy_name?: string;
    sort_by?: string;
  }): Promise<ReportPaginatedResponse> => {
    const queryParams: Record<string, string | number> = {};
    if (params?.page) queryParams.page = params.page;
    if (params?.page_size) queryParams.page_size = params.page_size;
    if (params?.organization_id && params.organization_id !== "ALL") queryParams.organization_id = params.organization_id;
    if (params?.regulation_id && params.regulation_id !== "ALL") queryParams.regulation_id = params.regulation_id;
    if (params?.status && params.status !== "ALL") queryParams.status = params.status;
    if (params?.risk_level && params.risk_level !== "ALL") queryParams.risk_level = params.risk_level;
    if (params?.start_date) queryParams.start_date = params.start_date;
    if (params?.end_date) queryParams.end_date = params.end_date;
    if (params?.report_id) queryParams.report_id = params.report_id;
    if (params?.policy_name) queryParams.policy_name = params.policy_name;
    if (params?.sort_by) queryParams.sort_by = params.sort_by;

    const response = await api.get<ReportPaginatedResponse>("/reports", {
      params: queryParams,
    });
    return response.data;
  },

  /**
   * Fetch details for a specific report from GET /reports/{id}
   */
  getReportById: async (id: string): Promise<ReportDetailResponse> => {
    const response = await api.get<ReportDetailResponse>(`/reports/${id}`);
    return response.data;
  },

  /**
   * Fetch reports for an organization from GET /reports/organization/{organization_id}
   */
  getReportsByOrganization: async (
    organizationId: string,
    status?: string
  ): Promise<ReportItemResponse[]> => {
    const queryParams: Record<string, string> = {};
    if (status && status !== "ALL") queryParams.status = status;

    const response = await api.get<ReportItemResponse[]>(
      `/reports/organization/${organizationId}`,
      { params: queryParams }
    );
    return response.data;
  },

  /**
   * Download compliance report PDF from GET /reports/{id}/pdf
   */
  downloadReportPdf: async (reportId: string): Promise<void> => {
    const response = await api.get(`/reports/${reportId}/pdf`, {
      responseType: "blob",
    });

    const blob = new Blob([response.data], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `LexisGraph_Compliance_Report_${reportId}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  /**
   * Fetch clause-level findings for a report from GET /reports/{id}/findings
   */
  getReportFindings: async (reportId: string): Promise<any[]> => {
    const response = await api.get<any[]>(`/reports/${reportId}/findings`);
    return response.data;
  },

  /**
   * Soft delete a compliance report via DELETE /reports/{id}
   */
  deleteReport: async (reportId: string): Promise<void> => {
    await api.delete(`/reports/${reportId}`);
  },
};

export default reportService;
