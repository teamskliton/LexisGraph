"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileCheck2,
  FileText,
  HelpCircle,
  Inbox,
  Layers,
  Loader2,
  LogOut,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";


import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { JobProgressCard } from "@/components/compliance/JobProgressCard";

import { organizationsService, Organization } from "@/services/api/organizations";
import { documentService } from "@/services/document-service";
import { DocumentResponse, DocumentType } from "@/types/document";
import {
  complianceService,
  ComplianceReport,
  ComplianceReportDetails,
  ComplianceJob,
  EvaluatedClause,
  MissingClause,
  WeakClause,
} from "@/services/api/compliance";

// ---------------------------------------------------------------------------
// Helper functions & risk status configs
// ---------------------------------------------------------------------------

function calculateRiskLevel(score: number | null | undefined, missingCount: number) {
  const actualScore = score ?? 0;
  if (actualScore >= 80 && missingCount === 0) {
    return {
      level: "LOW RISK",
      color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
      badge: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      icon: <ShieldCheck className="h-6 w-6 text-emerald-500" />,
      description: "Policy coverage aligns strongly with regulatory requirements.",
    };
  }
  if (actualScore >= 50 && missingCount <= 2) {
    return {
      level: "MEDIUM RISK",
      color: "text-amber-500 bg-amber-500/10 border-amber-500/30",
      badge: "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
      icon: <ShieldAlert className="h-6 w-6 text-amber-500" />,
      description: "Some policy gaps or weak controls require attention.",
    };
  }
  return {
    level: "HIGH RISK",
    color: "text-rose-500 bg-rose-500/10 border-rose-500/30",
    badge: "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30",
    icon: <AlertTriangle className="h-6 w-6 text-rose-500" />,
    description: "Significant compliance gaps detected. Immediate policy remediation required.",
  };
}

function getStatusBadge(status: string) {
  switch (status) {
    case "COMPLIANT":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="h-3.5 w-3.5" /> Compliant
        </span>
      );
    case "PARTIALLY_COMPLIANT":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <Clock className="h-3.5 w-3.5" /> Partial Coverage
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400 border border-rose-500/20">
          <AlertTriangle className="h-3.5 w-3.5" /> Non-Compliant / Missing
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Main Compliance Page
// ---------------------------------------------------------------------------

function CompliancePageContent() {
  const { logout } = useAuth();
  const router = useRouter();

  // State: Organizations & Documents
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isOrgLoading, setIsOrgLoading] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [isDocsLoading, setIsDocsLoading] = useState(false);
  const [selectedRegId, setSelectedRegId] = useState<string>("");
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>("");

  // State: Compliance Analysis, Async Job & Active Report
  const [activeReport, setActiveReport] = useState<ComplianceReport | null>(null);
  const [activeJob, setActiveJob] = useState<ComplianceJob | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filtered Regulation & Policy documents
  const regulationDocs = useMemo(
    () => documents.filter((d) => d.document_type === "REGULATION"),
    [documents]
  );
  const policyDocs = useMemo(
    () => documents.filter((d) => d.document_type === "POLICY"),
    [documents]
  );

  // ---------------------------------------------------------------------------
  // Load Organizations
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await organizationsService.getOrganizations();
        if (!active) return;
        setOrganizations(data);
        if (data.length > 0) {
          setSelectedOrgId(data[0].id);
        }
      } catch {
        toast.error("Failed to load organizations.");
      } finally {
        if (active) setIsOrgLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Load Documents when Organization changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedOrgId) return;
    let active = true;
    setIsDocsLoading(true);
    (async () => {
      try {
        const docs = await documentService.getDocuments(selectedOrgId);
        if (!active) return;
        setDocuments(docs);

        const regs = docs.filter((d) => d.document_type === "REGULATION");
        const policies = docs.filter((d) => d.document_type === "POLICY");

        setSelectedRegId(regs.length > 0 ? regs[0].id : "");
        setSelectedPolicyId(policies.length > 0 ? policies[0].id : "");
      } catch {
        toast.error("Failed to load documents for the selected organization.");
      } finally {
        if (active) setIsDocsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedOrgId]);

  // ---------------------------------------------------------------------------
  // Polling active compliance job status from PostgreSQL
  // ---------------------------------------------------------------------------
  const pollErrorCountRef = useRef(0);

  useEffect(() => {
    if (!jobId || !isAnalyzing) return;

    pollErrorCountRef.current = 0;
    const interval = setInterval(async () => {
      try {
        const job = await complianceService.getComplianceJob(jobId);
        pollErrorCountRef.current = 0;
        setActiveJob(job);

        if (job.status === "COMPLETED") {
          setIsAnalyzing(false);
          if (job.report_id) {
            setReportId(job.report_id);
            const rep = await complianceService.getComplianceReport(job.report_id);
            setActiveReport(rep);
          }
          toast.success("Compliance analysis complete!");
        } else if (job.status === "FAILED") {
          setIsAnalyzing(false);
          toast.error(job.error_message || "Compliance analysis failed.");
        } else if (job.status === "CANCELLED") {
          setIsAnalyzing(false);
          toast.info("Compliance job was cancelled.");
        }
      } catch (err: any) {
        pollErrorCountRef.current += 1;
        // After 10 consecutive network failures, halt polling and inform user
        if (pollErrorCountRef.current >= 10) {
          setIsAnalyzing(false);
          toast.error("Unable to reach server. Please check your backend connection.");
        }
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [jobId, isAnalyzing]);


  // ---------------------------------------------------------------------------
  // Action: Trigger Async Compliance Analysis
  // ---------------------------------------------------------------------------
  const handleAnalyze = async () => {
    if (!selectedOrgId || !selectedRegId || !selectedPolicyId) {
      toast.error("Please select an organization, a regulation document, and a policy document.");
      return;
    }

    setIsAnalyzing(true);
    setActiveReport(null);
    setActiveJob(null);
    try {
      const res = await complianceService.analyzeCompliance({
        organization_id: selectedOrgId,
        regulation_id: selectedRegId,
        regulation_document_id: selectedRegId,
        policy_document_id: selectedPolicyId,
      });

      if (res.existing_report && res.report_id) {
        setReportId(res.report_id);
        const rep = await complianceService.getComplianceReport(res.report_id);
        setActiveReport(rep);
        setIsAnalyzing(false);
        toast.success("Reused existing completed report for identical document parameters!");
      } else {
        setJobId(res.job_id);
        toast.info("Compliance audit job queued (sub-second response). Analyzing clauses...");
      }
    } catch (error: any) {
      setIsAnalyzing(false);
      const detail = error?.response?.data?.detail ?? "Failed to initiate compliance analysis.";
      toast.error(detail);
    }
  };

  const handleCancelJob = async () => {
    if (!jobId) return;
    try {
      await complianceService.cancelComplianceJob(jobId);
      setIsAnalyzing(false);
      toast.info("Job cancellation requested.");
    } catch (err) {
      toast.error("Failed to cancel job.");
    }
  };

  // Extract structured details from active report
  const reportDetails: ComplianceReportDetails | null = useMemo(() => {
    if (!activeReport) return null;
    if (activeReport.details) return activeReport.details;
    if (activeReport.summary) {
      try {
        return JSON.parse(activeReport.summary);
      } catch {
        return null;
      }
    }
    return null;
  }, [activeReport]);

  const risk = useMemo(
    () =>
      calculateRiskLevel(
        activeReport?.overall_score ?? reportDetails?.overall_score,
        reportDetails?.missing_clauses?.length ?? 0
      ),
    [activeReport, reportDetails]
  );

  // Filter evaluated clauses
  const filteredClauses = useMemo(() => {
    if (!reportDetails?.evaluated_clauses) return [];
    if (!searchQuery.trim()) return reportDetails.evaluated_clauses;
    const q = searchQuery.toLowerCase();
    return reportDetails.evaluated_clauses.filter(
      (c) =>
        c.regulation_text.toLowerCase().includes(q) ||
        (c.matched_policy_text && c.matched_policy_text.toLowerCase().includes(q)) ||
        c.reasoning.toLowerCase().includes(q)
    );
  }, [reportDetails, searchQuery]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Navbar Header ── */}
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

      <main className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
        {/* ── Page Header ── */}
        <div className="flex flex-col gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard")}
            className="mb-1 -ml-2 w-fit flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-extrabold tracking-tight">Compliance Audit & Gap Engine</h1>
                <Badge variant="outline" className="border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10">
                  GraphRAG Powered
                </Badge>
              </div>
              <p className="mt-1 text-muted-foreground">
                Audit internal policy documents against regulatory benchmarks using graph vector similarity and LLM reasoning.
              </p>
            </div>
          </div>
        </div>

        {/* ── Controls Section: Organization, Regulation, Policy Selectors ── */}
        <Card className="border-border/60 bg-card/50 shadow-sm backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-indigo-500" /> Audit Configuration
            </CardTitle>
            <CardDescription>Select your target organization and the specific documents to compare.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Organization Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-indigo-500" /> Organization
                </label>
                {isOrgLoading ? (
                  <Skeleton className="h-10 w-full rounded-md" />
                ) : (
                  <select
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {organizations.length === 0 ? (
                      <option value="">No organizations found</option>
                    ) : (
                      organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>

              {/* Regulation Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-indigo-500" /> Regulation Document
                </label>
                {isDocsLoading ? (
                  <Skeleton className="h-10 w-full rounded-md" />
                ) : (
                  <select
                    value={selectedRegId}
                    onChange={(e) => setSelectedRegId(e.target.value)}
                    disabled={regulationDocs.length === 0}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  >
                    {regulationDocs.length === 0 ? (
                      <option value="">No REGULATION documents uploaded</option>
                    ) : (
                      regulationDocs.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.original_filename}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>

              {/* Policy Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-emerald-500" /> Policy Document
                </label>
                {isDocsLoading ? (
                  <Skeleton className="h-10 w-full rounded-md" />
                ) : (
                  <select
                    value={selectedPolicyId}
                    onChange={(e) => setSelectedPolicyId(e.target.value)}
                    disabled={policyDocs.length === 0}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  >
                    {policyDocs.length === 0 ? (
                      <option value="">No POLICY documents uploaded</option>
                    ) : (
                      policyDocs.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.original_filename}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>
            </div>

            {/* Warning Banner if Documents are Missing */}
            {!isDocsLoading && (regulationDocs.length === 0 || policyDocs.length === 0) && (
              <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                  <span>
                    To run a compliance check, upload at least one <strong>REGULATION</strong> document and one <strong>POLICY</strong> document.
                  </span>
                </div>
                <Button size="sm" onClick={() => router.push("/upload")} className="ml-4 shrink-0">
                  Upload Now
                </Button>
              </div>
            )}

            {/* Analyze Action Button */}
            <div className="flex justify-end border-t border-border/40 pt-4">
              <Button
                onClick={handleAnalyze}
                disabled={isAnalyzing || !selectedOrgId || !selectedRegId || !selectedPolicyId}
                size="lg"
                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/25 transition-all"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Analyzing Clauses...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-5 w-5" /> Run Compliance Audit
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Real-Time Job Progress Card ── */}
        {jobId && isAnalyzing && (
          <JobProgressCard
            jobId={jobId}
            onCompleted={async (completedReportId) => {
              try {
                setReportId(completedReportId);
                const rep = await complianceService.getComplianceReport(completedReportId);
                setActiveReport(rep);
                setIsAnalyzing(false);
                toast.success("Analysis completed! Compliance report ready.");
              } catch {
                toast.error("Failed loading completed compliance report.");
              }
            }}
          />
        )}

        {/* ── Results Section (When Active Report is Ready) ── */}
        {activeReport && activeReport.status === "COMPLETED" && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header link to full report page */}
            <div className="flex items-center justify-between rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-indigo-500 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Compliance Audit Complete</h3>
                  <p className="text-xs text-muted-foreground">Report #{activeReport.id.slice(0, 8)} is ready for export and print.</p>
                </div>
              </div>
              <Button
                onClick={() => router.push(`/compliance/reports/${activeReport.id}`)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md flex items-center gap-1.5"
              >
                <FileCheck2 className="h-4 w-4" /> Open Full Report Page
              </Button>
            </div>

            {/* Top Stat Cards: Score, Risk Level, Coverage */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Compliance Score Card */}
              <Card className="border-border/60 bg-card/60 shadow-md">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-semibold uppercase tracking-wider">Overall Compliance Score</CardDescription>
                  <CardTitle className="text-4xl font-extrabold text-indigo-600 dark:text-indigo-400">
                    {activeReport.overall_score != null ? `${activeReport.overall_score.toFixed(1)}%` : "N/A"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Progress
                    value={activeReport.overall_score ?? 0}
                    className="h-2.5"
                    indicatorClassName={
                      (activeReport.overall_score ?? 0) >= 80
                        ? "bg-emerald-500"
                        : (activeReport.overall_score ?? 0) >= 50
                          ? "bg-amber-500"
                          : "bg-rose-500"
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Based on {reportDetails?.total_regulation_clauses ?? 0} regulation clause requirements evaluated.
                  </p>
                </CardContent>
              </Card>

              {/* Risk Level Card */}
              <Card className={`border shadow-md ${risk.color}`}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardDescription className="text-xs font-semibold uppercase tracking-wider">Risk Level Assessment</CardDescription>
                    <CardTitle className="text-2xl font-extrabold mt-1">{risk.level}</CardTitle>
                  </div>
                  {risk.icon}
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{risk.description}</p>
                </CardContent>
              </Card>

              {/* Breakdown Card */}
              <Card className="border-border/60 bg-card/60 shadow-md">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-semibold uppercase tracking-wider">Clause Coverage Breakdown</CardDescription>
                  <CardTitle className="text-lg font-bold flex items-center gap-4">
                    <span className="text-emerald-600 dark:text-emerald-400">{reportDetails?.compliant_count ?? 0} Compliant</span>
                    <span className="text-amber-600 dark:text-amber-400">{reportDetails?.partially_compliant_count ?? 0} Partial</span>
                    <span className="text-rose-600 dark:text-rose-400">{reportDetails?.non_compliant_count ?? 0} Gaps</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                    <div
                      style={{
                        width: `${((reportDetails?.compliant_count ?? 0) / (reportDetails?.total_regulation_clauses || 1)) * 100
                          }%`,
                      }}
                      className="bg-emerald-500"
                    />
                    <div
                      style={{
                        width: `${((reportDetails?.partially_compliant_count ?? 0) / (reportDetails?.total_regulation_clauses || 1)) * 100
                          }%`,
                      }}
                      className="bg-amber-500"
                    />
                    <div
                      style={{
                        width: `${((reportDetails?.non_compliant_count ?? 0) / (reportDetails?.total_regulation_clauses || 1)) * 100
                          }%`,
                      }}
                      className="bg-rose-500"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Executive Summary */}
            {reportDetails?.summary && (
              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-500" /> Executive Compliance Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">{reportDetails.summary}</p>
                </CardContent>
              </Card>
            )}

            {/* Tabs for Missing Clauses, Weak Clauses, All Evaluated Clauses, Recommendations */}
            <Tabs defaultValue="missing" className="w-full">
              <TabsList className="grid w-full grid-cols-4 bg-muted/50 p-1">
                <TabsTrigger value="missing" className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-500" /> Missing Gaps ({reportDetails?.missing_clauses?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="weak" className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" /> Weak Clauses ({reportDetails?.weak_clauses?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="clauses" className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-indigo-500" /> All Clauses ({reportDetails?.evaluated_clauses?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="recommendations" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-500" /> Recommendations ({reportDetails?.recommendations?.length ?? 0})
                </TabsTrigger>
              </TabsList>

              {/* ── Missing Clauses Tab ── */}
              <TabsContent value="missing" className="mt-6 space-y-4">
                {(!reportDetails?.missing_clauses || reportDetails.missing_clauses.length === 0) ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-xl bg-card/30">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
                    <h4 className="font-semibold text-lg">No Missing Regulation Clauses</h4>
                    <p className="text-sm text-muted-foreground">Every regulatory requirement has at least partial coverage in your policy.</p>
                  </div>
                ) : (
                  reportDetails.missing_clauses.map((item, idx) => (
                    <Card key={idx} className="border-rose-500/30 bg-rose-500/5 shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10">
                            Uncovered Requirement
                          </Badge>
                        </div>
                        <CardTitle className="text-base font-semibold text-foreground mt-2">{item.regulation_text}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <div className="p-3 rounded-md bg-background/80 border border-border/50">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Reasoning</p>
                          <p className="text-muted-foreground">{item.reasoning}</p>
                        </div>
                        {item.recommendation && (
                          <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300">
                            <p className="text-xs font-semibold uppercase tracking-wider mb-1">Actionable Remediation</p>
                            <p>{item.recommendation}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* ── Weak Clauses Tab ── */}
              <TabsContent value="weak" className="mt-6 space-y-4">
                {(!reportDetails?.weak_clauses || reportDetails.weak_clauses.length === 0) ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-xl bg-card/30">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
                    <h4 className="font-semibold text-lg">No Weak Policy Clauses</h4>
                    <p className="text-sm text-muted-foreground">All matched policy clauses provide sufficient coverage.</p>
                  </div>
                ) : (
                  reportDetails.weak_clauses.map((item, idx) => (
                    <Card key={idx} className="border-amber-500/30 bg-amber-500/5 shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                            Partial Match (Score: {(item.similarity_score * 100).toFixed(0)}%)
                          </Badge>
                        </div>
                        <CardTitle className="text-base font-semibold text-foreground mt-2">
                          Req: {item.regulation_text}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        {item.matched_policy_text && (
                          <div className="p-3 rounded-md bg-background/80 border border-border/50">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Current Policy Wording</p>
                            <p className="text-muted-foreground">{item.matched_policy_text}</p>
                          </div>
                        )}
                        <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200">
                          <p className="text-xs font-semibold uppercase tracking-wider mb-1">Recommended Improvement</p>
                          <p>{item.recommendation || item.reasoning}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* ── All Evaluated Clauses Tab ── */}
              <TabsContent value="clauses" className="mt-6 space-y-4">
                <div className="relative mb-4">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search evaluated clauses and reasoning..."
                    className="pl-8"
                  />
                </div>

                <div className="space-y-3">
                  {filteredClauses.map((clause, idx) => (
                    <Card key={idx} className="border-border/60 bg-card/40">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1 flex-1">
                            <p className="font-semibold text-sm text-foreground">{clause.regulation_text}</p>
                            {clause.matched_policy_text && (
                              <p className="text-xs text-muted-foreground">
                                <strong>Policy Match:</strong> {clause.matched_policy_text}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-right space-y-1">
                            {getStatusBadge(clause.status)}
                            <p className="text-xs text-muted-foreground">Similarity: {(clause.similarity_score * 100).toFixed(0)}%</p>
                          </div>
                        </div>
                        <div className="p-2.5 rounded bg-muted/40 text-xs text-muted-foreground">
                          <strong>Analysis:</strong> {clause.reasoning}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* ── Recommendations Tab ── */}
              <TabsContent value="recommendations" className="mt-6">
                <Card className="border-indigo-500/30 bg-indigo-500/5">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-indigo-500" /> Actionable Policy Recommendations
                    </CardTitle>
                    <CardDescription>Step-by-step edits to achieve full regulatory compliance.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(!reportDetails?.recommendations || reportDetails.recommendations.length === 0) ? (
                      <p className="text-sm text-muted-foreground">No recommendations needed. Your policy fully meets all regulatory requirements.</p>
                    ) : (
                      <ol className="space-y-3 list-decimal list-inside text-sm">
                        {reportDetails.recommendations.map((rec, idx) => (
                          <li key={idx} className="p-3 rounded-lg bg-background/80 border border-border/50 text-foreground">
                            {rec}
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
    </div>
  );
}

export default function CompliancePage() {
  return (
    <ProtectedRoute>
      <CompliancePageContent />
    </ProtectedRoute>
  );
}
