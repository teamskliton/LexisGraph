// RegulationLibrary — Global Regulation Library component
// Displays Header KPIs, Filter Toolbar, Data Table / Cards, Side Drawer Details,
// Link/Unlink Analysis selection, Contextual Empty States, Skeletons, and Error Retry.

"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
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
  FolderUp,
  CheckCircle2,
  Network,
  X,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
import type { OrganizationDocumentExtended } from "./documents-types";

import { useAuth } from "@/context/auth-context";

interface RegulationLibraryProps {
  organizationId?: string;
  organizationName?: string;
}

export const RegulationLibrary = memo(function RegulationLibrary({
  organizationId = "org-001",
  organizationName = "Organization Workspace",
}: RegulationLibraryProps) {
  const { permissions } = useAuth();
  const [regulations, setRegulations] = useState<GlobalRegulation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & State
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [sortKey, setSortKey] = useState<"act_name" | "act_year" | "jurisdiction">("act_name");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [linkedIds, setLinkedIds] = useState<string[]>([]);

  // Drawer & Upload State
  const [selectedReg, setSelectedReg] = useState<GlobalRegulation | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const fetchRegulations = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const data = await regulationsApi.listRegulations(organizationId, searchQuery);
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

  // Toggle Link / Unlink for Analysis
  const handleToggleLink = async (reg: GlobalRegulation) => {
    const isCurrentlyLinked = linkedIds.includes(reg.id);
    try {
      if (isCurrentlyLinked) {
        await regulationsApi.unlinkRegulation(organizationId, reg.id);
        setLinkedIds((prev) => prev.filter((id) => id !== reg.id));
        toast.success(`Unlinked ${reg.title || reg.act_name} from analysis workspace.`);
      } else {
        await regulationsApi.linkRegulation(organizationId, reg.id);
        setLinkedIds((prev) => [...prev, reg.id]);
        toast.success(`Selected ${reg.title || reg.act_name} for compliance analysis.`);
      }
    } catch {
      toast.error("Failed to update regulation selection state.");
    }
  };

  // Copy reference helper
  const handleCopyReference = (reg: GlobalRegulation) => {
    const title = reg.title || reg.act_name || "Statutory Regulation";
    const ref = `${title} (${reg.act_year || 2013}) — ${reg.jurisdiction || "India"}`;
    navigator.clipboard.writeText(ref);
    toast.success("Regulation reference copied to clipboard.");
  };

  // Filtered & Sorted regulations list
  const filteredRegulations = useMemo(() => {
    let result = [...regulations];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          (r.title && r.title.toLowerCase().includes(q)) ||
          (r.act_name && r.act_name.toLowerCase().includes(q)) ||
          (r.jurisdiction && r.jurisdiction.toLowerCase().includes(q)) ||
          (r.issuing_authority && r.issuing_authority.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== "All") {
      result = result.filter((r) => (r.processing_status || "PROCESSED") === statusFilter);
    }

    result.sort((a, b) => {
      if (sortKey === "act_year") return (b.act_year || 0) - (a.act_year || 0);
      if (sortKey === "jurisdiction") return (a.jurisdiction || "").localeCompare(b.jurisdiction || "");
      return (a.title || a.act_name || "").localeCompare(b.title || b.act_name || "");
    });

    return result;
  }, [regulations, searchQuery, statusFilter, sortKey]);

  return (
    <div className="space-y-6">
      {/* ─── 1. PAGE HEADER ────────────────────────────────────────────── */}
      <Card className="border border-border/50 bg-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <BookOpen className="h-5 w-5 text-success" />
              <h2 className="text-xl font-bold text-foreground">Global Regulation Library</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Discover, inspect, and select statutory acts for automated compliance cross-checks.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchRegulations(true)}
              disabled={isRefreshing}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-primary")} />
              Refresh
            </Button>
            {permissions.canUploadDocuments && (
              <Button
                size="sm"
                onClick={() => setIsUploadOpen(true)}
                className="gap-1.5 text-xs font-semibold cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" /> Import Regulation
              </Button>
            )}
          </div>
        </div>

        {/* 4 Header KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Total Regulations</span>
            <span className="text-xl font-bold tabular-nums text-foreground">{regulations.length}</span>
          </div>

          <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Selected for Scan</span>
            <span className="text-xl font-bold tabular-nums text-success">{linkedIds.length}</span>
          </div>

          <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Last Updated</span>
            <span className="text-xs font-semibold text-foreground truncate mt-1 block">Aug 2026</span>
          </div>

          <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Vector Indexing</span>
            <span className="text-xs font-semibold text-emerald-500 mt-1 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Qdrant Ready
            </span>
          </div>
        </div>
      </Card>

      {/* ─── 2. TOOLBAR ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-border/50 bg-card">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Quick search regulations by title, act, jurisdiction…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted cursor-pointer">
              Status: {statusFilter}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Filter Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {["All", "PROCESSED", "PARSING", "FAILED"].map((s) => (
                <DropdownMenuItem key={s} onClick={() => setStatusFilter(s)} className="text-xs cursor-pointer">
                  {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted cursor-pointer">
              Sort: {sortKey === "act_name" ? "Act Name" : sortKey === "act_year" ? "Act Year" : "Jurisdiction"}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Sort Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSortKey("act_name")} className="text-xs cursor-pointer">Act Name</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey("act_year")} className="text-xs cursor-pointer">Act Year</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey("jurisdiction")} className="text-xs cursor-pointer">Jurisdiction</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View Toggle */}
          <div className="flex items-center border border-border rounded-md overflow-hidden h-8">
            <button
              onClick={() => setViewMode("list")}
              className={cn("px-2 h-full flex items-center", viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground")}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn("px-2 h-full flex items-center", viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground")}
              title="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Selection Counter Bar */}
      {linkedIds.length > 0 && (
        <div className="flex items-center justify-between p-2.5 px-4 rounded-xl border border-success/30 bg-success/10 text-xs">
          <span className="font-semibold text-foreground">
            {linkedIds.length} regulation{linkedIds.length > 1 ? "s" : ""} selected for compliance analysis
          </span>
          <Button variant="ghost" size="xs" onClick={() => setLinkedIds([])} className="text-xs underline cursor-pointer">
            Clear Selection
          </Button>
        </div>
      )}

      {/* ─── 3. CONTENT / TABLE / CARDS ──────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        /* Error State */
        <Card className="border border-danger/30 bg-danger/5 p-8 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-danger mx-auto" />
          <h3 className="text-sm font-semibold text-foreground">Failed to load regulations</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">{error}</p>
          <Button variant="outline" size="sm" onClick={() => fetchRegulations()} className="gap-1.5 cursor-pointer text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Retry Connection
          </Button>
        </Card>
      ) : filteredRegulations.length === 0 ? (
        /* ─── 4. EMPTY STATE ──────────────────────────────────────────── */
        <Card className="border border-dashed border-border/60 bg-muted/10 p-12 text-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-success/10 text-success mx-auto">
            <BookOpen className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">No regulations available</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Global regulations will appear here once imported into the platform.
            </p>
          </div>
          <Button size="sm" onClick={() => setIsUploadOpen(true)} className="gap-1.5 font-semibold cursor-pointer">
            <Upload className="h-3.5 w-3.5" /> Import Regulation
          </Button>
        </Card>
      ) : (
        /* ─── 5. REGULATION TABLE (Desktop) OR CARDS (Mobile) ─────────── */
        <div className="space-y-2">
          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-border/50 bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/40 bg-muted/30 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 pl-4">Regulation Name</th>
                  <th className="p-3">Jurisdiction</th>
                  <th className="p-3">Issuing Authority</th>
                  <th className="p-3">Act Year</th>
                  <th className="p-3">Version</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredRegulations.map((reg) => {
                  const isLinked = linkedIds.includes(reg.id);
                  const regTitle = reg.title || reg.act_name || "Statutory Act";

                  return (
                    <tr key={reg.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 pl-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <BookOpen className="h-4 w-4 text-success shrink-0" />
                          <button
                            onClick={() => setSelectedReg(reg)}
                            className="font-semibold text-foreground hover:text-primary transition-colors text-left truncate max-w-xs cursor-pointer"
                          >
                            {regTitle}
                          </button>
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground font-medium">{reg.jurisdiction || "India (Central)"}</td>
                      <td className="p-3 text-muted-foreground truncate max-w-[140px]">{reg.issuing_authority || "Ministry of Corporate Affairs"}</td>
                      <td className="p-3 text-muted-foreground font-mono">{reg.act_year || 2013}</td>
                      <td className="p-3 text-muted-foreground">{reg.version || "Statutory Text"}</td>
                      <td className="p-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold",
                            isLinked
                              ? "bg-success/10 text-success border-success/20"
                              : "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {isLinked ? "Linked for Analysis" : "Available"}
                        </Badge>
                      </td>
                      <td className="p-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant={isLinked ? "outline" : "default"}
                            size="xs"
                            onClick={() => handleToggleLink(reg)}
                            className="gap-1 cursor-pointer text-[11px] font-semibold"
                          >
                            <Zap className="h-3 w-3 text-warning" />
                            {isLinked ? "Unlink" : "Select"}
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted cursor-pointer">
                              <MoreHorizontal className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => setSelectedReg(reg)} className="gap-2 text-xs cursor-pointer">
                                <Eye className="h-3.5 w-3.5" /> View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCopyReference(reg)} className="gap-2 text-xs cursor-pointer">
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

          {/* Mobile Card Layout */}
          <div className="sm:hidden space-y-3">
            {filteredRegulations.map((reg) => {
              const isLinked = linkedIds.includes(reg.id);
              const regTitle = reg.title || reg.act_name || "Statutory Act";

              return (
                <Card key={reg.id} className="p-3 space-y-2 border border-border/50 bg-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <BookOpen className="h-4 w-4 text-success shrink-0" />
                      <span onClick={() => setSelectedReg(reg)} className="font-bold text-foreground text-xs truncate cursor-pointer">
                        {regTitle}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-semibold bg-success/10 text-success border-success/20">
                      {isLinked ? "Linked" : "Available"}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground border-t border-border/30 pt-2">
                    <span>{reg.jurisdiction || "India"}</span>
                    <span>Year: {reg.act_year || 2013}</span>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" size="xs" onClick={() => setSelectedReg(reg)} className="text-xs cursor-pointer">
                      <Eye className="h-3 w-3" /> Details
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => handleToggleLink(reg)}
                      className="text-xs cursor-pointer font-semibold gap-1"
                    >
                      <Zap className="h-3 w-3 text-warning" /> {isLinked ? "Unlink" : "Select"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
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

      {/* Document Upload Modal (Import Regulation) */}
      <DocumentUpload
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onUploadSuccess={() => {
          fetchRegulations();
          toast.success("Regulation uploaded successfully.");
        }}
        organizationId={organizationId}
      />
    </div>
  );
});
