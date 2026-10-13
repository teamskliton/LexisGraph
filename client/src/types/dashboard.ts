export interface KpiStats {
  total_organizations: number;
  total_regulations: number;
  total_policies: number;
  total_compliance_reports: number;
  average_compliance_score: number;
}

export interface ComplianceKpiStats {
  compliance_score?: number | null;
  score_trend_delta?: number | null;
  critical_findings: number;
  needs_review: number;
  compliant_clauses: number;
  pending_analyses: number;
  total_regulations?: number;
  total_policies?: number;
  total_compliance_reports?: number;
  average_compliance_score?: number;
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

export interface OrgScoreAnalyticsItem {
  id: string;
  name: string;
  avg_score: number;
  report_count: number;
}

export type TopOrganizationItem = OrgScoreAnalyticsItem;

export interface RecentReportItem {
  id: string;
  name: string;
  organization_name: string;
  compliance_score: number | null;
  created_at: string;
  status: string;
  risk_level?: string | null;
}

export interface ComplianceTrendPoint {
  report_id: string;
  date: string;
  timestamp: string;
  score: number;
  report_name?: string | null;
}

export interface SeverityBreakdown {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface GraphOverviewStats {
  indexed_regulations: number;
  indexed_policies: number;
  connected_entities: number;
  unmapped_policies: number;
  mapping_status: string;
}

export interface PriorityActionItem {
  id: string;
  title: string;
  description: string;
  severity: "Critical" | "High" | "Medium" | "Low" | string;
  relevant_policy?: string | null;
  relevant_regulation?: string | null;
  policy_id?: string | null;
  report_id?: string | null;
  regulation_id?: string | null;
  action_label: string;
  action_type: "policy" | "finding" | "regulation" | string;
  confidence?: number | null;
  confidence_label?: string | null;
}

export interface DashboardStatsResponse {
  organization_id?: string;
  organization_name?: string;
  risk_status?: string;
  last_analysis_date?: string | null;
  kpis: KpiStats;
  compliance_kpis?: ComplianceKpiStats;
  compliance_trend?: ComplianceTrendPoint[];
  findings_severity?: SeverityBreakdown;
  graph_overview?: GraphOverviewStats;
  priority_actions?: PriorityActionItem[];
  recent_reports: RecentReportItem[];
  recent_activity: ActivityItem[];
  score_distribution?: ScoreDistribution;
  risk_breakdown?: RiskBreakdown;
  reports_over_time?: ReportsOverTimeItem[];
  org_scores?: OrgScoreAnalyticsItem[];
}

export type RecommendationPriority = "Critical" | "High" | "Medium" | "Low";

export type RecommendationType =
  | "Critical Compliance Gap"
  | "Policy Update"
  | "New Regulation"
  | "Upcoming Deadline"
  | "Knowledge Graph Improvement"
  | "Low Confidence Analysis"
  | "Recently Improved Compliance";

export interface ExecutiveRecommendation {
  id: string;
  priority: RecommendationPriority;
  type: RecommendationType;
  title: string;
  explanation: string;
  actionLabel: string;
  actionUrl?: string;
  confidence: number;
  confidence_label?: string;
  affectedOrganization?: string;
  regulation?: string;
  policy?: string;
  policy_id?: string;
  report_id?: string;
  regulation_id?: string;
  onAction?: () => void;
}

export interface ExecutiveAIRecommendationsProps {
  recommendations?: ExecutiveRecommendation[];
  summary?: string;
  isLoading?: boolean;
  onRecommendationAction?: (recommendation: ExecutiveRecommendation) => void;
  className?: string;
}
