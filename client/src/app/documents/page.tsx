"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Layers,
  LogOut,
  ArrowLeft,
  Search,
  Trash2,
  FileText,
  Building2,
  Upload,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
} from "lucide-react";
import { format } from "date-fns";

import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { OrganizationSelector } from "@/components/features/upload/organization-selector";

import { organizationsService, Organization } from "@/services/api/organizations";
import {
  documentService,
  formatFileSize,
} from "@/services/document-service";
import {
  DocumentResponse,
  DocumentStatusResponse,
  DocumentType,
  ProcessingStatus,
} from "@/types/document";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;
const POLL_INTERVAL_MS = 5000; // 5 s

const ACTIVE_STATUSES: ProcessingStatus[] = ["UPLOADED", "PROCESSING"];

// ---------------------------------------------------------------------------
// Status display config
// ---------------------------------------------------------------------------

type StatusConfig = {
  label: string;
  badgeClass: string;
  icon: React.ReactNode;
};

const STATUS_CONFIG: Record<ProcessingStatus, StatusConfig> = {
  UPLOADED: {
    label: "Queued",
    badgeClass:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
    icon: <Clock className="h-3 w-3" />,
  },
  PROCESSING: {
    label: "Processing",
    badgeClass:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  PROCESSED: {
    label: "Processed",
    badgeClass:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  FAILED: {
    label: "Failed",
    badgeClass:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

const TYPE_CONFIG: Record<DocumentType, { dot: string; label: string }> = {
  REGULATION: { dot: "bg-indigo-500", label: "Regulation" },
  POLICY: { dot: "bg-emerald-500", label: "Policy" },
};


// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ProcessingStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.UPLOADED;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.badgeClass}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function TypeBadge({ type }: { type: DocumentType }) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.REGULATION;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

/** Shows progress bar + step label for UPLOADED / PROCESSING documents */
function ProcessingProgress({
  status,
  progress,
  currentStep,
}: {
  status: ProcessingStatus;
  progress: number;
  currentStep: string | null;
}) {
  if (status !== "UPLOADED" && status !== "PROCESSING") return null;
  const indicatorColor =
    status === "PROCESSING" ? "bg-blue-500" : "bg-amber-500";
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">
          {currentStep ?? "Queued…"}
        </span>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {progress}%
        </span>
      </div>
      <Progress
        value={progress}
        className="h-1.5"
        indicatorClassName={indicatorColor}
      />
    </div>
  );
}

/** Green success ribbon shown when a doc just reached PROCESSED */
function SuccessIndicator({ filename }: { filename: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5" />
      <span className="truncate">{filename} — ready</span>
    </div>
  );
}

function DocumentsTableSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 bg-card">
      <div className="flex items-center gap-2 border-b border-border/50 p-4">
        <Skeleton className="h-9 w-full max-w-xs" />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[32%]">Filename</TableHead>
            <TableHead className="w-[18%]">Organization</TableHead>
            <TableHead className="w-[10%]">Type</TableHead>
            <TableHead className="w-[14%]">Upload date</TableHead>
            <TableHead className="w-[18%]">Status / Progress</TableHead>
            <TableHead className="w-[8%] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-5 w-3/4" /></TableCell>
              <TableCell><Skeleton className="h-5 w-2/3" /></TableCell>
              <TableCell><Skeleton className="h-5 w-20" /></TableCell>
              <TableCell><Skeleton className="h-5 w-24" /></TableCell>
              <TableCell><Skeleton className="h-5 w-32 rounded-full" /></TableCell>
              <TableCell className="text-right"><Skeleton className="ml-auto h-8 w-8 rounded-md" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page content
// ---------------------------------------------------------------------------

function DocumentsPageContent() {
  const { logout } = useAuth();
  const router = useRouter();

  // ---------- Organizations ----------
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isOrgLoading, setIsOrgLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState("");
  const [orgError, setOrgError] = useState<string | undefined>();

  // ---------- Documents ----------
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [isDocsLoading, setIsDocsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // ---------- Live status overlay ----------
  // Map<documentId, DocumentStatusResponse> — populated by the poller
  const [liveStatus, setLiveStatus] = useState<
    Map<string, DocumentStatusResponse>
  >(new Map());

  // Track which document IDs just transitioned to PROCESSED so we can flash
  // the success indicator for a few seconds
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<string>>(
    new Set()
  );

  // ---------- Table UI ----------
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // ---------- Ref to avoid stale-closure in the interval ----------
  const documentsRef = useRef<DocumentResponse[]>(documents);
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  // ---------------------------------------------------------------------------
  // Load organizations
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await organizationsService.getOrganizations();
        if (!active) return;
        setOrganizations(data);
        if (data.length > 0) setOrganizationId(data[0].id);
      } catch {
        toast.error("Failed to load your organizations.");
      } finally {
        if (active) setIsOrgLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const org of organizations) map.set(org.id, org.name);
    return map;
  }, [organizations]);

  // ---------------------------------------------------------------------------
  // Load documents when org changes
  // ---------------------------------------------------------------------------
  const loadDocuments = useCallback(async (orgId: string) => {
    if (!orgId) return;
    setIsDocsLoading(true);
    try {
      const data = await documentService.getDocuments(orgId);
      setDocuments(data);
      // Seed liveStatus from the document list (progress/current_step are
      // already embedded in DocumentResponse from the backend)
      setLiveStatus((prev) => {
        const next = new Map(prev);
        for (const doc of data) {
          next.set(doc.id, {
            document_id: doc.id,
            status: doc.processing_status,
            progress: doc.progress ?? 0,
            current_step: doc.current_step ?? null,
            error_message: doc.error_message ?? null,
            processing_started_at: doc.processing_started_at ?? null,
            processed_at: doc.processed_at ?? null,
          });
        }
        return next;
      });
    } catch {
      toast.error("Failed to load documents.");
    } finally {
      setIsDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (organizationId) loadDocuments(organizationId);
  }, [organizationId, loadDocuments]);

  // ---------------------------------------------------------------------------
  // Live-status poller — runs every 5 s while any doc is UPLOADED/PROCESSING
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const getActiveIds = () =>
      documentsRef.current
        .filter((d) => ACTIVE_STATUSES.includes(d.processing_status))
        .map((d) => d.id);

    if (getActiveIds().length === 0) return;

    const poll = async () => {
      const ids = getActiveIds();
      if (ids.length === 0) return;

      const results = await Promise.allSettled(
        ids.map((id) => documentService.getDocumentStatus(id))
      );

      setLiveStatus((prev) => {
        const next = new Map(prev);
        for (const result of results) {
          if (result.status === "fulfilled") {
            const s = result.value;
            next.set(s.document_id, s);
          }
        }
        return next;
      });

      // Update document list status + detect transitions to PROCESSED
      setDocuments((prev) => {
        const updated = prev.map((doc) => {
          const live = results
            .filter((r) => r.status === "fulfilled")
            .map((r) => (r as PromiseFulfilledResult<DocumentStatusResponse>).value)
            .find((s) => s.document_id === doc.id);
          if (!live) return doc;
          return { ...doc, processing_status: live.status };
        });
        return updated;
      });

      // Flash success indicator for docs that just completed
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.status === "PROCESSED") {
          const id = result.value.document_id;
          setRecentlyCompleted((prev) => {
            if (prev.has(id)) return prev;
            const next = new Set(prev);
            next.add(id);
            // Remove after 6 seconds
            setTimeout(() => {
              setRecentlyCompleted((s) => {
                const ns = new Set(s);
                ns.delete(id);
                return ns;
              });
            }, 6000);
            return next;
          });
        }
      }
    };

    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [documents]); // re-subscribe when document list changes

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const handleDelete = async (documentId: string, filename: string) => {
    if (!window.confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    setDeletingId(documentId);
    try {
      await documentService.deleteDocument(documentId);
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
      setLiveStatus((prev) => {
        const next = new Map(prev);
        next.delete(documentId);
        return next;
      });
      toast.success(`"${filename}" deleted.`);
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      toast.error(
        axiosError.response?.data?.detail ?? "Failed to delete document."
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleRetry = async (documentId: string, filename: string) => {
    setRetryingId(documentId);
    try {
      const updated = await documentService.retryDocument(documentId);
      // Optimistically update local state
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === documentId
            ? { ...d, processing_status: updated.status }
            : d
        )
      );
      setLiveStatus((prev) => {
        const next = new Map(prev);
        next.set(documentId, updated);
        return next;
      });
      toast.success(`"${filename}" queued for reprocessing.`);
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      toast.error(
        axiosError.response?.data?.detail ?? "Failed to retry document."
      );
    } finally {
      setRetryingId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Search + pagination
  // ---------------------------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => {
      const orgName = orgNameById.get(d.organization_id) ?? "";
      return (
        d.original_filename.toLowerCase().includes(q) ||
        d.document_type.toLowerCase().includes(q) ||
        d.processing_status.toLowerCase().includes(q) ||
        orgName.toLowerCase().includes(q)
      );
    });
  }, [documents, search, orgNameById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  const hasProcessingDocs = documents.some((d) =>
    ACTIVE_STATUSES.includes(d.processing_status)
  );

  const hasNoOrganizations = organizations.length === 0 && !isOrgLoading;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background">
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

      <main className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
        {/* ── Page header ── */}
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
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              Documents
            </h1>
            <p className="text-muted-foreground">
              Browse, search, and manage your uploaded regulation and policy files.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Auto-refresh indicator */}
            {hasProcessingDocs && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" />
                Auto-refreshing
              </span>
            )}
            <Button
              onClick={() => router.push("/upload")}
              className="flex items-center gap-1.5"
            >
              <Upload className="h-4 w-4" />
              Upload Document
            </Button>
          </div>
        </div>

        {/* ── No organizations state ── */}
        {hasNoOrganizations ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/50 bg-muted/30 px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">You have no organizations</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Create an organization first, then upload documents to it.
            </p>
            <Button
              onClick={() => router.push("/organizations")}
              className="mt-2 flex items-center gap-1.5"
            >
              Create Organization
            </Button>
          </div>
        ) : (
          <>
            {/* ── Filters ── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="sm:max-w-xs sm:flex-1">
                <OrganizationSelector
                  value={organizationId}
                  onChange={(v) => {
                    setOrganizationId(v);
                    setOrgError(undefined);
                    setPage(1);
                  }}
                  organizations={organizations}
                  isLoading={isOrgLoading}
                  disabled={isDocsLoading}
                  error={orgError}
                />
              </div>
              <div className="relative sm:w-72">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search filename, type, status…"
                  className="pl-8"
                />
              </div>
            </div>

            {/* ── Table / Loading / Empty ── */}
            {isDocsLoading ? (
              <DocumentsTableSkeleton />
            ) : pageItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/50 bg-card/50 px-6 py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Inbox className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-foreground">
                  {documents.length === 0 ? "No documents yet" : "No matching documents"}
                </h2>
                <p className="max-w-md text-sm text-muted-foreground">
                  {documents.length === 0
                    ? "This organization has no uploaded documents. Upload a PDF to get started."
                    : "Try a different search term, or clear the search."}
                </p>
                {documents.length === 0 && (
                  <Button
                    onClick={() => router.push("/upload")}
                    className="mt-2 flex items-center gap-1.5"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Document
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="w-[32%]">Filename</TableHead>
                        <TableHead className="w-[16%]">Organization</TableHead>
                        <TableHead className="w-[10%]">Type</TableHead>
                        <TableHead className="w-[13%]">Upload date</TableHead>
                        <TableHead className="w-[21%]">Status / Progress</TableHead>
                        <TableHead className="w-[8%] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageItems.map((doc) => {
                        const live = liveStatus.get(doc.id);
                        const status = live?.status ?? doc.processing_status;
                        const progress = live?.progress ?? doc.progress ?? 0;
                        const currentStep = live?.current_step ?? doc.current_step ?? null;
                        const errorMessage = live?.error_message ?? doc.error_message ?? null;
                        const isActive = ACTIVE_STATUSES.includes(status);
                        const isFailed = status === "FAILED";
                        const isProcessed = status === "PROCESSED";
                        const isDeleting = deletingId === doc.id;
                        const isRetrying = retryingId === doc.id;
                        const justCompleted = recentlyCompleted.has(doc.id);

                        return (
                          <TableRow
                            key={doc.id}
                            className={
                              justCompleted
                                ? "bg-emerald-50/50 dark:bg-emerald-900/10 transition-colors duration-700"
                                : isFailed
                                  ? "bg-red-50/30 dark:bg-red-900/10"
                                  : ""
                            }
                          >
                            {/* ── Filename ── */}
                            <TableCell>
                              <div className="flex min-w-0 items-start gap-2">
                                <div
                                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${isProcessed
                                      ? "bg-emerald-100 dark:bg-emerald-900/30"
                                      : isFailed
                                        ? "bg-red-100 dark:bg-red-900/30"
                                        : isActive
                                          ? "bg-blue-100 dark:bg-blue-900/30"
                                          : "bg-muted"
                                    }`}
                                >
                                  <FileText
                                    className={`h-3.5 w-3.5 ${isProcessed
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : isFailed
                                          ? "text-red-500"
                                          : isActive
                                            ? "text-blue-500"
                                            : "text-muted-foreground"
                                      }`}
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium text-foreground text-sm">
                                    {doc.original_filename}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatFileSize(doc.file_size)}
                                  </p>
                                  {/* Success indicator */}
                                  {justCompleted && (
                                    <SuccessIndicator filename={doc.original_filename} />
                                  )}
                                  {/* Error detail */}
                                  {isFailed && errorMessage && (
                                    <p className="mt-1 truncate text-xs text-red-500 dark:text-red-400">
                                      {errorMessage}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            {/* ── Org ── */}
                            <TableCell className="text-sm text-muted-foreground">
                              {orgNameById.get(doc.organization_id) ?? "—"}
                            </TableCell>

                            {/* ── Type ── */}
                            <TableCell>
                              <TypeBadge type={doc.document_type} />
                            </TableCell>

                            {/* ── Date ── */}
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(doc.created_at), "MMM d, yyyy")}
                            </TableCell>

                            {/* ── Status + Progress ── */}
                            <TableCell>
                              <div className="space-y-1">
                                <StatusBadge status={status} />
                                {/* Progress bar (UPLOADED / PROCESSING only) */}
                                {isActive && (
                                  <ProcessingProgress
                                    status={status}
                                    progress={progress}
                                    currentStep={currentStep}
                                  />
                                )}
                                {/* Inline success indicator for PROCESSED */}
                                {isProcessed && (
                                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                    ✓ 100% complete
                                  </p>
                                )}
                              </div>
                            </TableCell>

                            {/* ── Actions ── */}
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {/* Retry button — FAILED only */}
                                {isFailed && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() =>
                                      handleRetry(doc.id, doc.original_filename)
                                    }
                                    disabled={isRetrying}
                                    aria-label={`Retry processing ${doc.original_filename}`}
                                    className="text-muted-foreground hover:text-blue-500"
                                    title="Retry processing"
                                  >
                                    {isRetrying ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <RefreshCw className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                                {/* Zap indicator while processing */}
                                {isActive && !isRetrying && (
                                  <span
                                    className="flex h-7 w-7 items-center justify-center text-blue-400"
                                    title="Processing…"
                                  >
                                    <Zap className="h-3.5 w-3.5 animate-pulse" />
                                  </span>
                                )}
                                {/* Delete button */}
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() =>
                                    handleDelete(doc.id, doc.original_filename)
                                  }
                                  disabled={isDeleting || isActive}
                                  aria-label={`Delete ${doc.original_filename}`}
                                  className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                                  title={
                                    isActive
                                      ? "Cannot delete while processing"
                                      : "Delete document"
                                  }
                                >
                                  {isDeleting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* ── Pagination ── */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-1">
                    <p className="text-sm text-muted-foreground">
                      Showing{" "}
                      <span className="font-medium text-foreground">
                        {(currentPage - 1) * PAGE_SIZE + 1}
                      </span>
                      –
                      <span className="font-medium text-foreground">
                        {Math.min(currentPage * PAGE_SIZE, filtered.length)}
                      </span>{" "}
                      of{" "}
                      <span className="font-medium text-foreground">
                        {filtered.length}
                      </span>{" "}
                      document{filtered.length === 1 ? "" : "s"}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        className="flex items-center gap-1"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Prev
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={currentPage >= totalPages}
                        className="flex items-center gap-1"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <ProtectedRoute>
      <DocumentsPageContent />
    </ProtectedRoute>
  );
}
