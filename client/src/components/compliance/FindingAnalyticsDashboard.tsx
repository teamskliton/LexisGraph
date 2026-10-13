"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  BarChart3,
  TrendingUp,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  Clock,
  CheckCircle,
  FileCheck2,
  Calendar,
  Layers,
  ChevronRight,
  Activity,
  Sparkles,
  Download,
  Info,
  Scale,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  FileText,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import {
  findingsService,
  FindingAnalyticsResponse,
  HighRiskFindingItem,
  AgingFindingItem,
} from "@/services/api/findings";
import { ReportExposureItem } from "@/services/api/compliance";
import { FindingDetailDrawer, FindingItem } from "./FindingDetailDrawer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface FindingAnalyticsDashboardProps {
  organizationId?: string;
  organizationName?: string;
  reportExposure?: ReportExposureItem[];
  onOpenFindingDrawer?: (item: FindingItem) => void;
}

type DateRangeOption = "7d" | "30d" | "90d" | "this_year" | "all";

export function FindingAnalyticsDashboard({
  organizationId,
  organizationName,
  reportExposure,
  onOpenFindingDrawer,
}: FindingAnalyticsDashboardProps) {
  const router = useRouter();

  // Filter state
  const [dateRange, setDateRange] = useState<DateRangeOption>("30d");

  // Attention Queue Tab (By Risk vs By Age)
  const [attentionView, setAttentionView] = useState<"RISK" | "AGE">("RISK");

  // Data & loading state
  const [analyticsData, setAnalyticsData] = useState<FindingAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Fallback local drawer state
  const [localFinding, setLocalFinding] = useState<FindingItem | null>(null);
  const [isLocalDrawerOpen, setIsLocalDrawerOpen] = useState(false);

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    const activeOrgId =
      organizationId ||
      (typeof window !== "undefined"
        ? localStorage.getItem("selected_organization_id") || undefined
        : undefined);

    if (!activeOrgId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await findingsService.getAnalytics({
        organization_id: activeOrgId,
        date_range: dateRange,
      });
      setAnalyticsData(data);
    } catch (err: any) {
      console.error("Failed loading finding analytics:", err);
      const rawDetail =
        err?.response?.data?.detail || "Failed to load Finding analytics and compliance health metrics.";
      setError(typeof rawDetail === "string" ? rawDetail : JSON.stringify(rawDetail));
      toast.error("Error loading compliance analytics.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, dateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Click-through helper to navigate to My Work / All Findings with pre-set filters
  const handleNavigateToFindings = (params: { lifecycle_status?: string; severity?: string }) => {
    const searchParams = new URLSearchParams();
    searchParams.set("view", "all");
    if (params.lifecycle_status) {
      searchParams.set("lifecycle_status", params.lifecycle_status);
    }
    if (params.severity) {
      searchParams.set("severity", params.severity);
    }
    router.push(`/compliance/my-work?${searchParams.toString()}`);
  };

  const handleOpenFinding = (item: HighRiskFindingItem | AgingFindingItem) => {
    const findingObj: FindingItem = {
      id: item.id,
      report_id: "",
      status: "NON_COMPLIANT",
      regulation_clause_id: item.clause_id || undefined,
      severity: item.severity,
      lifecycle_status: item.lifecycle_status,
      reasoning: (item as HighRiskFindingItem).reasoning || undefined,
      created_at: item.created_at,
    };

    if (onOpenFindingDrawer) {
      onOpenFindingDrawer(findingObj);
    } else {
      setLocalFinding(findingObj);
      setIsLocalDrawerOpen(true);
    }
  };

  // Export Analytics CSV
  const handleExportAnalytics = async () => {
    const activeOrgId =
      organizationId ||
      (typeof window !== "undefined"
        ? localStorage.getItem("selected_organization_id") || undefined
        : undefined);

    if (!activeOrgId) return;

    setIsExporting(true);
    try {
      const result = await findingsService.exportFindings(activeOrgId, {});
      const url = window.URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename || `lexisgraph-analytics-${dateRange}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`Exported ${result.count || "all"} findings successfully.`);
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Failed to export analytics findings.");
    } finally {
      setIsExporting(false);
    }
  };

  const summary = analyticsData?.health_summary;
  const remediationPerf = analyticsData?.remediation_performance;

  // Compute Core Metrics
  const totalFindings = summary?.total_findings || 0;
  const resolvedCount = summary?.resolved || 0;
  const activeCount =
    (summary?.open_findings || 0) +
    (summary?.in_review || 0) +
    (summary?.in_remediation || 0) +
    (summary?.reassessment_required || 0);

  const resolutionRate =
    totalFindings > 0 ? Math.round((resolvedCount / totalFindings) * 100) : 0;

  // Trend Chart Calculations
  const trendPoints = useMemo(() => {
    const createdMap = new Map<string, { period: string; label: string; created: number; resolved: number }>();

    analyticsData?.open_finding_trend?.forEach((pt) => {
      createdMap.set(pt.period, {
        period: pt.period,
        label: pt.label || pt.period,
        created: pt.created_count,
        resolved: 0,
      });
    });

    analyticsData?.resolution_trend?.forEach((pt) => {
      if (createdMap.has(pt.period)) {
        const item = createdMap.get(pt.period)!;
        item.resolved = pt.resolved_count;
      } else {
        createdMap.set(pt.period, {
          period: pt.period,
          label: pt.label || pt.period,
          created: 0,
          resolved: pt.resolved_count,
        });
      }
    });

    return Array.from(createdMap.values()).sort((a, b) => a.period.localeCompare(b.period));
  }, [analyticsData?.open_finding_trend, analyticsData?.resolution_trend]);

  const createdTotal = useMemo(
    () => trendPoints.reduce((acc, p) => acc + p.created, 0),
    [trendPoints]
  );
  const resolvedTotal = useMemo(
    () => trendPoints.reduce((acc, p) => acc + p.resolved, 0),
    [trendPoints]
  );
  const netChange = createdTotal - resolvedTotal;

  // Dynamic SVG Chart Max Scale
  const maxTrendVal = useMemo(() => {
    let maxVal = 1;
    trendPoints.forEach((p) => {
      if (p.created > maxVal) maxVal = p.created;
      if (p.resolved > maxVal) maxVal = p.resolved;
    });
    return Math.max(maxVal, 5);
  }, [trendPoints]);

  // Deterministic Risk Assessment
  const riskAssessment = useMemo(() => {
    if (!summary || totalFindings === 0) {
      return {
        level: "LOW_RISK",
        label: "Low Risk",
        badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
        message: "No active regulatory gaps detected in this workspace.",
        primaryDriver: "Zero compliance violations identified.",
      };
    }

    if (summary.critical_count > 0) {
      return {
        level: "HIGH_RISK",
        label: "High Risk",
        badgeClass: "bg-rose-500/10 text-rose-600 border-rose-500/30",
        message: `${summary.critical_count} critical-severity gap${summary.critical_count > 1 ? "s require" : " requires"} urgent remediation before statutory audit review.`,
        primaryDriver: "Critical severity non-compliance clauses.",
      };
    }

    if (summary.high_count > 0 || resolutionRate < 40) {
      return {
        level: "MEDIUM_RISK",
        label: "Medium Risk",
        badgeClass: "bg-amber-500/10 text-amber-600 border-amber-500/30",
        message: `High-severity findings account for the primary compliance gaps across tracked policies. ${activeCount} findings remain active.`,
        primaryDriver: "High severity gaps pending review or remediation.",
      };
    }

    return {
      level: "LOW_RISK",
      label: "Low Risk",
      badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
      message: `Active compliance findings are largely resolved (${resolutionRate}% resolution rate). Remaining items are low-to-medium priority.`,
      primaryDriver: "Stable operational resolution throughput.",
    };
  }, [summary, totalFindings, activeCount, resolutionRate]);

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      {/* ── 1. Controls & Filter Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Finding Analytics & Health
            </span>
            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
              Workspace Isolated
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Analyze finding distributions, remediation performance, and compliance risk trends for{" "}
            <strong>{organizationName || "Active Workspace"}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Date Range Selector */}
          <div className="flex items-center rounded-xl border border-border/60 bg-card p-1 shadow-2xs">
            {(
              [
                { label: "7 Days", value: "7d" },
                { label: "30 Days", value: "30d" },
                { label: "90 Days", value: "90d" },
                { label: "This Year", value: "this_year" },
                { label: "All Time", value: "all" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDateRange(opt.value)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                  dateRange === opt.value
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportAnalytics}
            disabled={isExporting || isLoading}
            className="gap-1.5 text-xs font-semibold cursor-pointer border-border hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isExporting ? "Exporting..." : "Export Analytics"}</span>
          </Button>
        </div>
      </div>

      {/* Snapshot vs Timeframe Notice */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1 -mt-4">
        <Info className="h-3.5 w-3.5 text-primary shrink-0" />
        <span>
          <strong>Current Snapshot</strong> totals reflect active workspace records. <strong>Periodic Trends</strong> reflect activity within the selected {dateRange === "all" ? "complete history" : dateRange}.
        </span>
      </div>

      {/* ── 2. Error Banner ── */}
      {error && (
        <Card className="border border-rose-500/30 bg-rose-500/5 p-6 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-rose-500 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">Analytics Unavailable</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
          </div>
          <Button
            size="sm"
            onClick={fetchAnalytics}
            className="text-xs font-semibold cursor-pointer bg-primary hover:bg-primary-hover text-primary-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Retry Analytics
          </Button>
        </Card>
      )}

      {/* ── 3. Compliance Health Executive Summary Card ── */}
      {!isLoading && summary && (
        <Card className="border border-primary/20 bg-card p-5 sm:p-6 space-y-4 shadow-sm dark:shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Compliance Health Summary</h3>
                <p className="text-xs text-muted-foreground">
                  Synthesized risk evaluation derived deterministically from {totalFindings} findings.
                </p>
              </div>
            </div>

            <Badge variant="outline" className={cn("text-xs px-2.5 py-1 font-bold", riskAssessment.badgeClass)}>
              {riskAssessment.label}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1 p-3.5 rounded-xl bg-background border border-border/60">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Executive Risk Assessment</span>
              <p className="text-foreground leading-relaxed font-medium">
                {riskAssessment.message}
              </p>
            </div>

            <div className="space-y-1 p-3.5 rounded-xl bg-background border border-border/60">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Primary Risk Driver</span>
              <p className="text-foreground leading-relaxed font-medium">
                {riskAssessment.primaryDriver}
              </p>
              <div className="flex items-center gap-2 pt-1 font-mono text-[11px] text-muted-foreground">
                <span>Critical: <strong className="text-rose-500">{summary.critical_count}</strong></span>
                <span>•</span>
                <span>High: <strong className="text-amber-500">{summary.high_count}</strong></span>
                <span>•</span>
                <span>Resolution Rate: <strong className="text-emerald-500">{resolutionRate}%</strong></span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── 4. Compact Analytical Metrics (3 Cards Replacing 7 Repeated Cards) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isLoading ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
        ) : (
          <>
            {/* Total Findings */}
            <Card
              onClick={() => handleNavigateToFindings({})}
              className="p-4 border border-border/60 bg-card hover:border-primary/40 transition-all cursor-pointer group rounded-2xl shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Total Findings
                </span>
                <Layers className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold tabular-nums text-foreground font-mono">
                  {totalFindings}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <span className="text-[11px] text-muted-foreground block mt-1">
                All tracked findings across completed assessments
              </span>
            </Card>

            {/* Active Findings */}
            <Card
              onClick={() => handleNavigateToFindings({ lifecycle_status: "OPEN" })}
              className="p-4 border border-amber-500/30 bg-amber-500/[0.03] hover:border-amber-500/60 transition-all cursor-pointer group rounded-2xl shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Active Findings
                </span>
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400 font-mono">
                  {activeCount}
                </span>
                <ChevronRight className="h-4 w-4 text-amber-400/50 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <span className="text-[11px] text-muted-foreground block mt-1">
                Unresolved items requiring legal review or remediation
              </span>
            </Card>

            {/* Resolution Rate */}
            <Card
              onClick={() => handleNavigateToFindings({ lifecycle_status: "RESOLVED" })}
              className="p-4 border border-emerald-500/30 bg-emerald-500/[0.03] hover:border-emerald-500/60 transition-all cursor-pointer group rounded-2xl shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Resolution Rate
                </span>
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 font-mono">
                  {resolutionRate}%
                </span>
                <ChevronRight className="h-4 w-4 text-emerald-400/50 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <span className="text-[11px] text-muted-foreground block mt-1">
                {resolvedCount} of {totalFindings} findings verified and closed
              </span>
            </Card>
          </>
        )}
      </div>

      {/* ── 5. Status & Severity Visual Distribution (Proportional Fix) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-sm rounded-2xl">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-primary" /> Finding Status Distribution
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              Total: {totalFindings}
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ) : !analyticsData?.status_distribution || analyticsData.status_distribution.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-6 text-center">No status distribution data.</p>
          ) : (
            <div className="space-y-3">
              {analyticsData.status_distribution.map((item) => {
                const count = item.count;
                // Proportional width calculation — 0% for zero count, never full-width!
                const pct = totalFindings > 0 ? Number(((count / totalFindings) * 100).toFixed(1)) : 0;

                let colorClass = "bg-blue-500";
                if (item.status === "RESOLVED") colorClass = "bg-emerald-500";
                if (item.status === "REMEDIATION") colorClass = "bg-amber-500";
                if (item.status === "IN_REVIEW") colorClass = "bg-primary";
                if (item.status === "REASSESSMENT_REQUIRED") colorClass = "bg-purple-500";
                if (item.status === "REOPENED") colorClass = "bg-rose-500";
                if (item.status === "REJECTED") colorClass = "bg-slate-400";

                return (
                  <div
                    key={item.status}
                    onClick={() => handleNavigateToFindings({ lifecycle_status: item.status })}
                    className="group cursor-pointer space-y-1.5 p-2 rounded-xl hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-foreground group-hover:text-primary transition-colors">
                        {item.label || item.status.replace("_", " ")}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono text-[11px]">{pct}%</span>
                        <Badge variant="outline" className="font-mono text-[10px] font-bold">
                          {count}
                        </Badge>
                      </div>
                    </div>
                    {/* Neutral empty track with strictly proportional fill */}
                    <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", colorClass)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Severity Distribution */}
        <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-sm rounded-2xl">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-rose-500" /> Finding Severity Breakdown
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">Risk Profile</span>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ) : !analyticsData?.severity_distribution || analyticsData.severity_distribution.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-6 text-center">No severity distribution data.</p>
          ) : (
            <div className="space-y-3">
              {analyticsData.severity_distribution.map((item) => {
                const count = item.count;
                const pct = totalFindings > 0 ? Number(((count / totalFindings) * 100).toFixed(1)) : 0;

                let colorClass = "bg-emerald-500";
                let badgeClass = "text-emerald-600 border-emerald-500/30 bg-emerald-500/10";
                if (item.severity === "CRITICAL") {
                  colorClass = "bg-rose-500";
                  badgeClass = "text-rose-600 border-rose-500/30 bg-rose-500/10";
                } else if (item.severity === "HIGH") {
                  colorClass = "bg-orange-500";
                  badgeClass = "text-orange-600 border-orange-500/30 bg-orange-500/10";
                } else if (item.severity === "MEDIUM") {
                  colorClass = "bg-amber-500";
                  badgeClass = "text-amber-600 border-amber-500/30 bg-amber-500/10";
                }

                return (
                  <div
                    key={item.severity}
                    onClick={() => handleNavigateToFindings({ severity: item.severity })}
                    className="group cursor-pointer space-y-1.5 p-2 rounded-xl hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs font-medium">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-[10px] font-bold uppercase", badgeClass)}>
                          {item.severity}
                        </Badge>
                        <span className="text-foreground group-hover:text-primary transition-colors">
                          {item.label || item.severity} Impact Findings
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono text-[11px]">{pct}%</span>
                        <span className="font-bold text-foreground font-mono">{count}</span>
                      </div>
                    </div>
                    {/* Neutral empty track with strictly proportional fill */}
                    <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", colorClass)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── 6. Finding Trends & Remediation Performance Section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Responsive Finding Trends (Chart) */}
        <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-sm rounded-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-primary" /> Finding Trends
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Cadence of new gaps identified vs verified resolutions.
              </p>
            </div>

            {/* Series Legend */}
            <div className="flex items-center gap-3 text-[11px] font-medium">
              <span className="flex items-center gap-1.5 text-blue-500">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Created
              </span>
              <span className="flex items-center gap-1.5 text-emerald-500">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Resolved
              </span>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-52 w-full rounded-xl" />
          ) : trendPoints.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Activity className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="text-xs text-muted-foreground italic">
                No activity recorded for this period ({dateRange}).
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats Header */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-2.5 rounded-xl bg-background border border-border/60">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Created in Period</span>
                  <span className="text-base font-bold text-blue-500 font-mono">+{createdTotal}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-background border border-border/60">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Resolved in Period</span>
                  <span className="text-base font-bold text-emerald-500 font-mono">+{resolvedTotal}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-background border border-border/60">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Net Change</span>
                  <span className={cn(
                    "text-base font-bold font-mono flex items-center justify-center gap-0.5",
                    netChange > 0 ? "text-rose-500" : netChange < 0 ? "text-emerald-500" : "text-muted-foreground"
                  )}>
                    {netChange > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : netChange < 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                    {netChange > 0 ? `+${netChange}` : netChange}
                  </span>
                </div>
              </div>

              {/* Responsive SVG Bar Trend Chart */}
              <div className="pt-2">
                <div className="h-44 w-full flex items-end gap-2 sm:gap-3 px-2 border-b border-border/60 pb-2">
                  {trendPoints.map((pt) => {
                    const createdHeight = Math.max(Math.round((pt.created / maxTrendVal) * 100), pt.created > 0 ? 8 : 0);
                    const resolvedHeight = Math.max(Math.round((pt.resolved / maxTrendVal) * 100), pt.resolved > 0 ? 8 : 0);

                    return (
                      <div key={pt.period} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                        {/* Tooltip on hover */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 z-20 pointer-events-none bg-popover text-popover-foreground text-[10px] p-1.5 rounded-md shadow-md border border-border whitespace-nowrap">
                          <p className="font-bold">{pt.label}</p>
                          <p className="text-blue-500">Created: +{pt.created}</p>
                          <p className="text-emerald-500">Resolved: +{pt.resolved}</p>
                        </div>

                        {/* Dual Bar Pair */}
                        <div className="w-full flex items-end justify-center gap-1 h-32">
                          <div
                            className="w-1/2 max-w-[14px] bg-blue-500 rounded-t-sm transition-all duration-300 group-hover:brightness-110"
                            style={{ height: `${createdHeight}%` }}
                          />
                          <div
                            className="w-1/2 max-w-[14px] bg-emerald-500 rounded-t-sm transition-all duration-300 group-hover:brightness-110"
                            style={{ height: `${resolvedHeight}%` }}
                          />
                        </div>

                        {/* X-axis Label */}
                        <span className="text-[10px] font-mono text-muted-foreground mt-2 truncate w-full text-center">
                          {pt.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Remediation Performance Metrics */}
        <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-sm rounded-2xl">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-primary" /> Remediation Performance
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Verification throughput and audit cycle performance.
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
              Auditable Cycles
            </Badge>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3.5">
              {/* Avg cycles */}
              <div className="p-3.5 rounded-xl border border-border/60 bg-background space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Average Cycles
                </span>
                <p className="text-xl font-bold font-mono text-foreground">
                  {remediationPerf?.average_cycles_per_resolved != null && remediationPerf.average_cycles_per_resolved > 0
                    ? `${remediationPerf.average_cycles_per_resolved}x`
                    : "1.0x"}
                </p>
                <span className="text-[10px] text-muted-foreground">Per resolved finding</span>
              </div>

              {/* Success Rate */}
              <div className="p-3.5 rounded-xl border border-border/60 bg-background space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  1st Cycle Success
                </span>
                <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {remediationPerf?.resolved_first_cycle_count && remediationPerf.resolved_first_cycle_count > 0
                    ? `${remediationPerf.remediation_success_rate || 100}%`
                    : "Not enough data"}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {remediationPerf?.resolved_first_cycle_count
                    ? `${remediationPerf.resolved_first_cycle_count} resolved on 1st submission`
                    : "Requires completed cycles"}
                </span>
              </div>

              {/* Rejected count */}
              <div className="p-3.5 rounded-xl border border-border/60 bg-background space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Rejected Cycles
                </span>
                <p className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
                  {remediationPerf?.rejected_remediation_count || 0}
                </p>
                <span className="text-[10px] text-muted-foreground">Failed verifier review</span>
              </div>

              {/* Multi-cycle count */}
              <div className="p-3.5 rounded-xl border border-border/60 bg-background space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Multi-Cycle Fixes
                </span>
                <p className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  {remediationPerf?.resolved_multiple_cycles_count || 0}
                </p>
                <span className="text-[10px] text-muted-foreground">Required 2+ iterations</span>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── 7. Regulatory Exposure & Findings Requiring Attention ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Regulatory Exposure (Moved from Operations to Analytics) */}
        <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-sm rounded-2xl">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Scale className="h-4 w-4 text-primary" /> Regulatory Exposure
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Statutory exposure aggregated by regulation for this workspace.
              </p>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              {reportExposure?.length || 0} Assessed
            </span>
          </div>

          {!reportExposure || reportExposure.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-8 text-center">
              No regulatory exposure data available for this workspace.
            </p>
          ) : (
            <div className="space-y-3">
              {reportExposure.map((exp) => (
                <div
                  key={exp.report_id}
                  onClick={() => router.push(`/compliance/reports/${exp.report_id}`)}
                  className="p-3 rounded-xl border border-border/60 bg-background hover:bg-muted/30 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <h5 className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                      {exp.regulation_title || `Report #${exp.report_id.slice(0, 8)}`}
                    </h5>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      Policy: {exp.policy_filename || "Policy Document"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] font-semibold bg-amber-500/10 text-amber-600 border-amber-500/30">
                      {exp.open_count} Open
                    </Badge>
                    {exp.high_critical_count > 0 && (
                      <Badge variant="outline" className="text-[10px] font-bold bg-rose-500/10 text-rose-600 border-rose-500/30">
                        {exp.high_critical_count} High/Crit
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Consolidated: Findings Requiring Attention (By Risk / By Age Toggle) */}
        <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-sm rounded-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 text-rose-500" /> Findings Requiring Attention
              </h4>
              <p className="text-[11px] text-muted-foreground">
                High-impact gaps prioritized by severity or aging duration.
              </p>
            </div>

            {/* Toggle: By Risk vs By Age */}
            <div className="flex items-center rounded-lg border border-border/60 bg-background p-0.5">
              <button
                type="button"
                onClick={() => setAttentionView("RISK")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer",
                  attentionView === "RISK"
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                By Risk
              </button>
              <button
                type="button"
                onClick={() => setAttentionView("AGE")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer",
                  attentionView === "AGE"
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                By Age
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : attentionView === "RISK" ? (
            !analyticsData?.high_risk_findings || analyticsData.high_risk_findings.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-8 text-center">
                No high or critical risk unresolved findings.
              </p>
            ) : (
              <div className="space-y-2.5">
                {analyticsData.high_risk_findings.slice(0, 5).map((f) => (
                  <div
                    key={f.id}
                    onClick={() => handleOpenFinding(f)}
                    className="p-3 rounded-xl border border-border/60 bg-background hover:bg-muted/30 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-bold uppercase",
                            f.severity === "CRITICAL"
                              ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                              : "bg-orange-500/10 text-orange-600 border-orange-500/30"
                          )}
                        >
                          {f.severity}
                        </Badge>
                        <span className="text-xs font-semibold text-foreground truncate">
                          {f.clause_id ? `Clause ${f.clause_id}` : "Regulatory Non-Compliance Gap"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {f.reasoning || "Statutory compliance gap requires immediate mitigation."}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-mono text-muted-foreground">{f.age_days}d open</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            !analyticsData?.aging_findings || analyticsData.aging_findings.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-8 text-center">
                No open aging findings found.
              </p>
            ) : (
              <div className="space-y-2.5">
                {analyticsData.aging_findings.slice(0, 5).map((f) => (
                  <div
                    key={f.id}
                    onClick={() => handleOpenFinding(f)}
                    className="p-3 rounded-xl border border-border/60 bg-background hover:bg-muted/30 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {f.clause_id ? `Clause ${f.clause_id}` : "Aging Compliance Gap"}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {f.lifecycle_status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">
                        Created: {format(new Date(f.created_at), "dd MMM yyyy")}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-bold font-mono",
                          f.age_days > 30
                            ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                        )}
                      >
                        {f.age_days}d open
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </Card>
      </div>

      {/* ── Slide-over Finding Detail Drawer (Fallback) ── */}
      {localFinding && (
        <FindingDetailDrawer
          finding={localFinding}
          isOpen={isLocalDrawerOpen}
          onClose={() => {
            setIsLocalDrawerOpen(false);
            setLocalFinding(null);
          }}
          onFindingUpdated={() => {
            fetchAnalytics();
          }}
          organizationId={organizationId}
        />
      )}
    </div>
  );
}
