// AnalysisConfigurationPanel — Analysis Configuration UI Panel
// Validates organizational readiness and summarizes selected policies/regulations before initiating an analysis.

"use client";

import React, { useState, useMemo } from "react";
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
  Network,
  Clock,
  FileText,
  HelpCircle,
  Sparkles,
  Info,
  Loader2,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { Organization } from "@/services/api/organizations";
import type { DocumentResponse } from "@/types/document";
import type { GlobalRegulation } from "@/services/api/regulations";
import { complianceService, ComplianceReport } from "@/services/api/compliance";

interface AnalysisConfigurationPanelProps {
  organization: Organization | null;
  organizations: Organization[];
  onSelectOrganization: (id: string) => void;
  policies: DocumentResponse[];
  regulations: GlobalRegulation[];
  latestReport: ComplianceReport | null;
  isLoading: boolean;
}

export const AnalysisConfigurationPanel: React.FC<AnalysisConfigurationPanelProps> = ({
  organization,
  organizations,
  onSelectOrganization,
  policies,
  regulations,
  latestReport,
  isLoading,
}) => {
  const router = useRouter();

  // Selected document state (users can choose specific policies & regulations for analysis)
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<string[]>(() =>
    policies.map((p) => p.id)
  );

  const [selectedRegulationIds, setSelectedRegulationIds] = useState<string[]>(() =>
    regulations.map((r) => r.id)
  );

  // Sync selected IDs when loaded policies/regulations change
  React.useEffect(() => {
    if (policies.length > 0 && selectedPolicyIds.length === 0) {
      setSelectedPolicyIds(policies.map((p) => p.id));
    }
  }, [policies]);

  React.useEffect(() => {
    if (regulations.length > 0 && selectedRegulationIds.length === 0) {
      setSelectedRegulationIds(regulations.map((r) => r.id));
    }
  }, [regulations]);

  // Section 2 Policies Data
  const selectedPolicies = useMemo(
    () => policies.filter((p) => selectedPolicyIds.includes(p.id)),
    [policies, selectedPolicyIds]
  );

  // Section 3 Regulations Data
  const selectedRegulations = useMemo(
    () => regulations.filter((r) => selectedRegulationIds.includes(r.id)),
    [regulations, selectedRegulationIds]
  );

  // Section 4 Readiness Checklist Calculations (Backend data only)
  const hasOrg = Boolean(organization?.id);
  const hasPolicies = selectedPolicies.length > 0;
  const hasRegulations = selectedRegulations.length > 0;

  const policiesProcessed = useMemo(() => {
    if (selectedPolicies.length === 0) return false;
    return selectedPolicies.every((p) => p.processing_status === "PROCESSED");
  }, [selectedPolicies]);

  const regulationsProcessed = useMemo(() => {
    if (selectedRegulations.length === 0) return false;
    return selectedRegulations.every(
      (r) => r.processing_status === "PROCESSED" || r.processing_status === "ACTIVE" || !r.processing_status
    );
  }, [selectedRegulations]);

  const canProceed = hasOrg && hasPolicies && hasRegulations && policiesProcessed;

  // Reason why Run Analysis is disabled
  const disabledReason = useMemo(() => {
    if (!hasOrg) return "No organization workspace selected.";
    if (!hasPolicies) return "Select at least one policy document to analyze.";
    if (!hasRegulations) return "Select at least one regulation benchmark.";
    if (!policiesProcessed) return "One or more selected policy documents are still processing or failed.";
    return "";
  }, [hasOrg, hasPolicies, hasRegulations, policiesProcessed]);

  // Section 5 Analysis Summary Calculations
  const lastAnalysisDate = useMemo(() => {
    if (latestReport?.created_at) {
      return format(new Date(latestReport.created_at), "MMM d, yyyy");
    }
    return "No previous analysis";
  }, [latestReport]);

  const estimatedScopeText = useMemo(() => {
    const totalSizeKb = selectedPolicies.reduce((acc, p) => acc + (p.file_size || 0), 0) / 1024;
    const estClauses = Math.max(selectedPolicies.length * 8, Math.round(totalSizeKb / 15));
    return `~${estClauses} Clauses & Requirements across ${selectedPolicies.length} policy file${selectedPolicies.length > 1 ? "s" : ""}`;
  }, [selectedPolicies]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const togglePolicySelect = (id: string) => {
    setSelectedPolicyIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleRegulationSelect = (id: string) => {
    setSelectedRegulationIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleRunAnalysis = async () => {
    if (!canProceed || isSubmitting || !organization) return;

    setIsSubmitting(true);
    toast.info("Submitting compliance analysis request...");

    try {
      const firstPolicyId = selectedPolicies[0]?.id;
      const firstRegId = selectedRegulations[0]?.id || "";

      const res = await complianceService.analyzeCompliance({
        organization_id: organization.id,
        regulation_id: firstRegId,
        regulation_document_id: firstRegId,
        policy_document_id: firstPolicyId,
      });

      if (res.existing_report && res.report_id) {
        toast.success("Existing report reused for identical parameters!");
        router.push(`/compliance/reports/${res.report_id}`);
      } else if (res.job_id) {
        toast.success("Analysis request accepted!");
        router.push(
          `/compliance/progress/${res.job_id}?org=${organization.id}&policy=${firstPolicyId}&reg=${firstRegId}`
        );
      } else {
        toast.error("Unexpected response from compliance service.");
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setIsSubmitting(false);
      const detail = err?.response?.data?.detail || "Failed to submit compliance analysis request.";
      toast.error(detail);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  // EMPTY STATE: No Organization Selected
  if (!organization) {
    return (
      <Card className="border border-dashed border-border/60 bg-muted/10 p-10 text-center max-w-2xl mx-auto space-y-4">
        <Building2 className="h-12 w-12 text-muted-foreground mx-auto" />
        <div>
          <h3 className="text-base font-bold text-foreground">No Organization Selected</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Please select an active workspace organization to configure compliance analysis parameters.
          </p>
        </div>
        {organizations.length > 0 && (
          <select
            onChange={(e) => onSelectOrganization(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-xs font-semibold text-foreground focus:outline-none"
          >
            <option value="">Select an organization...</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Page Header Title & Subtitle */}
      <div className="flex flex-col gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/compliance")}
          className="w-fit -ml-2 text-muted-foreground hover:text-foreground cursor-pointer gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Compliance Home
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              Analysis Configuration
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review the selected data before starting compliance analysis.
            </p>
          </div>
          <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 text-xs px-3 py-1">
            Pre-Execution Setup
          </Badge>
        </div>
      </div>

      {/* SECTION 1: ORGANIZATION */}
      <Card className="border border-border/60 bg-card p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-indigo-500" /> Section 1 — Organization
              </span>
            </div>
            <h2 className="text-lg font-bold text-foreground">{organization.name}</h2>
            <p className="text-xs text-muted-foreground">
              Workspace ID: <code className="text-foreground font-mono">{organization.id}</code>
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="p-3 rounded-lg border border-border/40 bg-muted/20 text-right">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Compliance Score</span>
              <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">
                {latestReport?.overall_score != null ? `${latestReport.overall_score}%` : "No Score Yet"}
              </span>
            </div>

            <div className="p-3 rounded-lg border border-border/40 bg-muted/20 text-right">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Last Analysis</span>
              <span className="text-xs font-semibold text-foreground">{lastAnalysisDate}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* 2-COLUMN LAYOUT FOR SECTIONS 2 & 3 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* SECTION 2: POLICIES */}
        <Card className="border border-border/60 bg-card p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileCheck2 className="h-4 w-4 text-info" /> Section 2 — Policies ({policies.length})
              </span>
              <Badge variant="outline" className="text-[10px]">
                {selectedPolicies.length} Selected
              </Badge>
            </div>

            {policies.length === 0 ? (
              /* Informative Empty State for Policies */
              <div className="p-6 rounded-xl border border-dashed border-border/60 bg-muted/10 text-center space-y-2 my-2">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
                <h4 className="text-xs font-bold text-foreground">No Policies Uploaded</h4>
                <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                  Upload your organization internal policy documents (PDF) to evaluate them against regulations.
                </p>
                <Button
                  size="xs"
                  onClick={() => router.push("/documents")}
                  className="gap-1.5 cursor-pointer text-xs mt-2"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload Policy
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {policies.map((pol) => {
                  const isSelected = selectedPolicyIds.includes(pol.id);
                  const isProcessed = pol.processing_status === "PROCESSED";

                  return (
                    <div
                      key={pol.id}
                      role="checkbox"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onClick={() => togglePolicySelect(pol.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          togglePolicySelect(pol.id);
                        }
                      }}
                      className={cn(
                        "p-3 rounded-lg border flex items-center justify-between gap-3 cursor-pointer transition-all text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset",
                        isSelected
                          ? "border-primary/50 bg-primary/5"
                          : "border-border/40 bg-muted/10 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="h-3.5 w-3.5 rounded border-border text-primary cursor-pointer"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{pol.original_filename}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Updated: {format(new Date(pol.updated_at || pol.created_at), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] uppercase font-bold",
                            isProcessed
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                          )}
                        >
                          {pol.processing_status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* SECTION 3: REGULATIONS */}
        <Card className="border border-border/60 bg-card p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <BookOpen className="h-4 w-4 text-success" /> Section 3 — Regulations ({regulations.length})
              </span>
              <Badge variant="outline" className="text-[10px]">
                {selectedRegulations.length} Selected
              </Badge>
            </div>

            {regulations.length === 0 ? (
              /* Informative Empty State for Regulations */
              <div className="p-6 rounded-xl border border-dashed border-border/60 bg-muted/10 text-center space-y-2 my-2">
                <BookOpen className="h-8 w-8 text-muted-foreground mx-auto" />
                <h4 className="text-xs font-bold text-foreground">No Regulations Selected</h4>
                <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                  Select statutory acts from the regulation library to benchmark against company policies.
                </p>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => router.push("/documents")}
                  className="gap-1.5 cursor-pointer text-xs mt-2"
                >
                  <BookOpen className="h-3.5 w-3.5" /> Select Regulations
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {regulations.map((reg) => {
                  const isSelected = selectedRegulationIds.includes(reg.id);

                  return (
                    <div
                      key={reg.id}
                      role="checkbox"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onClick={() => toggleRegulationSelect(reg.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleRegulationSelect(reg.id);
                        }
                      }}
                      className={cn(
                        "p-3 rounded-lg border flex items-center justify-between gap-3 cursor-pointer transition-all text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset",
                        isSelected
                          ? "border-success/50 bg-success/5"
                          : "border-border/40 bg-muted/10 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="h-3.5 w-3.5 rounded border-border text-success cursor-pointer"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{reg.title || reg.act_name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {reg.jurisdiction || "India"} {reg.act_year ? `(${reg.act_year})` : ""}
                          </p>
                        </div>
                      </div>

                      {reg.version && (
                        <Badge variant="outline" className="text-[9px] shrink-0">
                          v{reg.version}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* SECTION 4: ANALYSIS READINESS CHECKLIST */}
      <Card className="border border-border/60 bg-card p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Section 4 — Analysis Readiness Checklist
          </span>
          <Badge
            variant="outline"
            className={cn(
              "text-xs px-2.5 py-0.5 font-bold uppercase tracking-wide",
              canProceed
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                : "bg-amber-500/10 text-amber-600 border-amber-500/30"
            )}
          >
            {canProceed ? "Pass — All Criteria Met" : "Action Required"}
          </Badge>
        </div>

        {/* Readiness Items List (Backend Data Only) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Item 1: Organization Selected */}
          <div className="p-3 rounded-lg border border-border/40 bg-muted/20 flex items-start gap-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-foreground">Organization Workspace Selected</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Active context: {organization.name}
              </p>
            </div>
          </div>

          {/* Item 2: At Least One Policy Uploaded */}
          <div className="p-3 rounded-lg border border-border/40 bg-muted/20 flex items-start gap-3">
            {hasPolicies ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            )}
            <div className="text-xs">
              <p className="font-semibold text-foreground">At least one policy selected</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {hasPolicies
                  ? `${selectedPolicies.length} policy file${selectedPolicies.length > 1 ? "s" : ""} included.`
                  : "Action required: Select or upload a company policy document."}
              </p>
            </div>
          </div>

          {/* Item 3: At Least One Regulation Selected */}
          <div className="p-3 rounded-lg border border-border/40 bg-muted/20 flex items-start gap-3">
            {hasRegulations ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            )}
            <div className="text-xs">
              <p className="font-semibold text-foreground">At least one regulation selected</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {hasRegulations
                  ? `${selectedRegulations.length} regulation act${selectedRegulations.length > 1 ? "s" : ""} included.`
                  : "Action required: Select at least one statutory regulation benchmark."}
              </p>
            </div>
          </div>

          {/* Item 4: Documents Processed */}
          <div className="p-3 rounded-lg border border-border/40 bg-muted/20 flex items-start gap-3">
            {policiesProcessed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            )}
            <div className="text-xs">
              <p className="font-semibold text-foreground">Documents Processed & Knowledge Graph Available</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {policiesProcessed
                  ? "All selected documents parsed and clause embeddings indexed in GraphRAG."
                  : "Action required: Wait for pending document processing to complete."}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* SECTION 5: ANALYSIS SUMMARY */}
      <Card className="border border-border/60 bg-card p-5 space-y-4 shadow-xs">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-amber-500" /> Section 5 — Analysis Summary & Expected Output
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-muted/20 border border-border/40">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Policies Included</span>
            <span className="text-sm font-bold text-foreground mt-0.5 block">
              {selectedPolicies.length} Policy File{selectedPolicies.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-muted/20 border border-border/40">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Regulations Included</span>
            <span className="text-sm font-bold text-foreground mt-0.5 block">
              {selectedRegulations.length} Statutory Benchmark{selectedRegulations.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-muted/20 border border-border/40">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Estimated Scope</span>
            <span className="text-xs font-semibold text-foreground mt-0.5 block truncate" title={estimatedScopeText}>
              {estimatedScopeText}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-muted/20 border border-border/40">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Last Successful Analysis</span>
            <span className="text-xs font-semibold text-foreground mt-0.5 block">{lastAnalysisDate}</span>
          </div>
        </div>

        {/* Expected Output Breakdown */}
        <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 space-y-2">
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-indigo-500" /> Expected Audit Report Output Deliverables:
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <span>Executive Compliance Summary</span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <span>Clause-by-Clause Compliance Findings</span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <span>Uncovered Statutory Gap Analysis</span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <span>Actionable Policy Recommendations</span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <span>Knowledge Graph Evidence Links</span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <span>PDF Audit Export Document</span>
            </li>
          </ul>
        </div>
      </Card>

      {/* SECTION 6: ACTIONS */}
      <Card className="border border-border/60 bg-card p-5 space-y-4 shadow-xs">
        {!canProceed && (
          <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <span>
              <strong>Run Analysis is disabled:</strong> {disabledReason}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <Button
            variant="outline"
            onClick={() => router.push("/compliance")}
            className="cursor-pointer text-xs"
          >
            Cancel
          </Button>

          <Button
            onClick={handleRunAnalysis}
            disabled={!canProceed || isSubmitting}
            size="lg"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-600/20 cursor-pointer disabled:opacity-50 gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Submitting Request...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 text-amber-300" /> Run Analysis
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
};
