"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  UserCheck,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Search,
  RefreshCw,
  Filter,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Clock,
  CheckCircle,
  FileText,
  AlertTriangle,
  Calendar,
  Layers,
  LayoutList,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/auth-context";
import { findingsService, FindingDetail } from "@/services/api/findings";
import { FindingDetailDrawer, FindingItem } from "./FindingDetailDrawer";
import { OrganizationSwitcher } from "@/components/layout/OrganizationSwitcher";
import { Organization } from "@/services/api/organizations";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ViewMode = "MY_WORK" | "ALL_FINDINGS";

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
    case "REMEDIATION_REQUIRED":
      return {
        label: "REMEDIATION",
        className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
      };
    case "POTENTIAL_FALSE_POSITIVE":
      return {
        label: "FALSE POSITIVE REVIEW",
        className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
      };
    case "ADMIN_REVIEW":
      return {
        label: "ADMIN REVIEW",
        className: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
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
    case "REASSESSMENT_REQUIRED":
      return {
        label: "REASSESSMENT REQUIRED",
        className: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/50 font-bold",
      };
    case "REJECTED":
      return {
        label: "REJECTED (FALSE POSITIVE)",
        className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
      };
    default:
      return {
        label: "OPEN",
        className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
      };
  }
}

interface MyWorkWorkspaceProps {
  initialView?: ViewMode;
}

export function MyWorkWorkspace({ initialView }: MyWorkWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, activeMembership } = useAuth();

  // Active Organization state
  const [activeOrgId, setActiveOrgId] = useState<string | undefined>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selected_organization_id") || undefined;
    }
    return undefined;
  });

  // View Mode: determine from props or URL query parameter
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (initialView) return initialView;
    const viewParam = searchParams?.get("view");
    if (viewParam === "all" || viewParam === "all-findings") return "ALL_FINDINGS";
    if (viewParam === "my-work") return "MY_WORK";
    return "ALL_FINDINGS"; // Default to All Organization Findings so users see all findings first
  });

  // Findings & Workspace State
  const [myWorkFindings, setMyWorkFindings] = useState<FindingDetail[]>([]);
  const [allFindings, setAllFindings] = useState<FindingDetail[]>([]);
  const [totalOrgFindings, setTotalOrgFindings] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Finding Detail Drawer State
  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Synchronize active organization on event
  useEffect(() => {
    const handleOrgChange = () => {
      if (typeof window !== "undefined") {
        const storedId = localStorage.getItem("selected_organization_id");
        if (storedId && storedId !== activeOrgId) {
          setActiveOrgId(storedId);
          setCurrentPage(1);
        }
      }
    };
    window.addEventListener("organization_changed", handleOrgChange);
    return () => window.removeEventListener("organization_changed", handleOrgChange);
  }, [activeOrgId]);

  // Read URL query params dynamically
  useEffect(() => {
    const viewParam = searchParams?.get("view");
    if (viewParam === "all" || viewParam === "all-findings") {
      setViewMode("ALL_FINDINGS");
    } else if (viewParam === "my-work") {
      setViewMode("MY_WORK");
    }

    const stParam = searchParams?.get("lifecycle_status") || searchParams?.get("status");
    if (stParam) {
      setStatusFilter(stParam.toUpperCase());
    }

    const sevParam = searchParams?.get("severity");
    if (sevParam) {
      setSeverityFilter(sevParam.toUpperCase());
    }
  }, [searchParams]);

  // Fetch assigned findings (My Work)
  const fetchMyWork = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await findingsService.getMyWork(activeOrgId, {
        lifecycle_status: statusFilter !== "ALL" ? statusFilter : undefined,
        severity: severityFilter !== "ALL" ? severityFilter : undefined,
        overdue_only: overdueOnly || undefined,
      });
      setMyWorkFindings(data || []);
    } catch (err: any) {
      console.error("Failed loading My Work findings:", err);
      const rawDetail = err?.response?.data?.detail || "Failed to load assigned findings.";
      setError(typeof rawDetail === "string" ? rawDetail : JSON.stringify(rawDetail));
      toast.error("Error loading assigned work items.");
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId, statusFilter, severityFilter, overdueOnly]);

  // Fetch all organization findings (All Organization Findings with server pagination)
  const fetchAllFindings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await findingsService.listFindings(activeOrgId, {
        page: currentPage,
        page_size: pageSize,
        search: searchQuery.trim() || undefined,
        lifecycle_status: statusFilter !== "ALL" ? statusFilter : undefined,
        severity: severityFilter !== "ALL" ? severityFilter : undefined,
        assigned_to: assigneeFilter === "ME" ? "me" : assigneeFilter === "UNASSIGNED" ? "unassigned" : undefined,
        overdue_only: overdueOnly || undefined,
      });
      setAllFindings(resp.items || []);
      setTotalOrgFindings(resp.total || 0);
      setTotalPages(resp.total_pages || 1);
    } catch (err: any) {
      console.error("Failed loading organization findings:", err);
      const rawDetail = err?.response?.data?.detail || "Failed to load organization findings.";
      setError(typeof rawDetail === "string" ? rawDetail : JSON.stringify(rawDetail));
      toast.error("Error loading organization findings.");
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId, currentPage, pageSize, searchQuery, statusFilter, severityFilter, assigneeFilter, overdueOnly]);

  // Trigger appropriate fetch based on viewMode
  useEffect(() => {
    if (viewMode === "MY_WORK") {
      fetchMyWork();
    } else {
      fetchAllFindings();
    }
  }, [viewMode, fetchMyWork, fetchAllFindings]);

  // Derived filtered findings for client-side search in My Work mode
  const filteredMyWorkFindings = useMemo(() => {
    if (!searchQuery.trim()) return myWorkFindings;

    const q = searchQuery.toLowerCase();
    return myWorkFindings.filter((f) => {
      return (
        f.id.toLowerCase().includes(q) ||
        (f.policy_clause_id && f.policy_clause_id.toLowerCase().includes(q)) ||
        (f.regulation_clause_id && f.regulation_clause_id.toLowerCase().includes(q)) ||
        (f.citation && f.citation.toLowerCase().includes(q)) ||
        (f.reasoning && f.reasoning.toLowerCase().includes(q)) ||
        (f.recommendation && f.recommendation.toLowerCase().includes(q))
      );
    });
  }, [myWorkFindings, searchQuery]);

  // Active findings dataset based on view mode
  const displayedFindings = viewMode === "MY_WORK" ? filteredMyWorkFindings : allFindings;

  // KPI Metrics Calculations (from My Work)
  const metrics = useMemo(() => {
    const total = myWorkFindings.length;
    const open = myWorkFindings.filter(
      (f) => (f.lifecycle_status || "OPEN").toUpperCase() in { OPEN: 1, REOPENED: 1 }
    ).length;
    const inReview = myWorkFindings.filter(
      (f) => (f.lifecycle_status || "OPEN").toUpperCase() === "IN_REVIEW"
    ).length;
    const highCritical = myWorkFindings.filter((f) => {
      const sev = (f.severity || "").toUpperCase();
      return sev === "CRITICAL" || sev === "HIGH" || f.status === "NON_COMPLIANT";
    }).length;

    return { total, open, inReview, highCritical };
  }, [myWorkFindings]);

  // Drawer Handlers
  const handleOpenDrawer = (finding: FindingDetail) => {
    setSelectedFinding(finding as FindingItem);
    setIsDrawerOpen(true);
  };

  const handleFindingUpdated = () => {
    if (viewMode === "MY_WORK") {
      fetchMyWork();
    } else {
      fetchAllFindings();
    }
  };

  const handleRefresh = () => {
    if (viewMode === "MY_WORK") {
      fetchMyWork();
    } else {
      fetchAllFindings();
    }
  };

  const handleOrgChanged = (org: Organization) => {
    setActiveOrgId(org.id);
    setCurrentPage(1);
  };

  // Pagination display range
  const startItem = totalOrgFindings > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItem = Math.min(currentPage * pageSize, totalOrgFindings);

  return (
    <div className="min-h-screen bg-background text-foreground pb-16 space-y-6">
      {/* Header Bar */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-md sticky top-0 z-10 px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/compliance/overview")}
              className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  {viewMode === "ALL_FINDINGS" ? (
                    <>
                      <Layers className="h-5 w-5 text-indigo-500" /> All Organization Findings
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-5 w-5 text-indigo-500" /> My Assigned Work
                    </>
                  )}
                </h1>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs font-semibold",
                    viewMode === "ALL_FINDINGS"
                      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                      : "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"
                  )}
                >
                  {viewMode === "ALL_FINDINGS"
                    ? `Total: ${totalOrgFindings} Findings`
                    : `${myWorkFindings.length} Assigned Items`}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {viewMode === "ALL_FINDINGS"
                  ? "Inspecting every compliance finding across all reports in this organization."
                  : `Active compliance findings assigned to ${user?.full_name || "you"} for review and remediation.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* View Mode Switcher */}
            <div className="flex items-center rounded-xl bg-muted/60 p-1 border border-border/50 text-xs">
              <button
                type="button"
                onClick={() => {
                  setViewMode("ALL_FINDINGS");
                  setCurrentPage(1);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5",
                  viewMode === "ALL_FINDINGS"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutList className="h-3.5 w-3.5 text-purple-500" />
                <span>All Findings ({totalOrgFindings || allFindings.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode("MY_WORK");
                  setCurrentPage(1);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5",
                  viewMode === "MY_WORK"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <UserCheck className="h-3.5 w-3.5 text-indigo-500" />
                <span>My Work ({myWorkFindings.length})</span>
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="gap-1.5 text-xs cursor-pointer shrink-0"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 space-y-6">
        {/* KPI Summary Cards (in My Work mode) */}
        {viewMode === "MY_WORK" && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border border-border/50 bg-card p-4 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Total Assigned</span>
              <p className="text-2xl font-bold text-foreground tabular-nums">{metrics.total}</p>
              <span className="text-[10px] text-muted-foreground">Work items assigned to you</span>
            </Card>

            <Card className="border border-border/50 bg-card p-4 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Open & Active</span>
              <p className="text-2xl font-bold text-blue-500 tabular-nums">{metrics.open}</p>
              <span className="text-[10px] text-muted-foreground">Requiring assessment</span>
            </Card>

            <Card className="border border-border/50 bg-card p-4 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">In Review</span>
              <p className="text-2xl font-bold text-indigo-500 tabular-nums">{metrics.inReview}</p>
              <span className="text-[10px] text-muted-foreground">Under active review</span>
            </Card>

            <Card className="border border-border/50 bg-card p-4 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">High / Critical Attention</span>
              <p className="text-2xl font-bold text-rose-500 tabular-nums">{metrics.highCritical}</p>
              <span className="text-[10px] text-muted-foreground">High statutory risk items</span>
            </Card>
          </div>
        )}

        {/* Filters & Search Controls */}
        <Card className="border border-border/50 bg-card p-4 space-y-3">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-xs font-semibold text-muted-foreground mr-1">Status:</span>
            {[
              { key: "ALL", label: "All Statuses" },
              { key: "OPEN", label: "Open" },
              { key: "IN_REVIEW", label: "In Review" },
              { key: "REMEDIATION", label: "Remediation" },
              { key: "POTENTIAL_FALSE_POSITIVE", label: "False Positive Review" },
              { key: "ADMIN_REVIEW", label: "Admin Review" },
              { key: "RESOLVED", label: "Resolved" },
              { key: "REASSESSMENT_REQUIRED", label: "Reassessment Required" },
              { key: "REOPENED", label: "Reopened" },
              { key: "REJECTED", label: "Rejected" },
            ].map((pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={() => {
                  setStatusFilter(pill.key);
                  setCurrentPage(1);
                }}
                className={cn(
                  "px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap",
                  statusFilter === pill.key
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {pill.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-3 flex-wrap pt-2 border-t border-border/40">
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search clause, citation, reasoning..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (viewMode === "ALL_FINDINGS") {
                    setCurrentPage(1);
                  }
                }}
                className="pl-9 text-xs h-9"
              />
            </div>

            {/* Filter Selects */}
            <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
              {/* Severity Filter */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                <span>Severity:</span>
              </div>
              <select
                value={severityFilter}
                onChange={(e) => {
                  setSeverityFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 px-3 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              {/* Assignee Filter (All Findings Mode) */}
              {viewMode === "ALL_FINDINGS" && (
                <>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium ml-1">
                    <span>Assignee:</span>
                  </div>
                  <select
                    value={assigneeFilter}
                    onChange={(e) => {
                      setAssigneeFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="h-9 px-3 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    <option value="ALL">All Assignees</option>
                    <option value="ME">Assigned to Me</option>
                    <option value="UNASSIGNED">Unassigned</option>
                  </select>
                </>
              )}

              {/* Page Size Selector */}
              {viewMode === "ALL_FINDINGS" && (
                <>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium ml-1">
                    <span>Per Page:</span>
                  </div>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="h-9 px-2 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </>
              )}

              <Button
                variant={overdueOnly ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  setOverdueOnly(!overdueOnly);
                  setCurrentPage(1);
                }}
                className={cn(
                  "h-9 text-xs font-semibold gap-1.5 cursor-pointer ml-1",
                  overdueOnly && "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 font-bold"
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Overdue Only</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* Content Area */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : error ? (
          <Card className="border border-rose-500/30 bg-rose-500/5 p-8 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-rose-500 mx-auto" />
            <h3 className="text-sm font-semibold text-foreground">Failed to Load Findings</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
            <Button size="sm" onClick={handleRefresh} className="cursor-pointer text-xs font-semibold gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Try Again
            </Button>
          </Card>
        ) : displayedFindings.length === 0 ? (
          /* Empty State */
          <Card className="border border-dashed border-border/60 bg-muted/10 p-12 text-center space-y-3">
            {viewMode === "MY_WORK" ? (
              <>
                <CheckCircle className="h-10 w-10 text-emerald-500/80 mx-auto" />
                <h3 className="text-sm font-bold text-foreground">No findings are currently assigned to you.</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Switch to &quot;All Findings&quot; tab to inspect all {totalOrgFindings} compliance findings across your organization.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setViewMode("ALL_FINDINGS")}
                  className="cursor-pointer text-xs gap-1.5 mt-2"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Browse All Organization Findings</span>
                </Button>
              </>
            ) : (
              <>
                <Filter className="h-10 w-10 text-muted-foreground/60 mx-auto" />
                <h3 className="text-sm font-bold text-foreground">No findings match your current filters.</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Try clearing your search query or selecting &quot;All Statuses&quot; and &quot;All Severities&quot;.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("ALL");
                    setSeverityFilter("ALL");
                    setAssigneeFilter("ALL");
                    setOverdueOnly(false);
                    setCurrentPage(1);
                  }}
                  className="cursor-pointer text-xs mt-2"
                >
                  Reset Filters
                </Button>
              </>
            )}
          </Card>
        ) : (
          /* Findings List Grid */
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {viewMode === "MY_WORK"
                  ? `Assigned Work Items (${displayedFindings.length})`
                  : `Showing ${startItem}–${endItem} of ${totalOrgFindings} organization findings`}
              </h3>
              <span className="text-[10px] text-muted-foreground font-mono">
                {viewMode === "ALL_FINDINGS" ? `Page ${currentPage} of ${totalPages}` : `${displayedFindings.length} items`}
              </span>
            </div>

            <div className="space-y-3">
              {displayedFindings.map((item) => {
                const sev = deriveSeverityBadge(item.severity, item.status);
                const lifecycle = deriveLifecycleBadge(item.lifecycle_status);

                return (
                  <Card
                    key={item.id}
                    onClick={() => handleOpenDrawer(item)}
                    className={cn(
                      "border border-border/60 bg-card hover:border-indigo-500/50 transition-all cursor-pointer p-4 space-y-3 group shadow-xs",
                      item.is_overdue && "border-rose-500/40 bg-rose-500/5"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={cn("gap-1 text-xs uppercase font-bold", sev.className)}>
                          {sev.icon}
                          {sev.label}
                        </Badge>
                        <Badge variant="outline" className={cn("text-xs font-bold uppercase", lifecycle.className)}>
                          {lifecycle.label}
                        </Badge>
                        {item.is_overdue && (
                          <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 gap-1 font-bold text-[10px]">
                            <AlertTriangle className="h-3 w-3" />
                            <span>OVERDUE</span>
                          </Badge>
                        )}
                        <span className="text-xs font-mono text-muted-foreground">
                          ID: #{item.id.slice(0, 8)}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {item.remediation_due_date && (
                          <div className="flex items-center gap-1 font-medium text-foreground">
                            <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                            <span>Due: {format(new Date(item.remediation_due_date), "dd MMM yyyy")}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{format(new Date(item.created_at), "MMM d, yyyy")}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        {item.policy_clause_id && <Badge variant="secondary" className="text-[10px]">{item.policy_clause_id}</Badge>}
                        {item.regulation_clause_id && <Badge variant="outline" className="text-[10px]">{item.regulation_clause_id}</Badge>}
                      </div>
                      <p className="text-xs text-foreground font-medium line-clamp-2">
                        {item.citation || item.reasoning || "Compliance finding item assigned for review."}
                      </p>
                    </div>

                    {item.recommendation && (
                      <p className="text-xs text-muted-foreground bg-muted/20 p-2.5 rounded-lg border border-border/30 line-clamp-2">
                        <strong className="text-foreground">Recommendation:</strong> {item.recommendation}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-border/30">
                      <span className="text-[11px] text-muted-foreground">
                        Assigned to:{" "}
                        <strong className="text-indigo-500">
                          {item.assignee?.full_name || (item.assigned_to ? "Assigned" : "Unassigned")}
                        </strong>
                      </span>

                      <Button variant="ghost" size="xs" className="h-7 text-xs font-semibold text-indigo-500 gap-1 group-hover:translate-x-0.5 transition-transform">
                        <span>Open Work Item</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Pagination Controls for All Findings mode */}
            {viewMode === "ALL_FINDINGS" && totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/40">
                <span className="text-xs text-muted-foreground">
                  Showing <strong className="text-foreground">{startItem}–{endItem}</strong> of <strong className="text-foreground">{totalOrgFindings}</strong> findings
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1 || isLoading}
                    className="h-8 px-2.5 text-xs cursor-pointer gap-1"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Previous</span>
                  </Button>

                  {/* Page numbers */}
                  {Array.from({ length: Math.min(7, totalPages) }, (_, idx) => {
                    let pageNum = idx + 1;
                    if (totalPages > 7) {
                      if (currentPage > 4) {
                        pageNum = currentPage - 3 + idx;
                        if (pageNum > totalPages) pageNum = totalPages - (6 - idx);
                      }
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        disabled={isLoading}
                        className={cn(
                          "h-8 w-8 text-xs p-0 cursor-pointer font-mono",
                          currentPage === pageNum && "bg-primary text-primary-foreground font-bold"
                        )}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages || isLoading}
                    className="h-8 px-2.5 text-xs cursor-pointer gap-1"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Canonical Finding Detail Drawer */}
      <FindingDetailDrawer
        finding={selectedFinding}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onFindingUpdated={handleFindingUpdated}
        organizationId={activeOrgId}
      />
    </div>
  );
}
