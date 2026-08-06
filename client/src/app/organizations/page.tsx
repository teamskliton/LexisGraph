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
} from "lucide-react";
import { toast } from "sonner";

import {
  Organization,
  organizationsService,
  OrganizationCreate,
  OrganizationUpdate,
} from "@/services/api/organizations";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { Button } from "@/components/ui/button";
import { OrganizationCard } from "@/components/features/organizations/OrganizationCard";
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

function getStatusFromScore(score: number | null | undefined): FilterStatus {
  if (score == null) return "Unknown";
  if (score >= 85) return "Healthy";
  if (score >= 65) return "Needs Review";
  return "Critical";
}

// ─── Skeleton Card ─────────────────────────────────────────────────────────────

function OrgCardSkeleton() {
  return (
    <div className="flex flex-col h-full rounded-xl border border-border/50 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
      {/* Metrics */}
      <div className="px-4 py-2.5 border-t border-border/30">
        <div className="grid grid-cols-4 gap-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-2.5 w-8" />
            </div>
          ))}
        </div>
      </div>
      {/* Actions */}
      <div className="px-4 py-2.5 border-t border-border/30 flex gap-1.5">
        <Skeleton className="h-7 flex-1 rounded-md" />
        <Skeleton className="h-7 flex-1 rounded-md" />
      </div>
      {/* Footer */}
      <div className="px-4 py-2 border-t border-border/30 bg-muted/20">
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}

function OrgListSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border/50 bg-card">
      <div className="flex items-center gap-3 flex-1">
        <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="hidden md:flex items-center gap-5">
        <Skeleton className="h-7 w-12" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-7 w-20 rounded-md" />
        <Skeleton className="h-7 w-20 rounded-md" />
        <Skeleton className="h-7 w-7 rounded-md" />
      </div>
    </div>
  );
}

// ─── Page Component ─────────────────────────────────────────────────────────────

function OrganizationsContent() {
  const router = useRouter();

  // ── State ──────────────────────────────────────────────────────────────────
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchOrganizations = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const data = await organizationsService.getOrganizations();
      setOrganizations(data);
      if (isManual) toast.success("Organizations refreshed.");
    } catch {
      toast.error("Failed to load organizations. Please try again.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  // ── View mode persistence ──────────────────────────────────────────────────
  const handleSetViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("org_view_mode", mode);
    }
  }, []);

  // ── CRUD handlers ──────────────────────────────────────────────────────────
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
      setOrganizations((prev) => prev.filter((o) => o.id !== id));
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
        setOrganizations((prev) => prev.map((o) => (o.id === editingOrg.id ? updated : o)));
        toast.success("Organization updated successfully.");
      } else {
        const created = await organizationsService.createOrganization(data as OrganizationCreate);
        setOrganizations((prev) => [created, ...prev]);
        toast.success("Organization created successfully.");
      }
      setIsDialogOpen(false);
    } catch {
      toast.error("Failed to save organization. Please check your inputs.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Derived: filtered + sorted list ───────────────────────────────────────
  const processed = useMemo(() => {
    let list = [...organizations];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          o.industry?.toLowerCase().includes(q) ||
          o.description?.toLowerCase().includes(q)
      );
    }

    // Status filter (we use placeholder score since the API doesn't return scores on list)
    if (statusFilter !== "All") {
      list = list.filter((o) => getStatusFromScore(null) === statusFilter || statusFilter === "Unknown");
    }

    // Sort
    list.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "created_at") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    return list;
  }, [organizations, searchQuery, statusFilter, sortKey]);

  const hasSearch = searchQuery.trim().length > 0;
  const currentSortLabel = SORT_OPTIONS.find((s) => s.value === sortKey)?.label ?? "Sort";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* ── PAGE HEADER ───────────────────────────────────────────────────── */}
      <div className="border-b border-border/40 bg-background/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Organizations
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage organizations, compliance status and AI analyses.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchOrganizations(true)}
              disabled={isLoading || isRefreshing}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-primary")} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs cursor-pointer"
              onClick={() => toast.info("Import feature coming soon.")}
            >
              <Download className="h-3.5 w-3.5" />
              Import
            </Button>
            <Button
              size="sm"
              onClick={handleCreateNew}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              New Organization
            </Button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-4">

        {/* ── TOOLBAR: Search + Filters + Sort + View Toggle ──────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search organizations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-8 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
            />
            {hasSearch && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "h-7 px-2.5 rounded-md text-xs font-medium transition-colors border",
                  statusFilter === f.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-border-strong"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted hover:border-border-strong transition-colors cursor-pointer">
              Sort: {currentSortLabel}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Sort by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SORT_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setSortKey(opt.value)}
                  className={cn("text-xs cursor-pointer", sortKey === opt.value && "font-semibold text-primary")}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View Toggle */}
          <div className="flex items-center border border-border rounded-md overflow-hidden h-7">
            <button
              onClick={() => handleSetViewMode("grid")}
              className={cn(
                "px-2 h-full flex items-center transition-colors",
                viewMode === "grid"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <div className="w-px h-full bg-border" />
            <button
              onClick={() => handleSetViewMode("list")}
              className={cn(
                "px-2 h-full flex items-center transition-colors",
                viewMode === "list"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── RESULTS META ─────────────────────────────────────────────────── */}
        {!isLoading && organizations.length > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>
              Showing{" "}
              <span className="font-semibold text-foreground">{processed.length}</span>
              {" "}of{" "}
              <span className="font-semibold text-foreground">{organizations.length}</span>
              {" "}organizations
            </span>
            {hasSearch && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-border/50">
                Filtered
              </Badge>
            )}
          </div>
        )}

        {/* ── LOADING STATE ────────────────────────────────────────────────── */}
        {isLoading && (
          viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <OrgCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <OrgListSkeleton key={i} />
              ))}
            </div>
          )
        )}

        {/* ── EMPTY STATE ──────────────────────────────────────────────────── */}
        {!isLoading && organizations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center rounded-xl border border-dashed border-border/60 bg-muted/10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
              <Building2 className="h-6 w-6" />
            </div>
            <h2 className="text-base font-semibold text-foreground mb-1">
              No organizations found
            </h2>
            <p className="text-xs text-muted-foreground max-w-sm mb-6">
              Create your first organization to begin AI compliance analysis.
            </p>
            <Button size="sm" onClick={handleCreateNew} className="gap-1.5 cursor-pointer">
              <Plus className="h-3.5 w-3.5" />
              Create Organization
            </Button>
          </div>
        )}

        {/* ── NO RESULTS (search/filter) ───────────────────────────────────── */}
        {!isLoading && organizations.length > 0 && processed.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-border/40 bg-muted/5">
            <Search className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No results found</p>
            <p className="text-xs text-muted-foreground mb-4">
              Try adjusting your search or filters.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSearchQuery(""); setStatusFilter("All"); }}
              className="text-xs cursor-pointer gap-1.5"
            >
              <X className="h-3.5 w-3.5" /> Clear Filters
            </Button>
          </div>
        )}

        {/* ── GRID / LIST ──────────────────────────────────────────────────── */}
        {!isLoading && processed.length > 0 && (
          viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {processed.map((org) => (
                <OrganizationCard
                  key={org.id}
                  organization={org}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  viewMode="grid"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {processed.map((org) => (
                <OrganizationCard
                  key={org.id}
                  organization={org}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  viewMode="list"
                />
              ))}
            </div>
          )
        )}
      </main>

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
