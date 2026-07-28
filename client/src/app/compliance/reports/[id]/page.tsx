"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  LogOut,
  Printer,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

import {
  complianceService,
  ComplianceReport,
  ComplianceReportDetails,
  EvaluatedClause,
} from "@/services/api/compliance";
import { documentService } from "@/services/document-service";
import { DocumentResponse } from "@/types/document";
import { organizationsService, Organization } from "@/services/api/organizations";

// ---------------------------------------------------------------------------
// Helpers & Risk Calculations
// ---------------------------------------------------------------------------

function calculateRisk(score: number | null | undefined, missingCount: number) {
  const s = score ?? 0;
  if (s >= 80 && missingCount === 0) {
    return {
      level: "LOW RISK",
      color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
      badge: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      icon: <ShieldCheck className="h-6 w-6 text-emerald-500" />,
      description: "Policy coverage aligns strongly with regulatory requirements.",
    };
  }
  if (s >= 50 && missingCount <= 2) {
    return {
      level: "MEDIUM RISK",
      color: "text-amber-500 bg-amber-500/10 border-amber-500/30",
      badge: "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
      icon: <ShieldAlert className="h-6 w-6 text-amber-500" />,
      description: "Moderate policy gaps or weak controls require attention.",
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

function StatusBadge({ status }: { status: string }) {
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
          <AlertTriangle className="h-3.5 w-3.5" /> Non-Compliant
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Main Report Component
// ---------------------------------------------------------------------------

function ComplianceReportDetailContent() {
  const { logout } = useAuth();
  const router = useRouter();
  const params = useParams();
  const reportId = params?.id as string;

  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [regDoc, setRegDoc] = useState<DocumentResponse | null>(null);
  const [policyDoc, setPolicyDoc] = useState<DocumentResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // ---------------------------------------------------------------------------
  // Load Report & Related Document Metadata
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!reportId) return;
    let active = true;

    (async () => {
      setIsLoading(true);
      try {
        const rep = await complianceService.getComplianceReport(reportId);
        if (!active) return;
        setReport(rep);

        // Fetch Organization metadata
        try {
          const org = await organizationsService.getOrganizationById(rep.organization_id);
          if (active) setOrganization(org);
        } catch {
          // Non-critical metadata lookup
        }

        // Fetch Regulation Document metadata
        try {
          const rDoc = await documentService.getDocument(rep.regulation_document_id);
          if (active) setRegDoc(rDoc);
        } catch {
          // Non-critical metadata lookup
        }

        // Fetch Policy Document metadata
        try {
          const pDoc = await documentService.getDocument(rep.policy_document_id);
          if (active) setPolicyDoc(pDoc);
        } catch {
          // Non-critical metadata lookup
        }
      } catch (err: any) {
        toast.error("Failed to load compliance report details.");
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [reportId]);

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

  const risk = useMemo(
    () => calculateRisk(report?.overall_score ?? details?.overall_score, details?.missing_clauses?.length ?? 0),
    [report, details]
  );

  // Toggle row expansion
  const toggleRow = (clauseId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(clauseId)) {
        next.delete(clauseId);
      } else {
        next.add(clauseId);
      }
      return next;
    });
  };

  // Filter evaluated clauses
  const filteredClauses = useMemo(() => {
    if (!details?.evaluated_clauses) return [];
    return details.evaluated_clauses.filter((item) => {
      const matchesStatus = filterStatus === "ALL" || item.status === filterStatus;
      const matchesSearch =
        !searchQuery.trim() ||
        item.regulation_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.matched_policy_text && item.matched_policy_text.toLowerCase().includes(searchQuery.toLowerCase())) ||
        item.reasoning.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [details, filterStatus, searchQuery]);

  // ---------------------------------------------------------------------------
  // Export Actions
  // ---------------------------------------------------------------------------
  const handleExportJSON = async () => {
    if (!report) return;
    try {
      const blob = await complianceService.downloadReportJSON(report.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance_report_${report.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("JSON report downloaded.");
    } catch {
      // Client-side fallback
      const payload = JSON.stringify(report, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance_report_${report.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("JSON report downloaded.");
    }
  };

  const handleExportPDF = async () => {
    if (!report) return;
    try {
      toast.info("Generating PDF report...");
      const blob = await complianceService.downloadReportPDF(report.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance_report_${report.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF report downloaded.");
    } catch {
      toast.info("Opening print dialog for PDF export...");
      window.print();
    }
  };

  const handleExportCSV = () => {

    if (!details?.evaluated_clauses) return;
    const headers = ["Regulation Clause ID", "Status", "Similarity Score", "Regulation Text", "Matched Policy Text", "Reasoning", "Recommendation"];
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
    a.download = `compliance_clauses_${report?.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV clause data downloaded.");
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-rose-500 mb-4" />
        <h2 className="text-2xl font-bold text-foreground">Compliance Report Not Found</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          The requested report could not be found or you do not have permission to access it.
        </p>
        <Button onClick={() => router.push("/compliance")} className="mt-6">
          Back to Compliance Audit
        </Button>
      </div>
    );
  }

  const score = report.overall_score ?? details?.overall_score ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground print:bg-white print:text-black">
      {/* ── Top Header (Hidden on Print) ── */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md print:hidden">
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

      <main className="p-6 md:p-10 max-w-7xl mx-auto space-y-8 print:p-0 print:max-w-none">
        {/* ── Action & Title Bar (Hidden on Print) ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-6 print:hidden">
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/compliance")}
              className="mb-1 -ml-2 w-fit flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Compliance Engine
            </Button>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight">Compliance Audit Report</h1>
              <Badge variant="outline" className="border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10">
                Report #{report.id.slice(0, 8)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Generated on {new Date(report.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          {/* Export Action Buttons */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportJSON} className="flex items-center gap-1.5">
              <FileCode className="h-4 w-4" /> JSON Export
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="flex items-center gap-1.5">
              <Download className="h-4 w-4" /> CSV Export
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF} className="flex items-center gap-1.5">
              <Download className="h-4 w-4 text-indigo-500" /> PDF Export
            </Button>
            <Button size="sm" onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-md">
              <Printer className="h-4 w-4" /> Print Report
            </Button>
          </div>

        </div>

        {/* ── Printable Header Header (Visible on Print Only) ── */}
        <div className="hidden print:block border-b pb-4 mb-6">
          <h1 className="text-2xl font-bold">LexisGraph Compliance Audit Report</h1>
          <p className="text-xs text-gray-600">Report ID: {report.id} | Generated: {new Date(report.created_at).toLocaleString()}</p>
        </div>

        {/* ── Source Citations & Metadata Card ── */}
        <Card className="border-border/60 bg-card/40 shadow-sm">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Organization</p>
                  <p className="font-medium text-foreground mt-0.5">{organization?.name || "Target Organization"}</p>
                  <p className="text-xs text-muted-foreground">{organization?.industry || "Legal & Regulatory Domain"}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-violet-500/10 text-violet-500 border border-violet-500/20 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Regulation Benchmark</p>
                  <p className="font-medium text-foreground mt-0.5">{regDoc?.original_filename || "Regulation Document"}</p>
                  <p className="text-xs text-muted-foreground">Reference Legal Standard</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <FileCheck2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audited Policy</p>
                  <p className="font-medium text-foreground mt-0.5">{policyDoc?.original_filename || "Policy Document"}</p>
                  <p className="text-xs text-muted-foreground">Target Corporate Guideline</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Top Dashboard Metrics Grid: Score Gauge, Risk Level, Pie/Progress Chart ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Score Gauge */}
          <Card className="border-border/60 bg-card/60 shadow-md">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-semibold uppercase tracking-wider">Overall Compliance Score</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between pt-0">
              <div>
                <div className="text-4xl font-extrabold text-indigo-600 dark:text-indigo-400">
                  {score.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {score >= 80 ? "High Compliance Alignment" : score >= 50 ? "Moderate Compliance Alignment" : "Critical Compliance Gaps"}
                </p>
              </div>

              {/* Circular Gauge Visualization */}
              <div className="relative h-20 w-20 flex items-center justify-center">
                <svg className="h-20 w-20 transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-muted/30"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className={score >= 80 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-rose-500"}
                    strokeDasharray={`${score}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute text-xs font-bold">{score.toFixed(0)}%</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Risk Assessment */}
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

          {/* Card 3: Clause Distribution Visualization */}
          <Card className="border-border/60 bg-card/60 shadow-md">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-semibold uppercase tracking-wider">Clause Distribution</CardDescription>
              <CardTitle className="text-base font-bold flex items-center justify-between mt-1">
                <span>{details?.total_regulation_clauses ?? 0} Requirements Evaluated</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Stacked Progress Bar */}
              <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                <div
                  style={{
                    width: `${
                      ((details?.compliant_count ?? 0) / (details?.total_regulation_clauses || 1)) * 100
                    }%`,
                  }}
                  className="bg-emerald-500"
                  title="Compliant"
                />
                <div
                  style={{
                    width: `${
                      ((details?.partially_compliant_count ?? 0) / (details?.total_regulation_clauses || 1)) * 100
                    }%`,
                  }}
                  className="bg-amber-500"
                  title="Partial Coverage"
                />
                <div
                  style={{
                    width: `${
                      ((details?.non_compliant_count ?? 0) / (details?.total_regulation_clauses || 1)) * 100
                    }%`,
                  }}
                  className="bg-rose-500"
                  title="Non-Compliant Gaps"
                />
              </div>

              {/* Metric Breakdown Legend */}
              <div className="grid grid-cols-3 gap-2 text-xs text-center pt-1">
                <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                  {details?.compliant_count ?? 0} Compliant
                </div>
                <div className="p-1.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-semibold">
                  {details?.partially_compliant_count ?? 0} Partial
                </div>
                <div className="p-1.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-semibold">
                  {details?.non_compliant_count ?? 0} Missing
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Executive Summary Section ── */}
        {details?.summary && (
          <Card className="border-border/60 bg-card/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-500" /> Executive Compliance Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">{details.summary}</p>
            </CardContent>
          </Card>
        )}

        {/* ── Clause-by-Clause Audit Table & Expandable Details ── */}
        <Card className="border-border/60 bg-card/60 shadow-md">
          <CardHeader className="pb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-bold">Clause-by-Clause Evaluation Table</CardTitle>
                <CardDescription>Expand any row to inspect similarity metrics, graph context, and legal reasoning.</CardDescription>
              </div>

              {/* Search & Status Filters */}
              <div className="flex items-center gap-3">
                <div className="relative w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search clause text..."
                    className="pl-8 h-9 text-xs"
                  />
                </div>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs ring-offset-background focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="COMPLIANT">Compliant</option>
                  <option value="PARTIALLY_COMPLIANT">Partially Compliant</option>
                  <option value="NON_COMPLIANT">Non-Compliant</option>
                </select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-[15%]">Status</TableHead>
                  <TableHead className="w-[35%]">Regulation Requirement</TableHead>
                  <TableHead className="w-[32%]">Matched Policy Clause</TableHead>
                  <TableHead className="w-[12%] text-center">Match Score</TableHead>
                  <TableHead className="w-[6%] text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClauses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground text-sm">
                      No matching clauses found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClauses.map((clause) => {
                    const isExpanded = expandedRows.has(clause.regulation_clause_id);
                    return (
                      <React.Fragment key={clause.regulation_clause_id}>
                        <TableRow
                          onClick={() => toggleRow(clause.regulation_clause_id)}
                          className="cursor-pointer hover:bg-muted/40 transition-colors"
                        >
                          <TableCell>
                            <StatusBadge status={clause.status} />
                          </TableCell>
                          <TableCell className="font-medium text-sm text-foreground">
                            <p className="line-clamp-2">{clause.regulation_text}</p>
                            <span className="text-[10px] text-muted-foreground font-mono">ID: {clause.regulation_clause_id}</span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {clause.matched_policy_text ? (
                              <p className="line-clamp-2">{clause.matched_policy_text}</p>
                            ) : (
                              <span className="text-xs italic text-rose-500">No policy match found</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-mono text-xs">
                              {(clause.similarity_score * 100).toFixed(0)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon-sm">
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                        </TableRow>

                        {/* Expandable Detail Sub-Row */}
                        {isExpanded && (
                          <TableRow className="bg-muted/20 hover:bg-muted/20 border-b border-border/60">
                            <TableCell colSpan={5} className="p-6">
                              <div className="space-y-4 text-sm">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Regulation Citation */}
                                  <div className="p-4 rounded-lg bg-background border border-border/60 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-semibold uppercase tracking-wider text-indigo-500">
                                        Regulation Requirement Citation
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCopyText(clause.regulation_text);
                                        }}
                                      >
                                        <Copy className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                    <p className="text-foreground">{clause.regulation_text}</p>
                                  </div>

                                  {/* Policy Citation */}
                                  <div className="p-4 rounded-lg bg-background border border-border/60 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-semibold uppercase tracking-wider text-emerald-500">
                                        Matched Policy Wording
                                      </span>
                                      {clause.matched_policy_text && (
                                        <Button
                                          variant="ghost"
                                          size="icon-sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleCopyText(clause.matched_policy_text || "");
                                          }}
                                        >
                                          <Copy className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                    </div>
                                    <p className="text-muted-foreground">
                                      {clause.matched_policy_text || "No policy clause addressing this requirement was identified in the policy document."}
                                    </p>
                                  </div>
                                </div>

                                {/* LLM Legal Reasoning */}
                                <div className="p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20 space-y-1">
                                  <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                                    <Sparkles className="h-3.5 w-3.5" /> LLM Compliance Auditor Reasoning
                                  </div>
                                  <p className="text-foreground text-sm">{clause.reasoning}</p>
                                </div>

                                {/* Actionable Recommendation if present */}
                                {clause.recommendation && (
                                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-1">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                                      <AlertTriangle className="h-3.5 w-3.5" /> Recommended Remediation
                                    </div>
                                    <p className="text-amber-900 dark:text-amber-200 text-sm">{clause.recommendation}</p>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── Actionable Recommendations & Remediation List ── */}
        {details?.recommendations && details.recommendations.length > 0 && (
          <Card className="border-indigo-500/30 bg-gradient-to-br from-indigo-950/10 via-card to-background shadow-md">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-500" /> Actionable Policy Remediation Steps
              </CardTitle>
              <CardDescription>Follow these recommendations to achieve 100% compliance alignment.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {details.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-3 p-4 rounded-xl bg-background/90 border border-border/60 shadow-sm">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white font-bold text-xs">
                      {idx + 1}
                    </span>
                    <div className="flex-1 text-sm text-foreground">{rec}</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyText(rec)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

export default function ComplianceReportDetailPage() {
  return (
    <ProtectedRoute>
      <ComplianceReportDetailContent />
    </ProtectedRoute>
  );
}
