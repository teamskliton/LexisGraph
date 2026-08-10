"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  Shield,
  BookOpen,
  ExternalLink,
  Eye,
  BarChart3,
  Network,
  Tag,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";

import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { OrganizationSwitcher } from "@/components/layout/OrganizationSwitcher";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { organizationsService, Organization } from "@/services/api/organizations";
import { documentService, formatFileSize } from "@/services/document-service";
import { regulationsApi, GlobalRegulation } from "@/services/api/regulations";
import { DocumentResponse, DocumentStatusResponse, ProcessingStatus } from "@/types/document";
import { DocumentUpload } from "@/components/features/documents/DocumentUpload";
import { DocumentPreviewDrawer } from "@/components/features/documents/DocumentPreviewDrawer";
import type { OrganizationDocumentExtended } from "@/components/features/documents/documents-types";

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

type DocumentFilterTab = "ALL" | "POLICIES" | "REGULATIONS" | "PROCESSING" | "ANALYZED";

const STATUS_CONFIG: Record<ProcessingStatus, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  UPLOADED: {
    label: "Queued",
    badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    icon: <Clock className="h-3 w-3" />,
  },
  PROCESSING: {
    label: "Processing",
    badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  PROCESSED: {
    label: "Processed",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  FAILED: {
    label: "Failed",
    badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

function StatusBadge({ status }: { status: ProcessingStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.UPLOADED;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cfg.badgeClass}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Documents Main Page Component
// ---------------------------------------------------------------------------

export function DocumentsContent() {
  const { logout, user } = useAuth();
  const router = useRouter();

  // Active Organization state
  const [activeOrgId, setActiveOrgId] = useState<string>("");
  const [orgName, setOrgName] = useState<string>("");

  // Data states
  const [policies, setPolicies] = useState<DocumentResponse[]>([]);
  const [applicableRegulations, setApplicableRegulations] = useState<GlobalRegulation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<DocumentFilterTab>("ALL");

  // UI Modal & Drawer states
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [previewDoc, setPreviewDoc] = useState<OrganizationDocumentExtended | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentResponse | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Load Organization & Documents
  const loadWorkspaceData = useCallback(async () => {
    const orgId = typeof window !== "undefined" ? localStorage.getItem("selected_organization_id") : null;
    if (!orgId) {
      setIsLoading(false);
      return;
    }

    setActiveOrgId(orgId);
    setIsLoading(true);

    try {
      // Fetch Policies owned by org
      const policyData = await documentService.getDocuments(orgId);
      const onlyPolicies = (policyData || []).filter((d) => d.document_type === "POLICY");
      setPolicies(onlyPolicies);

      // Fetch Linked Applicable Regulations
      const regData = await regulationsApi.listRegulations(orgId, undefined, true);
      setApplicableRegulations(regData || []);

      // Fetch Org Name
      try {
        const orgInfo = await organizationsService.getOrganizationById(orgId);
        setOrgName(orgInfo.name || "Organization Workspace");
      } catch {
        setOrgName("Organization Workspace");
      }
    } catch (err) {
      console.error("Failed loading documents workspace:", err);
      toast.error("Failed to load organization documents.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaceData();
    const handleOrgChange = () => loadWorkspaceData();
    window.addEventListener("organization_changed", handleOrgChange);
    return () => window.removeEventListener("organization_changed", handleOrgChange);
  }, [loadWorkspaceData]);

  // Policy Deletion
  const handleDeletePolicy = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await documentService.deleteDocument(deleteTarget.id);
      toast.success(`Deleted '${deleteTarget.original_filename}'.`);
      setPolicies((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to delete policy document.");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Filtered Policies
  const filteredPolicies = useMemo(() => {
    let result = [...policies];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.original_filename.toLowerCase().includes(q) ||
          p.processing_status.toLowerCase().includes(q)
      );
    }
    if (activeTab === "PROCESSING") {
      result = result.filter((p) => p.processing_status === "PROCESSING" || p.processing_status === "UPLOADED");
    } else if (activeTab === "ANALYZED") {
      result = result.filter((p) => p.processing_status === "PROCESSED");
    }
    return result;
  }, [policies, searchQuery, activeTab]);

  // Filtered Regulations
  const filteredRegulations = useMemo(() => {
    let result = [...applicableRegulations];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          (r.title && r.title.toLowerCase().includes(q)) ||
          (r.act_name && r.act_name.toLowerCase().includes(q)) ||
          (r.jurisdiction && r.jurisdiction.toLowerCase().includes(q))
      );
    }
    return result;
  }, [applicableRegulations, searchQuery]);

  const showPolicies = activeTab === "ALL" || activeTab === "POLICIES" || activeTab === "PROCESSING" || activeTab === "ANALYZED";
  const showRegulations = activeTab === "ALL" || activeTab === "REGULATIONS";

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      {/* Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-600/20">
              <Layers className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold tracking-tight text-foreground">LexisGraph</span>
            <span className="text-muted-foreground">/</span>
            <OrganizationSwitcher onOrganizationChanged={loadWorkspaceData} />
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="bg-card border-border text-foreground hover:bg-muted text-xs gap-1.5 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/dashboard")}
              className="mb-1 -ml-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
            </Button>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground">
              <Shield className="h-6 w-6 text-indigo-500" />
              Documents Workspace
            </h1>
            <p className="text-xs text-muted-foreground max-w-xl">
              Manage internal company policies and linked statutory regulations for <span className="font-semibold text-foreground">{orgName}</span>.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Button
              onClick={() => setIsUploadOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-9 px-4 rounded-xl shadow-lg shadow-indigo-600/20 cursor-pointer gap-1.5 font-semibold"
            >
              <Upload className="h-4 w-4" /> Upload Policy
            </Button>
          </div>
        </div>

        {/* Toolbar & Search & Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border p-3 rounded-2xl shadow-xs">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {(["ALL", "POLICIES", "REGULATIONS", "PROCESSING", "ANALYZED"] as DocumentFilterTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === tab
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab === "ALL" && `All (${policies.length + applicableRegulations.length})`}
                {tab === "POLICIES" && `Policies (${policies.length})`}
                {tab === "REGULATIONS" && `Applicable Regulations (${applicableRegulations.length})`}
                {tab === "PROCESSING" && "Processing"}
                {tab === "ANALYZED" && "Analyzed"}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search policies or regulations…"
              className="bg-background border-border text-xs h-8 pl-8 text-foreground rounded-xl"
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-10">
            {/* SECTION 1: YOUR POLICIES */}
            {showPolicies && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-500" /> Your Policies ({filteredPolicies.length})
                  </h2>
                  <span className="text-[11px] text-muted-foreground">Organization-owned internal policies</span>
                </div>

                {filteredPolicies.length === 0 ? (
                  <Card className="p-8 bg-card border-border border-dashed rounded-2xl text-center space-y-3">
                    <Shield className="h-10 w-10 text-muted-foreground mx-auto" />
                    <h3 className="text-sm font-semibold text-foreground">No policy documents found</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Upload company policies (POSH, Privacy, Leave, IT) to evaluate them against statutory mandates.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => setIsUploadOpen(true)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-8 px-4 cursor-pointer gap-1.5"
                    >
                      <Upload className="h-3.5 w-3.5" /> Upload First Policy
                    </Button>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredPolicies.map((p) => (
                      <Card
                        key={p.id}
                        className="p-5 bg-card border-border rounded-2xl hover:border-indigo-500/50 transition-all flex flex-col justify-between space-y-4 shadow-sm dark:shadow-xl"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] uppercase font-mono">
                              Company Policy
                            </Badge>
                            <StatusBadge status={p.processing_status} />
                          </div>

                          <h3 className="font-bold text-sm text-foreground line-clamp-2" title={p.original_filename}>
                            {p.original_filename}
                          </h3>

                          <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/60">
                            <div>
                              <span className="block text-[10px] text-muted-foreground">File Size</span>
                              {formatFileSize(p.file_size)}
                            </div>
                            <div>
                              <span className="block text-[10px] text-muted-foreground">Uploaded</span>
                              {format(new Date(p.created_at), "MMM d, yyyy")}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() =>
                              setPreviewDoc({
                                id: p.id,
                                organizationId: p.organization_id,
                                name: p.original_filename,
                                category: "Policy",
                                file_size: formatFileSize(p.file_size),
                                file_type: "pdf",
                                version: "v1.0",
                                uploaded_at: p.created_at,
                                uploaded_by: "Org Admin",
                                status: p.processing_status === "PROCESSED" ? "Analysis Ready" : "Processing",
                                tags: ["Internal Policy"],
                              })
                            }
                            className="text-xs text-foreground hover:text-indigo-500 cursor-pointer h-7 px-2.5"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1 text-muted-foreground" /> Open
                          </Button>

                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => router.push(`/ai-assistant?policyId=${p.id}&question=${encodeURIComponent(`What are the major compliance gaps in ${p.original_filename}?`)}`)}
                              className="bg-background border-border text-xs text-indigo-600 dark:text-indigo-400 hover:bg-muted h-7 px-2 gap-1 cursor-pointer"
                              title="Ask AI about this policy"
                            >
                              <Sparkles className="h-3 w-3" /> Ask AI
                            </Button>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => router.push("/compliance")}
                              className="bg-background border-border text-xs text-indigo-600 dark:text-indigo-400 hover:bg-muted h-7 px-2 gap-1 cursor-pointer"
                            >
                              <Zap className="h-3 w-3" /> Analyze
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => router.push(`/knowledge-graph?focus=${encodeURIComponent(p.original_filename)}`)}
                              className="text-muted-foreground hover:text-purple-500 h-7 w-7 cursor-pointer"
                              title="Explore in Knowledge Graph"
                            >
                              <Network className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => setDeleteTarget(p)}
                              className="text-muted-foreground hover:text-rose-500 h-7 w-7 cursor-pointer"
                              title="Delete Policy"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 2: APPLICABLE REGULATIONS */}
            {showRegulations && (
              <div className="space-y-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-indigo-500" /> Applicable Regulations ({filteredRegulations.length})
                  </h2>
                  <span className="text-[11px] text-muted-foreground">Global statutory acts linked to this workspace</span>
                </div>

                {filteredRegulations.length === 0 ? (
                  <Card className="p-8 bg-card border-border border-dashed rounded-2xl text-center space-y-3">
                    <BookOpen className="h-10 w-10 text-muted-foreground mx-auto" />
                    <h3 className="text-sm font-semibold text-foreground">No applicable regulations linked</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Link global statutory acts (POSH Act 2013, DPDP Act 2023) to run compliance audits.
                    </p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredRegulations.map((r) => (
                      <Card
                        key={r.id}
                        className="p-5 bg-card border-border rounded-2xl hover:border-indigo-500/50 transition-all flex flex-col justify-between space-y-4 shadow-sm dark:shadow-xl"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <Badge className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 text-[10px] uppercase font-mono">
                              Statutory Act
                            </Badge>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {r.jurisdiction || "Global"}
                            </span>
                          </div>

                          <h3 className="font-bold text-sm text-foreground line-clamp-2" title={r.title || r.act_name}>
                            {r.title || r.act_name}
                          </h3>

                          <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/60">
                            <div>
                              <span className="block text-[10px] text-muted-foreground">Act Year</span>
                              {r.act_year || "2013"}
                            </div>
                            <div>
                              <span className="block text-[10px] text-muted-foreground">Authority</span>
                              {r.issuing_authority || "Ministry of Law"}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() =>
                              setPreviewDoc({
                                id: r.id,
                                organizationId: activeOrgId,
                                name: r.title || r.original_filename,
                                category: "Regulation",
                                file_size: formatFileSize(r.file_size),
                                file_type: "pdf",
                                version: r.version || "v1.0",
                                uploaded_at: new Date().toISOString(),
                                uploaded_by: "Global Repository",
                                status: "Knowledge Graph Ready",
                                tags: ["Statutory Act", r.jurisdiction || "Global"],
                              })
                            }
                            className="text-xs text-foreground hover:text-indigo-500 cursor-pointer h-7 px-2.5"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1 text-muted-foreground" /> Open
                          </Button>

                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => router.push(`/ai-assistant?regulationId=${r.id}&question=${encodeURIComponent(`Which company policies are affected by ${r.title || r.act_name}?`)}`)}
                              className="bg-background border-border text-xs text-indigo-600 dark:text-indigo-400 hover:bg-muted h-7 px-2 gap-1 cursor-pointer"
                              title="Ask AI about this regulation"
                            >
                              <Sparkles className="h-3 w-3" /> Ask AI
                            </Button>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => router.push(`/knowledge-graph?focus=${encodeURIComponent(r.title || r.act_name || "")}`)}
                              className="bg-background border-border text-xs text-purple-600 dark:text-purple-400 hover:bg-muted h-7 px-2 gap-1 cursor-pointer"
                            >
                              <Network className="h-3 w-3" /> Explore Graph
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Upload Policy Modal */}
        <DocumentUpload
          open={isUploadOpen}
          onOpenChange={setIsUploadOpen}
          organizationId={activeOrgId}
          onUploadSuccess={() => loadWorkspaceData()}
        />

        {/* Document Detail Drawer */}
        <DocumentPreviewDrawer
          document={previewDoc}
          open={!!previewDoc}
          onOpenChange={(op) => !op && setPreviewDoc(null)}
          onDelete={(id) => {
            const found = policies.find((p) => p.id === id);
            if (found) setDeleteTarget(found);
          }}
        />

        {/* Delete Policy Confirmation Modal */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-background border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2 text-rose-500">
                <AlertTriangle className="w-5 h-5 text-rose-500" /> Delete {deleteTarget.original_filename}?
              </h3>

              <p className="text-xs text-muted-foreground leading-relaxed">
                This will remove the policy document from <span className="font-semibold text-foreground">{orgName}</span>. Associated embeddings and compliance analysis indexes will be unlinked. This operation cannot be undone.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setDeleteTarget(null)}
                  className="text-xs h-8 text-muted-foreground cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeletePolicy}
                  disabled={isDeleting}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs h-8 px-4 cursor-pointer"
                >
                  {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm Deletion"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <ProtectedRoute>
      <DocumentsContent />
    </ProtectedRoute>
  );
}
