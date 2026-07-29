"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { reportService } from "@/services/reportService";
import { organizationsService, Organization } from "@/services/api/organizations";
import { ReportItemResponse } from "@/types/report";
import { ReportFilters, FilterState } from "@/components/reports/ReportFilters";
import { ReportsTable, ReportsTableSkeleton } from "@/components/reports/ReportsTable";
import { ReportCard } from "@/components/reports/ReportCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Layers,
  LogOut,
  ArrowLeft,
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

const PAGE_SIZE = 10;

const DEFAULT_FILTERS: FilterState = {
  status: "ALL",
  orgSearch: "",
  idSearch: "",
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

  // Filter state
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // Organization map for displaying organization names
  const [orgMap, setOrgMap] = useState<Map<string, string>>(new Map());

  // ---------- Load Organizations ----------
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const orgs: Organization[] = await organizationsService.getOrganizations();
        if (!active) return;
        const map = new Map<string, string>();
        orgs.forEach((o) => map.set(o.id, o.name));
        setOrgMap(map);
      } catch (err) {
        console.error("Failed to fetch organizations for name mapping:", err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // ---------- Fetch Reports ----------
  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await reportService.getReports({
        page,
        page_size: PAGE_SIZE,
        status: filters.status,
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
  }, [page, filters.status]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // ---------- Client-side Filter & Sort Overlay ----------
  const processedReports = useMemo(() => {
    let result = [...reports];

    // Filter by Organization search
    if (filters.orgSearch.trim()) {
      const q = filters.orgSearch.trim().toLowerCase();
      result = result.filter((item) => {
        const orgName = (orgMap.get(item.organization_id) || "").toLowerCase();
        const orgId = item.organization_id.toLowerCase();
        return orgName.includes(q) || orgId.includes(q);
      });
    }

    // Filter by Report ID search
    if (filters.idSearch.trim()) {
      const q = filters.idSearch.trim().toLowerCase();
      result = result.filter((item) => item.id.toLowerCase().includes(q));
    }

    // Sort by Created Date
    result.sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return filters.sortOrder === "newest" ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [reports, filters.orgSearch, filters.idSearch, filters.sortOrder, orgMap]);

  // Pagination bounds calculation
  const totalPages = Math.max(1, Math.ceil((totalItems || processedReports.length) / PAGE_SIZE));

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

      {/* ── Main Content Area ── */}
      <main className="flex-1 p-6 md:p-10 max-w-7xl w-full mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/dashboard")}
              className="mb-2 -ml-2 flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileCheck className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
                  Compliance Reports
                </h1>
                <p className="text-sm text-muted-foreground">
                  View and analyze regulation vs. policy compliance reports across your organizations.
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

        {/* Filters section */}
        <ReportFilters
          filters={filters}
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
                reports={processedReports}
                orgMap={orgMap}
                isLoading={isLoading}
                onViewReport={handleViewReport}
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
            ) : processedReports.length === 0 ? (
              <ReportsTable
                reports={[]}
                orgMap={orgMap}
                isLoading={false}
                onViewReport={handleViewReport}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {processedReports.map((report) => (
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
            {!isLoading && (totalItems > 0 || processedReports.length > 0) && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <p className="text-xs text-muted-foreground">
                  Page <span className="font-medium text-foreground">{page}</span> of{" "}
                  <span className="font-medium text-foreground">{totalPages}</span>
                  {totalItems > 0 && (
                    <span className="ml-1">({totalItems} total reports)</span>
                  )}
                </p>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || isLoading}
                    className="gap-1 text-xs h-8"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Previous</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || isLoading}
                    className="gap-1 text-xs h-8"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
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
