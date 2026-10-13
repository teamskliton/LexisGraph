// RegulationLibrary — Global Regulation Library component
// Global regulations catalog with workspace-isolated linking, verified statutory metadata,
// summary statistics, and platform administrator publishing controls.

"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Search,
  Upload,
  RefreshCw,
  Eye,
  Zap,
  Copy,
  LayoutGrid,
  List,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  MoreHorizontal,
  Building2,
  Globe,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { regulationsApi, GlobalRegulation } from "@/services/api/regulations";
import { RegulationDetailsDrawer } from "./RegulationDetailsDrawer";
import { DocumentUpload } from "./DocumentUpload";
import { useAuth } from "@/context/auth-context";

interface RegulationLibraryProps {
  organizationId?: string;
  organizationName?: string;
}

export const RegulationLibrary = memo(function RegulationLibrary({
  organizationId = "",
  organizationName = "Active Workspace",
}: RegulationLibraryProps) {
  const { user } = useAuth();
  const isPlatformAdmin = Boolean(user?.is_superuser);

  const [regulations, setRegulations] = useState<GlobalRegulation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "LINKED" | "AVAILABLE">("All");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("All");
  const [sortKey, setSortKey] = useState<"title" | "act_year" | "jurisdiction">("title");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [pendingLinkIds, setPendingLinkIds] = useState<Set<string>>(new Set());

  // Drawer & Upload State
  const [selectedReg, setSelectedReg] = useState<GlobalRegulation | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const fetchRegulations = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const data = await regulationsApi.listRegulations(organizationId || undefined, searchQuery);
      setRegulations(data || []);
      const initialLinked = (data || [])
        .filter((r) => r.is_linked)
        .map((r) => r.id);
      setLinkedIds(initialLinked);
    } catch {
      setError("Failed to load global regulations. Please check backend connection and retry.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [organizationId, searchQuery]);

  useEffect(() => {
    fetchRegulations();
  }, [fetchRegulations]);

  // Automatic polling when regulations are in a processing / uploaded / parsing state
  const hasProcessingRegulations = useMemo(() => {
    return regulations.some(
      (r) =>
        r.processing_status === "PROCESSING" ||
        r.processing_status === "UPLOADED" ||
        r.processing_status === "PARSING"
    );
  }, [regulations]);

  useEffect(() => {
    if (!hasProcessingRegulations || !organizationId) return;

    const interval = setInterval(async () => {
      try {
        const data = await regulationsApi.listRegulations(organizationId, searchQuery);
        if (data) {
          setRegulations(data);
        }
      } catch (err) {
        console.warn("Polling regulations failed:", err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [hasProcessingRegulations, organizationId, searchQuery]);

  // Toggle Link / Unlink for Workspace Analysis
  const handleToggleLink = async (reg: GlobalRegulation) => {
    if (!organizationId) {
      toast.error("No active organization workspace selected.");
      return;
    }

    if (pendingLinkIds.has(reg.id)) return; // Prevent duplicate rapid clicks

    const isCurrentlyLinked = linkedIds.includes(reg.id);
    const regLabel = reg.official_title || reg.title || reg.act_name || "Statutory Act";

    setPendingLinkIds((prev) => new Set(prev).add(reg.id));

    try {
      if (isCurrentlyLinked) {
        await regulationsApi.unlinkRegulation(organizationId, reg.id);
        setLinkedIds((prev) => prev.filter((id) => id !== reg.id));
        toast.success(`Unlinked ${regLabel} from ${organizationName}.`);
      } else {
        await regulationsApi.linkRegulation(organizationId, reg.id);
        setLinkedIds((prev) => [...prev, reg.id]);
        toast.success(`Linked ${regLabel} to ${organizationName}.`);
      }
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.detail || "Failed to update regulation workspace link.";
      toast.error(errorMsg);
    } finally {
      setPendingLinkIds((prev) => {
        const next = new Set(prev);
        next.delete(reg.id);
        return next;
      });
    }
  };

  // Copy citation reference
  const handleCopyReference = (reg: GlobalRegulation) => {
    const title = reg.official_title || reg.title || reg.act_name || "Statutory Regulation";
    const yearStr = reg.act_year ? ` (${reg.act_year})` : "";
    const jurisStr = reg.jurisdiction ? ` — ${reg.jurisdiction}` : "";
    const authStr = reg.issuing_authority ? ` [${reg.issuing_authority}]` : "";
    const ref = `${title}${yearStr}${jurisStr}${authStr}`;
    navigator.clipboard.writeText(ref);
    toast.success("Regulation reference copied to clipboard.");
  };

  // Unique jurisdictions from dataset
  const uniqueJurisdictions = useMemo(() => {
    const set = new Set<string>();
    regulations.forEach((r) => {
      if (r.jurisdiction && r.jurisdiction.trim()) {
        set.add(r.jurisdiction.trim());
      }
    });
    return Array.from(set).sort();
  }, [regulations]);

  // Filtered & Sorted regulations list
  const filteredRegulations = useMemo(() => {
    let result = [...regulations];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          (r.title && r.title.toLowerCase().includes(q)) ||
          (r.official_title && r.official_title.toLowerCase().includes(q)) ||
          (r.act_name && r.act_name.toLowerCase().includes(q)) ||
          (r.jurisdiction && r.jurisdiction.toLowerCase().includes(q)) ||
          (r.issuing_authority && r.issuing_authority.toLowerCase().includes(q)) ||
          (r.domain && r.domain.toLowerCase().includes(q))
      );
    }

    if (jurisdictionFilter !== "All") {
      result = result.filter((r) => r.jurisdiction === jurisdictionFilter);
    }

    if (statusFilter === "LINKED") {
      result = result.filter((r) => linkedIds.includes(r.id));
    } else if (statusFilter === "AVAILABLE") {
      result = result.filter((r) => !linkedIds.includes(r.id));
    }

    result.sort((a, b) => {
      if (sortKey === "act_year") return (b.act_year || 0) - (a.act_year || 0);
      if (sortKey === "jurisdiction")
        return (a.jurisdiction || "").localeCompare(b.jurisdiction || "");
      const titleA = a.official_title || a.title || a.act_name || "";
      const titleB = b.official_title || b.title || b.act_name || "";
      return titleA.localeCompare(titleB);
    });

    return result;
  }, [regulations, searchQuery, jurisdictionFilter, statusFilter, sortKey, linkedIds]);

  // Statistics
  const totalGlobalCount = regulations.length;
  const linkedWorkspaceCount = linkedIds.length;
  const availableWorkspaceCount = Math.max(0, totalGlobalCount - linkedWorkspaceCount);
  const pendingIndexingCount = regulations.filter(
    (r) => r.processing_status && r.processing_status !== "PROCESSED"
  ).length;

  return (
    <div className="space-y-6">
      {/* ─── 1. PAGE HEADER ────────────────────────────────────────────── */}
      <Card className="border border-border/50 bg-card p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BookOpen className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Global Regulation Library
              </h1>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              Explore verified regulations and link applicable legislation to your organization&apos;s compliance analysis.
            </p>
            {/* Workspace Context Display */}
            <div className="flex items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/60 border border-border/60 text-xs font-medium text-foreground">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                <span>Managing regulations for:</span>
                <strong className="text-foreground font-semibold">{organizationName}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchRegulations(true)}
              disabled={isRefreshing}
              className="gap-1.5 text-xs cursor-pointer h-9"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-primary")} />
              Refresh
            </Button>
            {isPlatformAdmin && (
              <Button
                size="sm"
                onClick={() => setIsUploadOpen(true)}
                className="gap-1.5 text-xs font-semibold cursor-pointer h-9"
              >
                <Upload className="h-3.5 w-3.5" /> Import Regulation
              </Button>
            )}
          </div>
        </div>

        {/* ─── 2. SUMMARY STATISTICS (4 Cards) ─────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {/* Card 1: Total Global Regulations */}
          <div className="p-3.5 rounded-xl border border-border/50 bg-muted/20 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                Total Regulations
              </span>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-border/50 bg-background/50">
                Global
              </Badge>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-foreground">{totalGlobalCount}</span>
              <span className="text-[11px] text-muted-foreground">Published</span>
            </div>
          </div>

          {/* Card 2: Linked to Current Workspace */}
          <div className="p-3.5 rounded-xl border border-success/30 bg-success/5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                Linked to Workspace
              </span>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-success/30 text-success bg-success/10 font-semibold">
                Workspace
              </Badge>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-success">{linkedWorkspaceCount}</span>
              <span className="text-[11px] text-muted-foreground truncate" title={organizationName}>
                in {organizationName}
              </span>
            </div>
          </div>

          {/* Card 3: Available Regulations */}
          <div className="p-3.5 rounded-xl border border-border/50 bg-muted/20 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                Available to Link
              </span>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-border/50 bg-background/50">
                Workspace
              </Badge>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-foreground">{availableWorkspaceCount}</span>
              <span className="text-[11px] text-muted-foreground">Unlinked</span>
            </div>
          </div>

          {/* Card 4: Pending Indexing */}
          <div className="p-3.5 rounded-xl border border-border/50 bg-muted/20 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                Pending Indexing
              </span>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-border/50 bg-background/50">
                Global
              </Badge>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={cn("text-2xl font-bold tabular-nums", pendingIndexingCount > 0 ? "text-amber-500" : "text-foreground")}>
                {pendingIndexingCount}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {pendingIndexingCount === 0 ? "All indexed" : "In queue"}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── 3. TOOLBAR (Search, Filters, Sort, View) ───────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl border border-border/50 bg-card">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search regulations by title, act, jurisdiction…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter (Workspace Scope) */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted cursor-pointer">
              Status: {statusFilter === "All" ? "All" : statusFilter === "LINKED" ? "Linked to Workspace" : "Available"}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">Workspace Link Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setStatusFilter("All")} className="text-xs cursor-pointer">
                All Regulations
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("LINKED")} className="text-xs cursor-pointer">
                Linked to {organizationName}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("AVAILABLE")} className="text-xs cursor-pointer">
                Available (Unlinked)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Jurisdiction Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted cursor-pointer">
              Jurisdiction: {jurisdictionFilter}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs">Filter by Jurisdiction</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setJurisdictionFilter("All")} className="text-xs cursor-pointer">
                All Jurisdictions
              </DropdownMenuItem>
              {uniqueJurisdictions.map((j) => (
                <DropdownMenuItem key={j} onClick={() => setJurisdictionFilter(j)} className="text-xs cursor-pointer">
                  {j}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted cursor-pointer">
              Sort: {sortKey === "title" ? "Regulation Name" : sortKey === "act_year" ? "Enactment Year" : "Jurisdiction"}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Sort Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSortKey("title")} className="text-xs cursor-pointer">
                Regulation Name
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey("act_year")} className="text-xs cursor-pointer">
                Enactment Year
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey("jurisdiction")} className="text-xs cursor-pointer">
                Jurisdiction
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View Toggle */}
          <div className="flex items-center border border-border rounded-md overflow-hidden h-8">
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "px-2 h-full flex items-center cursor-pointer transition-colors",
                viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              title="Table view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "px-2 h-full flex items-center cursor-pointer transition-colors",
                viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              title="Card view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── 4. ACTIVE SELECTION BAR ──────────────────────────────────── */}
      {linkedIds.length > 0 && (
        <div className="flex items-center justify-between p-2.5 px-4 rounded-xl border border-success/30 bg-success/10 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="font-semibold text-foreground">
              {linkedIds.length} regulation{linkedIds.length > 1 ? "s" : ""} actively linked for compliance analysis in {organizationName}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Changes save automatically to workspace
          </span>
        </div>
      )}

      {/* ─── 5. CONTENT (TABLE / SKELETON / EMPTY) ────────────────────── */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card className="border border-destructive/30 bg-destructive/5 p-8 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <h3 className="text-sm font-semibold text-foreground">Failed to load regulations</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">{error}</p>
          <Button variant="outline" size="sm" onClick={() => fetchRegulations()} className="gap-1.5 cursor-pointer text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Retry Connection
          </Button>
        </Card>
      ) : filteredRegulations.length === 0 ? (
        <Card className="border border-dashed border-border/60 bg-muted/10 p-12 text-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mx-auto">
            <BookOpen className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">No regulations found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
              {searchQuery || jurisdictionFilter !== "All" || statusFilter !== "All"
                ? "No regulations match the current search or filter criteria. Try adjusting your search query."
                : isPlatformAdmin
                ? "The global regulation library is empty. Platform administrators can import statutory documents."
                : "No regulations are currently published in the global library. Contact a platform administrator to import regulations."}
            </p>
          </div>
          {isPlatformAdmin && !searchQuery && (
            <Button size="sm" onClick={() => setIsUploadOpen(true)} className="gap-1.5 font-semibold cursor-pointer">
              <Upload className="h-3.5 w-3.5" /> Import Regulation
            </Button>
          )}
        </Card>
      ) : viewMode === "list" ? (
        /* ─── DESKTOP DATA TABLE ─────────────────────────────────────── */
        <div className="overflow-x-auto rounded-xl border border-border/50 bg-card">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/40 bg-muted/30 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3 pl-4">Regulation Name</th>
                <th className="p-3">Jurisdiction</th>
                <th className="p-3">Issuing Authority</th>
                <th className="p-3">Year</th>
                <th className="p-3">Version</th>
                <th className="p-3">Workspace Status</th>
                <th className="p-3 text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filteredRegulations.map((reg) => {
                const isLinked = linkedIds.includes(reg.id);
                const isPending = pendingLinkIds.has(reg.id);
                const displayTitle = reg.official_title || reg.title || reg.act_name || "Statutory Act";
                const jurisdiction = reg.jurisdiction || "Not available";
                const authority = reg.issuing_authority || "Unverified";
                const actYear = reg.act_year ? String(reg.act_year) : "Not available";
                const version = reg.version || "Not available";

                return (
                  <tr key={reg.id} className="hover:bg-muted/20 transition-colors">
                    {/* Regulation Name */}
                    <td className="p-3 pl-4 max-w-xs">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <BookOpen className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <button
                            onClick={() => setSelectedReg(reg)}
                            className="font-semibold text-foreground hover:text-primary transition-colors text-left truncate block max-w-sm cursor-pointer"
                            title={displayTitle}
                          >
                            {displayTitle}
                          </button>
                          {reg.domain && (
                            <span className="text-[10px] text-muted-foreground block truncate">
                              {reg.domain}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Jurisdiction */}
                    <td className="p-3 text-muted-foreground font-medium whitespace-nowrap">
                      {jurisdiction}
                    </td>

                    {/* Issuing Authority */}
                    <td className="p-3 text-muted-foreground max-w-[180px] truncate" title={authority}>
                      {authority}
                    </td>

                    {/* Year */}
                    <td className="p-3 text-muted-foreground font-mono whitespace-nowrap">
                      {actYear}
                    </td>

                    {/* Version */}
                    <td className="p-3 text-muted-foreground whitespace-nowrap truncate max-w-[120px]" title={version}>
                      {version}
                    </td>

                    {/* Workspace Status */}
                    <td className="p-3 whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-semibold gap-1",
                          isLinked
                            ? "bg-success/10 text-success border-success/30"
                            : "bg-muted/60 text-muted-foreground border-border/60"
                        )}
                      >
                        {isLinked ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            Linked to Workspace
                          </>
                        ) : (
                          "Available"
                        )}
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td className="p-3 pr-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant={isLinked ? "outline" : "default"}
                          size="xs"
                          disabled={isPending}
                          onClick={() => handleToggleLink(reg)}
                          className={cn(
                            "gap-1 cursor-pointer text-[11px] font-semibold min-w-[70px]",
                            isLinked && "hover:border-destructive hover:text-destructive hover:bg-destructive/10"
                          )}
                        >
                          {isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isLinked ? (
                            "Unlink"
                          ) : (
                            <>
                              <Zap className="h-3 w-3 text-warning" />
                              Link
                            </>
                          )}
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted cursor-pointer text-muted-foreground hover:text-foreground">
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={() => setSelectedReg(reg)}
                              className="gap-2 text-xs cursor-pointer"
                            >
                              <Eye className="h-3.5 w-3.5" /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleCopyReference(reg)}
                              className="gap-2 text-xs cursor-pointer"
                            >
                              <Copy className="h-3.5 w-3.5" /> Copy Reference
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ─── GRID / CARD VIEW ───────────────────────────────────────── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredRegulations.map((reg) => {
            const isLinked = linkedIds.includes(reg.id);
            const isPending = pendingLinkIds.has(reg.id);
            const displayTitle = reg.official_title || reg.title || reg.act_name || "Statutory Act";
            const jurisdiction = reg.jurisdiction || "Not available";
            const authority = reg.issuing_authority || "Unverified";
            const actYear = reg.act_year ? String(reg.act_year) : "Not available";

            return (
              <Card key={reg.id} className="p-4 space-y-3 border border-border/50 bg-card hover:border-border transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <BookOpen className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <button
                      onClick={() => setSelectedReg(reg)}
                      className="font-bold text-foreground text-xs hover:text-primary transition-colors text-left line-clamp-2 cursor-pointer"
                      title={displayTitle}
                    >
                      {displayTitle}
                    </button>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] shrink-0 font-semibold",
                      isLinked
                        ? "bg-success/10 text-success border-success/30"
                        : "bg-muted text-muted-foreground border-border/60"
                    )}
                  >
                    {isLinked ? "Linked" : "Available"}
                  </Badge>
                </div>

                <div className="text-[11px] text-muted-foreground space-y-1 border-t border-border/30 pt-2.5">
                  <div className="flex justify-between">
                    <span>Jurisdiction:</span>
                    <strong className="text-foreground">{jurisdiction}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Authority:</span>
                    <strong className="text-foreground truncate max-w-[150px]">{authority}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Enactment Year:</span>
                    <strong className="text-foreground">{actYear}</strong>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/30">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setSelectedReg(reg)}
                    className="text-xs cursor-pointer gap-1"
                  >
                    <Eye className="h-3 w-3" /> Details
                  </Button>
                  <Button
                    variant={isLinked ? "outline" : "default"}
                    size="xs"
                    disabled={isPending}
                    onClick={() => handleToggleLink(reg)}
                    className={cn(
                      "text-xs cursor-pointer font-semibold gap-1 min-w-[70px]",
                      isLinked && "hover:border-destructive hover:text-destructive hover:bg-destructive/10"
                    )}
                  >
                    {isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isLinked ? (
                      "Unlink"
                    ) : (
                      <>
                        <Zap className="h-3 w-3 text-warning" /> Link
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Side Details Drawer */}
      <RegulationDetailsDrawer
        regulation={selectedReg}
        open={Boolean(selectedReg)}
        onOpenChange={(open) => !open && setSelectedReg(null)}
        isLinked={selectedReg ? linkedIds.includes(selectedReg.id) : false}
        onToggleLink={handleToggleLink}
      />

      {/* Document Upload Modal (Platform Administrator Only) */}
      {isPlatformAdmin && (
        <DocumentUpload
          open={isUploadOpen}
          onOpenChange={setIsUploadOpen}
          onUploadSuccess={() => {
            fetchRegulations();
            toast.success("Regulation imported into global library successfully.");
          }}
          organizationId={organizationId}
        />
      )}
    </div>
  );
});
