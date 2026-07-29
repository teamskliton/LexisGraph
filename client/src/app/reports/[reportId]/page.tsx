"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { reportService } from "@/services/reportService";
import { organizationsService, Organization } from "@/services/api/organizations";
import { ReportDetailResponse } from "@/types/report";

// Modular Components
import { ReportHeader } from "@/components/reports/ReportHeader";
import { ComplianceScoreCard } from "@/components/reports/ComplianceScoreCard";
import { ReportSummary } from "@/components/reports/ReportSummary";
import { ClauseStatistics } from "@/components/reports/ClauseStatistics";
import { RecommendationsCard } from "@/components/reports/RecommendationsCard";
import { ReportMetadata } from "@/components/reports/ReportMetadata";
import { ReportLoading } from "@/components/reports/ReportLoading";

import { Button } from "@/components/ui/button";
import { Layers, LogOut, ArrowLeft, RefreshCw, FileQuestion } from "lucide-react";
import { toast } from "sonner";

function ReportDetailPageContent() {
  const { logout } = useAuth();
  const router = useRouter();
  const params = useParams();
  const reportId = Array.isArray(params?.reportId)
    ? params.reportId[0]
    : (params?.reportId as string) || "";

  const [report, setReport] = useState<ReportDetailResponse | null>(null);
  const [orgName, setOrgName] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Fetch Report Details
  const fetchReportDetails = useCallback(async () => {
    if (!reportId) {
      setError("Invalid Report ID.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Call GET /reports/{report_id}
      const data = await reportService.getReportById(reportId);
      setReport(data);

      // 2. Fetch Organization details for name display
      if (data.organization_id) {
        try {
          const orgs: Organization[] = await organizationsService.getOrganizations();
          const found = orgs.find((o) => o.id === data.organization_id);
          if (found) {
            setOrgName(found.name);
          }
        } catch {
          // Ignore org resolution error silently
        }
      }
    } catch (err: unknown) {
      console.error("Error fetching report details:", err);
      const apiError = err as { response?: { data?: { detail?: string } }; message?: string };
      const message =
        apiError.response?.data?.detail ||
        apiError.message ||
        `Unable to load report "${reportId}". Please verify backend connection.`;
      setError(message);
      toast.error("Failed to load report details");
    } finally {
      setIsLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    fetchReportDetails();
  }, [fetchReportDetails]);

  // Handle PDF Download
  const handleDownloadPdf = async () => {
    if (!reportId) return;
    setIsDownloadingPdf(true);
    try {
      await reportService.downloadReportPdf(reportId);
      toast.success("PDF report downloaded successfully.");
    } catch (err) {
      console.error("Error downloading PDF report:", err);
      toast.error("Failed to download PDF report. Please try again.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navbar */}
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

      {/* Main Page Layout */}
      <main className="flex-1 p-6 md:p-10 max-w-7xl w-full mx-auto space-y-6">
        {isLoading ? (
          <ReportLoading />
        ) : error || !report ? (
          /* Error State */
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center rounded-xl border border-dashed border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20 space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
              <FileQuestion className="h-7 w-7" />
            </div>
            <div className="space-y-1 max-w-md">
              <h2 className="text-xl font-bold text-foreground">Report Not Found</h2>
              <p className="text-sm text-muted-foreground">
                {error || `The report with ID "${reportId}" could not be retrieved.`}
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/reports")}
                className="gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Reports List
              </Button>
              <Button
                size="sm"
                onClick={fetchReportDetails}
                className="gap-1.5 shadow-sm"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          </div>
        ) : (
          /* Report Content Sections */
          <div className="space-y-6">
            {/* Header */}
            <ReportHeader
              report={report}
              orgName={orgName}
              onBack={() => router.push("/reports")}
              onDownloadPdf={handleDownloadPdf}
              isDownloadingPdf={isDownloadingPdf}
            />

            {/* Section 1 & Section 2: Score & Executive Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
              <div className="md:col-span-1 flex flex-col">
                <ComplianceScoreCard score={report.overall_score} />
              </div>
              <div className="md:col-span-2 flex flex-col">
                <ReportSummary summary={report.summary} />
              </div>
            </div>

            {/* Section 3: Clause Evaluation Statistics */}
            <ClauseStatistics
              totalClauses={report.total_clauses}
              compliantClauses={report.compliant_clauses}
              partialClauses={report.partial_clauses}
              nonCompliantClauses={report.non_compliant_clauses}
            />

            {/* Section 4: Recommendations */}
            <RecommendationsCard recommendations={report.recommendations} />

            {/* Section 5: System Processing Details & Metadata */}
            <ReportMetadata report={report} />
          </div>
        )}
      </main>
    </div>
  );
}

export default function ReportDetailPage() {
  return (
    <ProtectedRoute>
      <ReportDetailPageContent />
    </ProtectedRoute>
  );
}
