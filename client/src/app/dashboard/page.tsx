"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { dashboardService } from "@/services/dashboard-service";
import { DashboardStatsResponse } from "@/types/dashboard";
import { complianceService, ComplianceJob } from "@/services/api/compliance";

// Dashboard Refactored Components
import { DashboardKpiCards } from "@/components/dashboard/DashboardKpiCards";
import { AIExecutiveBrief } from "@/components/dashboard/AIExecutiveBrief";
import { KnowledgeGraphOverview } from "@/components/dashboard/KnowledgeGraphOverview";
import { ComplianceTrendChart } from "@/components/dashboard/ComplianceTrendChart";
import { FindingsBySeverityChart } from "@/components/dashboard/FindingsBySeverityChart";
import { RecentReportsWidget } from "@/components/dashboard/RecentReportsWidget";
import { RecentActivityList } from "@/components/dashboard/RecentActivityList";
import { JobProgressCard } from "@/components/compliance/JobProgressCard";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw,
  AlertTriangle,
  Upload,
  Zap,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Layers,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function DashboardContent() {
  const {
    activeMembership,
    isReviewer,
    permissions,
    refreshUser,
  } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeJobs, setActiveJobs] = useState<ComplianceJob[]>([]);

  const fetchStats = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    const activeOrgId =
      typeof window !== "undefined"
        ? localStorage.getItem("selected_organization_id")
        : null;

    try {
      const [data, jobsData] = await Promise.all([
        dashboardService.getStats(),
        complianceService
          .listComplianceJobs(activeOrgId || undefined)
          .catch(() => []),
      ]);
      setStats(data);
      const runningJobs = (jobsData || []).filter(
        (j) => j.status === "QUEUED" || j.status === "RUNNING"
      );
      setActiveJobs(runningJobs);
      if (isManualRefresh) toast.success("Dashboard metrics updated.");
    } catch (err: unknown) {
      console.error("Error fetching dashboard statistics:", err);
      const apiError = err as {
        response?: { data?: { detail?: string } };
        message?: string;
      };
      const message =
        apiError.response?.data?.detail ||
        apiError.message ||
        "Failed to load live dashboard statistics. Please verify backend API connectivity.";
      setError(message);
      toast.error("Failed to update dashboard data");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const handleOrgChange = () => {
      fetchStats(false);
      refreshUser();
    };
    window.addEventListener("organization_changed", handleOrgChange);
    return () =>
      window.removeEventListener("organization_changed", handleOrgChange);
  }, [fetchStats, refreshUser]);

  // Dynamic organization name
  const organizationName =
    activeMembership?.organization_name ||
    stats?.organization_name ||
    "TechNova Solutions Pvt. Ltd.";

  // Dynamic organization risk status
  const riskStatus = stats?.risk_status || (
    stats?.compliance_kpis?.compliance_score !== null && stats?.compliance_kpis?.compliance_score !== undefined
      ? stats.compliance_kpis.compliance_score >= 85
        ? "Low Risk"
        : stats.compliance_kpis.compliance_score >= 70
        ? "Medium Risk"
        : "High Risk"
      : "Not Analyzed"
  );

  // Dynamic last analysis date
  const lastAnalysisDate = stats?.last_analysis_date || (
    stats?.recent_reports && stats.recent_reports.length > 0
      ? new Date(stats.recent_reports[0].created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null
  );

  const getRiskStatusBadge = (statusStr: string) => {
    const s = statusStr.toLowerCase();
    if (s.includes("low")) {
      return (
        <Badge
          variant="outline"
          className="gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 text-xs px-2.5 py-0.5 font-semibold uppercase tracking-wide"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Low Risk</span>
        </Badge>
      );
    }
    if (s.includes("medium")) {
      return (
        <Badge
          variant="outline"
          className="gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 text-xs px-2.5 py-0.5 font-semibold uppercase tracking-wide"
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>Medium Risk</span>
        </Badge>
      );
    }
    if (s.includes("high") || s.includes("critical") || s.includes("at risk")) {
      return (
        <Badge
          variant="outline"
          className="gap-1.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25 text-xs px-2.5 py-0.5 font-semibold uppercase tracking-wide"
        >
          <ShieldX className="h-3.5 w-3.5" />
          <span>High Risk</span>
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        className="gap-1.5 bg-muted text-muted-foreground border-border/50 text-xs px-2.5 py-0.5 font-medium uppercase tracking-wide"
      >
        <span>{statusStr}</span>
      </Badge>
    );
  };

  return (
    <AppShell>
      <main className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
        {/* ── SECTION 1 — Dashboard Header ────────────────────────────── */}
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-5 border-b border-border/40 pb-6">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Executive Dashboard
              </h1>
              <span className="text-muted-foreground/40 hidden sm:inline">•</span>
              <span className="text-lg font-semibold text-foreground/90 truncate">
                {organizationName}
              </span>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
              Monitor compliance health, identify regulatory risks, and prioritize corrective actions.
            </p>

            {/* Dynamic Status Display: Organization Risk Status + Last Analysis Date */}
            <div className="flex items-center gap-3 pt-1 flex-wrap">
              {isLoading ? (
                <>
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-4 w-40 rounded" />
                </>
              ) : (
                <>
                  {getRiskStatusBadge(riskStatus)}
                  <span className="text-muted-foreground/40">•</span>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      Last Analysis:{" "}
                      <strong className="text-foreground font-semibold">
                        {lastAnalysisDate || "No analyses run yet"}
                      </strong>
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right-side actions */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStats(true)}
              disabled={isLoading || isRefreshing}
              className="gap-1.5 cursor-pointer text-xs h-9 px-3"
              aria-label="Refresh dashboard data"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  isRefreshing ? "animate-spin text-primary" : ""
                }`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            {/* Upload Policy — secondary button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/documents")}
              className="gap-1.5 cursor-pointer text-xs h-9 px-3.5 font-medium border-border/80 hover:bg-muted"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Policy</span>
            </Button>

            {/* Run Analysis — primary button */}
            {permissions.canRunAnalysis && (
              <Button
                onClick={() => router.push("/compliance")}
                size="sm"
                className="gap-1.5 cursor-pointer text-xs h-9 px-4 font-semibold shadow-xs"
              >
                <Zap className="h-3.5 w-3.5 text-warning fill-warning" />
                <span>Run Analysis</span>
              </Button>
            )}
          </div>
        </header>

        {/* ── Reviewer Shortcut Banner ─────────────────────────────────── */}
        {isReviewer && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Layers className="h-4 w-4" />
              </div>
              <p className="text-xs text-foreground font-medium">
                Reviewer Workspace: You have permission to inspect and approve organization finding resolutions.
              </p>
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={() => router.push("/compliance/my-work?view=all")}
              className="border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 text-xs h-7 px-3 cursor-pointer shrink-0 ml-auto sm:ml-0"
            >
              <span>Review Findings Queue</span>
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        )}

        {/* ── Error Alert ──────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold">
                  API Connection Error
                </h3>
                <p className="text-xs text-rose-600/80 dark:text-rose-300 mt-0.5 leading-relaxed">
                  {error}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStats(false)}
              className="gap-1.5 border-rose-500/30 text-rose-600 hover:bg-rose-500/10 dark:text-rose-300 shrink-0 cursor-pointer h-8 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        )}

        {/* ── Active Jobs Banner ───────────────────────────────────────── */}
        {activeJobs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active Analyses ({activeJobs.length})
              </h2>
            </div>
            {activeJobs.map((job) => (
              <JobProgressCard
                key={job.id}
                jobId={job.id}
                onCompleted={() => fetchStats(false)}
              />
            ))}
          </div>
        )}

        {/* ── SECTION 2 — Compliance KPIs ──────────────────────────────── */}
        <section aria-label="Compliance Key Performance Indicators">
          <DashboardKpiCards
            complianceKpis={stats?.compliance_kpis}
            kpis={stats?.kpis}
            isLoading={isLoading}
          />
        </section>

        {/* ── SECTION 3 — Executive Intelligence ───────────────────────── */}
        <section
          aria-label="Executive Intelligence"
          className="grid gap-6 lg:grid-cols-3 items-stretch"
        >
          {/* AI Executive Brief (Larger Left Column, ~2/3) */}
          <div className="lg:col-span-2 flex flex-col">
            <AIExecutiveBrief
              isLoading={isLoading}
              activeJobs={activeJobs}
              recentReports={stats?.recent_reports}
              priorityActions={stats?.priority_actions}
              complianceScore={stats?.compliance_kpis?.compliance_score}
              riskStatus={riskStatus}
              lastAnalyzedAt={lastAnalysisDate}
              onViewFullAnalysis={() => router.push("/reports")}
            />
          </div>

          {/* Knowledge Graph Overview (Smaller Right Column, ~1/3) */}
          <div className="lg:col-span-1 flex flex-col">
            <KnowledgeGraphOverview
              graphOverview={stats?.graph_overview}
              kpis={stats?.kpis}
              isLoading={isLoading}
              onExplore={() => router.push("/knowledge-graph")}
            />
          </div>
        </section>

        {/* ── SECTION 4 — Compliance Analytics ─────────────────────────── */}
        <section
          aria-label="Compliance Analytics"
          className="grid gap-6 md:grid-cols-2 items-stretch"
        >
          {/* Compliance Trend (Replaces Avg. Score Per Organization) */}
          <ComplianceTrendChart
            data={stats?.compliance_trend}
            isLoading={isLoading}
          />

          {/* Findings by Severity (Refactored Risk Level Breakdown) */}
          <FindingsBySeverityChart
            data={stats?.findings_severity}
            fallbackRisk={stats?.risk_breakdown}
            isLoading={isLoading}
          />
        </section>

        {/* ── SECTION 5 — Operational Overview ─────────────────────────── */}
        <section
          aria-label="Operational Overview"
          className="grid gap-6 md:grid-cols-2 items-stretch"
        >
          {/* Recent Reports */}
          <RecentReportsWidget
            reports={stats?.recent_reports}
            isLoading={isLoading}
          />

          {/* Recent Activity Timeline */}
          <RecentActivityList
            activities={stats?.recent_activity || []}
            isLoading={isLoading}
          />
        </section>
      </main>
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
