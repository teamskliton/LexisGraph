// AnalysisHistoryTable — Enterprise Compliance Analysis History & Audit Trail
// Reuses existing complianceService, documentsService, regulationsApi, and organizationsService.
// Fully organization-scoped, resolving human-readable names, real timestamps, duration, and audit timeline.

"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  History,
  Search,
  RefreshCw,
  ExternalLink,
  RotateCcw,
  PlusCircle,
  User,
  Clock,
  ArrowUpDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Calendar,
  Info,
  FileText,
  ShieldAlert,
  Layers,
  Copy,
  Check,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCheck2,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/compliance/shared/StatusBadge";
import { RiskBadge } from "@/components/compliance/shared/RiskBadge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";

import { complianceService, ComplianceJob, ComplianceReport } from "@/services/api/compliance";
import { organizationsService, Organization, OrganizationMember } from "@/services/api/organizations";
import { documentsService, OrgDocumentItem } from "@/services/api/documents";
import { regulationsApi, GlobalRegulation } from "@/services/api/regulations";

interface AnalysisHistoryTableProps {
  organization: Organization | null;
}

export interface EnrichedHistoryItem {
  id: string;
  jobId: string;
  reportId: string | null;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  progress: number;
  currentStep: string;
  // Resolved entities
  policyName: string;
  policyDocId: string;
  regulationTitle: string;
  regulationId: string;
  userName: string;
  userEmail: string;
  createdBy: string;
  // Timings
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  duration: string;
  // Compliance Results
  score: number | null;
  riskLevel: string | null;
  errorMessage: string | null;
  // Raw references
  rawJob: ComplianceJob;
  linkedReport: ComplianceReport | null;
}

function formatExecutionDuration(
  startedAt?: string | null,
  completedAt?: string | null,
  processingTimeMs?: number | null
): string {
  if (processingTimeMs != null && processingTimeMs > 0) {
    const totalSec = Math.round(processingTimeMs / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${secs}s`;
  }
  if (startedAt && completedAt) {
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      const diffSec = Math.round((end - start) / 1000);
      if (diffSec < 60) return `${diffSec}s`;
      const mins = Math.floor(diffSec / 60);
      const secs = diffSec % 60;
      return `${mins}m ${secs}s`;
    }
  }
  return "Not recorded";
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return format(d, "MMM d, yyyy · h:mm a");
  } catch {
    return "—";
  }
}

export const AnalysisHistoryTable: React.FC<AnalysisHistoryTableProps> = ({
  organization,
}) => {
  const router = useRouter();

  // Core Data States
  const [jobs, setJobs] = useState<ComplianceJob[]>([]);
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [policyMap, setPolicyMap] = useState<Map<string, string>>(new Map());
  const [regulationMap, setRegulationMap] = useState<Map<string, string>>(new Map());
  const [userMembersMap, setUserMembersMap] = useState<Map<string, { name: string; email: string }>>(new Map());

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters, Search, Sort & Pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Detail Drawer State
  const [selectedItem, setSelectedItem] = useState<EnrichedHistoryItem | null>(null);
  const [isCopiedId, setIsCopiedId] = useState(false);

  // 1. Fetch organization-scoped data
  const fetchData = useCallback(async () => {
    if (!organization?.id) {
      setJobs([]);
      setReports([]);
      setPolicyMap(new Map());
      setRegulationMap(new Map());
      setUserMembersMap(new Map());
      setIsLoading(false);
      return;
    }

    setLoadError(null);
    try {
      const [fetchedJobs, fetchedReports, fetchedDocs, fetchedRegs, fetchedMembers] =
        await Promise.all([
          complianceService.listComplianceJobs(organization.id).catch(() => []),
          complianceService.listComplianceReports(organization.id).catch(() => []),
          documentsService.listDocuments(organization.id).catch(() => []),
          regulationsApi.listRegulations(organization.id).catch(() => []),
          organizationsService.getMembers(organization.id).catch(() => []),
        ]);

      setJobs(fetchedJobs || []);
      setReports(fetchedReports || []);

      const pMap = new Map<string, string>();
      (fetchedDocs || []).forEach((d: OrgDocumentItem) => {
        if (d.id && d.original_filename) pMap.set(d.id, d.original_filename);
      });
      setPolicyMap(pMap);

      const rMap = new Map<string, string>();
      (fetchedRegs || []).forEach((r: GlobalRegulation) => {
        const title = r.title || r.act_name || r.original_filename || "Regulation Document";
        if (r.id) rMap.set(r.id, title);
      });
      setRegulationMap(rMap);

      const uMap = new Map<string, { name: string; email: string }>();
      (fetchedMembers || []).forEach((m: OrganizationMember) => {
        const uid = m.user_id || m.id;
        if (uid) {
          uMap.set(uid, {
            name: m.full_name || m.username || "Team Member",
            email: m.email || "",
          });
        }
      });
      setUserMembersMap(uMap);
    } catch (err: any) {
      setLoadError("Unable to load compliance analysis history for this organization.");
      toast.error("Failed to load analysis history.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [organization?.id]);

  // Synchronize on organization switch — prevent data flashing
  useEffect(() => {
    setJobs([]);
    setReports([]);
    setPolicyMap(new Map());
    setRegulationMap(new Map());
    setUserMembersMap(new Map());
    setSelectedItem(null);
    setCurrentPage(1);
    setIsLoading(true);

    fetchData();
  }, [organization?.id, fetchData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData();
    toast.info("Refreshed analysis records.");
  };

  // 2. Build enriched history items
  const historyItems: EnrichedHistoryItem[] = useMemo(() => {
    const reportMap = new Map(reports.map((r) => [r.id, r]));

    return jobs.map((job) => {
      const linkedReport = job.report_id ? reportMap.get(job.report_id) || null : null;

      // Policy Name Resolution
      const policyName =
        job.policy_name ||
        policyMap.get(job.policy_document_id) ||
        "Internal Policy Document";

      // Regulation Title Resolution
      const regulationTitle =
        job.regulation_name ||
        regulationMap.get(job.regulation_id) ||
        "Applicable Regulation";

      // User Details Resolution
      let userName = "Former user";
      let userEmail = "";
      if (job.created_by_name) {
        userName = job.created_by_name;
        userEmail = job.created_by_email || "";
      } else if (userMembersMap.has(job.created_by)) {
        const member = userMembersMap.get(job.created_by)!;
        userName = member.name;
        userEmail = member.email;
      }

      // Timing & Duration
      const startedAt = job.started_at || null;
      const completedAt = job.completed_at || null;
      const processingMs =
        job.processing_time_ms ||
        (job.processing_time ? job.processing_time * 1000 : null);
      const duration = formatExecutionDuration(startedAt, completedAt, processingMs);

      // Score & Risk Level
      const score = linkedReport?.overall_score ?? job.overall_score ?? null;
      const riskLevel = linkedReport?.risk_level ?? job.risk_level ?? null;

      return {
        id: job.id,
        jobId: job.job_id || job.id,
        reportId: job.report_id || linkedReport?.id || null,
        status: job.status,
        progress: job.progress,
        currentStep: job.current_step,
        policyName,
        policyDocId: job.policy_document_id,
        regulationTitle,
        regulationId: job.regulation_id,
        userName,
        userEmail,
        createdBy: job.created_by,
        createdAt: job.created_at,
        startedAt,
        completedAt,
        duration,
        score,
        riskLevel,
        errorMessage: job.error_message || null,
        rawJob: job,
        linkedReport,
      };
    });
  }, [jobs, reports, policyMap, regulationMap, userMembersMap]);

  // 3. Organization-Scoped Summary Stats (All-time organization totals)
  const stats = useMemo(() => {
    const total = historyItems.length;
    const completed = historyItems.filter((i) => i.status === "COMPLETED").length;
    const failed = historyItems.filter((i) => i.status === "FAILED").length;
    const latestItem = historyItems[0];
    const latestDate = latestItem?.createdAt
      ? formatDateTime(latestItem.createdAt)
      : "No analyses run";

    return { total, completed, failed, latestDate };
  }, [historyItems]);

  // 4. Filtering & Sorting
  const filteredItems = useMemo(() => {
    return historyItems
      .filter((item) => {
        // Status filter
        if (statusFilter !== "ALL" && item.status !== statusFilter) {
          return false;
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchJobId = item.jobId.toLowerCase().includes(q);
          const matchPolicy = item.policyName.toLowerCase().includes(q);
          const matchRegulation = item.regulationTitle.toLowerCase().includes(q);
          const matchUser = item.userName.toLowerCase().includes(q);
          const matchEmail = item.userEmail.toLowerCase().includes(q);
          const matchStep = (item.currentStep || "").toLowerCase().includes(q);

          if (
            !matchJobId &&
            !matchPolicy &&
            !matchRegulation &&
            !matchUser &&
            !matchEmail &&
            !matchStep
          ) {
            return false;
          }
        }

        // Date Range filter
        if (startDate) {
          const itemTime = new Date(item.createdAt).getTime();
          const startLimit = new Date(startDate).setHours(0, 0, 0, 0);
          if (itemTime < startLimit) return false;
        }
        if (endDate) {
          const itemTime = new Date(item.createdAt).getTime();
          const endLimit = new Date(endDate).setHours(23, 59, 59, 999);
          if (itemTime > endLimit) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "oldest") {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        if (sortBy === "highest_score") {
          return (b.score ?? -1) - (a.score ?? -1);
        }
        if (sortBy === "lowest_score") {
          return (a.score ?? 999) - (b.score ?? 999);
        }
        // newest first (default)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [historyItems, statusFilter, searchQuery, startDate, endDate, sortBy]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, startDate, endDate, sortBy, pageSize]);

  // Paginated items
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    statusFilter !== "ALL" ||
    startDate !== "" ||
    endDate !== "" ||
    sortBy !== "newest";

  const handleResetFilters = () => {
    setSearchQuery("");
    setStatusFilter("ALL");
    setStartDate("");
    setEndDate("");
    setSortBy("newest");
  };

  const handleCopyJobId = (jobId: string) => {
    navigator.clipboard.writeText(jobId);
    setIsCopiedId(true);
    setTimeout(() => setIsCopiedId(false), 2000);
    toast.success("Analysis ID copied to clipboard.");
  };

  if (isLoading) {
    return (
      <div className="space-y-5 max-w-7xl mx-auto" aria-label="Loading analysis history" aria-busy="true">
        {/* KPI Cards Skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        {/* Toolbar Skeleton */}
        <Skeleton className="h-14 w-full rounded-xl" />
        {/* Table Skeleton */}
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="border border-destructive/40 bg-destructive/5 p-8 text-center space-y-3 max-w-xl mx-auto">
        <div className="h-10 w-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">Unable to load analysis history</h3>
        <p className="text-xs text-muted-foreground">{loadError}</p>
        <Button onClick={fetchData} variant="outline" size="sm" className="gap-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-16">
      {/* SECTION 1: REDESIGNED COMPACT SUMMARY KPI CARDS */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" aria-label="Summary statistics">
        {/* Total Runs */}
        <Card className="p-3.5 bg-card border border-border/70 rounded-xl shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
              Total Runs
            </span>
            <Layers className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground" aria-label={`${stats.total} total runs`}>
              {stats.total}
            </span>
            <span className="text-[10px] text-muted-foreground">All-time</span>
          </div>
        </Card>

        {/* Completed */}
        <Card className="p-3.5 bg-card border border-border/70 rounded-xl shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
              Completed
            </span>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400" aria-label={`${stats.completed} completed analyses`}>
              {stats.completed}
            </span>
            <span className="text-[10px] text-muted-foreground">Executions succeeded</span>
          </div>
        </Card>

        {/* Failed */}
        <Card className="p-3.5 bg-card border border-border/70 rounded-xl shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-rose-600 dark:text-rose-400">
              Failed
            </span>
            <XCircle className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400" aria-label={`${stats.failed} failed analyses`}>
              {stats.failed}
            </span>
            <span className="text-[10px] text-muted-foreground">Execution errors</span>
          </div>
        </Card>

        {/* Latest Run */}
        <Card className="p-3.5 bg-card border border-border/70 rounded-xl shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-primary">
              Latest Run
            </span>
            <Clock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-1">
            <p className="text-xs font-semibold text-foreground truncate" title={stats.latestDate}>
              {stats.latestDate}
            </p>
            <span className="text-[10px] text-muted-foreground block mt-0.5">Most recent activity</span>
          </div>
        </Card>
      </section>

      {/* SECTION 2: COMPACT TOOLBAR & FILTERS */}
      <Card className="p-3.5 bg-card border border-border/70 rounded-xl shadow-xs space-y-3" role="search" aria-label="Search and filter analyses">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[260px] max-w-lg">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search analyses, policies, regulations, or users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 text-xs h-8.5 bg-background border-border/70 rounded-lg"
              aria-label="Search analyses"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Clear search query"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-2 flex-wrap justify-start lg:justify-end">
            {/* Status Pills */}
            <div
              className="flex items-center gap-1 bg-muted/50 border border-border/60 rounded-lg p-0.5 text-xs"
              role="group"
              aria-label="Filter by execution status"
            >
              {(["ALL", "COMPLETED", "RUNNING", "FAILED", "QUEUED"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  aria-pressed={statusFilter === st}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
                    statusFilter === st
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {st === "ALL" ? "All" : st.charAt(0) + st.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {/* Date Range Inputs */}
            <div className="flex items-center gap-1 text-xs">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 px-2 text-[11px] bg-background border border-border/70 rounded-md text-foreground cursor-pointer"
                title="From Date"
                aria-label="Start Date"
              />
              <span className="text-muted-foreground text-xs">–</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 px-2 text-[11px] bg-background border border-border/70 rounded-md text-foreground cursor-pointer"
                title="To Date"
                aria-label="End Date"
              />
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-8 px-2.5 text-xs bg-background border border-border/70 rounded-lg text-foreground cursor-pointer font-medium focus:ring-1 focus:ring-primary"
              aria-label="Sort analyses"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="highest_score">Highest score</option>
              <option value="lowest_score">Lowest score</option>
            </select>

            {/* Reset Filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-8 text-xs text-muted-foreground hover:text-foreground cursor-pointer px-2"
                aria-label="Reset all filters"
              >
                Reset
              </Button>
            )}

            {/* Refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 text-xs cursor-pointer gap-1 px-2.5"
              aria-label="Refresh analysis history"
            >
              <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} aria-hidden="true" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* SECTION 3: TABLE / MOBILE CARD VIEW / EMPTY STATE */}
      {filteredItems.length === 0 ? (
        <Card
          className="border border-border/60 bg-card p-12 text-center space-y-4 rounded-xl shadow-xs"
          role="status"
          aria-live="polite"
        >
          <div className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <History className="h-5 w-5" aria-hidden="true" />
          </div>

          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-sm font-bold text-foreground">
              {hasActiveFilters
                ? "No analyses match your filters"
                : "No analyses have been run for this organization."}
            </h3>
            <p className="text-xs text-muted-foreground">
              {hasActiveFilters
                ? "Try adjusting your search query, status, or date range filters."
                : "Run your first compliance analysis to verify statutory and policy adherence."}
            </p>
          </div>

          {hasActiveFilters ? (
            <Button
              onClick={handleResetFilters}
              variant="outline"
              size="sm"
              className="text-xs cursor-pointer"
            >
              Reset Filters
            </Button>
          ) : (
            <Button
              onClick={() => router.push("/compliance/new")}
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs gap-1.5 cursor-pointer text-xs"
              aria-label="Start a new compliance analysis"
            >
              <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" /> Run Analysis
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {/* DESKTOP TABLE VIEW */}
          <Card className="border border-border/70 bg-card overflow-hidden rounded-xl shadow-xs hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" role="table" aria-label="Compliance analysis history">
                <thead className="bg-muted/40 border-b border-border/70 text-[11px] font-semibold text-muted-foreground">
                  <tr>
                    <th className="py-3 px-4" scope="col">Analysis</th>
                    <th className="py-3 px-3" scope="col">Regulation</th>
                    <th className="py-3 px-3" scope="col">Initiated By</th>
                    <th className="py-3 px-3" scope="col">Started</th>
                    <th className="py-3 px-3" scope="col">Duration</th>
                    <th className="py-3 px-3 text-center" scope="col">Compliance Result</th>
                    <th className="py-3 px-3 text-center" scope="col">Status</th>
                    <th className="py-3 px-4 text-right" scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-medium">
                  {paginatedItems.map((item) => {
                    const startedFormatted = formatDateTime(item.startedAt || item.createdAt);

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-muted/20 transition-colors group"
                      >
                        {/* 1. Analysis: ID + Policy Name */}
                        <td className="py-3 px-4 max-w-[220px]">
                          <div className="space-y-0.5">
                            <button
                              onClick={() => setSelectedItem(item)}
                              className="font-mono font-bold text-foreground hover:text-primary hover:underline text-xs flex items-center gap-1 cursor-pointer text-left"
                              title="Click to view details"
                            >
                              <span>Analysis #{item.jobId.slice(0, 8)}</span>
                            </button>
                            <span
                              className="text-[11px] text-muted-foreground truncate block font-sans"
                              title={item.policyName}
                            >
                              {item.policyName}
                            </span>
                          </div>
                        </td>

                        {/* 2. Regulation */}
                        <td className="py-3 px-3 max-w-[180px]">
                          <span
                            className="text-foreground font-medium truncate block text-xs"
                            title={item.regulationTitle}
                          >
                            {item.regulationTitle}
                          </span>
                        </td>

                        {/* 3. Initiated By */}
                        <td className="py-3 px-3 max-w-[160px]">
                          <div className="space-y-0.5">
                            <span className="text-foreground font-medium flex items-center gap-1.5 truncate text-xs">
                              <User className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
                              <span className="truncate">{item.userName}</span>
                            </span>
                            {item.userEmail && (
                              <span className="text-[10px] text-muted-foreground truncate block pl-4.5 font-mono">
                                {item.userEmail}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 4. Started */}
                        <td className="py-3 px-3 text-muted-foreground text-[11px] whitespace-nowrap">
                          {startedFormatted}
                        </td>

                        {/* 5. Duration */}
                        <td className="py-3 px-3 text-muted-foreground text-[11px] whitespace-nowrap font-mono">
                          {item.status === "RUNNING" ? (
                            <span className="text-primary font-sans font-medium">In progress</span>
                          ) : (
                            item.duration
                          )}
                        </td>

                        {/* 6. Compliance Result (Score + Risk) */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {item.status === "FAILED" ? (
                            <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                              Execution Failed
                            </span>
                          ) : item.status === "RUNNING" || item.status === "QUEUED" ? (
                            <span className="text-[11px] text-muted-foreground">
                              {item.status === "RUNNING" ? "Evaluating..." : "Pending"}
                            </span>
                          ) : item.score != null ? (
                            <div className="flex flex-col items-center justify-center gap-0.5">
                              <span className="font-mono font-bold text-xs text-foreground">
                                {Number(item.score).toFixed(1)}%
                              </span>
                              <RiskBadge riskLevel={item.riskLevel} score={item.score} size="xs" />
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground font-medium">
                              Not available
                            </span>
                          )}
                        </td>

                        {/* 7. Status */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <StatusBadge status={item.status} size="xs" />
                        </td>

                        {/* 8. Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* View Details action */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedItem(item)}
                              className="h-7 text-xs px-2 text-foreground hover:text-primary cursor-pointer gap-1"
                              aria-label={`View details for analysis ${item.jobId.slice(0, 8)}`}
                            >
                              <Eye className="h-3.5 w-3.5 text-muted-foreground" /> Details
                            </Button>

                            {/* Report action (only if report exists) */}
                            {item.reportId && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => router.push(`/compliance/reports/${item.reportId}`)}
                                className="h-7 text-xs px-2 gap-1 cursor-pointer"
                                aria-label={`Open compliance report for analysis ${item.jobId.slice(0, 8)}`}
                              >
                                <ExternalLink className="h-3 w-3" aria-hidden="true" /> Report
                              </Button>
                            )}

                            {/* Running job action */}
                            {item.status === "RUNNING" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => router.push(`/compliance/progress/${item.jobId}`)}
                                className="h-7 text-xs px-2 gap-1 cursor-pointer text-primary border-primary/30 hover:bg-primary/10"
                                aria-label={`View live progress for job ${item.jobId.slice(0, 8)}`}
                              >
                                View Progress
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* MOBILE RESPONSIVE CARDS (Under md) */}
          <div className="space-y-3 md:hidden">
            {paginatedItems.map((item) => (
              <Card
                key={item.id}
                className="p-4 bg-card border border-border/70 rounded-xl space-y-3 shadow-xs"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                  <button
                    onClick={() => setSelectedItem(item)}
                    className="font-mono font-bold text-xs text-primary hover:underline text-left cursor-pointer"
                  >
                    Analysis #{item.jobId.slice(0, 8)}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={item.status} size="xs" />
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Policy</span>
                    <span className="text-foreground font-medium">{item.policyName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Regulation</span>
                    <span className="text-foreground font-medium">{item.regulationTitle}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40 text-[11px]">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Initiated By</span>
                    <span className="font-medium text-foreground truncate block">{item.userName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Started</span>
                    <span className="font-medium text-foreground">{formatDateTime(item.startedAt || item.createdAt)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Duration</span>
                    <span className="font-mono text-foreground">{item.duration}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Compliance Score</span>
                    {item.score != null ? (
                      <span className="font-mono font-bold text-foreground">{Number(item.score).toFixed(1)}%</span>
                    ) : (
                      <span className="text-muted-foreground">Not available</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedItem(item)}
                    className="h-8 text-xs cursor-pointer"
                  >
                    View Details
                  </Button>
                  {item.reportId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/compliance/reports/${item.reportId}`)}
                      className="h-8 text-xs cursor-pointer gap-1"
                    >
                      <ExternalLink className="h-3 w-3" /> Report
                    </Button>
                  )}
                  {item.status === "RUNNING" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/compliance/progress/${item.jobId}`)}
                      className="h-8 text-xs cursor-pointer text-primary"
                    >
                      View Progress
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* SECTION 4: PAGINATION CONTROLS */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>
                Showing <strong className="text-foreground">{(currentPage - 1) * pageSize + 1}</strong> to{" "}
                <strong className="text-foreground">
                  {Math.min(currentPage * pageSize, filteredItems.length)}
                </strong>{" "}
                of <strong className="text-foreground">{filteredItems.length}</strong> analyses
              </span>

              <div className="flex items-center gap-1 pl-3 border-l border-border/60">
                <span className="text-[11px]">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-7 px-1.5 text-[11px] bg-background border border-border/70 rounded text-foreground cursor-pointer"
                  aria-label="Items per page"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="h-8 px-2.5 text-xs cursor-pointer"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Button>
              <span className="px-2 text-xs font-medium text-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-8 px-2.5 text-xs cursor-pointer"
                aria-label="Next page"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5: ANALYSIS DETAIL & REAL AUDIT TRAIL SLIDE-OVER SHEET */}
      <Sheet open={selectedItem !== null} onOpenChange={(open) => !open && setSelectedItem(null)}>
        {selectedItem && (
          <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-6 space-y-6">
            <SheetHeader className="p-0 border-b border-border/60 pb-4">
              <div className="flex items-center justify-between pr-8">
                <SheetTitle className="text-lg font-bold font-mono text-foreground flex items-center gap-2">
                  Analysis #{selectedItem.jobId.slice(0, 8)}
                </SheetTitle>
                <StatusBadge status={selectedItem.status} size="sm" />
              </div>
              <SheetDescription className="text-xs text-muted-foreground mt-1">
                Execution metadata, statutory configuration, and audit trail records.
              </SheetDescription>
            </SheetHeader>

            {/* Error Banner if job failed */}
            {selectedItem.status === "FAILED" && selectedItem.errorMessage && (
              <div className="p-3.5 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Execution Failure Reason
                </div>
                <p className="font-mono text-[11px] break-words">{selectedItem.errorMessage}</p>
              </div>
            )}

            {/* Analysis Configuration */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Configuration & Scope
              </h4>
              <Card className="p-3.5 bg-muted/20 border border-border/70 rounded-xl space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Organization</span>
                  <span className="font-semibold text-foreground text-right">{organization?.name || "Active Workspace"}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Policy Document</span>
                  <span className="font-medium text-foreground text-right">{selectedItem.policyName}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Applicable Regulation</span>
                  <span className="font-medium text-foreground text-right">{selectedItem.regulationTitle}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Initiated By</span>
                  <div className="text-right">
                    <span className="font-semibold text-foreground block">{selectedItem.userName}</span>
                    {selectedItem.userEmail && (
                      <span className="text-[11px] text-muted-foreground font-mono block">{selectedItem.userEmail}</span>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {/* Execution Metadata */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Execution Details
              </h4>
              <Card className="p-3.5 bg-muted/20 border border-border/70 rounded-xl space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Analysis ID</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-foreground">{selectedItem.jobId}</span>
                    <button
                      onClick={() => handleCopyJobId(selectedItem.jobId)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                      title="Copy Analysis ID"
                    >
                      {isCopiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Created At</span>
                  <span className="text-foreground">{formatDateTime(selectedItem.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Execution Started</span>
                  <span className="text-foreground">{formatDateTime(selectedItem.startedAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Execution Completed</span>
                  <span className="text-foreground">
                    {selectedItem.completedAt ? formatDateTime(selectedItem.completedAt) : "Not recorded"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Calculated Duration</span>
                  <span className="font-mono text-foreground font-semibold">{selectedItem.duration}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Current Stage</span>
                  <span className="font-medium text-foreground">{selectedItem.currentStep}</span>
                </div>
              </Card>
            </div>

            {/* Compliance Results Card */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Compliance Evaluation Results
              </h4>
              <Card className="p-4 bg-muted/20 border border-border/70 rounded-xl space-y-3 text-xs">
                {selectedItem.score != null ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-muted-foreground block">Overall Compliance Score</span>
                      <span className="text-2xl font-bold font-mono text-foreground">
                        {Number(selectedItem.score).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] text-muted-foreground block mb-1">Risk Classification</span>
                      <RiskBadge riskLevel={selectedItem.riskLevel} score={selectedItem.score} size="sm" />
                    </div>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-xs py-1">
                    {selectedItem.status === "COMPLETED"
                      ? "Analysis completed without a scored compliance report."
                      : selectedItem.status === "FAILED"
                      ? "No compliance score was generated due to execution error."
                      : "Compliance score pending analysis completion."}
                  </div>
                )}
              </Card>
            </div>

            {/* REAL AUDIT TRAIL TIMELINE (Requirement 10) */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Audit Trail Timeline
              </h4>
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
                {/* Event 1: Created */}
                <div className="relative space-y-0.5">
                  <div className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">Analysis Created & Queued</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{formatDateTime(selectedItem.createdAt)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Job enqueued by <strong className="text-foreground">{selectedItem.userName}</strong>
                  </p>
                </div>

                {/* Event 2: Started */}
                {selectedItem.startedAt && (
                  <div className="relative space-y-0.5">
                    <div className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full bg-blue-500 border-2 border-background" />
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">Execution Started</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{formatDateTime(selectedItem.startedAt)}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      GraphRAG pipeline commenced processing regulation & policy clauses
                    </p>
                  </div>
                )}

                {/* Event 3: Completed or Failed */}
                {selectedItem.completedAt && (
                  <div className="relative space-y-0.5">
                    <div
                      className={cn(
                        "absolute -left-6 top-1 h-2.5 w-2.5 rounded-full border-2 border-background",
                        selectedItem.status === "FAILED" ? "bg-rose-500" : "bg-emerald-500"
                      )}
                    />
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">
                        {selectedItem.status === "FAILED" ? "Execution Failed" : "Execution Completed"}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">{formatDateTime(selectedItem.completedAt)}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedItem.status === "FAILED"
                        ? selectedItem.errorMessage || "Terminated with error"
                        : `Finished processing in ${selectedItem.duration}`}
                    </p>
                  </div>
                )}

                {/* Event 4: Report Generated (if report exists) */}
                {selectedItem.reportId && (
                  <div className="relative space-y-0.5">
                    <div className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">Compliance Report Generated</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {formatDateTime(selectedItem.linkedReport?.created_at || selectedItem.completedAt)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Report #{selectedItem.reportId.slice(0, 8)} recorded with compliance score{" "}
                      {selectedItem.score != null ? `${Number(selectedItem.score).toFixed(1)}%` : "N/A"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <SheetFooter className="p-0 pt-4 border-t border-border/60 flex sm:flex-row items-center justify-end gap-2">
              {selectedItem.reportId && (
                <Button
                  onClick={() => router.push(`/compliance/reports/${selectedItem.reportId}`)}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs gap-1.5 cursor-pointer text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open Full Report
                </Button>
              )}

              {selectedItem.status === "RUNNING" && (
                <Button
                  onClick={() => router.push(`/compliance/progress/${selectedItem.jobId}`)}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs gap-1.5 cursor-pointer text-xs"
                >
                  View Live Progress
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedItem(null)}
                className="text-xs cursor-pointer"
              >
                Close
              </Button>
            </SheetFooter>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
};
