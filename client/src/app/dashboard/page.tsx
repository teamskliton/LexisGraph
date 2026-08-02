"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { dashboardService } from "@/services/dashboard-service";
import { DashboardStatsResponse } from "@/types/dashboard";
import { OrganizationDialog } from "@/components/features/organizations/OrganizationDialog";
import { organizationsService, OrganizationCreate, OrganizationUpdate } from "@/services/api/organizations";

// Dashboard Components
import { DashboardKpiCards } from "@/components/dashboard/DashboardKpiCards";
import { RecentActivityList } from "@/components/dashboard/RecentActivityList";
import { ComplianceScoreChart } from "@/components/dashboard/ComplianceScoreChart";
import { ReportsOverTimeChart } from "@/components/dashboard/ReportsOverTimeChart";
import { RiskBreakdownChart } from "@/components/dashboard/RiskBreakdownChart";
import { OrgScoresChart } from "@/components/dashboard/OrgScoresChart";
import { RecentReportsWidget } from "@/components/dashboard/RecentReportsWidget";
import { JobProgressCard } from "@/components/compliance/JobProgressCard";
import { complianceService, ComplianceJob } from "@/services/api/compliance";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import {
  LogOut,
  User as UserIcon,
  Mail,
  ShieldAlert,
  Calendar,
  Layers,
  RefreshCw,
  AlertTriangle,
  Building2,
  FileText,
  FileCheck,
  Zap,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

function DashboardContent() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Organization dialog state
  const [isOrgDialogOpen, setIsOrgDialogOpen] = useState(false);
  const [isSubmittingOrg, setIsSubmittingOrg] = useState(false);

  const [activeJobs, setActiveJobs] = useState<ComplianceJob[]>([]);

  // Fetch Live Dashboard Stats & Active Running Jobs
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
      const runningJobs = (jobsData || []).filter((j) => j.status === "QUEUED" || j.status === "RUNNING");
      setActiveJobs(runningJobs);
      if (isManualRefresh) toast.success("Dashboard metrics updated.");
    } catch (err: unknown) {
      console.error("Error fetching dashboard statistics:", err);
      const apiError = err as { response?: { data?: { detail?: string } }; message?: string };
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
  }, [fetchStats]);

  const handleCreateOrgSubmit = async (data: OrganizationCreate | OrganizationUpdate) => {
    try {
      setIsSubmittingOrg(true);
      await organizationsService.createOrganization(data as OrganizationCreate);
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

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-2 md:gap-6">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push("/dashboard")}>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-600/20">
                <Layers className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold tracking-tight text-foreground">
                LexisGraph
              </span>
            </div>

            <nav className="hidden md:flex items-center gap-1 text-xs font-medium">
              <Button variant="ghost" size="sm" className="h-8 text-xs text-foreground font-semibold" onClick={() => router.push("/dashboard")}>
                Dashboard
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={() => router.push("/organizations")}>
                <Building2 className="h-3.5 w-3.5 mr-1.5" />
                Organizations
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={() => router.push("/documents")}>
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Documents
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={() => router.push("/reports")}>
                <FileCheck className="h-3.5 w-3.5 mr-1.5" />
                Reports
              </Button>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
        {/* Welcome & Action Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              Executive Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Welcome back, <span className="font-semibold text-indigo-600">{user?.full_name}</span>. Here is your live compliance analysis overview.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStats(true)}
              disabled={isLoading || isRefreshing}
              className="gap-1.5 cursor-pointer text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
              <span>Refresh Data</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOrgDialogOpen(true)}
              className="gap-1.5 cursor-pointer text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Organization</span>
            </Button>

            <Button
              onClick={() => router.push("/compliance")}
              size="sm"
              className="gap-1.5 shadow-sm cursor-pointer"
            >
              <Zap className="h-4 w-4" />
              <span>New Analysis</span>
            </Button>
          </div>
        </div>

        {/* Error Alert State */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold">Backend API Error</h3>
                <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">{error}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStats(false)}
              className="gap-2 border-red-300 text-red-800 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/50 shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        )}

        {/* Active Real-Time Jobs Banner */}
        {activeJobs.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Active Compliance Jobs In Progress ({activeJobs.length})
            </h2>
            {activeJobs.map((job) => (
              <JobProgressCard
                key={job.id}
                jobId={job.id}
                onCompleted={() => fetchStats(false)}
              />
            ))}
          </div>
        )}

        {/* 1. Live KPI Cards (5 Cards) */}
        <DashboardKpiCards kpis={stats?.kpis} isLoading={isLoading} />

        {/* 2. Charts Grid (4 Live Analytics Charts) */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Chart 1: Compliance Score Distribution */}
          <ComplianceScoreChart data={stats?.score_distribution} isLoading={isLoading} />

          {/* Chart 2: Reports Generated Per Month */}
          <ReportsOverTimeChart data={stats?.reports_over_time} isLoading={isLoading} />

          {/* Chart 3: Risk Level Breakdown */}
          <RiskBreakdownChart data={stats?.risk_breakdown} isLoading={isLoading} />

          {/* Chart 4: Average Score Per Organization */}
          <OrgScoresChart
            data={stats?.org_scores}
            isLoading={isLoading}
            onAddOrg={() => setIsOrgDialogOpen(true)}
          />
        </div>

        {/* 3. Recent Reports Widget */}
        <RecentReportsWidget reports={stats?.recent_reports} isLoading={isLoading} />

        {/* 3. Recent Activity Feed & User Identity Panel */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Recent Activity List */}
          <div className="md:col-span-2">
            <RecentActivityList activities={stats?.recent_activity || []} isLoading={isLoading} />
          </div>

          {/* User Profile & Quick Links */}
          <Card className="md:col-span-1 border-border/60 shadow-sm flex flex-col justify-between">
            <CardHeader className="border-b border-border/40 pb-3">
              <CardTitle className="text-base font-bold text-foreground">User Identity</CardTitle>
              <CardDescription>Authenticated session details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5 pt-4 text-sm">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/25 flex items-center justify-center shrink-0">
                  <UserIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Username</p>
                  <p className="text-xs font-medium text-foreground truncate">{user?.username}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-500 border border-violet-500/25 flex items-center justify-center shrink-0">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Email</p>
                  <p className="text-xs font-medium text-foreground truncate">{user?.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/25 flex items-center justify-center shrink-0">
                  <ShieldAlert className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Role</p>
                  <p className="text-xs font-medium text-foreground">
                    {user?.is_superuser ? "System Administrator" : "Compliance Analyst"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 flex items-center justify-center shrink-0">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Member Since</p>
                  <p className="text-xs font-medium text-foreground">
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    }) : "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>

            <CardFooter className="bg-muted/30 border-t border-border/40 py-2.5 text-center text-[11px] text-muted-foreground flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <span>Quick Navigation:</span>
              <div className="flex gap-1.5 flex-wrap">
                <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 font-medium text-indigo-600 dark:text-indigo-400" onClick={() => setIsOrgDialogOpen(true)}>
                  + Create Org
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => router.push("/organizations")}>
                  Organizations
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => router.push("/reports")}>
                  Reports
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => router.push("/documents")}>
                  Documents
                </Button>
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
