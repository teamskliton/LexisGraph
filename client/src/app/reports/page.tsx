"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/auth-context";
import { reportService } from "@/services/reportService";
import { api } from "@/services/api";
import { ReportItemResponse, OrganizationReportSummary } from "@/types/report";
import {
  ReportFilters,
  FilterState,
  RegulationOption,
} from "@/components/reports/ReportFilters";
import { ReportsTable } from "@/components/reports/ReportsTable";
import { ReportCard } from "@/components/reports/ReportCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  LayoutGrid,
  List,
  Calendar,
  BarChart3,
  ShieldAlert,
  Zap,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { ReportComparisonModal } from "@/components/reports/ReportComparisonModal";

const PAGE_SIZE = 10;

const DEFAULT_FILTERS: FilterState = {
  search: "",
  riskLevel: "ALL",
  sortOrder: "newest",
  regulationId: "ALL",
  status: "ALL",
  startDate: "",
  endDate: "",
  reportId: "",
};

function ReportsPageContent() {
  const { activeMembership, permissions } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportQueryId = searchParams.get("report");

  const activeOrgId = activeMembership?.organization_id;
  const activeOrgName = activeMembership?.organization_name || "Active Workspace";

  // Redirect if deep-linked to report ID
  useEffect(() => {
    if (reportQueryId) {
      router.replace(`/compliance/reports/${reportQueryId}`);
    }
  }, [reportQueryId, router]);

  // ---------- State ----------
  const [reports, setReports] = useState<ReportItemResponse[]>([]);
  const [summary, setSummary] = useState<OrganizationReportSummary | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);

  // Filters state
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

  // Regulations list for advanced filter dropdown
  const [regulations, setRegulations] = useState<RegulationOption[]>([]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Load regulations for dropdown
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const regsRes = await api.get("/documents/regulations").catch(() => ({ data: [] }));
        if (active) {
          setRegulations(regsRes.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch regulations for filter:", err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Fetch organization KPI summary
  const fetchSummary = useCallback(async () => {
    if (!activeOrgId) return;
    setIsSummaryLoading(true);
    try {
      const summaryData = await reportService.getOrganizationReportSummary(activeOrgId);
      setSummary(summaryData);
    } catch (err) {
      console.error("Failed to load organization report summary:", err);
    } finally {
      setIsSummaryLoading(false);
    }
  }, [activeOrgId]);

  // Fetch paginated reports scoped strictly to active organization
  const fetchReports = useCallback(async () => {
    if (!activeOrgId) {
      setReports([]);
      setTotalItems(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await reportService.getReports({
        page,
        page_size: PAGE_SIZE,
        organization_id: activeOrgId,
        regulation_id: filters.regulationId !== "ALL" ? filters.regulationId : undefined,
        status: filters.status !== "ALL" ? filters.status : undefined,
        risk_level: filters.riskLevel !== "ALL" ? filters.riskLevel : undefined,
        start_date: filters.startDate ? new Date(filters.startDate).toISOString() : undefined,
        end_date: filters.endDate ? new Date(filters.endDate + "T23:59:59").toISOString() : undefined,
        search: debouncedSearch.trim() || undefined,
        report_id: filters.reportId.trim() || undefined,
        sort_by: filters.sortOrder,
      });

      setReports(response.items || []);
      setTotalItems(response.total || 0);
    } catch (err: unknown) {
      console.error("Error fetching reports:", err);
      const apiError = err as { response?: { data?: { detail?: string } }; message?: string };
      const message =
        apiError.response?.data?.detail ||
        apiError.message ||
        "Failed to load compliance reports. Please verify backend service availability.";
      setError(message);
      toast.error("Error loading reports");
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId, page, filters.regulationId, filters.status, filters.riskLevel, filters.startDate, filters.endDate, filters.reportId, filters.sortOrder, debouncedSearch]);

  // Fetch both summary and reports
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const handleFilterChange = (updated: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...updated }));
    setPage(1);
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const handleViewReport = (reportId: string) => {
    router.push(`/compliance/reports/${reportId}`);
  };

  const handleDeleteReport = async (reportId: string) => {
    try {
      await reportService.deleteReport(reportId);
      toast.success("Report deleted successfully.");
      // Refresh both list and KPIs
      fetchReports();
      fetchSummary();
    } catch (err) {
      console.error("Failed to delete report:", err);
      toast.error("Failed to delete compliance report.");
    }
  };

  // Active risk badge helper
  const getRiskColor = (level?: string | null) => {
    const l = (level || "").toUpperCase();
    if (l === "LOW") return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30";
    if (l === "HIGH") return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30";
    if (l === "CRITICAL") return "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30";
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30";
  };

  return (
    <AppShell>
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Reports
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Review compliance assessments and findings for{" "}
              <span className="font-semibold text-foreground">{activeOrgName}</span>.
            </p>
          </div>

          {/* View Switcher */}
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5 self-start sm:self-auto">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="h-7 px-2 cursor-pointer"
              title="Table View"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="h-7 px-2 cursor-pointer"
              title="Card Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Summary KPI Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Total Reports */}
          <Card className="border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total Reports
              </span>
              <FileCheck className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {isSummaryLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  summary?.total_reports ?? totalItems
                )}
              </span>
              <span className="text-[10px] text-muted-foreground">Generated</span>
            </div>
          </Card>

          {/* Card 2: Latest Compliance Score */}
          <Card className="border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Latest Score
              </span>
              <Calendar className="h-4 w-4 text-sky-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {isSummaryLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : summary?.latest_score != null ? (
                  `${summary.latest_score}%`
                ) : (
                  "—"
                )}
              </span>
              {summary?.latest_risk_level && (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide",
                    getRiskColor(summary.latest_risk_level)
                  )}
                >
                  {summary.latest_risk_level}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 truncate">
              {summary?.latest_report_date
                ? format(new Date(summary.latest_report_date), "MMM d, yyyy")
                : "No assessments yet"}
            </p>
          </Card>

          {/* Card 3: Average Compliance Score */}
          <Card className="border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Average Score
              </span>
              <BarChart3 className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-emerald-500 dark:text-emerald-400">
                {isSummaryLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : summary?.average_score != null ? (
                  `${summary.average_score}%`
                ) : (
                  "—"
                )}
              </span>
              <span className="text-[10px] text-muted-foreground">Completed</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Across completed reports
            </p>
          </Card>

          {/* Card 4: High-Risk Reports */}
          <Card className="border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                High-Risk Reports
              </span>
              <ShieldAlert className="h-4 w-4 text-orange-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={cn(
                  "text-2xl font-bold tabular-nums",
                  (summary?.high_risk_count ?? 0) > 0
                    ? "text-orange-500 dark:text-orange-400"
                    : "text-foreground"
                )}
              >
                {isSummaryLoading ? (
                  <Skeleton className="h-7 w-10" />
                ) : (
                  summary?.high_risk_count ?? 0
                )}
              </span>
              <span className="text-[10px] text-muted-foreground">Reports</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              High or Critical risk level
            </p>
          </Card>
        </div>

        {/* ── Search & Filter Toolbar ── */}
        <ReportFilters
          filters={filters}
          regulations={regulations}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
          disabled={isLoading}
        />

        {/* ── Error Alert State ── */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold">Failed to load reports</h3>
                <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">{error}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchReports();
                fetchSummary();
              }}
              className="gap-2 border-red-300 text-red-800 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/50 shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        )}

        {/* ── Main Data View: Table or Grid ── */}
        {!error && (
          <>
            {viewMode === "table" ? (
              <ReportsTable
                reports={reports}
                isLoading={isLoading}
                onViewReport={handleViewReport}
                onDeleteReport={
                  permissions?.canManageOrganization ? handleDeleteReport : undefined
                }
              />
            ) : isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="rounded-xl border border-border p-4 space-y-3 bg-card">
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-9 w-full rounded-md" />
                  </div>
                ))}
              </div>
            ) : reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-card/40 p-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Inbox className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {debouncedSearch ||
                  filters.riskLevel !== "ALL" ||
                  filters.status !== "ALL" ||
                  filters.regulationId !== "ALL" ||
                  filters.startDate ||
                  filters.endDate ||
                  filters.reportId
                    ? "No reports match your filters"
                    : "No compliance reports yet"}
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {debouncedSearch ||
                  filters.riskLevel !== "ALL" ||
                  filters.status !== "ALL" ||
                  filters.regulationId !== "ALL" ||
                  filters.startDate ||
                  filters.endDate ||
                  filters.reportId
                    ? "Try modifying your search keywords or resetting your active filters."
                    : "Run your first compliance analysis to generate a report."}
                </p>
                {debouncedSearch ||
                filters.riskLevel !== "ALL" ||
                filters.status !== "ALL" ||
                filters.regulationId !== "ALL" ||
                filters.startDate ||
                filters.endDate ||
                filters.reportId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetFilters}
                    className="mt-2 text-xs font-medium cursor-pointer"
                  >
                    Clear Filters
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => router.push("/compliance")}
                    className="mt-2 text-xs font-semibold cursor-pointer"
                  >
                    Run Your First Analysis
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    onViewReport={handleViewReport}
                  />
                ))}
              </div>
            )}

            {/* ── Pagination Controls ── */}
            {!isLoading && totalItems > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <p className="text-xs text-muted-foreground">
                  Page <span className="font-medium text-foreground">{page}</span> of{" "}
                  <span className="font-medium text-foreground">{totalPages}</span>
                  <span className="ml-1">({totalItems} total reports)</span>
                </p>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || isLoading}
                    className="gap-1 text-xs h-8 cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Previous</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || isLoading}
                    className="gap-1 text-xs h-8 cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Comparison Modal ── */}
        {compareIds && (
          <ReportComparisonModal
            reportId1={compareIds[0]}
            reportId2={compareIds[1]}
            onClose={() => setCompareIds(null)}
          />
        )}
      </main>
    </AppShell>
  );
}

export default function ReportsPage() {
  const { activeMembership } = useAuth();
  const activeOrgId = activeMembership?.organization_id;

  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="p-10 text-center text-sm text-muted-foreground">
            Loading reports...
          </div>
        }
      >
        <ReportsPageContent key={activeOrgId || "no-org"} />
      </Suspense>
    </ProtectedRoute>
  );
}
