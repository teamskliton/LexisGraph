"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  BarChart3,
  TrendingUp,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertOctagon,
  RotateCcw,
  FileCheck2,
  Calendar,
  Layers,
  ArrowRight,
  ExternalLink,
  Info,
  ChevronRight,
  Activity,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import {
  findingsService,
  FindingAnalyticsResponse,
  HighRiskFindingItem,
  AgingFindingItem,
} from "@/services/api/findings";
import { FindingDetailDrawer, FindingItem } from "./FindingDetailDrawer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface FindingAnalyticsDashboardProps {
  organizationId?: string;
  organizationName?: string;
}

type DateRangeOption = "7d" | "30d" | "90d" | "this_year" | "all";

export function FindingAnalyticsDashboard({
  organizationId,
  organizationName,
}: FindingAnalyticsDashboardProps) {
  const router = useRouter();

  // Filter state
  const [dateRange, setDateRange] = useState<DateRangeOption>("30d");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  // Data & loading state
  const [analyticsData, setAnalyticsData] = useState<FindingAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer state for inspecting high-risk / aging findings directly
  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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
        severity: selectedSeverity !== "ALL" ? selectedSeverity : undefined,
        status: selectedStatus !== "ALL" ? selectedStatus : undefined,
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
  }, [organizationId, dateRange, selectedSeverity, selectedStatus]);

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

  const handleOpenDrawer = (item: HighRiskFindingItem | AgingFindingItem) => {
    setSelectedFinding({
      id: item.id,
      report_id: "",
      status: "NON_COMPLIANT",
      regulation_clause_id: item.clause_id || undefined,
      severity: item.severity,
      lifecycle_status: item.lifecycle_status,
      reasoning: (item as HighRiskFindingItem).reasoning || undefined,
      created_at: item.created_at,
    });
    setIsDrawerOpen(true);
  };

  const summary = analyticsData?.health_summary;
  const remediationPerf = analyticsData?.remediation_performance;

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      {/* ── 1. Controls & Filter Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Analytics & Compliance Health
            </span>
            <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 border-indigo-500/30">
              Sprint 7.11
            </Badge>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl mt-0.5">
            Finding Intelligence & Risk Trends
          </h2>
          <p className="text-xs text-muted-foreground">
            Deterministic compliance posture, remediation throughput, reassessment status, and risk distributions for{" "}
            <strong>{organizationName || "Active Organization"}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date Range Selector */}
          <div className="flex items-center rounded-lg border border-border/60 bg-card p-1 shadow-2xs">
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
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                  dateRange === opt.value
                    ? "bg-indigo-600 text-white shadow-2xs"
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
            onClick={fetchAnalytics}
            disabled={isLoading}
            className="gap-1.5 text-xs cursor-pointer"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            <span>Refresh</span>
          </Button>
        </div>
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
            className="text-xs font-semibold cursor-pointer bg-indigo-600 text-white"
          >
            Retry Analytics
          </Button>
        </Card>
      )}

      {/* ── 3. Compliance Health Executive Summary Card ── */}
      {!isLoading && summary && (
        <Card className="border border-indigo-500/30 bg-indigo-500/5 p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-500/20 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Compliance Health Summary</h3>
                <p className="text-xs text-muted-foreground">
                  Synthesized status derived deterministically from {summary.total_findings} Finding records.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {summary.critical_count > 0 ? (
                <Badge className="bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 text-xs px-2.5 py-1 font-bold">
                  {summary.critical_count} Critical Gap{summary.critical_count > 1 ? "s" : ""}
                </Badge>
              ) : (
                <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 text-xs px-2.5 py-1 font-bold">
                  Zero Critical Gaps
                </Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {summary.summary_bullets.map((bullet, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 p-3 rounded-lg border border-border/40 bg-background/60 text-xs"
              >
                <CheckCircle className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                <span className="text-foreground/90 font-medium">{bullet}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── 4. Core KPI Stat Cards (7 Interactive Tiles) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {isLoading ? (
          [...Array(7)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            {/* 1. Total Findings */}
            <Card
              onClick={() => handleNavigateToFindings({})}
              className="p-3.5 border border-border/60 bg-card hover:border-indigo-500/50 hover:bg-muted/30 transition-all cursor-pointer group shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total
                </span>
                <Layers className="h-3.5 w-3.5 text-muted-foreground group-hover:text-indigo-500 transition-colors" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold tabular-nums text-foreground font-mono">
                  {summary?.total_findings || 0}
                </span>
                <ChevronRight className="h-3 w-3 text-muted-foreground/50 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <span className="text-[10px] text-muted-foreground block mt-0.5">All tracked Findings</span>
            </Card>

            {/* 2. Open Findings */}
            <Card
              onClick={() => handleNavigateToFindings({ lifecycle_status: "OPEN" })}
              className="p-3.5 border border-blue-500/30 bg-blue-500/5 hover:border-blue-500 hover:bg-blue-500/10 transition-all cursor-pointer group shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Open
                </span>
                <ShieldAlert className="h-3.5 w-3.5 text-blue-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400 font-mono">
                  {summary?.open_findings || 0}
                </span>
                <ChevronRight className="h-3 w-3 text-blue-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <span className="text-[10px] text-muted-foreground block mt-0.5">Awaiting resolution</span>
            </Card>

            {/* 3. In Review */}
            <Card
              onClick={() => handleNavigateToFindings({ lifecycle_status: "IN_REVIEW" })}
              className="p-3.5 border border-indigo-500/30 bg-indigo-500/5 hover:border-indigo-500 hover:bg-indigo-500/10 transition-all cursor-pointer group shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  In Review
                </span>
                <Clock className="h-3.5 w-3.5 text-indigo-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400 font-mono">
                  {summary?.in_review || 0}
                </span>
                <ChevronRight className="h-3 w-3 text-indigo-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <span className="text-[10px] text-muted-foreground block mt-0.5">Reviewer queue</span>
            </Card>

            {/* 4. In Remediation */}
            <Card
              onClick={() => handleNavigateToFindings({ lifecycle_status: "REMEDIATION" })}
              className="p-3.5 border border-amber-500/30 bg-amber-500/5 hover:border-amber-500 hover:bg-amber-500/10 transition-all cursor-pointer group shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Remediation
                </span>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400 font-mono">
                  {summary?.in_remediation || 0}
                </span>
                <ChevronRight className="h-3 w-3 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <span className="text-[10px] text-muted-foreground block mt-0.5">Active fixing plans</span>
            </Card>

            {/* 5. Needs Reassessment */}
            <Card
              onClick={() => handleNavigateToFindings({ lifecycle_status: "REASSESSMENT_REQUIRED" })}
              className="p-3.5 border border-purple-500/30 bg-purple-500/5 hover:border-purple-500 hover:bg-purple-500/10 transition-all cursor-pointer group shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  Reassess
                </span>
                <FileCheck2 className="h-3.5 w-3.5 text-purple-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold tabular-nums text-purple-600 dark:text-purple-400 font-mono">
                  {summary?.reassessment_required || 0}
                </span>
                <ChevronRight className="h-3 w-3 text-purple-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <span className="text-[10px] text-muted-foreground block mt-0.5">Sprint 7.9 triggers</span>
            </Card>

            {/* 6. Reopened */}
            <Card
              onClick={() => handleNavigateToFindings({ lifecycle_status: "REOPENED" })}
              className="p-3.5 border border-rose-500/30 bg-rose-500/5 hover:border-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer group shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Reopened
                </span>
                <RotateCcw className="h-3.5 w-3.5 text-rose-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400 font-mono">
                  {summary?.reopened_count || 0}
                </span>
                <ChevronRight className="h-3 w-3 text-rose-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <span className="text-[10px] text-muted-foreground block mt-0.5">Sprint 7.8 audits</span>
            </Card>

            {/* 7. Resolved */}
            <Card
              onClick={() => handleNavigateToFindings({ lifecycle_status: "RESOLVED" })}
              className="p-3.5 border border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500 hover:bg-emerald-500/10 transition-all cursor-pointer group shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Resolved
                </span>
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 font-mono">
                  {summary?.resolved || 0}
                </span>
                <ChevronRight className="h-3 w-3 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <span className="text-[10px] text-muted-foreground block mt-0.5">Verified & closed</span>
            </Card>
          </>
        )}
      </div>

      {/* ── 5. Status & Severity Visual Distribution ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-indigo-500" /> Finding Status Distribution
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              Total: {summary?.total_findings || 0}
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !analyticsData?.status_distribution || analyticsData.status_distribution.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-6 text-center">No status distribution data.</p>
          ) : (
            <div className="space-y-3.5">
              {analyticsData.status_distribution.map((item) => {
                let colorClass = "bg-blue-500";
                if (item.status === "RESOLVED") colorClass = "bg-emerald-500";
                if (item.status === "REMEDIATION") colorClass = "bg-amber-500";
                if (item.status === "IN_REVIEW") colorClass = "bg-indigo-500";
                if (item.status === "REASSESSMENT_REQUIRED") colorClass = "bg-purple-500";
                if (item.status === "REOPENED") colorClass = "bg-rose-500";
                if (item.status === "REJECTED") colorClass = "bg-slate-500";

                return (
                  <div
                    key={item.status}
                    onClick={() => handleNavigateToFindings({ lifecycle_status: item.status })}
                    className="group cursor-pointer space-y-1.5 p-2 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {item.status.replace("_", " ")}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono text-[11px]">{item.percentage}%</span>
                        <Badge variant="outline" className="font-mono text-[10px] font-bold">
                          {item.count}
                        </Badge>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", colorClass)}
                        style={{ width: `${Math.max(item.percentage, item.count > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Severity Distribution */}
        <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-rose-500" /> Finding Severity Breakdown
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">Risk Profile</span>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !analyticsData?.severity_distribution || analyticsData.severity_distribution.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-6 text-center">No severity distribution data.</p>
          ) : (
            <div className="space-y-3.5">
              {analyticsData.severity_distribution.map((item) => {
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
                    className="group cursor-pointer space-y-1.5 p-2 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs font-medium">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-[10px] font-bold uppercase", badgeClass)}>
                          {item.severity}
                        </Badge>
                        <span className="text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {item.severity} Impact Findings
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono text-[11px]">{item.percentage}%</span>
                        <span className="font-bold text-foreground font-mono">{item.count}</span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", colorClass)}
                        style={{ width: `${Math.max(item.percentage, item.count > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── 6. Trends & Remediation Performance Section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compliance Finding Trends (Timeline) */}
        <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-indigo-500" /> Finding Creation & Resolution Trends
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">Cadence</span>
          </div>

          {isLoading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : (!analyticsData?.open_finding_trend || analyticsData.open_finding_trend.length === 0) &&
            (!analyticsData?.resolution_trend || analyticsData.resolution_trend.length === 0) ? (
            <div className="py-10 text-center space-y-2">
              <Activity className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="text-xs text-muted-foreground italic">
                No historical trend points recorded in the selected date range ({dateRange}).
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">New Gaps Identified</span>
                  <p className="text-lg font-bold text-foreground font-mono">
                    {analyticsData?.open_finding_trend?.reduce((acc, p) => acc + p.created_count, 0) || 0}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                    Resolutions Verified
                  </span>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {analyticsData?.resolution_trend?.reduce((acc, p) => acc + p.resolved_count, 0) || 0}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Periodic Activity Breakdown
                </span>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {analyticsData?.open_finding_trend?.map((pt) => {
                    const matchRes = analyticsData?.resolution_trend?.find((r) => r.period === pt.period);
                    return (
                      <div
                        key={pt.period}
                        className="flex items-center justify-between text-xs p-2 rounded-md bg-muted/30 border border-border/30"
                      >
                        <span className="font-mono text-muted-foreground">{pt.period}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-blue-500 font-mono">+{pt.created_count} created</span>
                          <span className="text-emerald-500 font-mono">
                            +{matchRes?.resolved_count || 0} resolved
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Remediation Performance Metrics */}
        <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-indigo-500" /> Remediation Engine Performance
            </span>
            <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 border-indigo-500/30">
              Auditable Cycles
            </Badge>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3.5">
              {/* Avg cycles */}
              <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Average Cycles
                </span>
                <p className="text-xl font-bold font-mono text-foreground">
                  {remediationPerf?.average_cycles_per_resolved != null
                    ? `${remediationPerf.average_cycles_per_resolved}x`
                    : "1.0x"}
                </p>
                <span className="text-[10px] text-muted-foreground">Per resolved Finding</span>
              </div>

              {/* Success Rate */}
              <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  1st Cycle Success
                </span>
                <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {remediationPerf?.remediation_success_rate || 100}%
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {remediationPerf?.resolved_first_cycle_count || 0} resolved on 1st submission
                </span>
              </div>

              {/* Rejected count */}
              <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Rejected Cycles
                </span>
                <p className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
                  {remediationPerf?.rejected_remediation_count || 0}
                </p>
                <span className="text-[10px] text-muted-foreground">Failed verifier review</span>
              </div>

              {/* Multi-cycle count */}
              <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-1">
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

      {/* ── 7. High-Risk Findings & Aging Findings Queues ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* High Risk Unresolved Findings */}
        <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <ShieldX className="h-4 w-4 text-rose-500" /> High-Risk Unresolved Findings
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => handleNavigateToFindings({ severity: "CRITICAL" })}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1"
            >
              <span>View All Critical</span>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
          ) : !analyticsData?.high_risk_findings || analyticsData.high_risk_findings.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-6 text-center">
              No high or critical risk unresolved findings.
            </p>
          ) : (
            <div className="space-y-2.5">
              {analyticsData.high_risk_findings.slice(0, 5).map((f) => (
                <div
                  key={f.id}
                  onClick={() => handleOpenDrawer(f)}
                  className="p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
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
                      <span className="text-xs font-bold text-foreground font-mono">
                        {f.clause_id || `ID #${f.id.slice(0, 8)}`}
                      </span>
                      {f.is_reopened && (
                        <Badge className="bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 text-[9px]">
                          Reopened
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {f.reasoning || "Compliance gap requires mitigation"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-muted-foreground">{f.age_days}d old</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Aging Findings (Oldest Open) */}
        <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-amber-500" /> Aging Finding Queue
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">Oldest Open Items</span>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
          ) : !analyticsData?.aging_findings || analyticsData.aging_findings.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-6 text-center">No open aging findings found.</p>
          ) : (
            <div className="space-y-2.5">
              {analyticsData.aging_findings.slice(0, 5).map((f) => (
                <div
                  key={f.id}
                  onClick={() => handleOpenDrawer(f)}
                  className="p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground font-mono">
                        {f.clause_id || `ID #${f.id.slice(0, 8)}`}
                      </span>
                      <Badge variant="outline" className="text-[10px] font-semibold">
                        {f.lifecycle_status.replace("_", " ")}
                      </Badge>
                      {f.is_reopened && (
                        <Badge className="bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 text-[9px]">
                          Reopened
                        </Badge>
                      )}
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
                      {f.age_days} days open
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── 8. Finding Detail Drawer Modal ── */}
      {selectedFinding && (
        <FindingDetailDrawer
          finding={selectedFinding}
          isOpen={isDrawerOpen}
          onClose={() => {
            setIsDrawerOpen(false);
            setSelectedFinding(null);
          }}
          onFindingUpdated={() => {
            fetchAnalytics();
          }}
        />
      )}
    </div>
  );
}
