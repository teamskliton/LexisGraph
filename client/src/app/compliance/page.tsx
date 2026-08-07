// /compliance — Compliance Analysis Workspace Home Landing Page
// Serves as the central executive landing dashboard for the Compliance module in an Organization.
// Implements 6 core sections:
// Section 1: Workspace Header (Org Name, Compliance Score, Risk Level, Last Analysis Date, Current Analysis Status, Primary/Secondary CTAs)
// Section 2: Compliance Overview KPIs (Total Analyses, Latest Score, Active Risks, Policies Covered, Regulations Applied)
// Section 3: Analysis Readiness Checklist & Missing Prerequisite Alerts
// Section 4: Latest Analysis Card (or Contextual Empty State)
// Section 5: Analysis History Preview (Top 5 Recent Analyses)
// Section 6: Compliance Quick Actions Cards

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft,
  Layers,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";

import { ComplianceWorkspaceHeader } from "@/components/compliance/ComplianceWorkspaceHeader";
import { ComplianceOverviewKpis } from "@/components/compliance/ComplianceOverviewKpis";
import { AnalysisReadinessCard } from "@/components/compliance/AnalysisReadinessCard";
import { LatestAnalysisCard } from "@/components/compliance/LatestAnalysisCard";
import { AnalysisHistoryPreview } from "@/components/compliance/AnalysisHistoryPreview";
import { ComplianceQuickActions } from "@/components/compliance/ComplianceQuickActions";

import { organizationsService, Organization } from "@/services/api/organizations";
import { documentService } from "@/services/document-service";
import { regulationsApi } from "@/services/api/regulations";
import { complianceService, ComplianceReport, ComplianceJob } from "@/services/api/compliance";
import { DocumentResponse } from "@/types/document";

function calculateRiskLevel(score: number | null | undefined, missingCount: number = 0) {
  const actualScore = score ?? 0;
  if (actualScore >= 85 && missingCount === 0) {
    return {
      label: "LOW RISK",
      color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
      badge: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />,
    };
  }
  if (actualScore >= 70 && missingCount <= 2) {
    return {
      label: "MEDIUM RISK",
      color: "text-amber-500 bg-amber-500/10 border-amber-500/30",
      badge: "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
      icon: <ShieldAlert className="h-4 w-4 text-amber-500" />,
    };
  }
  return {
    label: "HIGH RISK",
    color: "text-rose-500 bg-rose-500/10 border-rose-500/30",
    badge: "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30",
    icon: <AlertTriangle className="h-4 w-4 text-rose-500" />,
  };
}

function ComplianceWorkspaceHomeContent() {
  const { logout } = useAuth();
  const router = useRouter();

  // State: Organization selection
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [isOrgLoading, setIsOrgLoading] = useState(true);

  // State: Workspace backend data
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [regulationsCount, setRegulationsCount] = useState<number>(0);
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [jobs, setJobs] = useState<ComplianceJob[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  // 1. Fetch Organizations
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
        toast.error("Failed loading organization workspaces.");
      } finally {
        if (active) setIsOrgLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 2. Fetch Workspace Data on Organization Change
  const fetchWorkspaceData = useCallback(async (orgId: string) => {
    if (!orgId) return;
    setIsDataLoading(true);

    try {
      const [docsData, regsData, reportsData, jobsData] = await Promise.all([
        documentService.getDocuments(orgId).catch(() => []),
        regulationsApi.listRegulations(orgId).catch(() => []),
        complianceService.listComplianceReports(orgId).catch(() => []),
        complianceService.listComplianceJobs(orgId).catch(() => []),
      ]);

      setDocuments(docsData || []);
      setRegulationsCount((regsData || []).length);
      setReports(reportsData || []);
      setJobs(jobsData || []);
    } catch {
      toast.error("Failed loading compliance workspace metrics.");
    } finally {
      setIsDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedOrgId) {
      fetchWorkspaceData(selectedOrgId);
    }
  }, [selectedOrgId, fetchWorkspaceData]);

  // Derived Calculations
  const selectedOrg = useMemo(
    () => organizations.find((o) => o.id === selectedOrgId) || null,
    [organizations, selectedOrgId]
  );

  const policyDocs = useMemo(
    () => documents.filter((d) => d.document_type === "POLICY"),
    [documents]
  );

  const regDocs = useMemo(
    () => documents.filter((d) => d.document_type === "REGULATION"),
    [documents]
  );

  const totalRegsCount = Math.max(regulationsCount, regDocs.length);

  const latestReport = useMemo(() => {
    if (reports.length === 0) return null;
    return [...reports].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
  }, [reports]);

  const latestJob = useMemo(() => {
    if (jobs.length === 0) return null;
    return [...jobs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
  }, [jobs]);

  const complianceScore = useMemo(() => {
    if (latestReport?.overall_score != null) return latestReport.overall_score;
    if (reports.length > 0) {
      const validScores = reports
        .map((r) => r.overall_score)
        .filter((s): s is number => s != null);
      if (validScores.length > 0) {
        return Math.round(
          validScores.reduce((acc, curr) => acc + curr, 0) / validScores.length
        );
      }
    }
    return null;
  }, [latestReport, reports]);

  const riskLevel = useMemo(
    () => calculateRiskLevel(complianceScore, 0),
    [complianceScore]
  );

  const lastAnalysisDate = useMemo(() => {
    if (latestReport?.created_at) {
      return format(new Date(latestReport.created_at), "MMM d, yyyy");
    }
    if (latestJob?.created_at) {
      return format(new Date(latestJob.created_at), "MMM d, yyyy");
    }
    return "No analysis yet";
  }, [latestReport, latestJob]);

  const currentAnalysisStatus = useMemo(() => {
    const activeJob = jobs.find(
      (j) => j.status === "QUEUED" || j.status === "RUNNING"
    );
    if (activeJob) return `Running (${activeJob.progress}%)`;
    if (latestReport) return "Completed";
    return "Idle";
  }, [jobs, latestReport]);

  const activeRisksCount = useMemo(() => {
    if (complianceScore == null) return 0;
    if (complianceScore < 70) return 3;
    if (complianceScore < 85) return 1;
    return 0;
  }, [complianceScore]);

  const handleRunAnalysisCTA = () => {
    if (policyDocs.length === 0 || totalRegsCount === 0) {
      toast.warning("Upload policies and select regulations before running an analysis.");
      router.push("/documents");
      return;
    }
    toast.info("Navigating to analysis configuration...");
    router.push("/compliance/new");
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-12">
      {/* Navbar Header */}
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
        {/* Back to Dashboard & Title */}
        <div className="flex flex-col gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard")}
            className="mb-1 -ml-2 w-fit flex items-center gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>

        {/* SECTION 1: WORKSPACE HEADER */}
        <ComplianceWorkspaceHeader
          organization={selectedOrg}
          organizations={organizations}
          onSelectOrganization={setSelectedOrgId}
          complianceScore={complianceScore}
          riskLevel={riskLevel}
          lastAnalysisDate={lastAnalysisDate}
          currentAnalysisStatus={currentAnalysisStatus}
          onRunAnalysis={handleRunAnalysisCTA}
        />

        {/* SECTION 2: COMPLIANCE OVERVIEW KPIS */}
        <ComplianceOverviewKpis
          totalAnalyses={reports.length + jobs.length}
          latestScore={complianceScore}
          activeRisksCount={activeRisksCount}
          policiesCount={policyDocs.length}
          regulationsCount={totalRegsCount}
          isLoading={isOrgLoading || isDataLoading}
        />

        {/* SECTION 3: ANALYSIS READINESS */}
        <AnalysisReadinessCard
          policiesCount={policyDocs.length}
          regulationsCount={totalRegsCount}
          isKnowledgeGraphReady={true}
          hasPreviousAnalysis={reports.length > 0 || jobs.length > 0}
          isLoading={isOrgLoading || isDataLoading}
        />

        {/* MAIN BODY 2-COLUMN GRID: SECTIONS 4 & 5 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SECTION 4: LATEST ANALYSIS */}
          <LatestAnalysisCard
            latestReport={latestReport}
            latestJob={latestJob}
            isLoading={isOrgLoading || isDataLoading}
            onRunAnalysis={handleRunAnalysisCTA}
          />

          {/* SECTION 5: ANALYSIS HISTORY PREVIEW */}
          <AnalysisHistoryPreview
            reports={reports}
            jobs={jobs}
            isLoading={isOrgLoading || isDataLoading}
          />
        </div>

        {/* SECTION 6: QUICK ACTIONS */}
        <ComplianceQuickActions onRunAnalysis={handleRunAnalysisCTA} />
      </main>
    </div>
  );
}

export default function ComplianceWorkspaceHomePage() {
  return (
    <ProtectedRoute>
      <ComplianceWorkspaceHomeContent />
    </ProtectedRoute>
  );
}
