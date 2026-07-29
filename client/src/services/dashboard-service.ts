import { api } from "./api";
import { DashboardStatsResponse } from "@/types/dashboard";

export const dashboardService = {
  /**
   * Fetch live aggregated dashboard statistics
   */
  getStats: async (): Promise<DashboardStatsResponse> => {
    const response = await api.get<DashboardStatsResponse>("/dashboard/stats");
    return response.data;
  },
};

export default dashboardService;
