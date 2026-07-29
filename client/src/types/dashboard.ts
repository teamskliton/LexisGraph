export interface KpiStats {
  total_organizations: number;
  total_regulations: number;
  total_policies: number;
  total_compliance_reports: number;
  average_compliance_score: number;
}

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  icon_type: "building" | "file" | "report" | "download" | string;
}

export interface ScoreDistribution {
  excellent: number;
  good: number;
  needs_review: number;
  high_risk: number;
}

export interface RiskBreakdown {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface ReportsOverTimeItem {
  label: string;
  count: number;
}

export interface TopOrganizationItem {
  id: string;
  name: string;
  avg_score: number;
  report_count: number;
}

export interface DashboardStatsResponse {
  kpis: KpiStats;
  recent_activity: ActivityItem[];
  score_distribution: ScoreDistribution;
  risk_breakdown: RiskBreakdown;
  reports_over_time: ReportsOverTimeItem[];
  top_organizations: TopOrganizationItem[];
}
