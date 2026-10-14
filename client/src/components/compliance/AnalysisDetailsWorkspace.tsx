// AnalysisDetailsWorkspace — Enterprise 5-Tab Statutory Compliance Audit Workspace
// Tab-based architecture: Overview | Findings | Evidence | Action Plan | Audit Details
// Synchronized with URL query parameters, GraphRAG evidence, and FindingDetailDrawer.

"use client";

import React, { useEffect, useMemo, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  FileCheck2,
  Layers,
  LayoutDashboard,
  ShieldAlert,
  Network,
  CheckCircle2,
  FileText,
  RefreshCw,
  Loader2,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import {
  complianceService,
  ComplianceReport,
  ComplianceReportDetails,
} from "@/services/api/compliance";
import { reportService } from "@/services/reportService";
import { documentService } from "@/services/document-service";
import { DocumentResponse } from "@/types/document";
import { organizationsService, Organization } from "@/services/api/organizations";
import { regulationsApi, GlobalRegulation } from "@/services/api/regulations";

import { ReportHeader } from "./report/ReportHeader";
import { OverviewTab } from "./report/OverviewTab";
import { FindingsTab } from "./report/FindingsTab";
import { EvidenceTab } from "./report/EvidenceTab";
import { ActionPlanTab, ActionPlanItem } from "./report/ActionPlanTab";
import { AuditDetailsTab } from "./report/AuditDetailsTab";
import { FindingDetailDrawer, FindingItem } from "./FindingDetailDrawer";
import { ShareReportModal } from "./ShareReportModal";

type PrimaryTab = "overview" | "findings" | "evidence" | "action-plan" | "audit-details";

interface AnalysisDetailsWorkspaceProps {
  reportId: string;
}

function AnalysisDetailsWorkspaceInner({ reportId }: AnalysisDetailsWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Active Tab synchronized with ?tab=...
  const tabFromUrl = searchParams.get("tab");
  const validTabs: PrimaryTab[] = ["overview", "findings", "evidence", "action-plan", "audit-details"];
  const initialTab: PrimaryTab =
    tabFromUrl && validTabs.includes(tabFromUrl as PrimaryTab)
      ? (tabFromUrl as PrimaryTab)
      : "overview";

  const [activeTab, setActiveTab] = useState<PrimaryTab>(initialTab);
  const [initialSeverityFilter, setInitialSeverityFilter] = useState<string>("ALL");

  // Core Data States
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [regDoc, setRegDoc] = useState<DocumentResponse | null>(null);
  const [globalReg, setGlobalReg] = useState<GlobalRegulation | null>(null);
  const [policyDoc, setPolicyDoc] = useState<DocumentResponse | null>(null);
  const [dbFindings, setDbFindings] = useState<FindingItem[]>([]);

  // UI States
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Sync tab with URL
  const handleTabChange = useCallback((newTab: PrimaryTab) => {
    setActiveTab(newTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", newTab);
    window.history.replaceState({}, "", url.toString());
  }, []);

  // Synchronize if user navigates via browser back/forward buttons
  useEffect(() => {
    if (tabFromUrl && validTabs.includes(tabFromUrl as PrimaryTab)) {
      setActiveTab(tabFromUrl as PrimaryTab);
    }
  }, [tabFromUrl]);

  // Load Report and all related metadata in parallel
  const loadWorkspace = useCallback(async () => {
    const isUUID =
      !!reportId &&
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        reportId
      );
    if (!isUUID) {
      setErrorMessage("Invalid Report ID format. Please select a report from your organization list.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Fetch main report
      const rep = await complianceService.getComplianceReport(reportId);
      setReport(rep);

      // 2. Fetch DB findings, Organization, Policy Document, Regulation Metadata in parallel
      const [findingsData, orgData, pDocData, rDocData, gRegData] = await Promise.all([
        reportService.getReportFindings(reportId).catch(() => []),
        organizationsService.getOrganizationById(rep.organization_id).catch(() => null),
        documentService.getDocument(rep.policy_document_id).catch(() => null),
        rep.regulation_document_id
          ? documentService.getDocument(rep.regulation_document_id).catch(() => null)
          : null,
        rep.regulation_id || rep.regulation_document_id
          ? regulationsApi
              .getRegulation(rep.regulation_id || rep.regulation_document_id)
              .catch(() => null)
          : null,
      ]);

      setDbFindings(findingsData || []);
      setOrganization(orgData);
      setPolicyDoc(pDocData);
      setRegDoc(rDocData);
      setGlobalReg(gRegData);
    } catch (err: any) {
      console.error(`Error loading report workspace ${reportId}:`, err);
      const rawDetail = err?.response?.data?.detail;
      let detailMsg = "The compliance report could not be retrieved. Please verify your permissions.";
      if (typeof rawDetail === "string") {
        detailMsg = rawDetail;
      } else if (err?.message) {
        detailMsg = err.message;
      }
      setErrorMessage(detailMsg);
      toast.error("Failed to load statutory report details.");
    } finally {
      setIsLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  // Parse structured report details
  const details: ComplianceReportDetails | null = useMemo(() => {
    if (!report) return null;
    if (report.details) return report.details;
    if (report.report_json && typeof report.report_json === "object") {
      return report.report_json as ComplianceReportDetails;
    }
    if (report.summary) {
      try {
        return JSON.parse(report.summary);
      } catch {
        return null;
      }
    }
    return null;
  }, [report]);

  // Overall Score
  const score = report?.overall_score ?? details?.overall_score ?? 0;

  // Correlate evaluated clauses and DB findings
  const { allFindings, evidenceItems, actionItems } = useMemo(() => {
    const clauses = details?.evaluated_clauses || [];
    const dbMap = new Map<string, FindingItem>();
    dbFindings.forEach((f) => {
      if (f.regulation_clause_id) {
        dbMap.set(f.regulation_clause_id, f);
      }
      if (f.id) {
        dbMap.set(f.id, f);
      }
    });

    const unifiedFindings: FindingItem[] = [];
    const evidenceList: any[] = [];
    const actionPlanList: ActionPlanItem[] = [];

    // Process all evaluated clauses
    clauses.forEach((c, idx) => {
      const dbMatch = dbMap.get(c.regulation_clause_id);

      const severity =
        dbMatch?.severity ||
        (c.status === "NON_COMPLIANT"
          ? "HIGH"
          : c.status === "PARTIALLY_COMPLIANT"
          ? "MEDIUM"
          : "LOW");

      const lifecycle =
        dbMatch?.lifecycle_status ||
        (c.status === "COMPLIANT" ? "RESOLVED" : "OPEN");

      const findingObj: FindingItem = {
        id: dbMatch?.id || `clause-${c.regulation_clause_id || idx}`,
        report_id: report?.id || reportId,
        policy_clause_id: dbMatch?.policy_clause_id || c.matched_policy_clause_id || null,
        regulation_clause_id: c.regulation_clause_id,
        status: dbMatch?.status || c.status,
        lifecycle_status: lifecycle,
        confidence: c.similarity_score,
        severity: severity,
        reasoning: dbMatch?.reasoning || c.reasoning || "Statutory clause evaluation",
        recommendation: dbMatch?.recommendation || c.recommendation || null,
        citation: dbMatch?.citation || c.regulation_text,
        matched_policy_text: dbMatch?.matched_policy_text || c.matched_policy_text || null,
        assigned_to: dbMatch?.assigned_to || null,
        assignee: dbMatch?.assignee || null,
        created_at: dbMatch?.created_at || report?.created_at,
        updated_at: dbMatch?.updated_at || report?.updated_at,
      };

      unifiedFindings.push(findingObj);

      // Evidence Explorer item
      evidenceList.push({
        id: `ev-${c.regulation_clause_id || idx}`,
        regulationClauseId: c.regulation_clause_id,
        regulationText: c.regulation_text,
        matchedPolicyClauseId: c.matched_policy_clause_id,
        matchedPolicyText: c.matched_policy_text,
        similarityScore: c.similarity_score,
        graphScore: c.graph_score,
        status: c.status,
        reasoning: c.reasoning,
        recommendation: c.recommendation,
        associatedFinding: findingObj,
      });

      // Action Plan item if there is a recommendation
      const recText = findingObj.recommendation;
      if (recText && recText.trim()) {
        actionPlanList.push({
          id: `act-${findingObj.id}`,
          findingId: findingObj.id,
          findingTitle: findingObj.reasoning || findingObj.citation || "Statutory Requirement",
          statutoryClause: findingObj.regulation_clause_id || "Statutory Mandate",
          recommendedAction: recText,
          priority:
            findingObj.severity === "CRITICAL"
              ? "CRITICAL"
              : findingObj.severity === "HIGH"
              ? "HIGH"
              : findingObj.severity === "MEDIUM"
              ? "MEDIUM"
              : "LOW",
          status: findingObj.lifecycle_status || "OPEN",
          assignedTo: findingObj.assigned_to,
          assigneeName: findingObj.assignee?.full_name || null,
          findingItem: findingObj,
        });
      }
    });

    // If report has standalone recommendations not attached to evaluated clauses, append them
    if (details?.recommendations && Array.isArray(details.recommendations)) {
      details.recommendations.forEach((recStr, rIdx) => {
        if (typeof recStr === "string" && !actionPlanList.some((a) => a.recommendedAction === recStr)) {
          const fallbackFinding: FindingItem = {
            id: `rec-finding-${rIdx}`,
            report_id: report?.id || reportId,
            status: "NON_COMPLIANT",
            lifecycle_status: "OPEN",
            severity: "HIGH",
            reasoning: recStr,
            recommendation: recStr,
            citation: "Audit Assessment Recommendation",
          };
          actionPlanList.push({
            id: `act-rec-${rIdx}`,
            findingId: fallbackFinding.id,
            findingTitle: "Compliance Remediation Priority",
            statutoryClause: `Recommendation #${rIdx + 1}`,
            recommendedAction: recStr,
            priority: "HIGH",
            status: "OPEN",
            findingItem: fallbackFinding,
          });
        }
      });
    }

    return {
      allFindings: unifiedFindings,
      evidenceItems: evidenceList,
      actionItems: actionPlanList,
    };
  }, [details, dbFindings, report, reportId]);

  // Severity counts
  const { criticalCount, highCount, mediumCount, lowCount } = useMemo(() => {
    let crit = 0;
    let hi = 0;
    let med = 0;
    let lo = 0;

    allFindings.forEach((f) => {
      if (f.severity === "CRITICAL") crit++;
      else if (f.severity === "HIGH") hi++;
      else if (f.severity === "MEDIUM") med++;
      else lo++;
    });

    // If no findings, fallback to details counts
    if (allFindings.length === 0 && details) {
      hi = details.non_compliant_count || 0;
      med = details.partially_compliant_count || 0;
      lo = details.compliant_count || 0;
    }

    return {
      criticalCount: crit,
      highCount: hi,
      mediumCount: med,
      lowCount: lo,
    };
  }, [allFindings, details]);

  // Top Priority Findings (up to 5 highest severity unresolved)
  const topPriorityFindings = useMemo(() => {
    return allFindings
      .filter((f) => (f.lifecycle_status || "OPEN") !== "RESOLVED")
      .sort((a, b) => {
        const rank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        return (rank[b.severity] || 0) - (rank[a.severity] || 0);
      })
      .slice(0, 5);
  }, [allFindings]);

  // Finding Handlers
  const handleSelectFinding = (finding: FindingItem) => {
    setSelectedFinding(finding);
    setIsDrawerOpen(true);
  };

  const handleFindingUpdated = (updated: FindingItem) => {
    setDbFindings((prev) =>
      prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f))
    );
    setSelectedFinding(updated);
    toast.success("Finding operational lifecycle status updated.");
  };

  const handleNavigateToFindings = (severity?: string) => {
    if (severity) {
      setInitialSeverityFilter(severity);
    }
    handleTabChange("findings");
  };

  // Export handlers
  const handleExportPDF = async () => {
    if (!report) return;
    try {
      toast.info("Generating official audit PDF export...");
      const blob = await complianceService.downloadReportPDF(report.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LexisGraph_Audit_Report_${report.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF audit report downloaded successfully.");
    } catch {
      window.print();
    }
  };

  const handleExportJSON = async () => {
    if (!report) return;
    try {
      const blob = await complianceService.downloadReportJSON(report.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LexisGraph_Report_${report.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("JSON report data downloaded.");
    } catch {
      const payload = JSON.stringify(report, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LexisGraph_Report_${report.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("JSON report downloaded.");
    }
  };

  const handleExportCSV = () => {
    if (allFindings.length === 0) {
      toast.error("No findings available to export.");
      return;
    }
    const headers = [
      "Finding ID",
      "Statutory Clause ID",
      "Severity",
      "Lifecycle Status",
      "Compliance Status",
      "Statutory Citation",
      "Matched Policy Text",
      "Reasoning",
      "Recommendation",
      "Assigned Owner",
    ];
    const rows = allFindings.map((f) => [
      `"${f.id}"`,
      `"${f.regulation_clause_id || ""}"`,
      `"${f.severity}"`,
      `"${f.lifecycle_status || "OPEN"}"`,
      `"${f.status}"`,
      `"${(f.citation || "").replace(/"/g, '""')}"`,
      `"${(f.matched_policy_text || "").replace(/"/g, '""')}"`,
      `"${(f.reasoning || "").replace(/"/g, '""')}"`,
      `"${(f.recommendation || "").replace(/"/g, '""')}"`,
      `"${f.assignee?.full_name || "Unassigned"}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `LexisGraph_Findings_${report?.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Findings CSV export downloaded.");
  };

  // Names
  const policyName = policyDoc?.original_filename || (report?.policy_document_id ? `Policy #${report.policy_document_id.slice(0, 8)}` : undefined);
  const regulationName = globalReg?.title || globalReg?.original_filename || regDoc?.original_filename || (report?.regulation_id ? `Regulation #${report.regulation_id.slice(0, 8)}` : undefined);
  const organizationName = organization?.name || "TechNova Solutions Pvt. Ltd.";

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-16" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  // Error boundary state
  if (errorMessage || !report) {
    return (
      <Card className="border border-rose-500/30 bg-rose-500/5 p-12 text-center max-w-2xl mx-auto my-12 space-y-4 shadow-sm">
        <AlertTriangle className="h-12 w-12 text-rose-500 mx-auto" />
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-foreground">Audit Report Could Not Be Loaded</h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {errorMessage || "The requested statutory compliance report could not be found or access is restricted."}
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/reports")}
            className="text-xs cursor-pointer"
          >
            Back to Reports
          </Button>
          <Button
            size="sm"
            onClick={loadWorkspace}
            className="text-xs gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ── REPORT HEADER (Sticky & Clean) ── */}
      <ReportHeader
        reportId={report.id}
        organizationName={organizationName}
        organizationId={report.organization_id}
        policyName={policyName}
        regulationName={regulationName}
        status={report.status}
        riskLevel={report.risk_level || (score >= 80 ? "LOW" : score >= 50 ? "MEDIUM" : "HIGH")}
        score={score}
        createdAt={report.created_at}
        updatedAt={report.updated_at}
        onExportPDF={handleExportPDF}
        onExportJSON={handleExportJSON}
        onExportCSV={handleExportCSV}
        onShare={() => setIsShareModalOpen(true)}
      />

      {/* ── 5 PRIMARY REPORT TABS NAVIGATION ── */}
      <div className="border-b border-border">
        <div
          className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none"
          role="tablist"
          aria-label="Statutory compliance report sections"
        >
          {/* Tab 1: Overview */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "overview"}
            onClick={() => handleTabChange("overview")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              activeTab === "overview"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Overview</span>
          </button>

          {/* Tab 2: Findings */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "findings"}
            onClick={() => handleTabChange("findings")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              activeTab === "findings"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
            )}
          >
            <ShieldAlert className="h-4 w-4" />
            <span>Findings</span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 font-mono",
                activeTab === "findings"
                  ? "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30"
                  : "bg-muted text-muted-foreground border-border"
              )}
            >
              {allFindings.length}
            </Badge>
          </button>

          {/* Tab 3: Evidence */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "evidence"}
            onClick={() => handleTabChange("evidence")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              activeTab === "evidence"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
            )}
          >
            <Network className="h-4 w-4" />
            <span>Evidence</span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 font-mono",
                activeTab === "evidence"
                  ? "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30"
                  : "bg-muted text-muted-foreground border-border"
              )}
            >
              {evidenceItems.length}
            </Badge>
          </button>

          {/* Tab 4: Action Plan */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "action-plan"}
            onClick={() => handleTabChange("action-plan")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              activeTab === "action-plan"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
            )}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Action Plan</span>
            {actionItems.length > 0 && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0 font-mono",
                  activeTab === "action-plan"
                    ? "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30"
                    : "bg-muted text-muted-foreground border-border"
                )}
              >
                {actionItems.length}
              </Badge>
            )}
          </button>

          {/* Tab 5: Audit Details */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "audit-details"}
            onClick={() => handleTabChange("audit-details")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              activeTab === "audit-details"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
            )}
          >
            <FileText className="h-4 w-4" />
            <span>Audit Details</span>
          </button>
        </div>
      </div>

      {/* ── TAB CONTENT CONTAINERS (Lazy / Non-overlapping) ── */}
      <div className="pt-2">
        {/* Tab 1: Overview */}
        {activeTab === "overview" && (
          <div role="tabpanel" aria-label="Executive Overview">
            <OverviewTab
              score={score}
              riskLevel={report.risk_level || (score >= 80 ? "LOW" : score >= 50 ? "MEDIUM" : "HIGH")}
              totalFindings={allFindings.length}
              criticalCount={criticalCount}
              highCount={highCount}
              mediumCount={mediumCount}
              lowCount={lowCount}
              summaryText={details?.summary || report.executive_summary}
              topPriorityFindings={topPriorityFindings}
              organizationName={organizationName}
              policyName={policyName}
              regulationName={regulationName}
              policyDocumentId={report.policy_document_id}
              regulationDocumentId={report.regulation_document_id}
              createdAt={report.created_at}
              onNavigateToFindings={handleNavigateToFindings}
              onSelectFinding={handleSelectFinding}
            />
          </div>
        )}

        {/* Tab 2: Findings */}
        {activeTab === "findings" && (
          <div role="tabpanel" aria-label="Compliance Findings">
            <FindingsTab
              findings={allFindings}
              initialSeverityFilter={initialSeverityFilter}
              onSelectFinding={handleSelectFinding}
            />
          </div>
        )}

        {/* Tab 3: Evidence */}
        {activeTab === "evidence" && (
          <div role="tabpanel" aria-label="Evidence Explorer">
            <EvidenceTab
              evidenceList={evidenceItems}
              regulationName={regulationName}
              policyName={policyName}
              onSelectFinding={handleSelectFinding}
            />
          </div>
        )}

        {/* Tab 4: Action Plan */}
        {activeTab === "action-plan" && (
          <div role="tabpanel" aria-label="Remediation Action Plan">
            <ActionPlanTab
              actions={actionItems}
              onSelectFinding={handleSelectFinding}
              policyDocumentId={report.policy_document_id}
            />
          </div>
        )}

        {/* Tab 5: Audit Details */}
        {activeTab === "audit-details" && (
          <div role="tabpanel" aria-label="Audit Details">
            <AuditDetailsTab
              reportId={report.id}
              organizationId={report.organization_id}
              organizationName={organizationName}
              policyDocumentId={report.policy_document_id}
              policyName={policyName}
              regulationDocumentId={report.regulation_document_id}
              regulationName={regulationName}
              status={report.status}
              createdAt={report.created_at}
              updatedAt={report.updated_at}
              totalClauses={allFindings.length}
            />
          </div>
        )}
      </div>

      {/* ── FINDING DETAIL DRAWER (Reused System-Wide) ── */}
      <FindingDetailDrawer
        finding={selectedFinding}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onFindingUpdated={handleFindingUpdated}
        reportName={regulationName}
      />

      {/* ── SHARE REPORT MODAL ── */}
      <ShareReportModal
        open={isShareModalOpen}
        onOpenChange={setIsShareModalOpen}
        report={report}
        reportId={report.id}
        organizationName={organizationName}
        regulationName={regulationName}
        policyName={policyName}
        overallScore={score}
        riskLevel={report.risk_level || undefined}
        totalClauses={allFindings.length}
        compliantCount={lowCount}
        partialCount={mediumCount}
        gapCount={highCount + criticalCount}
      />
    </div>
  );
}

export function AnalysisDetailsWorkspace({ reportId }: AnalysisDetailsWorkspaceProps) {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 max-w-7xl mx-auto pb-16">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      }
    >
      <AnalysisDetailsWorkspaceInner reportId={reportId} />
    </Suspense>
  );
}
