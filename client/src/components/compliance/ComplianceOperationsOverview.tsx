"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  RefreshCw,
  Layers,
  ArrowLeft,
  ExternalLink,
  ChevronRight,
  FileCheck2,
  BarChart3,
  Network,
  XCircle,
  UserCheck,
  Clock,
  CheckCircle,
  Sparkles,
  PlusCircle,
  History,
  User,
  LogOut,
  Building2,
  Users,
  AlertOctagon,
  AlertCircle,
  Calendar,
  TrendingUp,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/auth-context";
import {
  complianceService,
  ComplianceOverviewData,
  ComplianceReport,
} from "@/services/api/compliance";
import { FindingDetailDrawer, FindingItem } from "./FindingDetailDrawer";
import { FindingAnalyticsDashboard } from "./FindingAnalyticsDashboard";
import { ComplianceReportModal } from "./ComplianceReportModal";
import { OrganizationSwitcher } from "@/components/layout/OrganizationSwitcher";
import { Organization } from "@/services/api/organizations";
import { formatRoleLabel } from "@/utils/role-utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { cn } from "@/lib/utils";

function deriveSeverityBadge(severity?: string, status?: string) {
  const sev = (severity || "").toUpperCase();
  const st = (status || "").toUpperCase();

  if (sev === "CRITICAL" || sev === "HIGH" || st === "NON_COMPLIANT") {
    return {
      label: sev || "HIGH SEVERITY",
      className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
      icon: <ShieldX className="h-3.5 w-3.5 text-rose-500" />,
    };
  }
  if (sev === "MEDIUM" || st === "PARTIALLY_COMPLIANT") {
    return {
      label: sev || "MEDIUM SEVERITY",
      className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
      icon: <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />,
    };
  }
  return {
    label: sev || "LOW SEVERITY",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    icon: <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />,
  };
}

function deriveLifecycleBadge(lifecycleStatus?: string) {
  const st = (lifecycleStatus || "OPEN").toUpperCase();

  switch (st) {
    case "IN_REVIEW":
      return {
        label: "IN REVIEW",
        className: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
      };
    case "REMEDIATION":
      return {
        label: "REMEDIATION",
        className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
      };
    case "RESOLVED":
      return {
        label: "RESOLVED",
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      };
    case "REOPENED":
      return {
        label: "REOPENED",
        className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
      };
    default:
      return {
        label: "OPEN",
        className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
      };
  }
}

export function ComplianceOperationsOverview() {
  const router = useRouter();
  const { user, logout, permissions } = useAuth();

  // Overview state
  const [activeOrgId, setActiveOrgId] = useState<string | undefined>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selected_organization_id") || undefined;
    }
    return undefined;
  });
  const [activeTab, setActiveTab] = useState<"OPERATIONS" | "ANALYTICS">("OPERATIONS");
  const [overviewData, setOverviewData] = useState<ComplianceOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Finding Detail Drawer State
  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Compliance Report Modal State (Sprint 7.14)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const lastFetchedOrgIdRef = React.useRef<string | undefined>(undefined);

  // Synchronize Active Organization on event
  useEffect(() => {
    const handleOrgChange = () => {
      if (typeof window !== "undefined") {
        const storedId = localStorage.getItem("selected_organization_id");
        if (storedId) {
          setActiveOrgId(storedId);
        }
      }
    };
    window.addEventListener("organization_changed", handleOrgChange);
    return () => window.removeEventListener("organization_changed", handleOrgChange);
  }, []);

  // Fetch Overview Data
  const fetchOverview = useCallback(async () => {
    const targetId = activeOrgId || (typeof window !== "undefined" ? localStorage.getItem("selected_organization_id") || undefined : undefined);

    if (lastFetchedOrgIdRef.current === targetId && overviewData) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await complianceService.getComplianceOverview(targetId);
      setOverviewData(data);
      lastFetchedOrgIdRef.current = data.organization_id;
      if (data.organization_id) {
        if (typeof window !== "undefined") {
          localStorage.setItem("selected_organization_id", data.organization_id);
        }
        if (data.organization_id !== activeOrgId) {
          setActiveOrgId(data.organization_id);
        }
      }
    } catch (err: any) {
      console.error("Failed loading compliance overview:", err);
      const rawDetail = err?.response?.data?.detail || "Failed to load compliance operations metrics.";
      setError(typeof rawDetail === "string" ? rawDetail : JSON.stringify(rawDetail));
      toast.error("Error loading compliance operations overview.");
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId, overviewData]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Handlers for Drawer
  const handleOpenDrawer = (item: any) => {
    setSelectedFinding(item);
    setIsDrawerOpen(true);
  };

  const handleFindingUpdated = (updated: FindingItem) => {
    // Refresh overview data dynamically
    fetchOverview();
  };

  const handleOrgChanged = (org: Organization) => {
    setActiveOrgId(org.id);
  };

  const summary = overviewData?.summary;

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      {/* ── 1. Navbar Header ── */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-600/20">
              <Layers className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold tracking-tight text-foreground hidden sm:inline">LexisGraph</span>
            <span className="text-muted-foreground/60 hidden sm:inline">•</span>
            <OrganizationSwitcher onOrganizationChanged={handleOrgChanged} />
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell organizationId={activeOrgId} />
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground text-xs"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
        {/* ── 2. Page Header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard")}
                className="w-fit -ml-2 text-muted-foreground hover:text-foreground cursor-pointer gap-1.5 text-xs"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Dashboard
              </Button>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  Compliance Operations Overview
                </h1>
                <p className="text-xs text-muted-foreground">
                  Real-time operational status, active findings, assigned work, and compliance activity for{" "}
                  <strong>{overviewData?.organization_name || "Active Workspace"}</strong>.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/compliance/my-work?view=all")}
              className="gap-1.5 text-xs font-semibold cursor-pointer border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>All Findings ({summary?.total_findings || 0})</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReportModalOpen(true)}
              className="gap-1.5 text-xs font-semibold cursor-pointer border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Generate Report</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchOverview}
              disabled={isLoading}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
              <span>Refresh</span>
            </Button>

            {permissions.canRunAnalysis && (
              <Button
                size="sm"
                onClick={() => router.push("/compliance/new")}
                className="gap-1.5 text-xs font-semibold cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <PlusCircle className="h-3.5 w-3.5" /> Start New Analysis
              </Button>
            )}
          </div>
        </div>

        {/* ── Subnav Navigation Tabs ── */}
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("OPERATIONS")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              activeTab === "OPERATIONS"
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Operations & Priority Work</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ANALYTICS")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              activeTab === "ANALYTICS"
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Finding Analytics & Health</span>
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] px-1.5 py-0 font-bold",
                activeTab === "ANALYTICS"
                  ? "bg-white/20 text-white border-white/40"
                  : "bg-indigo-500/10 text-indigo-600 border-indigo-500/30"
              )}
            >
              Sprint 7.11
            </Badge>
          </button>
        </div>

        {activeTab === "ANALYTICS" ? (
          <FindingAnalyticsDashboard
            organizationId={activeOrgId}
            organizationName={overviewData?.organization_name}
          />
        ) : (
          <>
            {/* ── 3. Error Banner ── */}
            {error && (
              <Card className="border border-rose-500/30 bg-rose-500/5 p-6 text-center space-y-3">
                <AlertTriangle className="h-8 w-8 text-rose-500 mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-foreground">Compliance Overview Unavailable</h3>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
                </div>
                <Button size="sm" onClick={fetchOverview} className="text-xs font-semibold cursor-pointer bg-indigo-600 text-white">
                  Retry
                </Button>
              </Card>
            )}

        {/* ── 4. Summary Metrics (6 KPI Cards) ── */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          summary && (
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
              {/* Compliance Score / Status */}
              <Card className="border border-border/60 bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Compliance Status
                  </span>
                  <ShieldCheck className="h-4 w-4 text-indigo-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold tabular-nums text-foreground font-mono">
                    {summary.compliance_score != null ? `${summary.compliance_score}%` : "N/A"}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-bold uppercase px-2 py-0.5",
                      summary.compliance_status === "LOW_RISK"
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                        : summary.compliance_status === "MEDIUM_RISK"
                        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                        : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                    )}
                  >
                    {summary.compliance_status.replace("_", " ")}
                  </Badge>
                </div>
              </Card>

              {/* Total / Open Findings */}
              <Card className="border border-border/60 bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-500">
                    Open Findings
                  </span>
                  <ShieldAlert className="h-4 w-4 text-rose-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums text-rose-500">{summary.open_findings}</span>
                  <span className="text-[10px] text-muted-foreground">of {summary.total_findings} total</span>
                </div>
              </Card>

              {/* In Review */}
              <Card className="border border-border/60 bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-500">
                    In Review
                  </span>
                  <Clock className="h-4 w-4 text-indigo-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums text-indigo-500">{summary.in_review}</span>
                  <span className="text-[10px] text-muted-foreground">Under legal review</span>
                </div>
              </Card>

              {/* In Remediation */}
              <Card className="border border-border/60 bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-500">
                    In Remediation
                  </span>
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums text-amber-500">{summary.remediation}</span>
                  <span className="text-[10px] text-muted-foreground">Active fixes</span>
                </div>
              </Card>

              {/* Overdue Remediation */}
              <Card className="border border-border/60 bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-500">
                    Overdue
                  </span>
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums text-rose-500">{summary.overdue_count || 0}</span>
                  <span className="text-[10px] text-muted-foreground">Past due date</span>
                </div>
              </Card>

              {/* Resolved */}
              <Card className="border border-border/60 bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500">
                    Resolved
                  </span>
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums text-emerald-500">{summary.resolved}</span>
                  <span className="text-[10px] text-muted-foreground">Remediated</span>
                </div>
              </Card>
            </div>
          )
        )}

        {/* ── 5. Unassigned Findings Banner ── */}
        {summary && summary.unassigned_count > 0 && (
          <Card className="border border-amber-500/40 bg-amber-500/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground">
                  {summary.unassigned_count} Unassigned Finding{summary.unassigned_count > 1 ? "s" : ""} Require Ownership
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Compliance gap findings currently lack an assigned reviewer or owner.
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/compliance/my-work")}
              className="text-xs font-semibold gap-1.5 cursor-pointer shrink-0 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
            >
              <span>Assign Owners in My Work</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Card>
        )}

        {/* ── 6. Main Operational Grid: Priority Attention Queue & My Work ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SECTION 1: PRIORITY ATTENTION QUEUE */}
          <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1.5">
                <AlertOctagon className="h-4 w-4 text-rose-500" /> Priority Attention Queue
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => router.push("/compliance/my-work?view=all")}
                  className="text-xs text-rose-500 hover:text-rose-600 gap-1 cursor-pointer font-semibold"
                >
                  <span>View All Findings ({summary?.total_findings || 0})</span>
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ) : (!overviewData?.priority_attention || overviewData.priority_attention.length === 0) &&
              (!overviewData?.attention_required || overviewData.attention_required.length === 0) ? (
              <div className="py-8 text-center space-y-2">
                <ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto opacity-80" />
                <p className="text-xs text-muted-foreground font-medium">
                  Nothing requires immediate attention. All compliance findings are on track.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {(overviewData?.priority_attention || overviewData?.attention_required || []).slice(0, 5).map((item) => {
                  const sev = deriveSeverityBadge(item.severity, item.status);
                  const lifecycle = deriveLifecycleBadge(item.lifecycle_status);

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleOpenDrawer(item)}
                      className={cn(
                        "p-3.5 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer space-y-2 group",
                        item.is_overdue && "border-rose-500/40 bg-rose-500/5"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={cn("gap-1 text-[10px] uppercase font-bold", sev.className)}>
                            {sev.icon}
                            {sev.label}
                          </Badge>
                          <Badge variant="outline" className={cn("text-[10px] font-bold uppercase", lifecycle.className)}>
                            {lifecycle.label}
                          </Badge>
                          {item.is_overdue && (
                            <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] font-bold">
                              OVERDUE
                            </Badge>
                          )}
                        </div>

                        <span className="text-[10px] font-mono text-muted-foreground">
                          ID: #{item.id.slice(0, 8)}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-foreground line-clamp-2">
                        {item.citation || item.reasoning || item.matched_policy_text || "Non-compliant clause finding"}
                      </p>

                      <div className="flex items-center justify-between text-[11px] border-t border-border/30 pt-2">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <User className="h-3 w-3 text-indigo-500" />
                          <span>Assignee: {item.assignee?.full_name || <em className="text-muted-foreground/70">Unassigned</em>}</span>
                        </div>

                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDrawer(item);
                          }}
                          className="h-6 text-[11px] gap-1 cursor-pointer text-indigo-600 dark:text-indigo-400"
                        >
                          <span>View Finding</span>
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* SECTION 2: MY WORK */}
          <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
                <UserCheck className="h-4 w-4 text-indigo-500" /> My Work ({overviewData?.my_work.length || 0} Assigned)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => router.push("/compliance/my-work")}
                  className="text-xs text-indigo-500 hover:text-indigo-600 gap-1 cursor-pointer font-semibold"
                >
                  <span>View Workspace</span>
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ) : !overviewData?.my_work || overviewData.my_work.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <CheckCircle className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
                <p className="text-xs text-muted-foreground font-medium">
                  No findings are currently assigned to you.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {overviewData.my_work.map((item) => {
                  const sev = deriveSeverityBadge(item.severity, item.status);
                  const lifecycle = deriveLifecycleBadge(item.lifecycle_status);

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleOpenDrawer(item)}
                      className="p-3.5 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer space-y-2 group"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={cn("gap-1 text-[10px] uppercase font-bold", sev.className)}>
                            {sev.icon}
                            {sev.label}
                          </Badge>
                          <Badge variant="outline" className={cn("text-[10px] font-bold uppercase", lifecycle.className)}>
                            {lifecycle.label}
                          </Badge>
                        </div>

                        <span className="text-[10px] font-mono text-muted-foreground">
                          ID: #{item.id.slice(0, 8)}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-foreground line-clamp-2">
                        {item.citation || item.reasoning || "Assigned remediation item"}
                      </p>

                      <div className="flex items-center justify-between text-[11px] border-t border-border/30 pt-2">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Updated: {format(new Date(item.updated_at || item.created_at), "dd MMM yyyy")}
                        </span>

                        <Button
                          variant="outline"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDrawer(item);
                          }}
                          className="h-6 text-[11px] gap-1 cursor-pointer"
                        >
                          <span>Open</span>
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* ── 7. Team Workload Intelligence & Overdue Work Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* TEAM WORKLOAD SUMMARY TABLE */}
          <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Users className="h-4 w-4 text-indigo-500" /> Team Workload Intelligence
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {overviewData?.team_workload?.length || 0} Members
              </span>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            ) : !overviewData?.team_workload || overviewData.team_workload.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-6 text-center">
                Add organization members to distribute compliance work.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-border/40 text-[10px] uppercase font-semibold text-muted-foreground">
                      <th className="pb-2">Team Member</th>
                      <th className="pb-2 text-center">Open</th>
                      <th className="pb-2 text-center">In Review</th>
                      <th className="pb-2 text-center">Remediation</th>
                      <th className="pb-2 text-center">Resolved</th>
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {overviewData.team_workload.map((m) => (
                      <tr key={m.user_id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 font-medium text-foreground">
                          {m.full_name}
                          <span className="block text-[10px] font-mono text-muted-foreground">{formatRoleLabel(m.role)}</span>
                        </td>
                        <td className="py-2.5 text-center font-bold text-blue-500 tabular-nums">{m.open_count}</td>
                        <td className="py-2.5 text-center font-bold text-indigo-500 tabular-nums">{m.in_review_count}</td>
                        <td className="py-2.5 text-center font-bold text-amber-500 tabular-nums">{m.remediation_count}</td>
                        <td className="py-2.5 text-center font-bold text-emerald-500 tabular-nums">{m.resolved_count}</td>
                        <td className="py-2.5 text-right font-bold text-foreground tabular-nums">{m.total_assigned}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* REPORT EXPOSURE SUMMARY */}
          <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-indigo-500" /> Report Exposure Summary
              </span>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            ) : !overviewData?.report_exposure || overviewData.report_exposure.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-6 text-center">
                No compliance report exposure records found.
              </p>
            ) : (
              <div className="space-y-3">
                {overviewData.report_exposure.map((exp) => (
                  <div
                    key={exp.report_id}
                    onClick={() => router.push(`/compliance/reports/${exp.report_id}`)}
                    className="p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <h5 className="text-xs font-bold text-foreground truncate">
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
                          {exp.high_critical_count} High/Critical
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ── 6. Secondary Grid: Recent Activity & Recent Reports ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SECTION 3: RECENT ACTIVITY */}
          <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <History className="h-4 w-4 text-indigo-500" /> Recent Lifecycle Activity
              </span>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            ) : !overviewData?.recent_activity || overviewData.recent_activity.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-6 text-center">
                No recent compliance activity recorded.
              </p>
            ) : (
              <div className="space-y-3">
                {overviewData.recent_activity.map((act) => (
                  <div key={act.id} className="flex items-start gap-2.5 text-xs border-l-2 border-indigo-500/30 pl-3 py-1">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">
                        <span className="font-semibold">{act.user_name}</span>: {act.description || act.title}
                      </p>
                      <span className="text-[10px] text-muted-foreground font-mono block">
                        {format(new Date(act.created_at), "dd MMM yyyy, HH:mm")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* SECTION 4: RECENT REPORTS */}
          <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-indigo-500" /> Recent Reports
              </span>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => router.push("/reports")}
                className="text-xs text-indigo-600 dark:text-indigo-400 cursor-pointer gap-1"
              >
                <span>View All Reports</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
              </div>
            ) : !overviewData?.recent_reports || overviewData.recent_reports.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-6 text-center">
                No compliance reports generated yet.
              </p>
            ) : (
              <div className="space-y-3">
                {overviewData.recent_reports.map((report) => {
                  const score = report.overall_score != null ? `${report.overall_score}%` : "N/A";

                  return (
                    <div
                      key={report.id}
                      onClick={() => router.push(`/compliance/reports/${report.id}`)}
                      className="p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">
                            Report #{report.id.slice(0, 8)}
                          </span>
                          <Badge variant="outline" className="text-[9px] uppercase font-bold px-1.5 py-0.2 bg-indigo-500/10 text-indigo-600 border-indigo-500/30">
                            {report.status || (report as any).report_status}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Created {format(new Date(report.created_at), "dd MMM yyyy")} • Score: {score}
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/compliance/reports/${report.id}`);
                        }}
                        className="h-7 text-xs cursor-pointer gap-1"
                      >
                        <span>View Report</span>
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* ── 7. Quick Actions ── */}
        <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
            Quick Actions
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button
              variant="outline"
              onClick={() => router.push("/compliance/new")}
              className="h-12 text-xs font-semibold cursor-pointer gap-2 justify-start border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Run New Analysis</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => router.push("/compliance/calendar")}
              className="h-12 text-xs font-semibold cursor-pointer gap-2 justify-start border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
            >
              <Calendar className="h-4 w-4" />
              <span>Compliance Calendar</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => router.push("/reports")}
              className="h-12 text-xs font-semibold cursor-pointer gap-2 justify-start"
            >
              <BarChart3 className="h-4 w-4 text-emerald-500" />
              <span>View All Reports</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => router.push("/documents")}
              className="h-12 text-xs font-semibold cursor-pointer gap-2 justify-start"
            >
              <FileCheck2 className="h-4 w-4 text-sky-500" />
              <span>Upload Policy Document</span>
            </Button>
          </div>
        </Card>
        </>
        )}
      </main>

      {/* ── Slide-over Finding Detail Drawer ── */}
      <FindingDetailDrawer
        finding={selectedFinding}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onFindingUpdated={handleFindingUpdated}
        reportName={selectedFinding ? `Report #${selectedFinding.report_id.slice(0, 8)}` : undefined}
        organizationId={activeOrgId}
      />

      {/* ── Compliance Report Generation Modal (Sprint 7.14) ── */}
      <ComplianceReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        organizationId={activeOrgId}
        organizationName={overviewData?.organization_name}
      />
    </div>
  );
}
