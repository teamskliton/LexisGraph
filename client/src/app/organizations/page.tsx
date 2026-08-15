"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Building2,
  Search,
  LayoutGrid,
  List,
  Download,
  RefreshCw,
  X,
  ChevronDown,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  HelpCircle,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

import {
  Organization,
  organizationsService,
  OrganizationCreate,
  OrganizationUpdate,
} from "@/services/api/organizations";
import { documentService } from "@/services/document-service";
import { reportService } from "@/services/reportService";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import {
  OrganizationCard,
  ComplianceStatus,
  deriveStatus,
} from "@/components/features/organizations/OrganizationCard";
import { OrganizationDialog } from "@/components/features/organizations/OrganizationDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterStatus = "All" | "Healthy" | "Needs Review" | "Critical" | "Unknown";
type SortKey = "name" | "created_at" | "updated_at";
type ViewMode = "grid" | "list";

interface EnrichedOrganizationData {
  org: Organization;
  complianceScore: number | null;
  policyCount: number;
  regulationCount: number;
  documentCount: number;
  reportCount: number;
  status: ComplianceStatus;
}

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "Name", value: "name" },
  { label: "Recently Created", value: "created_at" },
  { label: "Last Updated", value: "updated_at" },
];

const STATUS_FILTERS: { label: string; value: FilterStatus }[] = [
  { label: "All", value: "All" },
  { label: "Healthy", value: "Healthy" },
  { label: "Needs Review", value: "Needs Review" },
  { label: "Critical", value: "Critical" },
  { label: "Unknown", value: "Unknown" },
];

// ─── Skeleton Components ──────────────────────────────────────────────────────

function OrgCardSkeleton() {
  return (
    <div className="flex flex-col h-72 rounded-xl border border-border/50 bg-card p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid grid-cols-4 gap-2 pt-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-2.5 w-10" />
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2 mt-auto">
        <Skeleton className="h-8 flex-1 rounded-lg" />
        <Skeleton className="h-8 flex-1 rounded-lg" />
      </div>
    </div>
  );
}

function OrgListSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl border border-border/50 bg-card">
      <div className="flex items-center gap-3 flex-1">
        <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-4">
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
    </div>
  );
}

// ─── Main Organizations Page Content ──────────────────────────────────────────

function OrganizationsContent() {
  const router = useRouter();
  const { permissions } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [enrichedOrgs, setEnrichedOrgs] = useState<EnrichedOrganizationData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("All");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("org_view_mode") as ViewMode) || "grid";
    }
    return "grid";
  });

  // ── Data Fetching & Enrichment ─────────────────────────────────────────────
  const fetchOrganizations = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    setHasError(false);

    try {
      const rawOrgs = await organizationsService.getOrganizations();

      // Enrich organizations with document counts, report counts, and latest score
      const enrichedResults = await Promise.all(
        rawOrgs.map(async (org) => {
          try {
            const [docs, reports] = await Promise.all([
              documentService.getDocuments(org.id).catch(() => []),
              reportService.getReportsByOrganization(org.id).catch(() => []),
            ]);

            const policyCount = docs.filter((d) => d.document_type === "POLICY").length;
            const regulationCount = docs.filter((d) => d.document_type === "REGULATION").length;
            const documentCount = docs.length;
            const reportCount = reports.length;

            const latestReport = reports.length > 0
              ? [...reports].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
              : null;

            const complianceScore = latestReport?.overall_score ?? null;
            const status = deriveStatus(complianceScore);

            return {
              org,
              complianceScore,
              policyCount,
              regulationCount,
              documentCount,
              reportCount,
              status,
            };
          } catch {
            return {
              org,
              complianceScore: null,
              policyCount: 0,
              regulationCount: 0,
              documentCount: 0,
              reportCount: 0,
              status: "Unknown" as ComplianceStatus,
            };
          }
        })
      );

      setEnrichedOrgs(enrichedResults);
      if (isManual) toast.success("Organizations refreshed successfully.");
    } catch (err) {
      console.error("Failed to load organizations:", err);
      setHasError(true);
      toast.error("Failed to load organizations. Please try again.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  // ── View Mode Persistence ─────────────────────────────────────────────────
  const handleSetViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("org_view_mode", mode);
    }
  }, []);

  // ── CRUD Handlers ─────────────────────────────────────────────────────────
  const handleCreateNew = () => {
    setEditingOrg(undefined);
    setIsDialogOpen(true);
  };

  const handleEdit = (org: Organization) => {
    setEditingOrg(org);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this organization? This action cannot be undone.")) {
      return;
    }
    try {
      await organizationsService.deleteOrganization(id);
      setEnrichedOrgs((prev) => prev.filter((item) => item.org.id !== id));
      toast.success("Organization deleted successfully.");
    } catch {
      toast.error("Failed to delete organization. Please try again.");
    }
  };

  const handleSubmit = async (data: OrganizationCreate | OrganizationUpdate) => {
    setIsSubmitting(true);
    try {
      if (editingOrg) {
        const updated = await organizationsService.updateOrganization(editingOrg.id, data as OrganizationUpdate);
        setEnrichedOrgs((prev) =>
          prev.map((item) => (item.org.id === editingOrg.id ? { ...item, org: updated } : item))
        );
        toast.success("Organization updated successfully.");
      } else {
        const created = await organizationsService.createOrganization(data as OrganizationCreate);
        setEnrichedOrgs((prev) => [
          {
            org: created,
            complianceScore: null,
            policyCount: 0,
            regulationCount: 0,
            documentCount: 0,
            reportCount: 0,
            status: "Unknown",
          },
          ...prev,
        ]);
        toast.success("Organization created successfully.");
      }
      setIsDialogOpen(false);
    } catch (err: any) {
      console.error("Failed to save organization:", err);
      const detail =
        err?.response?.data?.detail ||
        (Array.isArray(err?.response?.data?.detail) ? err.response.data.detail[0]?.msg : null) ||
        err?.message ||
        "Failed to save organization. Please check your inputs.";
      toast.error(`Error: ${detail}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Portfolio Metrics Calculations ─────────────────────────────────────────
  const metrics = useMemo(() => {
    const total = enrichedOrgs.length;
    const healthy = enrichedOrgs.filter((i) => i.status === "Healthy").length;
    const needsReview = enrichedOrgs.filter((i) => i.status === "Needs Review").length;
    const critical = enrichedOrgs.filter((i) => i.status === "Critical").length;
    const unknown = enrichedOrgs.filter((i) => i.status === "Unknown").length;

    return { total, healthy, needsReview, critical, unknown };
  }, [enrichedOrgs]);

  // ── Filtered + Sorted List ────────────────────────────────────────────────
  const processedOrgs = useMemo(() => {
    let list = [...enrichedOrgs];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (item) =>
          item.org.name.toLowerCase().includes(q) ||
          item.org.industry?.toLowerCase().includes(q) ||
          item.org.description?.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== "All") {
      list = list.filter((item) => item.status === statusFilter);
    }

    // Sort
    list.sort((a, b) => {
      if (sortKey === "name") return a.org.name.localeCompare(b.org.name);
      if (sortKey === "created_at")
        return new Date(b.org.created_at).getTime() - new Date(a.org.created_at).getTime();
      return new Date(b.org.updated_at).getTime() - new Date(a.org.updated_at).getTime();
    });

    return list;
  }, [enrichedOrgs, searchQuery, statusFilter, sortKey]);

  const hasSearch = searchQuery.trim().length > 0;
  const currentSortLabel = SORT_OPTIONS.find((s) => s.value === sortKey)?.label ?? "Sort";

  // Result count formatting
  const resultCountString = useMemo(() => {
    const count = processedOrgs.length;
    if (count === 1) return "1 organization";
    return `${count} organizations`;
  }, [processedOrgs]);

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground pb-12">
      {/* ── 1. PAGE HEADER ─────────────────────────────────────────────────── */}
      <div className="border-b border-border/40 bg-background/90 backdrop-blur-md sticky top-0 z-20 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/dashboard")}
              className="w-fit -ml-2 mb-1 text-muted-foreground hover:text-foreground cursor-pointer gap-1.5 text-xs h-7 px-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Dashboard</span>
            </Button>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              Organizations
            </h1>
            <p className="text-xs text-muted-foreground">
              Manage organizations, compliance status and AI analyses.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchOrganizations(true)}
              disabled={isLoading || isRefreshing}
              className="gap-1.5 text-xs font-semibold cursor-pointer h-9 px-3"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-primary")} />
              <span>Refresh</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.info("Import feature coming soon.")}
              className="gap-1.5 text-xs font-semibold cursor-pointer h-9 px-3"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Import</span>
            </Button>

            {permissions.canCreateOrganization && (
              <Button
                size="sm"
                onClick={handleCreateNew}
                className="gap-1.5 text-xs font-semibold cursor-pointer h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
              >
                <Plus className="h-4 w-4" />
                <span>New Organization</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── 2. ORGANIZATION SUMMARY / OVERVIEW ─────────────────────────── */}
        {!isLoading && !hasError && enrichedOrgs.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {/* Total Organizations */}
            <button
              onClick={() => setStatusFilter("All")}
              className={cn(
                "p-3.5 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer",
                statusFilter === "All"
                  ? "border-primary bg-primary/5 shadow-2xs"
                  : "border-border/60 bg-card/60 hover:bg-muted/30 hover:border-border"
              )}
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                <span>Total Organizations</span>
                <Building2 className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="text-2xl font-extrabold text-foreground tabular-nums mt-2">
                {metrics.total}
              </div>
            </button>

            {/* Healthy */}
            <button
              onClick={() => setStatusFilter("Healthy")}
              className={cn(
                "p-3.5 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer",
                statusFilter === "Healthy"
                  ? "border-emerald-500 bg-emerald-500/10 shadow-2xs"
                  : "border-border/60 bg-card/60 hover:bg-muted/30 hover:border-border"
              )}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span>Healthy</span>
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-extrabold text-foreground tabular-nums mt-2">
                {metrics.healthy}
              </div>
            </button>

            {/* Needs Review */}
            <button
              onClick={() => setStatusFilter("Needs Review")}
              className={cn(
                "p-3.5 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer",
                statusFilter === "Needs Review"
                  ? "border-amber-500 bg-amber-500/10 shadow-2xs"
                  : "border-border/60 bg-card/60 hover:bg-muted/30 hover:border-border"
              )}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-amber-600 dark:text-amber-400">
                <span>Needs Review</span>
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-2xl font-extrabold text-foreground tabular-nums mt-2">
                {metrics.needsReview}
              </div>
            </button>

            {/* Critical */}
            <button
              onClick={() => setStatusFilter("Critical")}
              className={cn(
                "p-3.5 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer",
                statusFilter === "Critical"
                  ? "border-rose-500 bg-rose-500/10 shadow-2xs"
                  : "border-border/60 bg-card/60 hover:bg-muted/30 hover:border-border"
              )}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-rose-600 dark:text-rose-400">
                <span>Critical</span>
                <ShieldX className="h-4 w-4 text-rose-500" />
              </div>
              <div className="text-2xl font-extrabold text-foreground tabular-nums mt-2">
                {metrics.critical}
              </div>
            </button>

            {/* Unknown */}
            <button
              onClick={() => setStatusFilter("Unknown")}
              className={cn(
                "p-3.5 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer col-span-2 sm:col-span-1",
                statusFilter === "Unknown"
                  ? "border-primary/50 bg-muted/40 shadow-2xs"
                  : "border-border/60 bg-card/60 hover:bg-muted/30 hover:border-border"
              )}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Unknown</span>
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-extrabold text-foreground tabular-nums mt-2">
                {metrics.unknown}
              </div>
            </button>
          </div>
        )}

        {/* ── 3. SEARCH + FILTER TOOLBAR ─────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search organizations by name or industry..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-9 text-xs rounded-lg border border-border/70 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
            />
            {hasSearch && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                aria-label="Clear search query"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "h-8 px-3 rounded-lg text-xs font-semibold transition-all border cursor-pointer",
                  statusFilter === f.value
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                    : "bg-background text-muted-foreground border-border/60 hover:text-foreground hover:border-border"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors cursor-pointer">
                <span>Sort: {currentSortLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-xs">Sort organizations by</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SORT_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => setSortKey(opt.value)}
                    className={cn("text-xs cursor-pointer", sortKey === opt.value && "font-bold text-indigo-600")}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Grid/List View Toggle */}
            <div className="flex items-center border border-border/70 rounded-lg overflow-hidden h-8 bg-background p-0.5">
              <button
                onClick={() => handleSetViewMode("grid")}
                className={cn(
                  "px-2.5 h-full rounded-md flex items-center transition-all cursor-pointer",
                  viewMode === "grid"
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Grid view"
                aria-label="Switch to grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleSetViewMode("list")}
                className={cn(
                  "px-2.5 h-full rounded-md flex items-center transition-all cursor-pointer",
                  viewMode === "list"
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="List view"
                aria-label="Switch to list view"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Result Count Indicator */}
        {!isLoading && !hasError && enrichedOrgs.length > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span className="font-semibold text-foreground">
              {resultCountString}
              {hasSearch || statusFilter !== "All" ? ` matching filters` : ""}
            </span>
          </div>
        )}

        {/* ── 10. LOADING STATE ───────────────────────────────────────────── */}
        {isLoading && (
          viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
              {[...Array(6)].map((_, i) => (
                <OrgCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <OrgListSkeleton key={i} />
              ))}
            </div>
          )
        )}

        {/* ── 11. ERROR STATE ─────────────────────────────────────────────── */}
        {!isLoading && hasError && (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Unable to load organizations</h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Something went wrong while communicating with the backend compliance service.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => fetchOrganizations(true)}
              className="gap-1.5 text-xs font-semibold cursor-pointer bg-rose-600 hover:bg-rose-700 text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        )}

        {/* ── 9. EMPTY STATE (Zero Organizations) ─────────────────────────── */}
        {!isLoading && !hasError && enrichedOrgs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center rounded-xl border border-dashed border-border/70 bg-muted/10 p-8 space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400">
              <Building2 className="h-7 w-7" />
            </div>
            <div className="space-y-1 max-w-md">
              <h2 className="text-lg font-bold text-foreground">No organizations yet</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Create your first organization to start managing policies, regulations and compliance analysis.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              {permissions.canCreateOrganization && (
                <Button
                  size="sm"
                  onClick={handleCreateNew}
                  className="gap-1.5 text-xs font-semibold cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs px-4"
                >
                  <Plus className="h-4 w-4" />
                  <span>New Organization</span>
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.info("Import feature coming soon.")}
                className="gap-1.5 text-xs font-semibold cursor-pointer px-4"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Import Organization</span>
              </Button>
            </div>
          </div>
        )}

        {/* ── NO FILTER MATCHES ───────────────────────────────────────────── */}
        {!isLoading && !hasError && enrichedOrgs.length > 0 && processedOrgs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-border/60 bg-muted/10 p-6 space-y-3">
            <Search className="h-8 w-8 text-muted-foreground" />
            <h4 className="text-sm font-bold text-foreground">No matching organizations found</h4>
            <p className="text-xs text-muted-foreground">
              Try modifying your search keywords or clearing active filters.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSearchQuery(""); setStatusFilter("All"); }}
              className="text-xs font-semibold cursor-pointer gap-1.5 mt-1"
            >
              <X className="h-3.5 w-3.5" /> Clear Filters
            </Button>
          </div>
        )}

        {/* ── 4 & 12. GRID OR LIST VIEW ────────────────────────────────────── */}
        {!isLoading && !hasError && processedOrgs.length > 0 && (
          viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5 items-start">
              {processedOrgs.map((item) => (
                <OrganizationCard
                  key={item.org.id}
                  organization={item.org}
                  complianceScore={item.complianceScore}
                  policyCount={item.policyCount}
                  regulationCount={item.regulationCount}
                  documentCount={item.documentCount}
                  reportCount={item.reportCount}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  viewMode="grid"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {processedOrgs.map((item) => (
                <OrganizationCard
                  key={item.org.id}
                  organization={item.org}
                  complianceScore={item.complianceScore}
                  policyCount={item.policyCount}
                  regulationCount={item.regulationCount}
                  documentCount={item.documentCount}
                  reportCount={item.reportCount}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  viewMode="list"
                />
              ))}
            </div>
          )
        )}
      </main>

      {/* Organization Create / Edit Dialog */}
      <OrganizationDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        organization={editingOrg}
        onSubmit={handleSubmit}
        isLoading={isSubmitting}
      />
    </div>
  );
}

export default function OrganizationsPage() {
  return (
    <ProtectedRoute>
      <OrganizationsContent />
    </ProtectedRoute>
  );
}
