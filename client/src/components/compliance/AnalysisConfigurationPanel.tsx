// AnalysisConfigurationPanel — Modern Enterprise Compliance Analysis Configuration UI
// Route: /compliance/new
// Enforces a streamlined 3-step workflow: 1. Organization -> 2. Select Documents -> 3. Review & Run.
// Implements single-selection models, interactive document preview drawer, reactive readiness validation,
// and a persistent sticky execution action bar.

"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Building2,
  FileCheck2,
  BookOpen,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
  ArrowLeft,
  Upload,
  Clock,
  FileText,
  Info,
  Loader2,
  Search,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  ShieldCheck,
  Eye,
  X,
  FileCode,
  Tag,
  Hash,
  Scale,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import type { Organization } from "@/services/api/organizations";
import type { DocumentResponse } from "@/types/document";
import type { GlobalRegulation } from "@/services/api/regulations";
import { complianceService, ComplianceReport } from "@/services/api/compliance";

export interface AnalysisConfigurationPanelProps {
  organization: Organization | null;
  organizations: Organization[];
  onSelectOrganization: (id: string) => void;
  onRefresh?: () => void;
  policies: DocumentResponse[];
  regulations: GlobalRegulation[];
  latestReport: ComplianceReport | null;
  isLoading: boolean;
  error?: string | null;
}

type PolicyStatusFilter = "ALL" | "READY" | "PROCESSING" | "FAILED";

interface PreviewItem {
  type: "POLICY" | "REGULATION";
  policy?: DocumentResponse;
  regulation?: GlobalRegulation;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export const AnalysisConfigurationPanel: React.FC<AnalysisConfigurationPanelProps> = ({
  organization,
  organizations,
  onSelectOrganization,
  policies,
  regulations,
  isLoading,
  error,
}) => {
  const router = useRouter();

  // Single policy and single regulation selection (strictly 1 policy × 1 regulation)
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [selectedRegulationId, setSelectedRegulationId] = useState<string | null>(null);

  // Search & Filter state
  const [policySearch, setPolicySearch] = useState<string>("");
  const [policyStatusFilter, setPolicyStatusFilter] = useState<PolicyStatusFilter>("ALL");
  const [regulationSearch, setRegulationSearch] = useState<string>("");
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<string>("ALL");

  // In-app Document Preview Drawer state
  const [previewItem, setPreviewItem] = useState<PreviewItem | null>(null);

  // Accordion state for expected deliverables
  const [isDeliverablesOpen, setIsDeliverablesOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Business Logic: Strict workspace isolation
  // When organization changes, immediately clear previously selected policy from other workspace!
  const prevOrgIdRef = useRef<string | null>(organization?.id ?? null);
  useEffect(() => {
    if (organization?.id !== prevOrgIdRef.current) {
      prevOrgIdRef.current = organization?.id ?? null;
      setSelectedPolicyId(null);
    } else if (selectedPolicyId && !policies.some((p) => p.id === selectedPolicyId)) {
      setSelectedPolicyId(null);
    }
  }, [organization?.id, policies, selectedPolicyId]);

  // Regulations are global: ensure selected regulation still exists in catalog
  useEffect(() => {
    if (selectedRegulationId && !regulations.some((r) => r.id === selectedRegulationId)) {
      setSelectedRegulationId(null);
    }
  }, [regulations, selectedRegulationId]);

  // Selected policy object
  const selectedPolicy = useMemo(
    () => policies.find((p) => p.id === selectedPolicyId) || null,
    [policies, selectedPolicyId]
  );

  // Selected regulation object
  const selectedRegulation = useMemo(
    () => regulations.find((r) => r.id === selectedRegulationId) || null,
    [regulations, selectedRegulationId]
  );

  // Available jurisdictions extracted from global regulations
  const jurisdictions = useMemo(() => {
    const list = new Set<string>();
    regulations.forEach((r) => {
      if (r.jurisdiction && r.jurisdiction.trim()) {
        list.add(r.jurisdiction.trim());
      }
    });
    return Array.from(list).sort();
  }, [regulations]);

  // Filtered policies based on search query and status filter
  const filteredPolicies = useMemo(() => {
    return policies.filter((p) => {
      // Status filter
      if (policyStatusFilter === "READY" && p.processing_status !== "PROCESSED") return false;
      if (
        policyStatusFilter === "PROCESSING" &&
        p.processing_status !== "PROCESSING" &&
        p.processing_status !== "UPLOADED"
      ) {
        return false;
      }
      if (policyStatusFilter === "FAILED" && p.processing_status !== "FAILED") return false;

      // Search query
      if (!policySearch.trim()) return true;
      const query = policySearch.toLowerCase().trim();
      return p.original_filename?.toLowerCase().includes(query);
    });
  }, [policies, policySearch, policyStatusFilter]);

  // Filtered regulations based on search query and jurisdiction filter
  const filteredRegulations = useMemo(() => {
    return regulations.filter((reg) => {
      const matchesJurisdiction =
        selectedJurisdiction === "ALL" ||
        (reg.jurisdiction && reg.jurisdiction.toLowerCase() === selectedJurisdiction.toLowerCase());

      if (!matchesJurisdiction) return false;

      if (!regulationSearch.trim()) return true;
      const query = regulationSearch.toLowerCase().trim();
      const titleMatch = reg.title?.toLowerCase().includes(query);
      const officialMatch = reg.official_title?.toLowerCase().includes(query);
      const actMatch = reg.act_name?.toLowerCase().includes(query);
      const jurisMatch = reg.jurisdiction?.toLowerCase().includes(query);
      return Boolean(titleMatch || officialMatch || actMatch || jurisMatch);
    });
  }, [regulations, regulationSearch, selectedJurisdiction]);

  // Readiness calculations
  const hasOrg = Boolean(organization?.id);
  const hasPolicy = Boolean(selectedPolicy);
  const hasRegulation = Boolean(selectedRegulation);

  const policyProcessed = selectedPolicy?.processing_status === "PROCESSED";
  const policyProcessing =
    selectedPolicy?.processing_status === "PROCESSING" ||
    selectedPolicy?.processing_status === "UPLOADED";
  const policyFailed = selectedPolicy?.processing_status === "FAILED";

  const canProceed = hasOrg && hasPolicy && hasRegulation && policyProcessed;

  // Concise actionable validation message
  const actionableValidationMessage = useMemo(() => {
    if (!hasOrg) return "Select an active organization workspace to configure analysis.";
    if (!hasPolicy && !hasRegulation) return "Select a policy and a regulation to continue.";
    if (!hasPolicy) return "Select an internal policy document to evaluate.";
    if (!hasRegulation) return "Select a statutory regulation benchmark to compare against.";
    if (policyProcessing) return "Selected policy document is still processing. Please wait for completion.";
    if (policyFailed) return "Selected policy document processing failed. Choose a different file.";
    if (!policyProcessed) return "Selected policy document is not ready for analysis.";
    return "Ready to run analysis.";
  }, [hasOrg, hasPolicy, hasRegulation, policyProcessing, policyFailed, policyProcessed]);

  // Estimated scope calculation — only shown when reliable data is available
  const estimatedScopeText = useMemo(() => {
    if (!selectedPolicy) {
      return "Calculated after document selection";
    }
    const sizeBytes = selectedPolicy.file_size || 0;
    if (sizeBytes <= 0) {
      return "Not available";
    }
    const sizeKb = sizeBytes / 1024;
    const estClauses = Math.max(8, Math.round(sizeKb / 15));
    return `~${estClauses} Clauses estimated (${formatFileSize(sizeBytes)})`;
  }, [selectedPolicy]);

  // Execution handler
  const handleRunAnalysis = async () => {
    if (!canProceed || isSubmitting || !organization || !selectedPolicy || !selectedRegulation) {
      return;
    }

    setIsSubmitting(true);
    toast.info("Submitting compliance analysis request...");

    try {
      const res = await complianceService.analyzeCompliance({
        organization_id: organization.id,
        regulation_id: selectedRegulation.id,
        regulation_document_id: selectedRegulation.id,
        policy_document_id: selectedPolicy.id,
      });

      if (res.existing_report && res.report_id) {
        toast.success("Existing analysis report found. Loading report...");
        router.push(`/compliance/reports/${res.report_id}`);
      } else if (res.job_id) {
        toast.success("Analysis job initialized!");
        router.push(
          `/compliance/progress/${res.job_id}?org=${organization.id}&policy=${selectedPolicy.id}&reg=${selectedRegulation.id}`
        );
      } else {
        toast.error("Unexpected response from compliance service.");
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setIsSubmitting(false);
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to initiate compliance analysis. Please try again.";
      toast.error(detail);
    }
  };

  // Loading skeleton state
  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6 animate-pulse">
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <Skeleton className="h-44 rounded-xl" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <Card className="border border-destructive/30 bg-destructive/5 p-8 space-y-4">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
          <h2 className="text-lg font-bold text-foreground">Unable to load analysis configuration</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">{error}</p>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className="gap-2 cursor-pointer text-xs"
          >
            Retry Loading
          </Button>
        </Card>
      </div>
    );
  }

  // Empty workspace state
  if (!organization) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Card className="border border-border/80 bg-card p-10 space-y-5 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">No Organization Workspace Selected</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Please choose an active workspace organization to configure and initiate compliance evaluation.
            </p>
          </div>
          {organizations.length > 0 && (
            <div className="max-w-xs mx-auto">
              <select
                aria-label="Select an organization"
                onChange={(e) => onSelectOrganization(e.target.value)}
                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select workspace...</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
      {/* ── Page Header & Context ── */}
      <header className="space-y-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => router.push("/compliance")}
            className="hover:text-foreground transition-colors cursor-pointer flex items-center gap-1 font-medium"
          >
            <ArrowLeft className="h-3 w-3" /> Compliance
          </button>
          <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
          <span className="text-foreground font-semibold">New Analysis</span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              New Compliance Analysis
            </h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <span>Evaluating compliance for</span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground px-2.5 py-0.5 rounded-md bg-muted/60 border border-border/60 text-xs">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                {organization.name}
              </span>
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/compliance")}
            className="w-fit text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1.5 h-8 -ml-2 sm:ml-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Overview
          </Button>
        </div>
      </header>

      {/* ── 1. Select Documents (Two-Column Layout) ── */}
      <section aria-labelledby="step-1-heading" className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 id="step-1-heading" className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <span>1. Select Documents</span>
          </h2>
          <div className="flex items-center gap-3 text-xs">
            {(selectedPolicyId || selectedRegulationId) && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(selectedPolicyId || selectedRegulationId)}
                  onChange={() => {
                    setSelectedPolicyId(null);
                    setSelectedRegulationId(null);
                  }}
                  className="h-3.5 w-3.5 rounded border-border text-primary cursor-pointer accent-primary"
                  title="Unselect both policy and regulation"
                />
                <span className="font-medium text-foreground">Unselect All</span>
              </label>
            )}
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Each analysis compares one internal policy against one statutory regulation.
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ── LEFT: Internal Policy Selector ── */}
          <Card className="border border-border/60 bg-card p-4 sm:p-5 space-y-4 shadow-xs">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-primary shrink-0" />
                  <h3 className="text-sm font-bold text-foreground">Internal Policy</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose the workspace policy you want to evaluate.
                </p>
              </div>
              <Badge variant="outline" className="text-[11px] font-semibold shrink-0">
                {policies.length} {policies.length === 1 ? "document" : "documents"}
              </Badge>
            </div>

            {/* Search & Status Filter */}
            {policies.length > 0 && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={policySearch}
                    onChange={(e) => setPolicySearch(e.target.value)}
                    placeholder="Search policies by filename..."
                    className="w-full h-8 pl-8 pr-8 rounded-md border border-input bg-background/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {policySearch && (
                    <button
                      type="button"
                      onClick={() => setPolicySearch("")}
                      className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Status Filter Tabs (Only show if multiple policies exist) */}
                {policies.length > 2 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPolicyStatusFilter("ALL")}
                      className={cn(
                        "px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer",
                        policyStatusFilter === "ALL"
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      All ({policies.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPolicyStatusFilter("READY")}
                      className={cn(
                        "px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer",
                        policyStatusFilter === "READY"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Ready ({policies.filter((p) => p.processing_status === "PROCESSED").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPolicyStatusFilter("PROCESSING")}
                      className={cn(
                        "px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer",
                        policyStatusFilter === "PROCESSING"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Processing (
                      {
                        policies.filter(
                          (p) =>
                            p.processing_status === "PROCESSING" || p.processing_status === "UPLOADED"
                        ).length
                      }
                      )
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Unselect Policy Checkbox Control */}
            {policies.length > 0 && (
              <div className="flex items-center justify-between px-1 py-1.5 text-xs border-b border-border/40">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedPolicyId)}
                    onChange={() => setSelectedPolicyId(null)}
                    disabled={!selectedPolicyId}
                    className="h-3.5 w-3.5 rounded border-border text-primary cursor-pointer accent-primary disabled:opacity-40"
                    title={selectedPolicyId ? "Click to unselect policy" : "No policy selected"}
                  />
                  <span className={cn(selectedPolicyId ? "text-foreground font-medium" : "text-muted-foreground")}>
                    {selectedPolicyId ? "1 Policy Selected (Click to unselect)" : "No policy selected"}
                  </span>
                </label>
                {selectedPolicyId && (
                  <button
                    type="button"
                    onClick={() => setSelectedPolicyId(null)}
                    className="text-[11px] text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                  >
                    Unselect
                  </button>
                )}
              </div>
            )}

            {/* Policy List / Empty States */}
            {policies.length === 0 ? (
              <div className="p-6 rounded-lg border border-dashed border-border/60 bg-muted/10 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-muted/40 text-muted-foreground flex items-center justify-center mx-auto">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-foreground">No policies available in this workspace.</p>
                  <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                    Upload an organizational internal policy (PDF) to evaluate it against statutory regulations.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push("/documents")}
                  className="gap-1.5 cursor-pointer text-xs h-8"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload Policy
                </Button>
              </div>
            ) : filteredPolicies.length === 0 ? (
              <div className="p-6 rounded-lg border border-dashed border-border/60 bg-muted/10 text-center space-y-2">
                <p className="text-xs text-muted-foreground">No policies match your filters.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPolicySearch("");
                    setPolicyStatusFilter("ALL");
                  }}
                  className="text-xs h-7 text-primary cursor-pointer"
                >
                  Reset Filters
                </Button>
              </div>
            ) : (
              <div
                role="radiogroup"
                aria-label="Internal Policies"
                className="space-y-2 max-h-[380px] overflow-y-auto pr-1"
              >
                {filteredPolicies.map((pol) => {
                  const isSelected = selectedPolicyId === pol.id;
                  const isProcessed = pol.processing_status === "PROCESSED";
                  const isProcessing =
                    pol.processing_status === "PROCESSING" || pol.processing_status === "UPLOADED";
                  const isFailed = pol.processing_status === "FAILED";

                  return (
                    <div
                      key={pol.id}
                      role="radio"
                      aria-checked={isSelected}
                      aria-disabled={!isProcessed}
                      tabIndex={isProcessed ? 0 : -1}
                      onClick={() => {
                        if (isProcessed) {
                          setSelectedPolicyId((prev) => (prev === pol.id ? null : pol.id));
                        } else if (isProcessing) {
                          toast.info("This document is still being processed. Please wait for completion.");
                        } else if (isFailed) {
                          toast.error("Document processing failed. Please upload a valid document.");
                        }
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && isProcessed) {
                          e.preventDefault();
                          setSelectedPolicyId((prev) => (prev === pol.id ? null : pol.id));
                        }
                      }}
                      className={cn(
                        "p-3 rounded-lg border flex items-center justify-between gap-3 transition-all text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                        !isProcessed && "opacity-60 cursor-not-allowed bg-muted/10 border-border/40",
                        isProcessed &&
                          !isSelected &&
                          "border-border/60 bg-card hover:bg-muted/30 hover:border-border cursor-pointer",
                        isSelected &&
                          "border-primary/80 bg-primary/5 dark:bg-primary/10 shadow-xs ring-1 ring-primary/40 cursor-pointer"
                      )}
                    >
                      {/* Left: Radio & Filename */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40 bg-background"
                          )}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                        </div>

                        <div className="min-w-0">
                          <p
                            className="font-semibold text-foreground truncate max-w-[180px] sm:max-w-[240px]"
                            title={pol.original_filename}
                          >
                            {pol.original_filename}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                            <span>
                              Updated {format(new Date(pol.updated_at || pol.created_at), "MMM d, yyyy")}
                            </span>
                            <span>•</span>
                            <span>{formatFileSize(pol.file_size)}</span>
                          </p>
                        </div>
                      </div>

                      {/* Right: Status Badge & Preview Action */}
                      <div className="shrink-0 flex items-center gap-2">
                        {isProcessed && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          >
                            Ready
                          </Badge>
                        )}
                        {isProcessing && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1"
                          >
                            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Processing
                          </Badge>
                        )}
                        {isFailed && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-semibold bg-destructive/10 text-destructive border-destructive/20"
                          >
                            Failed
                          </Badge>
                        )}

                        {/* Preview button */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewItem({ type: "POLICY", policy: pol });
                          }}
                          title="Preview document details"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer rounded-md"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* ── RIGHT: Regulation Selector ── */}
          <Card className="border border-border/60 bg-card p-4 sm:p-5 space-y-4 shadow-xs">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary shrink-0" />
                  <h3 className="text-sm font-bold text-foreground">Regulation</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose the statutory regulation to compare against your policy.
                </p>
              </div>
              <Badge variant="outline" className="text-[11px] font-semibold shrink-0">
                {filteredRegulations.length} of {regulations.length}
              </Badge>
            </div>

            {/* Search & Jurisdiction Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={regulationSearch}
                  onChange={(e) => setRegulationSearch(e.target.value)}
                  placeholder="Search regulations..."
                  className="w-full h-8 pl-8 pr-8 rounded-md border border-input bg-background/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {regulationSearch && (
                  <button
                    type="button"
                    onClick={() => setRegulationSearch("")}
                    className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Jurisdiction Dropdown */}
              {jurisdictions.length > 0 && (
                <select
                  aria-label="Filter by jurisdiction"
                  value={selectedJurisdiction}
                  onChange={(e) => setSelectedJurisdiction(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background/80 px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary shrink-0 cursor-pointer"
                >
                  <option value="ALL">All Jurisdictions ({regulations.length})</option>
                  {jurisdictions.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Unselect Regulation Checkbox Control */}
            {regulations.length > 0 && (
              <div className="flex items-center justify-between px-1 py-1.5 text-xs border-b border-border/40">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedRegulationId)}
                    onChange={() => setSelectedRegulationId(null)}
                    disabled={!selectedRegulationId}
                    className="h-3.5 w-3.5 rounded border-border text-primary cursor-pointer accent-primary disabled:opacity-40"
                    title={selectedRegulationId ? "Click to unselect regulation" : "No regulation selected"}
                  />
                  <span className={cn(selectedRegulationId ? "text-foreground font-medium" : "text-muted-foreground")}>
                    {selectedRegulationId ? "1 Regulation Selected (Click to unselect)" : "No regulation selected"}
                  </span>
                </label>
                {selectedRegulationId && (
                  <button
                    type="button"
                    onClick={() => setSelectedRegulationId(null)}
                    className="text-[11px] text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                  >
                    Unselect
                  </button>
                )}
              </div>
            )}

            {/* Regulations List / States */}
            {regulations.length === 0 ? (
              <div className="p-6 rounded-lg border border-dashed border-border/60 bg-muted/10 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-muted/40 text-muted-foreground flex items-center justify-center mx-auto">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-foreground">No regulations available in catalog.</p>
                  <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                    Statutory acts are managed globally. Check catalog connectivity or permissions.
                  </p>
                </div>
              </div>
            ) : filteredRegulations.length === 0 ? (
              <div className="p-6 rounded-lg border border-dashed border-border/60 bg-muted/10 text-center space-y-2">
                <p className="text-xs text-muted-foreground">No regulations match your filter criteria.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRegulationSearch("");
                    setSelectedJurisdiction("ALL");
                  }}
                  className="text-xs h-7 text-primary cursor-pointer"
                >
                  Reset Filters
                </Button>
              </div>
            ) : (
              <div
                role="radiogroup"
                aria-label="Statutory Regulations"
                className="space-y-2 max-h-[380px] overflow-y-auto pr-1"
              >
                {filteredRegulations.map((reg) => {
                  const isSelected = selectedRegulationId === reg.id;
                  const regTitle = reg.title || reg.act_name || reg.official_title || "Unnamed Regulation";

                  return (
                    <div
                      key={reg.id}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onClick={() => setSelectedRegulationId((prev) => (prev === reg.id ? null : reg.id))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedRegulationId((prev) => (prev === reg.id ? null : reg.id));
                        }
                      }}
                      className={cn(
                        "p-3 rounded-lg border flex items-center justify-between gap-3 cursor-pointer transition-all text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                        isSelected
                          ? "border-primary/80 bg-primary/5 dark:bg-primary/10 shadow-xs ring-1 ring-primary/40"
                          : "border-border/60 bg-card hover:bg-muted/30 hover:border-border"
                      )}
                    >
                      {/* Left: Radio & Details */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40 bg-background"
                          )}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                        </div>

                        <div className="min-w-0">
                          <p
                            className="font-semibold text-foreground truncate max-w-[180px] sm:max-w-[240px]"
                            title={regTitle}
                          >
                            {regTitle}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                            <span>{reg.jurisdiction || "Global"}</span>
                            {reg.act_year && <span>({reg.act_year})</span>}
                            {reg.version && <span>• v{reg.version}</span>}
                          </p>
                        </div>
                      </div>

                      {/* Right: Badge & Preview Action */}
                      <div className="shrink-0 flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-[9px] font-semibold uppercase bg-muted/40 border-border/60 text-muted-foreground"
                        >
                          Benchmark
                        </Badge>

                        {/* Preview button */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewItem({ type: "REGULATION", regulation: reg });
                          }}
                          title="Preview regulation metadata"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer rounded-md"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </section>

      {/* ── STEP 2: Review & Run (Readiness & Summary) ── */}
      <section aria-labelledby="step-2-heading" className="space-y-4">
        <Card className="border border-border/60 bg-card p-4 sm:p-5 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
              <h2 id="step-2-heading" className="text-sm font-bold uppercase tracking-wider text-foreground">
                2. Review & Run
              </h2>
            </div>

            <Badge
              variant="outline"
              className={cn(
                "text-xs px-2.5 py-0.5 font-bold uppercase tracking-wide w-fit",
                canProceed
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
              )}
            >
              {canProceed ? "Ready to Run Analysis" : "Action Required"}
            </Badge>
          </div>

          {/* 4-Item Readiness Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* 1: Workspace */}
            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold text-foreground">Organization</p>
                <p className="text-[11px] text-muted-foreground truncate" title={organization.name}>
                  {organization.name}
                </p>
              </div>
            </div>

            {/* 2: Policy Document */}
            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 flex items-start gap-2.5">
              {hasPolicy ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-foreground">Policy Selected</p>
                <p
                  className="text-[11px] text-muted-foreground truncate"
                  title={selectedPolicy ? selectedPolicy.original_filename : "Action: Select policy above"}
                >
                  {selectedPolicy ? selectedPolicy.original_filename : "Select a policy to continue"}
                </p>
              </div>
            </div>

            {/* 3: Regulation Document */}
            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 flex items-start gap-2.5">
              {hasRegulation ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-foreground">Regulation Selected</p>
                <p
                  className="text-[11px] text-muted-foreground truncate"
                  title={
                    selectedRegulation
                      ? selectedRegulation.title || selectedRegulation.act_name
                      : "Action: Select regulation above"
                  }
                >
                  {selectedRegulation
                    ? selectedRegulation.title || selectedRegulation.act_name
                    : "Select a regulation to continue"}
                </p>
              </div>
            </div>

            {/* 4: Processing & GraphRAG */}
            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 flex items-start gap-2.5">
              {policyProcessed ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              ) : policyFailed ? (
                <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-foreground">Document Readiness</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {policyProcessed
                    ? "Ready for Analysis & GraphRAG"
                    : selectedPolicy
                    ? `Status: ${selectedPolicy.processing_status}`
                    : "Awaiting document selection"}
                </p>
              </div>
            </div>
          </div>

          {/* Actionable Callout Banner */}
          <div
            className={cn(
              "p-3 rounded-lg border text-xs flex items-center justify-between gap-3",
              canProceed
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                : "bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300"
            )}
          >
            <div className="flex items-center gap-2">
              {canProceed ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              )}
              <span className="font-medium">{actionableValidationMessage}</span>
            </div>

            {estimatedScopeText !== "Calculated after document selection" && (
              <span className="text-[11px] opacity-90 hidden sm:inline">{estimatedScopeText}</span>
            )}
          </div>
        </Card>

        {/* Collapsible: What will this analysis generate? */}
        <Card className="border border-border/60 bg-card overflow-hidden shadow-xs">
          <button
            type="button"
            onClick={() => setIsDeliverablesOpen((prev) => !prev)}
            className="w-full p-4 text-left flex items-center justify-between gap-2 hover:bg-muted/20 transition-colors cursor-pointer"
          >
            <span className="text-xs font-semibold text-foreground flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              What will this analysis generate?
            </span>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{isDeliverablesOpen ? "Hide Deliverables" : "View Deliverables"}</span>
              {isDeliverablesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </button>

          {isDeliverablesOpen && (
            <div className="p-4 pt-1 border-t border-border/40 bg-muted/10 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 rounded-lg border border-border/40 bg-card/60 flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">Executive Compliance Summary</p>
                    <p className="text-[11px] text-muted-foreground">
                      High-level compliance score, overall rating, and executive narrative.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-border/40 bg-card/60 flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">Clause-by-Clause Findings</p>
                    <p className="text-[11px] text-muted-foreground">
                      Detailed requirement-level verification and matched policy citations.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-border/40 bg-card/60 flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">Regulatory Gap Analysis</p>
                    <p className="text-[11px] text-muted-foreground">
                      Identification of uncovered statutory mandates and policy omissions.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-border/40 bg-card/60 flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">Actionable Recommendations</p>
                    <p className="text-[11px] text-muted-foreground">
                      Prioritized steps to remediate identified gaps and achieve compliance.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-border/40 bg-card/60 flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">Knowledge Graph Evidence</p>
                    <p className="text-[11px] text-muted-foreground">
                      Interactive traceability links connecting policy text with statutory acts.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-border/40 bg-card/60 flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">Compliance Report</p>
                    <p className="text-[11px] text-muted-foreground">
                      Audit-ready, exportable report for internal and legal audit review.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* ── STICKY FOOTER: Execution Action Bar ── */}
      <aside
        aria-label="Analysis Actions"
        className="sticky bottom-4 z-20 rounded-xl border border-border/60 bg-card/95 backdrop-blur-md p-4 sm:p-5 shadow-lg"
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Left: Reactive Status */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                "w-2.5 h-2.5 rounded-full shrink-0",
                canProceed ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              )}
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">
                {canProceed ? "Ready to analyze" : "Configuration incomplete"}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {canProceed
                  ? `Evaluating ${selectedPolicy?.original_filename} against ${
                      selectedRegulation?.title || selectedRegulation?.act_name
                    }`
                  : actionableValidationMessage}
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center justify-end gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/compliance")}
              disabled={isSubmitting}
              className="text-xs h-9 cursor-pointer"
            >
              Cancel
            </Button>

            <Button
              onClick={handleRunAnalysis}
              disabled={!canProceed || isSubmitting}
              size="sm"
              className={cn(
                "text-xs font-semibold h-9 px-5 gap-2 cursor-pointer transition-all",
                canProceed
                  ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm shadow-primary/30"
                  : "opacity-50 cursor-not-allowed"
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Starting Analysis...</span>
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5 fill-current" />
                  <span>Run Analysis</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </aside>

      {/* ── IN-APP DOCUMENT PREVIEW DRAWER ── */}
      <Sheet open={Boolean(previewItem)} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md p-6 space-y-6 overflow-y-auto">
          {previewItem?.type === "POLICY" && previewItem.policy && (
            <>
              <SheetHeader className="p-0 space-y-2 border-b border-border/40 pb-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="text-base font-bold text-foreground truncate">
                      {previewItem.policy.original_filename}
                    </SheetTitle>
                    <SheetDescription className="text-xs text-muted-foreground">
                      Workspace Internal Policy Document
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              {/* Policy Metadata Breakdown */}
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Status
                    </span>
                    <span className="text-xs font-semibold text-foreground mt-0.5 block">
                      {previewItem.policy.processing_status}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      File Size
                    </span>
                    <span className="text-xs font-semibold text-foreground mt-0.5 block">
                      {formatFileSize(previewItem.policy.file_size)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border/40 pt-4">
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Uploaded:</span>
                    <span className="font-medium text-foreground">
                      {format(new Date(previewItem.policy.created_at), "MMM d, yyyy · HH:mm")}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Last Updated:</span>
                    <span className="font-medium text-foreground">
                      {format(new Date(previewItem.policy.updated_at), "MMM d, yyyy · HH:mm")}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">MIME Type:</span>
                    <span className="font-medium text-foreground">{previewItem.policy.mime_type}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Document ID:</span>
                    <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[200px]">
                      {previewItem.policy.id}
                    </span>
                  </div>
                </div>

                {/* Quick Selection Toggle within Preview */}
                <div className="pt-4 border-t border-border/40 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {selectedPolicyId === previewItem.policy.id
                      ? "Currently selected for analysis"
                      : "Not selected"}
                  </span>
                  {selectedPolicyId !== previewItem.policy.id ? (
                    <Button
                      size="sm"
                      disabled={previewItem.policy.processing_status !== "PROCESSED"}
                      onClick={() => {
                        setSelectedPolicyId(previewItem.policy!.id);
                        setPreviewItem(null);
                        toast.success(`Selected "${previewItem.policy!.original_filename}"`);
                      }}
                      className="text-xs h-8 cursor-pointer"
                    >
                      Select Policy
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedPolicyId(null);
                        setPreviewItem(null);
                      }}
                      className="text-xs h-8 cursor-pointer"
                    >
                      Deselect
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {previewItem?.type === "REGULATION" && previewItem.regulation && (
            <>
              <SheetHeader className="p-0 space-y-2 border-b border-border/40 pb-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="text-base font-bold text-foreground truncate">
                      {previewItem.regulation.title || previewItem.regulation.act_name}
                    </SheetTitle>
                    <SheetDescription className="text-xs text-muted-foreground">
                      Statutory Regulatory Benchmark
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              {/* Regulation Metadata Breakdown */}
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Jurisdiction
                    </span>
                    <span className="text-xs font-semibold text-foreground mt-0.5 block">
                      {previewItem.regulation.jurisdiction || "Global"}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Act Year
                    </span>
                    <span className="text-xs font-semibold text-foreground mt-0.5 block">
                      {previewItem.regulation.act_year || "N/A"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border/40 pt-4">
                  {previewItem.regulation.official_title && (
                    <div className="py-1">
                      <span className="text-muted-foreground block">Official Title:</span>
                      <span className="font-medium text-foreground mt-0.5 block">
                        {previewItem.regulation.official_title}
                      </span>
                    </div>
                  )}
                  {previewItem.regulation.version && (
                    <div className="flex justify-between py-1">
                      <span className="text-muted-foreground">Version:</span>
                      <span className="font-medium text-foreground">
                        v{previewItem.regulation.version}
                      </span>
                    </div>
                  )}
                  {previewItem.regulation.issuing_authority && (
                    <div className="flex justify-between py-1">
                      <span className="text-muted-foreground">Authority:</span>
                      <span className="font-medium text-foreground">
                        {previewItem.regulation.issuing_authority}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Regulation ID:</span>
                    <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[200px]">
                      {previewItem.regulation.id}
                    </span>
                  </div>
                </div>

                {/* Quick Selection Toggle within Preview */}
                <div className="pt-4 border-t border-border/40 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {selectedRegulationId === previewItem.regulation.id
                      ? "Currently selected for analysis"
                      : "Not selected"}
                  </span>
                  {selectedRegulationId !== previewItem.regulation.id ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedRegulationId(previewItem.regulation!.id);
                        setPreviewItem(null);
                        toast.success(
                          `Selected "${
                            previewItem.regulation!.title || previewItem.regulation!.act_name
                          }"`
                        );
                      }}
                      className="text-xs h-8 cursor-pointer"
                    >
                      Select Regulation
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedRegulationId(null);
                        setPreviewItem(null);
                      }}
                      className="text-xs h-8 cursor-pointer"
                    >
                      Deselect
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
