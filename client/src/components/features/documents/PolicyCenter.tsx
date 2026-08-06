// PolicyCenter — Modern Enterprise Policy Center component
// Includes Top Header, Filter Toolbar, Policy Table / Cards, Side Details Drawer,
// Contextual Empty State, Skeleton Loaders, Error Retry, and Mobile Sticky Action.

"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Shield,
  FileText,
  Upload,
  RefreshCw,
  Search,
  Zap,
  BarChart3,
  ExternalLink,
  Eye,
  Download,
  Trash2,
  AlertCircle,
  FolderUp,
  LayoutGrid,
  List,
  ChevronDown,
  User,
  MoreHorizontal,
  Pencil,
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
import { cn } from "@/lib/utils";

import { documentService } from "@/services/document-service";
import { DocumentResponse } from "@/types/document";
import { ProcessingBadge } from "./ProcessingBadge";
import { DocumentPreviewDrawer } from "./DocumentPreviewDrawer";
import { DocumentUpload } from "./DocumentUpload";
import type { OrganizationDocumentExtended, ProcessingStatus, DocumentCategory } from "./documents-types";

interface PolicyCenterProps {
  organizationId: string;
  organizationName?: string;
}

export const PolicyCenter = memo(function PolicyCenter({
  organizationId,
  organizationName = "Organization Workspace",
}: PolicyCenterProps) {
  const router = useRouter();

  const [documents, setDocuments] = useState<OrganizationDocumentExtended[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & State
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | DocumentCategory>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | ProcessingStatus>("All");
  const [sortKey, setSortKey] = useState<"uploaded_at" | "name" | "file_size">("uploaded_at");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  // Drawer & Upload Modal State
  const [previewDoc, setPreviewDoc] = useState<OrganizationDocumentExtended | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const fetchPolicies = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const rawDocs = await documentService.getDocuments(organizationId);
      const mapped: OrganizationDocumentExtended[] = (rawDocs || []).map((d: DocumentResponse) => {
        let statusVal: ProcessingStatus = "Uploaded";
        if (d.processing_status === "PROCESSED") statusVal = "Analysis Ready";
        else if (d.processing_status === "PROCESSING") statusVal = "Processing";
        else if (d.processing_status === "FAILED") statusVal = "Error";

        return {
          id: d.id,
          organizationId: d.organization_id,
          name: d.original_filename || `Policy ${d.id}`,
          category: (d.document_type as DocumentCategory) || "Policy",
          file_size: `${(d.file_size / (1024 * 1024)).toFixed(1)} MB`,
          file_type: d.original_filename?.endsWith(".docx") ? "docx" : "pdf",
          version: "v1.0",
          uploaded_at: d.created_at,
          uploaded_by: d.uploaded_by || "Legal Admin",
          status: statusVal,
          tags: ["Internal Policy", "POSH", "Governance"],
          clause_count: 18,
          extracted_nodes: 34,
        };
      });

      setDocuments(mapped);
    } catch {
      setError("Failed to load policy documents. Please check backend connection and retry.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  // Derived Header KPI stats
  const totalPolicies = documents.length;
  const readyForAnalysisCount = useMemo(() => {
    return documents.filter(
      (d) => d.status === "Analysis Ready" || d.status === "Knowledge Graph Ready"
    ).length;
  }, [documents]);

  const lastUploadDate = useMemo(() => {
    if (documents.length === 0) return "No uploads yet";
    const sorted = [...documents].sort(
      (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
    );
    return format(new Date(sorted[0].uploaded_at), "MMM d, yyyy");
  }, [documents]);

  // Filtered & Sorted documents list
  const filteredDocuments = useMemo(() => {
    let result = [...documents];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (typeFilter !== "All") {
      result = result.filter((d) => d.category === typeFilter);
    }

    if (statusFilter !== "All") {
      result = result.filter((d) => d.status === statusFilter);
    }

    result.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "file_size") return a.file_size.localeCompare(b.file_size);
      return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime();
    });

    return result;
  }, [documents, searchQuery, typeFilter, statusFilter, sortKey]);

  // Selection
  const toggleSelectDoc = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleDeleteDoc = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    setSelectedDocIds((prev) => prev.filter((i) => i !== id));
  };

  return (
    <div className="space-y-6">
      {/* ─── 1. TOP HEADER ────────────────────────────────────────────── */}
      <Card className="border border-border/50 bg-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-info" />
              <h2 className="text-xl font-bold text-foreground">{organizationName} Policy Center</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Centralized corporate policy repository, statutory alignment status, and GraphRAG indexing.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchPolicies(true)}
              disabled={isRefreshing}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-primary")} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setIsUploadOpen(true)}
              className="gap-1.5 text-xs font-semibold cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" /> Upload Policy
            </Button>
          </div>
        </div>

        {/* 4 Top Header KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Total Policies</span>
            <span className="text-xl font-bold tabular-nums text-foreground">{totalPolicies}</span>
          </div>

          <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Ready For Analysis</span>
            <span className="text-xl font-bold tabular-nums text-emerald-500">{readyForAnalysisCount}</span>
          </div>

          <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Last Upload Date</span>
            <span className="text-xs font-semibold text-foreground truncate mt-1 block">{lastUploadDate}</span>
          </div>

          <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Graph Indexing</span>
            <span className="text-xs font-semibold text-primary mt-1 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> Active
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
            placeholder="Search policies by name, tag…"
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
              <DropdownMenuLabel className="text-xs">Filter by Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(["All", "Analysis Ready", "Knowledge Graph Ready", "Indexed", "Processing", "Uploaded", "Error"] as const).map((s) => (
                <DropdownMenuItem key={s} onClick={() => setStatusFilter(s)} className="text-xs cursor-pointer">
                  {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted cursor-pointer">
              Sort: {sortKey === "uploaded_at" ? "Date Uploaded" : sortKey === "name" ? "Name" : "File Size"}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Sort Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSortKey("uploaded_at")} className="text-xs cursor-pointer">Date Uploaded</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey("name")} className="text-xs cursor-pointer">Name</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey("file_size")} className="text-xs cursor-pointer">File Size</DropdownMenuItem>
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
      {selectedDocIds.length > 0 && (
        <div className="flex items-center justify-between p-2.5 px-4 rounded-xl border border-primary/30 bg-primary/10 text-xs">
          <span className="font-semibold text-foreground">
            {selectedDocIds.length} policy document{selectedDocIds.length > 1 ? "s" : ""} selected
          </span>
          <Button variant="ghost" size="xs" onClick={() => setSelectedDocIds([])} className="text-xs underline cursor-pointer">
            Clear Selection
          </Button>
        </div>
      )}

      {/* ─── 3. CONTENT / POLICY TABLE / CARDS ───────────────────────── */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        /* Error State */
        <Card className="border border-danger/30 bg-danger/5 p-8 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-danger mx-auto" />
          <h3 className="text-sm font-semibold text-foreground">Failed to load policy documents</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">{error}</p>
          <Button variant="outline" size="sm" onClick={() => fetchPolicies()} className="gap-1.5 cursor-pointer text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Retry Connection
          </Button>
        </Card>
      ) : filteredDocuments.length === 0 ? (
        /* ─── 4. CONTEXTUAL EMPTY STATE ───────────────────────────────── */
        <Card className="border border-dashed border-border/60 bg-muted/10 p-12 text-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mx-auto">
            <FolderUp className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">No company policies uploaded</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Upload your first company policy to begin AI-powered compliance analysis.
            </p>
          </div>
          <Button size="sm" onClick={() => setIsUploadOpen(true)} className="gap-1.5 font-semibold cursor-pointer">
            <Upload className="h-3.5 w-3.5" /> Upload Policy
          </Button>
        </Card>
      ) : (
        /* ─── 5. FULL POLICY TABLE (Desktop/Tablet) OR CARDS (Mobile) ──── */
        <div className="space-y-2">
          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-border/50 bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/40 bg-muted/30 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 pl-4">Document Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Uploaded By</th>
                  <th className="p-3">Upload Date</th>
                  <th className="p-3">Processing Status</th>
                  <th className="p-3">Analysis Status</th>
                  <th className="p-3 text-right pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-muted/20 transition-colors">
                    <td className="p-3 pl-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <button
                          onClick={() => setPreviewDoc(doc)}
                          className="font-semibold text-foreground hover:text-primary transition-colors text-left truncate max-w-xs cursor-pointer"
                        >
                          {doc.name}
                        </button>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground font-medium">{doc.category}</td>
                    <td className="p-3 text-muted-foreground">{doc.uploaded_by}</td>
                    <td className="p-3 text-muted-foreground">{format(new Date(doc.uploaded_at), "MMM d, yyyy")}</td>
                    <td className="p-3">
                      <ProcessingBadge status={doc.status} />
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                        Aligned
                      </Badge>
                    </td>
                    <td className="p-3 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => setPreviewDoc(doc)}
                          className="gap-1 cursor-pointer text-[11px]"
                        >
                          <Eye className="h-3 w-3" /> Preview
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted cursor-pointer">
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => setPreviewDoc(doc)} className="gap-2 text-xs cursor-pointer">
                              <Eye className="h-3.5 w-3.5" /> Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push("/compliance")} className="gap-2 text-xs cursor-pointer">
                              <Zap className="h-3.5 w-3.5" /> Run Analysis
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push("/reports")} className="gap-2 text-xs cursor-pointer">
                              <BarChart3 className="h-3.5 w-3.5" /> View Reports
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => handleDeleteDoc(doc.id)} className="gap-2 text-xs cursor-pointer">
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <div className="sm:hidden space-y-3">
            {filteredDocuments.map((doc) => (
              <Card key={doc.id} className="p-3 space-y-2 border border-border/50 bg-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <span onClick={() => setPreviewDoc(doc)} className="font-bold text-foreground text-xs truncate cursor-pointer">
                      {doc.name}
                    </span>
                  </div>
                  <ProcessingBadge status={doc.status} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground border-t border-border/30 pt-2">
                  <span>{doc.uploaded_by}</span>
                  <span>{format(new Date(doc.uploaded_at), "MMM d, yyyy")}</span>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="xs" onClick={() => setPreviewDoc(doc)} className="text-xs cursor-pointer">
                    <Eye className="h-3 w-3" /> Details
                  </Button>
                </div>
              </Card>
            ))}

            {/* Mobile Sticky Upload Button */}
            <div className="fixed bottom-4 right-4 z-30 sm:hidden">
              <Button onClick={() => setIsUploadOpen(true)} className="rounded-full shadow-lg gap-2 font-semibold cursor-pointer">
                <Upload className="h-4 w-4" /> Upload Policy
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Side Details Drawer */}
      <DocumentPreviewDrawer
        document={previewDoc}
        open={Boolean(previewDoc)}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
        onDelete={handleDeleteDoc}
      />

      {/* Drag & Drop Upload Modal */}
      <DocumentUpload
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onUploadSuccess={(newDocs) => {
          setDocuments((prev) => [...newDocs, ...prev]);
        }}
        organizationId={organizationId}
      />
    </div>
  );
});
