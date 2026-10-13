"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/auth-context";
import { reportService } from "@/services/reportService";
import { organizationsService, Organization } from "@/services/api/organizations";
import { api } from "@/services/api";
import { ReportItemResponse } from "@/types/report";
import { ReportFilters, FilterState, OrganizationOption, RegulationOption } from "@/components/reports/ReportFilters";
import { ReportsTable } from "@/components/reports/ReportsTable";
import { ReportCard } from "@/components/reports/ReportCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { BrandLogo } from "@/components/ui/brand-logo";
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
  PlusCircle,
  Calendar,
  BarChart3,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { ReportComparisonModal } from "@/components/reports/ReportComparisonModal";
import { GitCompare } from "lucide-react";

const PAGE_SIZE = 10;

const DEFAULT_FILTERS: FilterState = {
  organizationId: "ALL",
  regulationId: "ALL",
  status: "ALL",
  riskLevel: "ALL",
  startDate: "",
  endDate: "",
  reportId: "",
  policyName: "",
  sortOrder: "newest",
};

function ReportsPageContent() {
  const { logout, permissions } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportQueryId = searchParams.get("report");
  const orgQueryId = searchParams.get("org");

  // ---------- State ----------
  const [reports, setReports] = useState<ReportItemResponse[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);

  // Filter state
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  useEffect(() => {
    if (reportQueryId) {
      router.replace(`/compliance/reports/${reportQueryId}`);
    } else if (orgQueryId) {
      setFilters((prev) => ({ ...prev, organizationId: orgQueryId }));
    } else {
      const stored = typeof window !== "undefined" ? localStorage.getItem("selected_organization_id") : null;
      if (stored) {
        setFilters((prev) => ({ ...prev, organizationId: stored }));
      }
    }
  }, [reportQueryId, orgQueryId, router]);

  useEffect(() => {
    const handleOrgChange = () => {
      const stored = typeof window !== "undefined" ? localStorage.getItem("selected_organization_id") : null;
      if (stored) {
        setFilters((prev) => ({ ...prev, organizationId: stored }));
      }
    };
    window.addEventListener("organization_changed", handleOrgChange);
    return () => window.removeEventListener("organization_changed", handleOrgChange);
  }, []);

  // Dropdown filter options
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [regulations, setRegulations] = useState<RegulationOption[]>([]);

  // Organization map for displaying organization names
  const [orgMap, setOrgMap] = useState<Map<string, string>>(new Map());

  // ---------- Load Organizations & Regulations for Dropdowns ----------
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [orgs, regsRes] = await Promise.all([
          organizationsService.getOrganizations(),
          api.get("/documents/regulations").catch(() => ({ data: [] })),
        ]);
        if (!active) return;

        setOrganizations(orgs || []);
        setRegulations(regsRes.data || []);

        const map = new Map<string, string>();
        (orgs || []).forEach((o: Organization) => map.set(o.id, o.name));
        setOrgMap(map);
      } catch (err) {
        console.error("Failed to fetch filter options:", err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // ---------- Backend Fetch Reports ----------
  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await reportService.getReports({
        page,
        page_size: PAGE_SIZE,
        organization_id: filters.organizationId !== "ALL" ? filters.organizationId : undefined,
        regulation_id: filters.regulationId !== "ALL" ? filters.regulationId : undefined,
        status: filters.status !== "ALL" ? filters.status : undefined,
        risk_level: filters.riskLevel !== "ALL" ? filters.riskLevel : undefined,
        start_date: filters.startDate ? new Date(filters.startDate).toISOString() : undefined,
        end_date: filters.endDate ? new Date(filters.endDate + "T23:59:59").toISOString() : undefined,
        report_id: filters.reportId.trim() || undefined,
        policy_name: filters.policyName.trim() || undefined,
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
  }, [page, filters]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Pagination bounds calculation
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const handleFilterChange = (updated: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...updated }));
    setPage(1); // Reset to first page on filter change
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
      fetchReports();
    } catch (err) {
      console.error("Failed to delete report:", err);
      toast.error("Failed to delete compliance report.");
    }
  };

  // Derived Summary Metrics (Matching screenshot)
  const metrics = useMemo(() => {
    if (!reports || reports.length === 0) {
      return {
        total: 0,
        latestScore: null as number | null,
        latestReportDate: "",
        averageScore: null as number | null,
        requiringReviewCount: 0,
      };
    }

    const total = totalItems || reports.length;

    // Latest report (by created_at)
    const sortedByDate = [...reports].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const latest = sortedByDate[0];
    const latestScore =
      latest?.overall_score != null
        ? Math.round(latest.overall_score <= 1.0 ? latest.overall_score * 100 : latest.overall_score)
        : null;
    const latestReportDate = latest?.created_at
      ? format(new Date(latest.created_at), "MMM d, yyyy")
      : "";

    // Average score across reports that have scores
    const scoredReports = reports.filter((r) => r.overall_score != null);
    const avg =
      scoredReports.length > 0
        ? Math.round(
            scoredReports.reduce((acc, r) => {
              const s = r.overall_score! <= 1.0 ? r.overall_score! * 100 : r.overall_score!;
              return acc + s;
            }, 0) / scoredReports.length
          )
        : null;

    // Reports needing review (Critical or High risk, or score < 70)
    const reviewCount = reports.filter((r) => {
      const risk = (r.risk_level || "").toUpperCase();
      const s = r.overall_score != null ? (r.overall_score <= 1.0 ? r.overall_score * 100 : r.overall_score) : null;
      return risk === "CRITICAL" || risk === "HIGH" || (s != null && s < 70);
    }).length;

    return {
      total,
      latestScore,
      latestReportDate,
      averageScore: avg,
      requiringReviewCount: reviewCount,
    };
  }, [reports, totalItems]);

  const currentOrgName =
    orgMap.get(filters.organizationId) ||
    (filters.organizationId !== "ALL"
      ? organizations.find((o) => o.id === filters.organizationId)?.name
      : null) ||
    "your organization";

  return (
    <AppShell>
      {/* ── Main Content Container ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Page Header (Matching screenshot) */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                <FileCheck className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
                  Reports
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Review and manage compliance reports for {currentOrgName}.
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons / View Toggle */}
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <div className="flex items-center rounded-lg border border-border bg-card p-1">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="h-7 px-2.5 cursor-pointer"
                title="Table View"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="h-7 px-2.5 cursor-pointer"
                title="Card Grid View"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>

            <Button
              onClick={() => router.push("/compliance")}
              className="flex items-center gap-1.5 shadow-sm cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs"
            >
              <Zap className="h-4 w-4" />
              <span>Run New Analysis</span>
            </Button>
          </div>
        </div>

        {/* ── Summary Metrics Bar (Upper side of screenshot) ── */}
        {!isLoading && !error && reports.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Total Reports */}
            <Card className="border border-border/60 bg-card p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Total Reports
                </span>
                <FileCheck className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {metrics.total}
                </span>
                <span className="text-[10px] text-muted-foreground">Generated</span>
              </div>
            </Card>

            {/* Latest Report */}
            <Card className="border border-border/60 bg-card p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Latest Report
                </span>
                <Calendar className="h-4 w-4 text-sky-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {metrics.latestScore != null ? `${metrics.latestScore}%` : "—"}
                </span>
                <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                  {metrics.latestReportDate || "No data"}
                </span>
              </div>
            </Card>

            {/* Average Compliance Score */}
            <Card className="border border-border/60 bg-card p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Average Score
                </span>
                <BarChart3 className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-emerald-500">
                  {metrics.averageScore != null ? `${metrics.averageScore}%` : "—"}
                </span>
                <span className="text-[10px] text-muted-foreground">Across analyses</span>
              </div>
            </Card>

            {/* Reports Requiring Review */}
            <Card className="border border-border/60 bg-card p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Needs Review
                </span>
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    metrics.requiringReviewCount > 0 ? "text-amber-500" : "text-foreground"
                  )}
                >
                  {metrics.requiringReviewCount}
                </span>
                <span className="text-[10px] text-muted-foreground">High / Critical risk</span>
              </div>
            </Card>
          </div>
        )}

        {/* Filters section (Backend Driven) */}
        <ReportFilters
          filters={filters}
          organizations={organizations}
          regulations={regulations}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
          disabled={isLoading}
        />

        {/* Error Alert State */}
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
              onClick={fetchReports}
              className="gap-2 border-red-300 text-red-800 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/50 shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        )}

        {/* Data View: Table or Card Grid */}
        {!error && (
          <>
            {viewMode === "table" ? (
              <ReportsTable
                reports={reports}
                orgMap={orgMap}
                isLoading={isLoading}
                onViewReport={handleViewReport}
                onDeleteReport={permissions.canManageOrganization ? handleDeleteReport : undefined}
              />
            ) : isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="rounded-xl border border-border p-4 space-y-3">
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-9 w-full rounded-md" />
                  </div>
                ))}
              </div>
            ) : reports.length === 0 ? (
              <ReportsTable
                reports={[]}
                orgMap={orgMap}
                isLoading={false}
                onViewReport={handleViewReport}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    orgName={orgMap.get(report.organization_id)}
                    onViewReport={handleViewReport}
                  />
                ))}
              </div>
            )}

            {/* Pagination Controls */}
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

        {/* Comparison Modal */}
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
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="p-10 text-center text-sm text-muted-foreground">Loading reports...</div>}>
        <ReportsPageContent />
      </Suspense>
    </ProtectedRoute>
  );
}
