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
    status?: string;
  }): Promise<ReportPaginatedResponse> => {
    const queryParams: Record<string, string | number> = {};
    if (params?.page) queryParams.page = params.page;
    if (params?.page_size) queryParams.page_size = params.page_size;
    if (params?.status && params.status !== "ALL") {
      queryParams.status = params.status;
    }

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
};

export default reportService;
