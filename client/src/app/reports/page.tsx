"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
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
import {
  Layers,
  LogOut,
  RefreshCw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  LayoutGrid,
  List,
  PlusCircle,
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
  const { logout } = useAuth();
  const router = useRouter();

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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* ── Top Navbar ── */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-600/20">
              <Layers className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold tracking-tight text-foreground">LexisGraph</span>
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

      {/* ── Main Content Container ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/25 flex items-center justify-center shrink-0">
                <FileCheck className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
                  Report History
                </h1>
                <p className="text-sm text-muted-foreground">
                  View and access stored compliance reports instantly without recomputation.
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
                className="h-7 px-2.5"
                title="Table View"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="h-7 px-2.5"
                title="Card Grid View"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>

            <Button
              onClick={() => router.push("/compliance")}
              className="flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Run Check</span>
            </Button>
          </div>
        </div>

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
                onDeleteReport={handleDeleteReport}
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
    </div>
  );
}

export default function ReportsPage() {
  return (
    <ProtectedRoute>
      <ReportsPageContent />
    </ProtectedRoute>
  );
}
