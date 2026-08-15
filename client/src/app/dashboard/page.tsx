"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { dashboardService } from "@/services/dashboard-service";
import { DashboardStatsResponse } from "@/types/dashboard";
import { OrganizationDialog } from "@/components/features/organizations/OrganizationDialog";
import {
  organizationsService,
  OrganizationCreate,
  OrganizationUpdate,
} from "@/services/api/organizations";
import { formatRoleLabel, getRoleBadgeClass } from "@/utils/role-utils";

// Dashboard Components
import { DashboardKpiCards } from "@/components/dashboard/DashboardKpiCards";
import { RecentActivityList } from "@/components/dashboard/RecentActivityList";
import { ComplianceScoreChart } from "@/components/dashboard/ComplianceScoreChart";
import { ReportsOverTimeChart } from "@/components/dashboard/ReportsOverTimeChart";
import { RiskBreakdownChart } from "@/components/dashboard/RiskBreakdownChart";
import { OrgScoresChart } from "@/components/dashboard/OrgScoresChart";
import { RecentReportsWidget } from "@/components/dashboard/RecentReportsWidget";
import { AIExecutiveBrief } from "@/components/dashboard/AIExecutiveBrief";
import { JobProgressCard } from "@/components/compliance/JobProgressCard";
import { KnowledgeGraphOverview } from "@/components/dashboard/KnowledgeGraphOverview";
import { MyReviewQueue } from "@/components/dashboard/MyReviewQueue";
import { complianceService, ComplianceJob } from "@/services/api/compliance";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LogOut,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  Layers,
  RefreshCw,
  AlertTriangle,
  Building2,
  FileText,
  FileCheck,
  Zap,
  Plus,
  BarChart3,
  Users,
  Network,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Executive Summary helper ─────────────────────────────────────────────────

interface PostureSummary {
  postureLabel: string;
  postureColor: string;
  summaryText: string;
}

function buildPostureSummary(stats: DashboardStatsResponse): PostureSummary {
  const score = stats.kpis.average_compliance_score;
  const total = stats.kpis.total_compliance_reports;
  const critical = stats.risk_breakdown?.critical ?? 0;
  const high = stats.risk_breakdown?.high ?? 0;
  const highRisk = critical + high;

  if (total === 0) {
    return {
      postureLabel: "Getting Started",
      postureColor: "text-muted-foreground",
      summaryText:
        "No compliance reports generated yet. Create an organization and run your first analysis to begin monitoring your regulatory posture.",
    };
  }

  let postureLabel: string;
  let postureColor: string;

  if (score >= 85) {
    postureLabel = "Compliant";
    postureColor = "text-emerald-600 dark:text-emerald-400";
  } else if (score >= 70) {
    postureLabel = "Needs Attention";
    postureColor = "text-amber-600 dark:text-amber-400";
  } else {
    postureLabel = "At Risk";
    postureColor = "text-rose-600 dark:text-rose-400";
  }

  let summaryText = `Portfolio-wide compliance score is ${score}%.`;

  if (critical > 0) {
    summaryText += ` ${critical} critical ${critical === 1 ? "issue requires" : "issues require"
      } immediate review.`;
  } else if (highRisk > 0) {
    summaryText += ` ${highRisk} high-risk ${highRisk === 1 ? "item requires" : "items require"
      } review.`;
  } else {
    summaryText += " No critical risks detected across your portfolio.";
  }

  return { postureLabel, postureColor, summaryText };
}

// ─── Dashboard Content ────────────────────────────────────────────────────────

function DashboardContent() {
  const {
    user,
    logout,
    activeMembership,
    activeRole,
    isAdmin,
    isReviewer,
    isComplianceAnalyst,
    isViewer,
    permissions,
    refreshUser,
  } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isOrgDialogOpen, setIsOrgDialogOpen] = useState(false);
  const [isSubmittingOrg, setIsSubmittingOrg] = useState(false);

  const [activeJobs, setActiveJobs] = useState<ComplianceJob[]>([]);

  const fetchStats = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const [data, jobsData] = await Promise.all([
        dashboardService.getStats(),
        complianceService.listComplianceJobs().catch(() => []),
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
    return () => window.removeEventListener("organization_changed", handleOrgChange);
  }, [fetchStats, refreshUser]);

  const handleCreateOrgSubmit = async (
    data: OrganizationCreate | OrganizationUpdate
  ) => {
    try {
      setIsSubmittingOrg(true);
      await organizationsService.createOrganization(
        data as OrganizationCreate
      );
      toast.success("Organization created successfully.");
      setIsOrgDialogOpen(false);
      fetchStats(false);
    } catch (error) {
      console.error("Failed to create organization:", error);
      toast.error("Failed to create organization. Please check your inputs.");
    } finally {
      setIsSubmittingOrg(false);
    }
  };

  // Derived summary
  const posture =
    !isLoading && stats ? buildPostureSummary(stats) : null;

  // User initials for avatar
  const initials =
    user?.full_name
      ?.split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() ?? "?";

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top Navbar ── */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-6">
          {/* Logo + Nav */}
          <div className="flex items-center gap-6">
            <div
              className="flex items-center gap-2 cursor-pointer shrink-0"
              onClick={() => router.push("/dashboard")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-sm shadow-indigo-600/25">
                <Layers className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold tracking-tight text-foreground">
                LexisGraph
              </span>
            </div>

            <div className="hidden md:block h-5 w-px bg-border" />

            <nav className="hidden md:flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs font-semibold text-foreground"
                onClick={() => router.push("/dashboard")}
              >
                Dashboard
              </Button>
              {(isAdmin || (user?.memberships && user.memberships.length > 1)) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => router.push("/organizations")}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  Organizations
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => router.push("/compliance/my-work?view=all")}
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Findings
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => router.push("/documents")}
              >
                <FileText className="h-3.5 w-3.5" />
                Documents
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => router.push("/reports")}
              >
                <FileCheck className="h-3.5 w-3.5" />
                Reports
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => router.push("/knowledge-graph")}
              >
                <Network className="h-3.5 w-3.5" />
                Knowledge Graph
              </Button>
            </nav>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">

        {/* ── Header: Title + Executive Summary + Actions ── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-border/40 pb-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Executive Dashboard
            </h1>

            {/* Executive summary — dynamic from data */}
            <div className="mt-2 space-y-0.5">
              {isLoading ? (
                <>
                  <Skeleton className="h-3.5 w-24 rounded" />
                  <Skeleton className="h-4 w-96 rounded mt-1" />
                </>
              ) : posture ? (
                <>
                  <span
                    className={cn(
                      "text-[11px] font-bold uppercase tracking-[0.08em]",
                      posture.postureColor
                    )}
                  >
                    ● {posture.postureLabel}
                  </span>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                    {posture.summaryText}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Welcome back,{" "}
                  <span className="font-semibold text-primary">
                    {user?.full_name}
                  </span>
                  .
                </p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStats(true)}
              disabled={isLoading || isRefreshing}
              className="gap-1.5 cursor-pointer text-xs"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : ""
                  }`}
              />
              <span>Refresh</span>
            </Button>

            {permissions.canCreateOrganization && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOrgDialogOpen(true)}
                className="gap-1.5 cursor-pointer text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Organization</span>
              </Button>
            )}

            {isReviewer && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/compliance/my-work?view=all")}
                className="gap-1.5 cursor-pointer text-xs border-purple-500/30 text-purple-600 hover:bg-purple-500/10 dark:text-purple-400 dark:hover:bg-purple-950/50 font-semibold"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>All Findings</span>
              </Button>
            )}

            {isReviewer && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/compliance/my-work?view=my-work")}
                className="gap-1.5 cursor-pointer text-xs border-amber-500/30 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-950/50"
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>My Work</span>
              </Button>
            )}

            {isReviewer && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/reports")}
                className="gap-1.5 cursor-pointer text-xs"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>View Reports</span>
              </Button>
            )}

            {permissions.canRunAnalysis && (
              <Button
                onClick={() => router.push("/compliance")}
                size="sm"
                className="gap-1.5 cursor-pointer"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>New Analysis</span>
              </Button>
            )}
          </div>
        </div>

        {/* ── Reviewer Workspace Banner ── */}
        {isReviewer && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Reviewer Workspace — {activeMembership?.organization_name || "LexisGraph Workspace"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  You are assigned as Reviewer. Inspect all organization compliance findings, review remediation recommendations, and evaluate audit evidence across published reports.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/compliance/my-work?view=my-work")}
                className="border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 text-xs h-8 cursor-pointer gap-1"
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>My Work</span>
              </Button>
              <Button
                size="sm"
                onClick={() => router.push("/compliance/my-work?view=all")}
                className="bg-amber-600 hover:bg-amber-500 text-white gap-1.5 shrink-0 cursor-pointer text-xs h-8 font-semibold"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>All Organization Findings</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Error Alert ── */}
        {error && (
          <div className="rounded-xl border border-danger/20 bg-danger-subtle p-4 text-danger dark:border-danger/30 dark:bg-danger/10 dark:text-red-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-danger dark:text-red-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-danger dark:text-red-300">
                  API Connection Error
                </h3>
                <p className="text-xs text-danger/80 dark:text-red-400 mt-0.5 leading-relaxed">
                  {error}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStats(false)}
              className="gap-1.5 border-danger/30 text-danger hover:bg-danger/10 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/50 shrink-0 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        )}

        {/* ── Active Jobs Banner ── */}
        {activeJobs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Active Jobs ({activeJobs.length})
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

        {/* ── AI Executive Brief & Knowledge Graph Overview ── */}
        <div className="grid gap-6 lg:grid-cols-3 items-stretch">
          <div className="lg:col-span-2 flex flex-col">
            <AIExecutiveBrief
              isLoading={isLoading}
              activeJobs={activeJobs}
              recentReports={stats?.recent_reports}
              riskBreakdown={stats?.risk_breakdown}
              kpis={stats?.kpis}
              onViewFullAnalysis={() => router.push("/reports")}
            />
          </div>
          <div className="lg:col-span-1 flex flex-col">
            <KnowledgeGraphOverview
              kpis={stats?.kpis}
              isLoading={isLoading}
              onExplore={() => router.push("/knowledge-graph")}
            />
          </div>
        </div>

        {/* ── 1. KPI Cards ── */}
        <DashboardKpiCards kpis={stats?.kpis} isLoading={isLoading} />

        {/* ── 2. Charts Grid ── */}
        <div className="grid gap-6 md:grid-cols-2">
          <ComplianceScoreChart
            data={stats?.score_distribution}
            isLoading={isLoading}
          />
          <ReportsOverTimeChart
            data={stats?.reports_over_time}
            isLoading={isLoading}
          />
          <RiskBreakdownChart
            data={stats?.risk_breakdown}
            isLoading={isLoading}
          />
          <OrgScoresChart
            data={stats?.org_scores}
            isLoading={isLoading}
            onAddOrg={() => setIsOrgDialogOpen(true)}
          />
        </div>

        {/* ── 2.5 My Review Queue (for Reviewers) ── */}
        {isReviewer && (
          <MyReviewQueue
            organizationId={activeMembership?.organization_id}
            organizationName={activeMembership?.organization_name}
          />
        )}

        {/* ── 3. Recent Reports ── */}
        <RecentReportsWidget
          reports={stats?.recent_reports}
          isLoading={isLoading}
        />

        {/* ── 4. Activity Timeline + Workspace Summary ── */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Activity timeline — 2/3 width */}
          <div className="md:col-span-2">
            <RecentActivityList
              activities={stats?.recent_activity || []}
              isLoading={isLoading}
            />
          </div>

          {/* ── Workspace Summary ── */}
          <Card className="md:col-span-1 flex flex-col">
            {/* Identity header */}
            <CardHeader className="border-b border-border/40 px-5 pt-5 pb-4">
              <div className="flex items-center gap-3">
                {/* Initials avatar */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm select-none">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate leading-tight">
                    {user?.full_name ?? "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {user?.email}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 px-5 py-4 space-y-3">
              {/* Role */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Role
                </span>
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold", getRoleBadgeClass(activeRole))}>
                  {formatRoleLabel(activeRole)}
                </span>
              </div>

              {/* Member since */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Member since
                </span>
                <span className="text-[11px] font-medium text-foreground tabular-nums">
                  {user?.created_at
                    ? new Date(user.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                    })
                    : "—"}
                </span>
              </div>

              {/* Workspace */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Workspace
                </span>
                <span className="text-[11px] font-medium text-foreground truncate max-w-[150px]" title={activeMembership?.organization_name || "LexisGraph Workspace"}>
                  {activeMembership?.organization_name || "LexisGraph Workspace"}
                </span>
              </div>

              {/* Compliance posture */}
              <div className="rounded-lg bg-muted/40 border border-border/40 px-3.5 py-3 space-y-1.5 mt-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                  Compliance Posture
                </p>
                {isLoading ? (
                  <Skeleton className="h-7 w-24 rounded" />
                ) : stats && stats.kpis.average_compliance_score > 0 ? (
                  <div className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        "text-2xl font-bold tabular-nums tracking-tight leading-none",
                        stats.kpis.average_compliance_score >= 85
                          ? "text-emerald-600 dark:text-emerald-400"
                          : stats.kpis.average_compliance_score >= 70
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-rose-600 dark:text-rose-400"
                      )}
                    >
                      {stats.kpis.average_compliance_score}%
                    </span>
                    <span className="text-xs text-muted-foreground">
                      avg. score
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No reports yet
                  </span>
                )}
              </div>

              {/* Platform stats — compact 3-column */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    label: "Orgs",
                    value: stats?.kpis.total_organizations ?? 0,
                    icon: <Users className="h-3 w-3" />,
                  },
                  {
                    label: "Reports",
                    value: stats?.kpis.total_compliance_reports ?? 0,
                    icon: <BarChart3 className="h-3 w-3" />,
                  },
                  {
                    label: "Policies",
                    value: stats?.kpis.total_policies ?? 0,
                    icon: <ShieldCheck className="h-3 w-3" />,
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-md bg-muted/30 px-2 py-2.5 text-center border border-border/30"
                  >
                    {isLoading ? (
                      <Skeleton className="h-5 w-8 mx-auto rounded mb-1" />
                    ) : (
                      <p className="text-base font-bold tabular-nums text-foreground leading-none">
                        {s.value}
                      </p>
                    )}
                    <p className="text-[9px] text-muted-foreground mt-1 font-medium uppercase tracking-wider">
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>

            {/* Quick actions */}
            <CardFooter className="px-5 py-3">
              <div className="flex w-full flex-col gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                  Quick Actions
                </p>
                <div className="flex gap-1 flex-wrap">
                  {permissions.canCreateOrganization && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] px-2.5 font-medium text-primary border-primary/20 hover:bg-primary/5 cursor-pointer"
                      onClick={() => setIsOrgDialogOpen(true)}
                    >
                      + New Org
                    </Button>
                  )}
                  {isReviewer && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] px-2.5 font-medium text-amber-600 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer"
                      onClick={() => router.push("/compliance/overview")}
                    >
                      Review Findings
                    </Button>
                  )}
                  {permissions.canRunAnalysis && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] px-2.5 cursor-pointer"
                      onClick={() => router.push("/compliance")}
                    >
                      Run Analysis
                    </Button>
                  )}
                  {(permissions.canCreateOrganization || (user?.memberships && user.memberships.length > 1)) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] px-2.5 cursor-pointer"
                      onClick={() => router.push("/organizations")}
                    >
                      Organizations
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] px-2.5 cursor-pointer"
                    onClick={() => router.push("/reports")}
                  >
                    Reports
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] px-2.5 cursor-pointer"
                    onClick={() => router.push("/documents")}
                  >
                    Documents
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] px-2.5 cursor-pointer"
                    onClick={() => router.push("/knowledge-graph")}
                  >
                    Knowledge Graph
                  </Button>
                </div>
              </div>
            </CardFooter>
          </Card>
        </div>
      </main>

      <OrganizationDialog
        open={isOrgDialogOpen}
        onOpenChange={setIsOrgDialogOpen}
        onSubmit={handleCreateOrgSubmit}
        isLoading={isSubmittingOrg}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
