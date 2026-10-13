// PolicyCenter — Modern Enterprise Policy Center component
// Scoped strictly to active organization workspace with real-time status polling,
// workspace duplicate detection, and separated processing vs analysis status.

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
  Eye,
  Download,
  Trash2,
  AlertCircle,
  FolderUp,
  LayoutGrid,
  List,
  ChevronDown,
  User as UserIcon,
  MoreHorizontal,
  Pencil,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { documentService } from "@/services/document-service";
import { DocumentResponse } from "@/types/document";
import { ProcessingBadge } from "./ProcessingBadge";
import { DocumentPreviewDrawer } from "./DocumentPreviewDrawer";
import { DocumentUpload } from "./DocumentUpload";
import { useAuth } from "@/context/auth-context";
import type {
  OrganizationDocumentExtended,
  ProcessingStatus,
} from "./documents-types";

type AnalysisStatusFilter =
  | "All"
  | "Not Analyzed"
  | "Under Review"
  | "Compliant"
  | "Non-Compliant";

interface PolicyCenterProps {
  organizationId: string;
  organizationName?: string;
}

export const PolicyCenter = memo(function PolicyCenter({
  organizationId,
  organizationName = "Active Organization",
}: PolicyCenterProps) {
  const router = useRouter();
  const { permissions } = useAuth();

  const [documents, setDocuments] = useState<OrganizationDocumentExtended[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ProcessingStatus>("All");
  const [analysisFilter, setAnalysisFilter] = useState<AnalysisStatusFilter>("All");
  const [sortKey, setSortKey] = useState<"uploaded_at" | "name" | "file_size">("uploaded_at");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Drawer & Upload Modal State
  const [previewDoc, setPreviewDoc] = useState<OrganizationDocumentExtended | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Rename Dialog State
  const [renameDoc, setRenameDoc] = useState<OrganizationDocumentExtended | null>(null);
  const [newDocName, setNewDocName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  const mapDocs = useCallback(
    (rawDocs: DocumentResponse[]): OrganizationDocumentExtended[] => {
      return (rawDocs || []).map((d: DocumentResponse) => {
        let statusVal: ProcessingStatus = "Uploaded";
        if (d.processing_status === "PROCESSED") statusVal = "Analysis Ready";
        else if (d.processing_status === "PROCESSING") statusVal = "Processing";
        else if (d.processing_status === "FAILED") statusVal = "Error";

        // Display uploader name instead of database UUID
        const displayName =
          d.uploader_name ||
          (d.uploaded_by && d.uploaded_by.length > 20
            ? "Workspace Member"
            : d.uploaded_by) ||
          "Compliance Officer";

        const analysisStatus =
          (d.analysis_status as
            | "Not Analyzed"
            | "Under Review"
            | "Compliant"
            | "Non-Compliant") || "Not Analyzed";

        return {
          id: d.id,
          organizationId: d.organization_id,
          name: d.original_filename || `Policy ${d.id.slice(0, 8)}`,
          category: "Policy",
          file_size: `${(d.file_size / (1024 * 1024)).toFixed(1)} MB`,
          file_type: d.original_filename?.endsWith(".docx") ? "docx" : "pdf",
          version: d.version || "v1.0",
          uploaded_at: d.created_at,
          uploaded_by: displayName,
          status: statusVal,
          analysis_status: analysisStatus,
          tags: ["Company Policy", "Internal"],
          clause_count: 12,
          extracted_nodes: 24,
        };
      });
    },
    []
  );

  const fetchPolicies = useCallback(
    async (isManual = false) => {
      if (!organizationId) {
        setIsLoading(false);
        setDocuments([]);
        return;
      }

      if (isManual) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      try {
        const rawDocs = await documentService.getDocuments(organizationId, "POLICY");
        setDocuments(mapDocs(rawDocs));
        if (isManual) {
          toast.success("Policy list refreshed.");
        }
      } catch (err: unknown) {
        console.error("Failed to load policies:", err);
        setError("Failed to load policy documents. Please check backend connection and retry.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [organizationId, mapDocs]
  );

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  // Automatic live polling while documents are in a processing / uploaded state
  const hasProcessingDocs = useMemo(() => {
    return documents.some(
      (d) =>
        d.status === "Processing" ||
        d.status === "Uploaded" ||
        d.status === "Parsing"
    );
  }, [documents]);

  useEffect(() => {
    if (!hasProcessingDocs || !organizationId) return;

    const interval = setInterval(async () => {
      try {
        const rawDocs = await documentService.getDocuments(organizationId, "POLICY");
        if (rawDocs) {
          setDocuments(mapDocs(rawDocs));
        }
      } catch (e) {
        console.warn("Polling policy documents status failed:", e);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [hasProcessingDocs, organizationId, mapDocs]);

  // Derived Header KPI stats (strictly scoped to active workspace)
  const totalPolicies = documents.length;

  const readyForAnalysisCount = useMemo(() => {
    return documents.filter(
      (d) => d.status === "Analysis Ready" || d.status === "Knowledge Graph Ready"
    ).length;
  }, [documents]);

  const processingCount = useMemo(() => {
    return documents.filter(
      (d) =>
        d.status === "Processing" ||
        d.status === "Uploaded" ||
        d.status === "Parsing"
    ).length;
  }, [documents]);

  const failedCount = useMemo(() => {
    return documents.filter((d) => d.status === "Error").length;
  }, [documents]);

  const lastUploadDate = useMemo(() => {
    if (documents.length === 0) return "No uploads yet";
    const sorted = [...documents].sort(
      (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
    );
    try {
      return format(new Date(sorted[0].uploaded_at), "MMM d, yyyy");
    } catch {
      return "Recently";
    }
  }, [documents]);

  // Filtered & Sorted documents list
  const filteredDocuments = useMemo(() => {
    let result = [...documents];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.uploaded_by.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "All") {
      result = result.filter((d) => d.status === statusFilter);
    }

    if (analysisFilter !== "All") {
      result = result.filter((d) => d.analysis_status === analysisFilter);
    }

    result.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "file_size") return a.file_size.localeCompare(b.file_size);
      return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime();
    });

    return result;
  }, [documents, searchQuery, statusFilter, analysisFilter, sortKey]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, analysisFilter, sortKey]);

  // Paginated records
  const totalPages = Math.max(1, Math.ceil(filteredDocuments.length / PAGE_SIZE));
  const paginatedDocuments = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredDocuments.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredDocuments, currentPage, PAGE_SIZE]);

  // Actions Handlers
  const handleDownloadDoc = async (doc: OrganizationDocumentExtended) => {
    try {
      toast.info(`Preparing download for ${doc.name}...`);
      await documentService.downloadDocument(doc.id, doc.name);
      toast.success(`Downloaded ${doc.name}`);
    } catch (err) {
      console.error("Failed to download document:", err);
      toast.error("Failed to download policy document.");
    }
  };

  const handleReprocessDoc = async (id: string, name: string) => {
    try {
      toast.info(`Re-queuing ${name} for processing...`);
      await documentService.reprocessDocument(id);
      toast.success("Document re-queued successfully.");
      fetchPolicies(false);
    } catch (err: unknown) {
      console.error("Failed to reprocess document:", err);
      toast.error("Failed to reprocess policy document.");
    }
  };

  const handleDeleteDoc = async (id: string) => {
    try {
      await documentService.deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setSelectedDocIds((prev) => prev.filter((i) => i !== id));
      toast.success("Policy deleted successfully.");
    } catch (err) {
      console.error("Failed to delete policy:", err);
      toast.error("Failed to delete policy document.");
    }
  };

  const openRenameModal = (doc: OrganizationDocumentExtended) => {
    setRenameDoc(doc);
    setNewDocName(doc.name);
  };

  const handleConfirmRename = async () => {
    if (!renameDoc || !newDocName.trim()) return;
    setIsRenaming(true);
    try {
      const updated = await documentService.renameDocument(renameDoc.id, newDocName.trim());
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === renameDoc.id ? { ...d, name: updated.original_filename } : d
        )
      );
      toast.success("Policy renamed successfully.");
      setRenameDoc(null);
    } catch (err) {
      console.error("Failed to rename policy:", err);
      toast.error("Failed to rename policy document.");
    } finally {
      setIsRenaming(false);
    }
  };

  // Render Analysis Status Badge
  const renderAnalysisBadge = (status?: string) => {
    switch (status) {
      case "Compliant":
        return (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-500 border-emerald-500/25 text-[10px] gap-1 font-semibold"
          >
            <CheckCircle2 className="h-3 w-3" /> Compliant
          </Badge>
        );
      case "Non-Compliant":
        return (
          <Badge
            variant="outline"
            className="bg-rose-500/10 text-rose-500 border-rose-500/25 text-[10px] gap-1 font-semibold"
          >
            <AlertCircle className="h-3 w-3" /> Non-Compliant
          </Badge>
        );
      case "Under Review":
        return (
          <Badge
            variant="outline"
            className="bg-amber-500/10 text-amber-500 border-amber-500/25 text-[10px] gap-1 font-semibold"
          >
            <Loader2 className="h-3 w-3 animate-spin" /> Under Review
          </Badge>
        );
      default:
        return (
          <Badge
            variant="outline"
            className="bg-muted/50 text-muted-foreground border-border text-[10px] font-medium"
          >
            Not Analyzed
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── 1. TOP HEADER ────────────────────────────────────────────── */}
      <Card className="border border-border/50 bg-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">Policy Center</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Manage and monitor policies for{" "}
              <span className="font-semibold text-foreground">{organizationName}</span>.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchPolicies(true)}
              disabled={isRefreshing}
              className="gap-1.5 text-xs cursor-pointer"
              title="Refresh policies"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-primary")}
              />
              Refresh
            </Button>
            {permissions.canUploadDocuments && (
              <Button
                size="sm"
                onClick={() => setIsUploadOpen(true)}
                className="gap-1.5 text-xs font-semibold cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" /> Upload Policy
              </Button>
            )}
          </div>
        </div>

        {/* ─── 2. 4 REAL METRICS KPI CARDS ─────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {/* Total Policies */}
          <div className="p-3.5 rounded-xl border border-border/40 bg-muted/20 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
              Total Policies
            </span>
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {totalPolicies}
            </span>
          </div>

          {/* Ready for Analysis */}
          <div className="p-3.5 rounded-xl border border-border/40 bg-muted/20 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
              Ready for Analysis
            </span>
            <span className="text-2xl font-bold tabular-nums text-emerald-500">
              {readyForAnalysisCount}
            </span>
          </div>

          {/* Processing / Failed */}
          <div className="p-3.5 rounded-xl border border-border/40 bg-muted/20 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
              Processing / Failed
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tabular-nums text-amber-500">
                {processingCount}
              </span>
              <span className="text-xs text-muted-foreground">
                / {failedCount} failed
              </span>
            </div>
          </div>

          {/* Last Policy Upload */}
          <div className="p-3.5 rounded-xl border border-border/40 bg-muted/20 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
              Last Policy Upload
            </span>
            <span className="text-xs font-semibold text-foreground truncate block mt-2">
              {lastUploadDate}
            </span>
          </div>
        </div>
      </Card>

      {/* ─── 3. TOOLBAR ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl border border-border/50 bg-card">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search policies by name or uploader…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Processing Status Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted cursor-pointer">
              Processing: {statusFilter}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">Processing Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(
                [
                  "All",
                  "Analysis Ready",
                  "Processing",
                  "Uploaded",
                  "Error",
                ] as const
              ).map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className="text-xs cursor-pointer"
                >
                  {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Analysis Status Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted cursor-pointer">
              Analysis: {analysisFilter}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">Compliance Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(
                [
                  "All",
                  "Not Analyzed",
                  "Under Review",
                  "Compliant",
                  "Non-Compliant",
                ] as const
              ).map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => setAnalysisFilter(s)}
                  className="text-xs cursor-pointer"
                >
                  {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted cursor-pointer">
              Sort:{" "}
              {sortKey === "uploaded_at"
                ? "Upload Date"
                : sortKey === "name"
                ? "Name"
                : "File Size"}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Sort Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setSortKey("uploaded_at")}
                className="text-xs cursor-pointer"
              >
                Upload Date
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortKey("name")}
                className="text-xs cursor-pointer"
              >
                Name
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortKey("file_size")}
                className="text-xs cursor-pointer"
              >
                File Size
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View Toggle */}
          <div className="flex items-center border border-border rounded-md overflow-hidden h-8">
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "px-2 h-full flex items-center cursor-pointer",
                viewMode === "list"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground"
              )}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "px-2 h-full flex items-center cursor-pointer",
                viewMode === "grid"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground"
              )}
              title="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── 4. POLICY TABLE / CARDS ───────────────────────────────────── */}
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
          <h3 className="text-sm font-semibold text-foreground">
            Failed to load policy documents
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchPolicies(true)}
            className="gap-1.5 cursor-pointer text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry Connection
          </Button>
        </Card>
      ) : filteredDocuments.length === 0 ? (
        /* Empty State */
        <Card className="border border-dashed border-border/60 bg-muted/10 p-12 text-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mx-auto">
            <FolderUp className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              No policies found in {organizationName}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Upload your company policies to monitor compliance rules and execute AI analysis.
            </p>
          </div>
          {permissions.canUploadDocuments && (
            <Button
              size="sm"
              onClick={() => setIsUploadOpen(true)}
              className="gap-1.5 font-semibold cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" /> Upload Policy
            </Button>
          )}
        </Card>
      ) : (
        /* Table / Grid */
        <div className="space-y-3">
          {viewMode === "list" ? (
            <div className="overflow-x-auto rounded-xl border border-border/50 bg-card">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/40 bg-muted/30 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3 pl-4">Policy Name</th>
                    <th className="p-3">Uploaded By</th>
                    <th className="p-3">Upload Date</th>
                    <th className="p-3">Processing Status</th>
                    <th className="p-3">Analysis Status</th>
                    <th className="p-3 text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {paginatedDocuments.map((doc) => (
                    <tr key={doc.id} className="hover:bg-muted/20 transition-colors">
                      {/* Policy Name with Version Badge */}
                      <td className="p-3 pl-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <div className="flex items-center gap-1.5 truncate max-w-xs md:max-w-sm">
                            <button
                              onClick={() => setPreviewDoc(doc)}
                              className="font-semibold text-foreground hover:text-primary transition-colors text-left truncate cursor-pointer"
                            >
                              {doc.name}
                            </button>
                            {doc.version && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 h-4 border-border/60 text-muted-foreground font-mono"
                              >
                                {doc.version}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Uploaded By */}
                      <td className="p-3 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <UserIcon className="h-3 w-3 text-muted-foreground/70" />
                          <span>{doc.uploaded_by}</span>
                        </div>
                      </td>

                      {/* Upload Date */}
                      <td className="p-3 text-muted-foreground font-mono text-[11px]">
                        {format(new Date(doc.uploaded_at), "MMM d, yyyy")}
                      </td>

                      {/* Processing Status */}
                      <td className="p-3">
                        <ProcessingBadge status={doc.status} />
                      </td>

                      {/* Analysis Status */}
                      <td className="p-3">
                        {renderAnalysisBadge(doc.analysis_status)}
                      </td>

                      {/* Actions */}
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
                            <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted cursor-pointer text-muted-foreground hover:text-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={() => setPreviewDoc(doc)}
                                className="gap-2 text-xs cursor-pointer"
                              >
                                <Eye className="h-3.5 w-3.5" /> Details & Preview
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onClick={() => handleDownloadDoc(doc)}
                                className="gap-2 text-xs cursor-pointer"
                              >
                                <Download className="h-3.5 w-3.5" /> Download
                              </DropdownMenuItem>

                              {permissions.canUploadDocuments && (
                                <DropdownMenuItem
                                  onClick={() => openRenameModal(doc)}
                                  className="gap-2 text-xs cursor-pointer"
                                >
                                  <Pencil className="h-3.5 w-3.5" /> Rename
                                </DropdownMenuItem>
                              )}

                              {permissions.canUploadDocuments && (
                                <DropdownMenuItem
                                  onClick={() => handleReprocessDoc(doc.id, doc.name)}
                                  className="gap-2 text-xs cursor-pointer"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" /> Reprocess
                                </DropdownMenuItem>
                              )}

                              {permissions.canRunAnalysis && (
                                <DropdownMenuItem
                                  onClick={() => router.push("/compliance")}
                                  className="gap-2 text-xs cursor-pointer"
                                >
                                  <Zap className="h-3.5 w-3.5 text-warning" /> Run Analysis
                                </DropdownMenuItem>
                              )}

                              <DropdownMenuItem
                                onClick={() => router.push("/reports")}
                                className="gap-2 text-xs cursor-pointer"
                              >
                                <BarChart3 className="h-3.5 w-3.5" /> View Reports
                              </DropdownMenuItem>

                              {permissions.canDeleteDocuments && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => handleDeleteDoc(doc.id)}
                                    className="gap-2 text-xs cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Grid View */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {paginatedDocuments.map((doc) => (
                <Card
                  key={doc.id}
                  className="p-4 space-y-3 border border-border/50 bg-card hover:border-border transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <div className="truncate">
                        <span
                          onClick={() => setPreviewDoc(doc)}
                          className="font-bold text-foreground text-xs truncate cursor-pointer hover:text-primary transition-colors block"
                        >
                          {doc.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {doc.version || "v1.0"} · {doc.file_size}
                        </span>
                      </div>
                    </div>
                    <ProcessingBadge status={doc.status} />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-[11px] text-muted-foreground">Compliance:</span>
                    {renderAnalysisBadge(doc.analysis_status)}
                  </div>

                  <div className="flex justify-between text-[10px] text-muted-foreground border-t border-border/30 pt-2">
                    <span>{doc.uploaded_by}</span>
                    <span>{format(new Date(doc.uploaded_at), "MMM d, yyyy")}</span>
                  </div>

                  <div className="flex justify-end gap-1.5 pt-1">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleDownloadDoc(doc)}
                      className="text-xs cursor-pointer"
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setPreviewDoc(doc)}
                      className="text-xs cursor-pointer"
                    >
                      <Eye className="h-3 w-3" /> Details
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-card text-xs">
              <span className="text-muted-foreground">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filteredDocuments.length)} of{" "}
                {filteredDocuments.length} policies
              </span>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="cursor-pointer gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </Button>
                <span className="px-2 font-mono text-[11px]">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="cursor-pointer gap-1"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 5. SIDE DETAILS DRAWER ────────────────────────────────────── */}
      <DocumentPreviewDrawer
        document={previewDoc}
        open={Boolean(previewDoc)}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
        onDownload={handleDownloadDoc}
        onDelete={handleDeleteDoc}
      />

      {/* ─── 6. DRAG & DROP UPLOAD MODAL ───────────────────────────────── */}
      <DocumentUpload
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        organizationId={organizationId}
        organizationName={organizationName}
        existingPolicies={documents.map((d) => ({ name: d.name, version: d.version }))}
        defaultCategory="Policy"
        onUploadSuccess={(_newDocs) => {
          fetchPolicies(true);
        }}
      />

      {/* ─── 7. RENAME POLICY MODAL ────────────────────────────────────── */}
      <Dialog open={Boolean(renameDoc)} onOpenChange={(open) => !open && setRenameDoc(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Pencil className="h-4 w-4 text-primary" /> Rename Policy
            </DialogTitle>
            <DialogDescription className="text-xs">
              Update the filename of this policy document in {organizationName}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs font-semibold">Policy Name</Label>
            <Input
              value={newDocName}
              onChange={(e) => setNewDocName(e.target.value)}
              placeholder="e.g. Code_of_Conduct_2026.pdf"
              className="text-xs"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRenameDoc(null)}
              disabled={isRenaming}
              className="cursor-pointer text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmRename}
              disabled={!newDocName.trim() || isRenaming}
              className="cursor-pointer text-xs font-semibold"
            >
              {isRenaming ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> Renaming…
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
