"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  Clock,
  CheckCircle,
  PlusCircle,
  History,
  User,
  Users,
  AlertCircle,
  ChevronRight,
  UserCheck,
  Layers,
  FileText,
  AlertOctagon,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/auth-context";
import {
  complianceService,
  ComplianceOverviewData,
} from "@/services/api/compliance";
import { FindingDetailDrawer, FindingItem } from "./FindingDetailDrawer";
import { FindingAnalyticsDashboard } from "./FindingAnalyticsDashboard";
import { formatRoleLabel } from "@/utils/role-utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/layout/AppShell";
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
        className: "bg-primary/10 text-primary border-primary/30",
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
  const { user, activeMembership, permissions } = useAuth();

  // Active workspace from context
  const activeOrgId =
    activeMembership?.organization_id ||
    (typeof window !== "undefined"
      ? localStorage.getItem("selected_organization_id") || undefined
      : undefined);

  const [activeTab, setActiveTab] = useState<"OPERATIONS" | "ANALYTICS">("OPERATIONS");
  const [overviewData, setOverviewData] = useState<ComplianceOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Finding Detail Drawer State
  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Synchronize on organization_changed event
  useEffect(() => {
    const handleOrgChange = () => {
      fetchOverview();
    };
    window.addEventListener("organization_changed", handleOrgChange);
    return () => window.removeEventListener("organization_changed", handleOrgChange);
  }, [activeOrgId]);

  // Fetch Overview Data
  const fetchOverview = useCallback(async () => {
    if (!activeOrgId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await complianceService.getComplianceOverview(activeOrgId);
      setOverviewData(data);
    } catch (err: any) {
      console.error("Failed loading compliance overview:", err);
      const rawDetail = err?.response?.data?.detail || "Failed to load compliance operations metrics.";
      setError(typeof rawDetail === "string" ? rawDetail : JSON.stringify(rawDetail));
      toast.error("Error loading compliance operations overview.");
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Handlers for Drawer
  const handleOpenDrawer = (item: any) => {
    setSelectedFinding(item);
    setIsDrawerOpen(true);
  };

  const handleFindingUpdated = (_updated: FindingItem) => {
    fetchOverview();
  };

  const summary = overviewData?.summary;
  const activeOrgName = overviewData?.organization_name || activeMembership?.organization_name || "Active Workspace";

  return (
    <AppShell>
      <main className="p-6 md:p-10 max-w-7xl mx-auto space-y-7">
        {/* ── 1. Page Header (Simplified & Clean) ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
                <ShieldAlert className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Compliance Overview
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Monitor findings, assignments, remediation, and risk trends for{" "}
                  <strong className="text-foreground">{activeOrgName}</strong>.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {permissions.canRunAnalysis && (
              <Button
                size="sm"
                onClick={() => router.push("/compliance/new")}
                className="gap-1.5 text-xs font-semibold cursor-pointer bg-primary hover:bg-primary-hover text-primary-foreground h-9 px-4 rounded-xl shadow-md shadow-primary/20"
              >
                <PlusCircle className="h-4 w-4" />
                <span>New Analysis</span>
              </Button>
            )}
          </div>
        </div>

        {/* ── 2. Segmented Tab Navigation ── */}
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center rounded-xl border border-border/60 bg-card p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab("OPERATIONS")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                activeTab === "OPERATIONS"
                  ? "bg-primary text-primary-foreground shadow-2xs"
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
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Finding Analytics & Health</span>
            </button>
          </div>
        </div>

        {activeTab === "ANALYTICS" ? (
          <FindingAnalyticsDashboard
            organizationId={activeOrgId}
            organizationName={activeOrgName}
            reportExposure={overviewData?.report_exposure}
            onOpenFindingDrawer={handleOpenDrawer}
          />
        ) : (
          <>
            {/* ── 3. Error Banner ── */}
            {error && (
              <Card className="border border-rose-500/30 bg-rose-500/5 p-6 text-center space-y-3 rounded-2xl">
                <AlertTriangle className="h-8 w-8 text-rose-500 mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-foreground">Compliance Overview Unavailable</h3>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
                </div>
                <Button
                  size="sm"
                  onClick={fetchOverview}
                  className="text-xs font-semibold cursor-pointer bg-primary text-primary-foreground rounded-xl"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Retry
                </Button>
              </Card>
            )}

            {/* ── 4. Lifecycle KPI Cards (6 Clickable Cards) ── */}
            {isLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
            ) : (
              summary && (
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
                  {/* 1. Compliance Score */}
                  <Card className="border border-border/60 bg-card p-4 rounded-2xl shadow-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Compliance Score
                      </span>
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex items-baseline gap-2 pt-1">
                      <span className="text-2xl font-bold tabular-nums text-foreground font-mono">
                        {summary.compliance_score != null ? `${summary.compliance_score}%` : "N/A"}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] font-bold uppercase px-1.5 py-0.5",
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
                    <span className="text-[10px] text-muted-foreground block truncate">
                      Latest completed assessment
                    </span>
                  </Card>

                  {/* 2. Open Findings */}
                  <Card
                    onClick={() => router.push("/compliance/my-work?view=all&lifecycle_status=OPEN")}
                    className="border border-blue-500/30 bg-blue-500/[0.03] hover:border-blue-500/60 p-4 rounded-2xl shadow-sm cursor-pointer group transition-all space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        Open Findings
                      </span>
                      <ShieldAlert className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400 font-mono">
                        {summary.open_findings}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-blue-400/50 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <span className="text-[10px] text-muted-foreground block">
                      of {summary.total_findings} total findings
                    </span>
                  </Card>

                  {/* 3. In Review */}
                  <Card
                    onClick={() => router.push("/compliance/my-work?view=all&lifecycle_status=IN_REVIEW")}
                    className="border border-primary/30 bg-primary/[0.03] hover:border-primary/60 p-4 rounded-2xl shadow-sm cursor-pointer group transition-all space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                        In Review
                      </span>
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-2xl font-bold tabular-nums text-primary font-mono">
                        {summary.in_review}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-primary/50 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <span className="text-[10px] text-muted-foreground block">
                      Under legal/analyst review
                    </span>
                  </Card>

                  {/* 4. In Remediation */}
                  <Card
                    onClick={() => router.push("/compliance/my-work?view=all&lifecycle_status=REMEDIATION")}
                    className="border border-amber-500/30 bg-amber-500/[0.03] hover:border-amber-500/60 p-4 rounded-2xl shadow-sm cursor-pointer group transition-all space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        In Remediation
                      </span>
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400 font-mono">
                        {summary.remediation}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-amber-400/50 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <span className="text-[10px] text-muted-foreground block">
                      Active mitigation plans
                    </span>
                  </Card>

                  {/* 5. Overdue */}
                  <Card
                    onClick={() => router.push("/compliance/my-work?view=all&overdue=true")}
                    className="border border-rose-500/30 bg-rose-500/[0.03] hover:border-rose-500/60 p-4 rounded-2xl shadow-sm cursor-pointer group transition-all space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                        Overdue
                      </span>
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                    </div>
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400 font-mono">
                        {summary.overdue_count || 0}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-rose-400/50 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <span className="text-[10px] text-muted-foreground block">
                      Passed target SLA date
                    </span>
                  </Card>

                  {/* 6. Resolved */}
                  <Card
                    onClick={() => router.push("/compliance/my-work?view=all&lifecycle_status=RESOLVED")}
                    className="border border-emerald-500/30 bg-emerald-500/[0.03] hover:border-emerald-500/60 p-4 rounded-2xl shadow-sm cursor-pointer group transition-all space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        Resolved
                      </span>
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 font-mono">
                        {summary.resolved}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-emerald-400/50 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <span className="text-[10px] text-muted-foreground block">
                      Verified & closed gaps
                    </span>
                  </Card>
                </div>
              )
            )}

            {/* ── 5. Unassigned Findings Alert Banner ── */}
            {summary && summary.unassigned_count > 0 && (
              <Card className="border border-amber-500/30 bg-amber-500/[0.04] p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">
                      {summary.unassigned_count} finding{summary.unassigned_count > 1 ? "s" : ""} need an owner
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Assign responsible team members to move these findings through review and remediation.
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/compliance/my-work?view=all&unassigned=true")}
                  className="text-xs font-semibold gap-1.5 cursor-pointer shrink-0 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 rounded-xl"
                >
                  <span>Assign Findings</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </Card>
            )}

            {/* ── 6. Main Operational Grid: Priority Findings & My Assigned Work ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* SECTION 1: PRIORITY FINDINGS */}
              <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-sm rounded-2xl">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1.5">
                    <AlertOctagon className="h-4 w-4 text-rose-500" /> Priority Findings
                  </span>
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
                      const displayTitle = item.citation || item.reasoning || item.matched_policy_text || "Non-compliant clause finding";

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleOpenDrawer(item)}
                          className={cn(
                            "p-3.5 rounded-xl border border-border/60 bg-background hover:bg-muted/30 transition-colors cursor-pointer space-y-2 group",
                            item.is_overdue && "border-rose-500/40 bg-rose-500/[0.02]"
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
                              {item.remediation_due_date ? `Due: ${format(new Date(item.remediation_due_date), "dd MMM")}` : ""}
                            </span>
                          </div>

                          <p className="text-xs font-semibold text-foreground line-clamp-2 leading-relaxed">
                            {displayTitle}
                          </p>

                          <div className="flex items-center justify-between text-[11px] border-t border-border/30 pt-2">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <User className="h-3 w-3 text-primary" />
                              <span>Assignee: {item.assignee?.full_name || <em className="text-muted-foreground/70">Unassigned</em>}</span>
                            </div>

                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDrawer(item);
                              }}
                              className="h-6 text-[11px] gap-1 cursor-pointer text-primary"
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

              {/* SECTION 2: MY ASSIGNED WORK (Independent Height) */}
              <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-sm rounded-2xl">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <UserCheck className="h-4 w-4 text-primary" /> My Assigned Work
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => router.push("/compliance/my-work")}
                    className="text-xs text-primary hover:text-primary-hover gap-1 cursor-pointer font-semibold"
                  >
                    <span>View Workspace</span>
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>

                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full rounded-xl" />
                    <Skeleton className="h-16 w-full rounded-xl" />
                  </div>
                ) : !overviewData?.my_work || overviewData.my_work.length === 0 ? (
                  <div className="py-8 text-center space-y-1.5">
                    <CheckCircle className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
                    <p className="text-xs font-semibold text-foreground">
                      No findings assigned to you.
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Your assigned reviews and remediation tasks will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {overviewData.my_work.slice(0, 5).map((item) => {
                      const sev = deriveSeverityBadge(item.severity, item.status);
                      const lifecycle = deriveLifecycleBadge(item.lifecycle_status);
                      const displayTitle = item.citation || item.reasoning || "Assigned remediation item";

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleOpenDrawer(item)}
                          className="p-3.5 rounded-xl border border-border/60 bg-background hover:bg-muted/30 transition-colors cursor-pointer space-y-2 group"
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
                              {format(new Date(item.updated_at || item.created_at), "dd MMM yyyy")}
                            </span>
                          </div>

                          <p className="text-xs font-semibold text-foreground line-clamp-2 leading-relaxed">
                            {displayTitle}
                          </p>

                          <div className="flex items-center justify-between text-[11px] border-t border-border/30 pt-2">
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {item.remediation_due_date ? `Due: ${format(new Date(item.remediation_due_date), "dd MMM yyyy")}` : "No due date set"}
                            </span>

                            <Button
                              variant="outline"
                              size="xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDrawer(item);
                              }}
                              className="h-6 text-[11px] gap-1 cursor-pointer rounded-lg"
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

            {/* ── 7. Secondary Operational Grid: Team Workload & Recent Activity ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* SECTION 3: TEAM WORKLOAD */}
              <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-sm rounded-2xl">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-primary" /> Team Workload
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {overviewData?.team_workload?.length || 0} Members
                  </span>
                </div>

                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                  </div>
                ) : !overviewData?.team_workload || overviewData.team_workload.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-8 text-center">
                    Add organization members to distribute compliance work.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-border/40 text-[10px] uppercase font-semibold text-muted-foreground">
                          <th className="pb-2.5">Team Member</th>
                          <th className="pb-2.5 text-center">Active</th>
                          <th className="pb-2.5 text-center">Overdue</th>
                          <th className="pb-2.5 text-right">Resolved</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {overviewData.team_workload
                          .slice()
                          .sort((a, b) => (b.active_count ?? (b.open_count + b.in_review_count + b.remediation_count)) - (a.active_count ?? (a.open_count + a.in_review_count + a.remediation_count)))
                          .map((m) => {
                            const activeNum = m.active_count ?? (m.open_count + m.in_review_count + m.remediation_count);
                            const overdueNum = m.overdue_count ?? 0;
                            const resolvedNum = m.resolved_count;

                            return (
                              <tr key={m.user_id} className="hover:bg-muted/20 transition-colors">
                                <td className="py-2.5 font-medium text-foreground">
                                  {m.full_name}
                                  <span className="block text-[10px] text-muted-foreground">
                                    {formatRoleLabel(m.role)}
                                  </span>
                                </td>
                                <td className="py-2.5 text-center tabular-nums">
                                  <span className={cn(
                                    "font-bold",
                                    activeNum > 0 ? "text-primary" : "text-muted-foreground/60 font-normal"
                                  )}>
                                    {activeNum}
                                  </span>
                                </td>
                                <td className="py-2.5 text-center tabular-nums">
                                  <span className={cn(
                                    "font-bold",
                                    overdueNum > 0 ? "text-rose-500" : "text-muted-foreground/60 font-normal"
                                  )}>
                                    {overdueNum}
                                  </span>
                                </td>
                                <td className="py-2.5 text-right tabular-nums">
                                  <span className={cn(
                                    "font-bold",
                                    resolvedNum > 0 ? "text-emerald-500" : "text-muted-foreground/60 font-normal"
                                  )}>
                                    {resolvedNum}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* SECTION 4: RECENT ACTIVITY */}
              <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-sm rounded-2xl">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <History className="h-4 w-4 text-primary" /> Recent Activity
                  </span>
                </div>

                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                  </div>
                ) : !overviewData?.recent_activity || overviewData.recent_activity.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-8 text-center">
                    No recent compliance activity recorded for this workspace.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {overviewData.recent_activity.slice(0, 5).map((act) => (
                      <div key={act.id} className="flex items-start gap-2.5 text-xs border-l-2 border-primary/30 pl-3 py-1">
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
            </div>
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
    </AppShell>
  );
}
