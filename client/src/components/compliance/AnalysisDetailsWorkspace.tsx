// AnalysisDetailsWorkspace — Comprehensive 9-Section Compliance Review Workspace
// Reuses existing compliance APIs, document services, and KnowledgeGraphOverview component.

"use client";

import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format, differenceInSeconds } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  FileCheck2,
  FileCode,
  FileText,
  Layers,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Share2,
  Network,
  Activity,
  History,
  ArrowRight,
  BarChart3,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RiskBadge } from "@/components/compliance/shared/RiskBadge";
import { StatusBadge } from "@/components/compliance/shared/StatusBadge";

import {
  complianceService,
  ComplianceReport,
  ComplianceReportDetails,
  EvaluatedClause,
} from "@/services/api/compliance";
import { documentService } from "@/services/document-service";
import { DocumentResponse } from "@/types/document";
import { organizationsService, Organization } from "@/services/api/organizations";
import { KnowledgeGraphOverview } from "@/components/dashboard/KnowledgeGraphOverview";
import { GapAnalysisWorkspace } from "@/components/compliance/GapAnalysisWorkspace";
import { ShareReportModal } from "@/components/compliance/ShareReportModal";

interface AnalysisDetailsWorkspaceProps {
  reportId: string;
}

export const AnalysisDetailsWorkspace: React.FC<AnalysisDetailsWorkspaceProps> = ({
  reportId,
}) => {
  const router = useRouter();
  const reportSectionRef = useRef<HTMLDivElement>(null);

  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [regDoc, setRegDoc] = useState<DocumentResponse | null>(null);
  const [policyDoc, setPolicyDoc] = useState<DocumentResponse | null>(null);
  const [relatedReports, setRelatedReports] = useState<ComplianceReport[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  // Sprint 8.1: Gap Analysis workspace tab
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"DETAILS" | "GAP_ANALYSIS">("DETAILS");

  const loadWorkspace = useCallback(async () => {
    const isUUID = !!reportId && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(reportId);
    if (!isUUID) {
      setErrorMessage("Invalid Report ID format. Please select a report from your organization list.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const rep = await complianceService.getComplianceReport(reportId);
      setReport(rep);

      // Fetch Organization & Document metadata in parallel
      const [org, rDoc, pDoc, relReports] = await Promise.all([
        organizationsService.getOrganizationById(rep.organization_id).catch(() => null),
        documentService.getDocument(rep.regulation_document_id).catch(() => null),
        documentService.getDocument(rep.policy_document_id).catch(() => null),
        complianceService.listComplianceReports(rep.organization_id).catch(() => []),
      ]);

      setOrganization(org);
      setRegDoc(rDoc);
      setPolicyDoc(pDoc);
      setRelatedReports(relReports.filter((r) => r.id !== reportId).slice(0, 5));
    } catch (err: any) {
      console.error(`Error loading report workspace ${reportId}:`, err);
      const rawDetail = err?.response?.data?.detail;
      let detailMsg = "Report could not be loaded. Please verify backend connection or permissions.";
      if (typeof rawDetail === "string") {
        detailMsg = rawDetail;
      } else if (Array.isArray(rawDetail)) {
        detailMsg = rawDetail.map((d: any) => d?.msg || d?.detail || (typeof d === "string" ? d : JSON.stringify(d))).join("; ");
      } else if (rawDetail && typeof rawDetail === "object") {
        detailMsg = rawDetail?.msg || rawDetail?.detail || JSON.stringify(rawDetail);
      } else if (err?.message) {
        detailMsg = err.message;
      }
      setErrorMessage(detailMsg);
      toast.error("Failed to load report details.");
    } finally {
      setIsLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  // Extract structured details
  const details: ComplianceReportDetails | null = useMemo(() => {
    if (!report) return null;
    if (report.details) return report.details;
    if (report.summary) {
      try {
        return JSON.parse(report.summary);
      } catch {
        return null;
      }
    }
    return null;
  }, [report]);

  const score = report?.overall_score ?? details?.overall_score ?? 0;
  const missingCount = details?.missing_clauses?.length ?? details?.non_compliant_count ?? 0;

  // Risk Assessment — kept local since it needs both score + missingCount
  const riskInfo = useMemo(() => {
    if (score >= 80 && missingCount === 0) {
      return {
        level: "LOW RISK",
        badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        icon: <ShieldCheck className="h-5 w-5 text-emerald-500" aria-hidden="true" />,
      };
    }
    if (score >= 50 && missingCount <= 2) {
      return {
        level: "MEDIUM RISK",
        badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
        icon: <ShieldAlert className="h-5 w-5 text-amber-500" aria-hidden="true" />,
      };
    }
    return {
      level: "HIGH RISK",
      badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
      icon: <AlertTriangle className="h-5 w-5 text-rose-500" aria-hidden="true" />,
    };
  }, [score, missingCount]);

  // Expand row toggle — keyboard accessible
  const toggleRow = (clauseId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(clauseId)) next.delete(clauseId);
      else next.add(clauseId);
      return next;
    });
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, clauseId: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleRow(clauseId);
    }
  };

  // Filtered clauses for findings table — short-circuit when no details
  const filteredClauses = useMemo(() => {
    if (!details?.evaluated_clauses) return [];
    return details.evaluated_clauses.filter((item) => {
      const matchesStatus = filterStatus === "ALL" || item.status === filterStatus;
      const matchesSearch =
        !searchQuery.trim() ||
        item.regulation_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.matched_policy_text &&
          item.matched_policy_text.toLowerCase().includes(searchQuery.toLowerCase())) ||
        item.reasoning.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [details, filterStatus, searchQuery]);

  // Duration calculation from real timestamps
  const durationText = useMemo(() => {
    if (!report?.created_at || !report?.updated_at) return "—";
    const secs = differenceInSeconds(new Date(report.updated_at), new Date(report.created_at));
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
  }, [report?.created_at, report?.updated_at]);

  // Export & Action handlers
  const handleShare = () => {
    setIsShareModalOpen(true);
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const handleExportJSON = async () => {
    if (!report) return;
    try {
      const blob = await complianceService.downloadReportJSON(report.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analysis_${report.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("JSON report downloaded.");
    } catch {
      const payload = JSON.stringify(report, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analysis_${report.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("JSON report downloaded.");
    }
  };

  const handleExportCSV = () => {
    if (!details?.evaluated_clauses) return;
    const headers = [
      "Clause ID",
      "Status",
      "Score",
      "Regulation Text",
      "Policy Text",
      "Reasoning",
      "Recommendation",
    ];
    const rows = details.evaluated_clauses.map((c) => [
      `"${c.regulation_clause_id}"`,
      `"${c.status}"`,
      `"${(c.similarity_score * 100).toFixed(1)}%"`,
      `"${c.regulation_text.replace(/"/g, '""')}"`,
      `"${(c.matched_policy_text || "").replace(/"/g, '""')}"`,
      `"${c.reasoning.replace(/"/g, '""')}"`,
      `"${(c.recommendation || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analysis_clauses_${report?.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV clause findings downloaded.");
  };

  const handleExportPDF = async () => {
    if (!report) return;
    try {
      toast.info("Generating PDF export...");
      const blob = await complianceService.downloadReportPDF(report.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analysis_report_${report.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF report downloaded.");
    } catch {
      window.print();
    }
  };

  const scrollToReport = () => {
    reportSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-16" aria-busy="true" aria-label="Loading analysis workspace">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (errorMessage || !report) {
    return (
      <Card
        className="border border-rose-500/30 bg-rose-500/5 p-12 text-center max-w-2xl mx-auto my-12 space-y-4 shadow-sm"
        role="alert"
      >
        <AlertTriangle className="h-12 w-12 text-rose-500 mx-auto" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-foreground">Report Could Not Be Loaded</h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {errorMessage || "The requested compliance report could not be retrieved."}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/reports")}
            className="cursor-pointer text-xs"
            aria-label="Return to reports workspace"
          >
            Back to Reports
          </Button>
          <Button
            size="sm"
            onClick={loadWorkspace}
            className="cursor-pointer text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            aria-label="Retry loading report"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </Button>
        </div>
      </Card>
    );
  }

  const createdFormatted = format(new Date(report.created_at), "MMM d, yyyy · HH:mm");
  const completedFormatted = report.updated_at
    ? format(new Date(report.updated_at), "MMM d, yyyy · HH:mm")
    : createdFormatted;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/compliance")}
          className="w-fit -ml-2 text-muted-foreground hover:text-foreground cursor-pointer gap-1.5 text-xs"
          aria-label="Back to compliance workspace"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Compliance Workspace
        </Button>

        <Badge
          variant="outline"
          className="border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 text-xs px-3 py-1 font-bold"
        >
          Analysis Workspace
        </Badge>
      </div>

      {/* ── SECTION 1: ANALYSIS HEADER ── */}
      <Card className="border border-border/60 bg-gradient-to-r from-card via-card/90 to-background p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                Statutory Compliance Audit #{report.id.slice(0, 8)}
              </h1>
              <Badge variant="outline" className={cn("text-xs font-bold px-3 py-0.5", riskInfo.badge)}>
                {riskInfo.level}
              </Badge>
              <StatusBadge status={report.status} />
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <Building2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" aria-hidden="true" />
              <span>
                Workspace: <strong>{organization?.name || "Organization Workspace"}</strong>
              </span>
              <span aria-hidden="true">•</span>
              <span>Created: {createdFormatted}</span>
              <span aria-hidden="true">•</span>
              <span>Completed: {completedFormatted}</span>
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/ai-assistant?reportId=${report.id}&question=${encodeURIComponent(`Summarize the major compliance risks in report #${report.id.slice(0, 8)}.`)}`)}
              className="text-xs cursor-pointer gap-1.5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
              aria-label="Analyze report with AI Assistant"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" /> Analyze Report with AI
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={scrollToReport}
              className="text-xs cursor-pointer gap-1.5"
              aria-label="Scroll to executive report section"
            >
              <FileText className="h-4 w-4 text-indigo-500" aria-hidden="true" /> View Report
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJSON}
              className="text-xs cursor-pointer gap-1.5"
              aria-label="Export analysis as JSON"
            >
              <FileCode className="h-4 w-4" aria-hidden="true" /> Export JSON
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="text-xs cursor-pointer gap-1.5"
              aria-label="Export findings as CSV"
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              className="text-xs cursor-pointer gap-1.5"
              aria-label="Download PDF report"
            >
              <Download className="h-4 w-4 text-emerald-500" aria-hidden="true" /> Download PDF
            </Button>

            <Button
              size="sm"
              onClick={handleShare}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md text-xs cursor-pointer gap-1.5"
              aria-label="Copy workspace URL to clipboard"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" /> Share
            </Button>
          </div>
        </div>
      </Card>

      {/* ── SPRINT 8.1: WORKSPACE TAB SWITCHER ── */}
      {report.status === "COMPLETED" && (
        <div
          className="flex items-center gap-1 p-1 rounded-xl border border-border/50 bg-muted/20 w-fit"
          role="tablist"
          aria-label="Analysis workspace tabs"
        >
          {([
            { id: "DETAILS" as const, label: "Report Details", icon: <FileCheck2 className="h-3.5 w-3.5" /> },
            { id: "GAP_ANALYSIS" as const, label: "Gap Analysis", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeWorkspaceTab === tab.id}
              onClick={() => setActiveWorkspaceTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
                activeWorkspaceTab === tab.id
                  ? "bg-card text-foreground shadow-sm border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.id === "GAP_ANALYSIS" && (
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 py-0 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 font-bold"
                >
                  NEW
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── SPRINT 8.1: GAP ANALYSIS TAB CONTENT ── */}
      {activeWorkspaceTab === "GAP_ANALYSIS" && report.status === "COMPLETED" && (
        <div role="tabpanel" aria-label="Gap Analysis">
          <GapAnalysisWorkspace
            reportId={reportId}
            organizationId={report.organization_id}
          />
        </div>
      )}

      {/* ── EXISTING SECTIONS (Report Details tab) ── */}
      {activeWorkspaceTab === "DETAILS" && (
        <>

      {/* ── SECTION 2: EXECUTIVE SUMMARY ── */}
      <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-indigo-500" aria-hidden="true" /> Executive Compliance Summary
        </span>

        {details?.summary ? (
          <p className="text-xs leading-relaxed text-foreground/90 font-medium">{details.summary}</p>
        ) : (
          <p className="text-xs text-muted-foreground italic" role="status">
            No high-level executive summary is available for this analysis run.
          </p>
        )}
      </Card>

      {/* ── SECTION 3: ANALYSIS METRICS (KPI CARDS) ── */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3"
        role="region"
        aria-label="Analysis metrics"
      >
        <Card className="border border-border/60 bg-card p-3.5 shadow-xs text-center">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Compliance Score</span>
          <p
            className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1 font-mono"
            aria-label={`Compliance score: ${score}%`}
          >
            {score}%
          </p>
        </Card>

        <Card className="border border-border/60 bg-card p-3.5 shadow-xs text-center">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Policies Analysed</span>
          <p className="text-xl font-extrabold text-foreground mt-1 font-mono" aria-label="1 policy analysed">1</p>
        </Card>

        <Card className="border border-border/60 bg-card p-3.5 shadow-xs text-center">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Regulations Applied</span>
          <p className="text-xl font-extrabold text-foreground mt-1 font-mono" aria-label="1 regulation applied">1</p>
        </Card>

        <Card className="border border-border/60 bg-card p-3.5 shadow-xs text-center">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Clauses Reviewed</span>
          <p
            className="text-xl font-extrabold text-foreground mt-1 font-mono"
            aria-label={`${details?.total_regulation_clauses ?? 0} clauses reviewed`}
          >
            {details?.total_regulation_clauses ?? 0}
          </p>
        </Card>

        <Card className="border border-border/60 bg-card p-3.5 shadow-xs text-center">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Issues Found</span>
          <p
            className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1 font-mono"
            aria-label={`${(details?.non_compliant_count ?? 0) + (details?.partially_compliant_count ?? 0)} issues found`}
          >
            {(details?.non_compliant_count ?? 0) + (details?.partially_compliant_count ?? 0)}
          </p>
        </Card>

        <Card className="border border-border/60 bg-card p-3.5 shadow-xs text-center">
          <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 block">High Risk Issues</span>
          <p
            className="text-xl font-extrabold text-rose-600 dark:text-rose-400 mt-1 font-mono"
            aria-label={`${details?.non_compliant_count ?? 0} high risk issues`}
          >
            {details?.non_compliant_count ?? 0}
          </p>
        </Card>

        <Card className="border border-border/60 bg-card p-3.5 shadow-xs text-center">
          <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 block">Medium Risk</span>
          <p
            className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1 font-mono"
            aria-label={`${details?.partially_compliant_count ?? 0} medium risk items`}
          >
            {details?.partially_compliant_count ?? 0}
          </p>
        </Card>

        <Card className="border border-border/60 bg-card p-3.5 shadow-xs text-center">
          <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Low Risk</span>
          <p
            className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 font-mono"
            aria-label={`${details?.compliant_count ?? 0} low risk items`}
          >
            {details?.compliant_count ?? 0}
          </p>
        </Card>
      </div>

      {/* ── FINDING LIFECYCLE OPERATIONS SUMMARY BAR ── */}
      <Card className="border border-indigo-500/20 bg-card p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-indigo-500" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Finding Remediation Lifecycle Status
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Operational status of active compliance remediation workflows for this report.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs font-semibold px-3 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30">
              Open: {report?.open_count ?? 0}
            </Badge>
            <Badge variant="outline" className="text-xs font-semibold px-3 py-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30">
              In Review: {report?.in_review_count ?? 0}
            </Badge>
            <Badge variant="outline" className="text-xs font-semibold px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
              In Remediation: {report?.remediation_count ?? 0}
            </Badge>
            <Badge variant="outline" className="text-xs font-semibold px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
              Resolved: {report?.resolved_count ?? 0}
            </Badge>

            <Button
              size="sm"
              onClick={() => router.push(`/compliance/reports/${report?.id}/findings`)}
              className="text-xs font-semibold cursor-pointer gap-1 bg-indigo-600 hover:bg-indigo-700 text-white ml-2"
            >
              <span>Manage Findings Workspace</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      {/* ── SECTION 4: FINDINGS (PRIMARY EXPANDABLE TABLE) ── */}
      <Card className="border border-border/60 bg-card p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">Compliance Evaluation Findings</h3>
              <Button
                variant="outline"
                size="xs"
                onClick={() => router.push(`/compliance/reports/${reportId}/findings`)}
                className="text-xs font-semibold cursor-pointer gap-1 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
              >
                <span>View All Findings Workspace</span>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Expand rows to inspect similarity scores, LLM legal reasoning, and policy recommendations.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Search clause text..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs h-9 bg-background"
                aria-label="Search clause text"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground cursor-pointer focus:ring-1 focus:ring-indigo-500"
              aria-label="Filter findings by status"
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLIANT">Compliant</option>
              <option value="PARTIALLY_COMPLIANT">Partially Compliant</option>
              <option value="NON_COMPLIANT">Non-Compliant</option>
            </select>
          </div>
        </div>

        {filteredClauses.length === 0 ? (
          <div
            className="p-8 border border-dashed border-border/60 bg-muted/10 text-center rounded-xl"
            role="status"
          >
            <p className="text-xs font-semibold text-muted-foreground">No matching findings found.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table (md and above) */}
            <div className="hidden md:block overflow-x-auto border border-border/50 rounded-xl">
              <table
                className="w-full text-left text-xs"
                role="table"
                aria-label="Compliance evaluation findings"
              >
                <thead className="bg-muted/40 border-b border-border/60 uppercase font-bold text-[10px] text-muted-foreground tracking-wider">
                  <tr>
                    <th className="p-3 pl-4" scope="col">Status</th>
                    <th className="p-3" scope="col">Regulation Clause</th>
                    <th className="p-3" scope="col">Matched Policy Clause</th>
                    <th className="p-3 text-center" scope="col">Score</th>
                    <th className="p-3 pr-4 text-right" scope="col">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-medium">
                  {filteredClauses.map((clause) => {
                    const isExpanded = expandedRows.has(clause.regulation_clause_id);
                    return (
                      <React.Fragment key={clause.regulation_clause_id}>
                        <tr
                          onClick={() => toggleRow(clause.regulation_clause_id)}
                          onKeyDown={(e) => handleRowKeyDown(e, clause.regulation_clause_id)}
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          aria-label={`Clause ${clause.regulation_clause_id} — ${clause.status}. Press to ${isExpanded ? "collapse" : "expand"} details.`}
                          className="hover:bg-muted/30 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset"
                        >
                          <td className="p-3 pl-4">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-bold uppercase",
                                clause.status === "COMPLIANT"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                  : clause.status === "PARTIALLY_COMPLIANT"
                                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                              )}
                            >
                              {clause.status}
                            </Badge>
                          </td>

                          <td className="p-3 text-foreground font-semibold max-w-xs">
                            <p className="line-clamp-2">{clause.regulation_text}</p>
                            <span className="text-[10px] text-muted-foreground font-mono block">
                              ID: {clause.regulation_clause_id}
                            </span>
                          </td>

                          <td className="p-3 text-muted-foreground max-w-xs">
                            {clause.matched_policy_text ? (
                              <p className="line-clamp-2">{clause.matched_policy_text}</p>
                            ) : (
                              <span className="italic text-rose-500">No policy match</span>
                            )}
                          </td>

                          <td className="p-3 text-center font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {(clause.similarity_score * 100).toFixed(0)}%
                          </td>

                          <td className="p-3 pr-4 text-right">
                            <Button variant="ghost" size="icon-xs" className="cursor-pointer" aria-hidden="true" tabIndex={-1}>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-muted/20 border-b border-border/60">
                            <td colSpan={5} className="p-5 space-y-4 text-xs">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-3.5 rounded-lg bg-background border border-border/50 space-y-1">
                                  <span className="text-[10px] font-bold text-indigo-500 uppercase block">
                                    Regulation Citation
                                  </span>
                                  <p className="text-foreground">{clause.regulation_text}</p>
                                </div>

                                <div className="p-3.5 rounded-lg bg-background border border-border/50 space-y-1">
                                  <span className="text-[10px] font-bold text-emerald-500 uppercase block">
                                    Policy Wording
                                  </span>
                                  <p className="text-muted-foreground">
                                    {clause.matched_policy_text ||
                                      "No policy clause addresses this requirement."}
                                  </p>
                                </div>
                              </div>

                              <div className="p-3.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 space-y-1">
                                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase flex items-center gap-1">
                                  <Sparkles className="h-3 w-3" aria-hidden="true" /> LLM Legal Reasoning
                                </span>
                                <p className="text-foreground">{clause.reasoning}</p>
                              </div>

                              {clause.recommendation && (
                                <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-1">
                                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Recommended Remediation
                                  </span>
                                  <p className="text-amber-900 dark:text-amber-200">
                                    {clause.recommendation}
                                  </p>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (md and below) */}
            <div className="space-y-3 md:hidden">
              {filteredClauses.map((clause) => (
                <div
                  key={clause.regulation_clause_id}
                  className="p-4 rounded-xl border border-border/60 bg-background space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-bold uppercase",
                        clause.status === "COMPLIANT"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          : clause.status === "PARTIALLY_COMPLIANT"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                      )}
                    >
                      {clause.status}
                    </Badge>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {(clause.similarity_score * 100).toFixed(0)}% Score
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Regulation Clause (#{clause.regulation_clause_id})
                    </span>
                    <p className="text-foreground font-medium">{clause.regulation_text}</p>
                  </div>

                  <div className="space-y-1 pt-2 border-t border-border/40">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Matched Policy Text
                    </span>
                    <p className="text-muted-foreground">
                      {clause.matched_policy_text || <span className="italic text-rose-500">No policy match</span>}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 space-y-1">
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase flex items-center gap-1">
                      <Sparkles className="h-3 w-3" aria-hidden="true" /> Reasoning
                    </span>
                    <p className="text-foreground">{clause.reasoning}</p>
                  </div>

                  {clause.recommendation && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-1">
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Recommendation
                      </span>
                      <p className="text-amber-900 dark:text-amber-200">{clause.recommendation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* ── SECTION 5: KNOWLEDGE GRAPH EVIDENCE ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Network className="h-4 w-4 text-indigo-500" aria-hidden="true" /> Knowledge Graph Structural Evidence
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/knowledge-graph")}
            className="text-xs cursor-pointer gap-1.5 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
            aria-label="Explore evidence in the knowledge graph"
          >
            Explore in Knowledge Graph <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>

        <KnowledgeGraphOverview
          isLoading={false}
          onExplore={() => router.push("/knowledge-graph")}
        />
      </div>

      {/* ── SECTION 6: AI RECOMMENDATIONS ── */}
      <Card className="border border-indigo-500/30 bg-indigo-500/5 p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" aria-hidden="true" /> AI Recommendations & Remediation
          </span>
          <Button
            variant="outline"
            size="xs"
            onClick={() => router.push(`/compliance/reports/${reportId}/recommendations`)}
            className="text-xs font-semibold cursor-pointer gap-1 text-amber-600 dark:text-amber-400 border-amber-500/30 bg-background"
          >
            <span>View All Recommendations Workspace</span>
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>

        {details?.recommendations && details.recommendations.length > 0 ? (
          <ol className="space-y-3 text-xs" aria-label="AI remediation recommendations">
            {details.recommendations.map((rec, idx) => (
              <li
                key={idx}
                className="p-3.5 rounded-lg border border-border/50 bg-background/90 flex items-start gap-3"
              >
                <span
                  className="h-6 w-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  {idx + 1}
                </span>
                <div className="flex-1 text-foreground font-medium">{rec}</div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleCopyText(rec)}
                  className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                  aria-label={`Copy recommendation ${idx + 1} to clipboard`}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-muted-foreground italic" role="status">
            No specific remediation steps required.
          </p>
        )}
      </Card>

      {/* ── SECTION 7: REPORT PREVIEW ── */}
      <div ref={reportSectionRef} className="space-y-4">
        <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/50 pb-4">
            <div>
              <h3 className="text-base font-bold text-foreground">Executive Report Document</h3>
              <p className="text-xs text-muted-foreground">
                Formally compiled statutory compliance report.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/reports?report=${report.id}`)}
                className="text-xs cursor-pointer gap-1.5"
                aria-label="Open the full report in the reports viewer"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open Full Report
              </Button>
              <Button
                size="sm"
                onClick={handleExportPDF}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs cursor-pointer gap-1.5"
                aria-label="Download this report as PDF"
              >
                <Download className="h-4 w-4" aria-hidden="true" /> Download PDF
              </Button>
            </div>
          </div>

          <div className="p-6 rounded-xl border border-border/40 bg-muted/20 space-y-4 text-xs font-mono">
            <p className="font-bold text-foreground">LEXISGRAPH STATUTORY AUDIT REPORT</p>
            <p className="text-muted-foreground">Report ID: {report.id}</p>
            <p className="text-muted-foreground">
              Overall Compliance Alignment Score: {score}%
            </p>
            <p className="text-muted-foreground">Risk Level: {riskInfo.level}</p>
          </div>
        </Card>
      </div>

      {/* ── SECTION 8: TIMELINE ── */}
      <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-indigo-500" aria-hidden="true" /> Execution Milestone Timeline
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-lg border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Submitted</span>
            <span className="font-semibold text-foreground">{createdFormatted}</span>
          </div>

          <div className="p-3.5 rounded-lg border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Completed</span>
            <span className="font-semibold text-foreground">{completedFormatted}</span>
          </div>

          <div className="p-3.5 rounded-lg border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Duration</span>
            <span className="font-semibold text-foreground">{durationText}</span>
          </div>
        </div>
      </Card>

      {/* ── SECTION 9: RELATED ANALYSES ── */}
      <Card className="border border-border/60 bg-card p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <History className="h-4 w-4 text-indigo-500" aria-hidden="true" /> Related Analyses for Organization
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/compliance/history")}
            className="text-xs cursor-pointer gap-1.5 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
            aria-label="View all analysis history"
          >
            View All History <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>

        {relatedReports.length === 0 ? (
          <p className="text-xs text-muted-foreground italic" role="status">
            No other compliance analyses recorded for this organization.
          </p>
        ) : (
          <div className="space-y-2 text-xs" role="list" aria-label="Related analyses">
            {relatedReports.map((rel) => (
              <div
                key={rel.id}
                role="listitem"
                className="p-3 rounded-lg border border-border/40 bg-muted/20 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-foreground font-mono">Audit #{rel.id.slice(0, 8)}</span>
                  <span className="text-muted-foreground">
                    {format(new Date(rel.created_at), "MMM d, yyyy")}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {rel.overall_score != null ? (
                    <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">
                      {rel.overall_score}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground font-mono">—</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/compliance/reports/${rel.id}`)}
                    className="text-xs cursor-pointer px-2"
                    aria-label={`Open analysis workspace for audit ${rel.id.slice(0, 8)}`}
                  >
                    Open Workspace
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Sprint 8.1: Close DETAILS tab wrapper */}
      </>
      )}

      {/* Share Audit Modal */}
      <ShareReportModal
        open={isShareModalOpen}
        onOpenChange={setIsShareModalOpen}
        report={report}
        reportId={report?.id || reportId}
        organizationName={organization?.name}
        regulationName={regDoc?.original_filename || (report?.regulation_id ? `Regulation #${report.regulation_id.slice(0, 8)}` : undefined)}
        policyName={policyDoc?.original_filename || (report?.policy_document_id ? `Policy #${report.policy_document_id.slice(0, 8)}` : undefined)}
        overallScore={report?.overall_score ?? details?.overall_score}
        riskLevel={report?.risk_level}
        totalClauses={details?.total_regulation_clauses}
        compliantCount={details?.compliant_count ?? report?.total_matches}
        partialCount={details?.partially_compliant_count ?? report?.total_partial_matches}
        gapCount={details?.non_compliant_count ?? report?.total_missing}
      />
    </div>
  );
};
