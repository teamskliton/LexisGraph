"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  FileCheck,
  Search,
  RefreshCw,
  AlertTriangle,
  Download,
  Trash2,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  PlusCircle,
  Zap,
  BarChart3,
  Calendar,
  Layers,
  ArrowUpDown,
  Filter,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { reportService } from "@/services/reportService";
import type { ReportItemResponse } from "@/types/report";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface OrganizationReportsWorkspaceProps {
  organizationId: string;
  organizationName?: string;
}

function deriveRiskBadge(risk?: string | null, score?: number | null) {
  const r = (risk || "").toUpperCase();
  if (r === "CRITICAL" || (score != null && score < 50)) {
    return {
      label: "Critical Risk",
      className: "bg-red-500/10 text-red-500 border-red-500/25",
      icon: <ShieldX className="h-3 w-3" />,
    };
  }
  if (r === "HIGH" || (score != null && score >= 50 && score < 70)) {
    return {
      label: "High Risk",
      className: "bg-amber-500/10 text-amber-500 border-amber-500/25",
      icon: <ShieldAlert className="h-3 w-3" />,
    };
  }
  if (r === "MEDIUM" || (score != null && score >= 70 && score < 85)) {
    return {
      label: "Medium Risk",
      className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/25",
      icon: <ShieldAlert className="h-3 w-3" />,
    };
  }
  return {
    label: "Low Risk",
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/25",
    icon: <ShieldCheck className="h-3 w-3" />,
  };
}

function deriveStatusBadge(status?: string) {
  const s = (status || "COMPLETED").toUpperCase();
  if (s === "COMPLETED") {
    return { label: "Completed", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" };
  }
  if (s === "PROCESSING" || s === "RUNNING") {
    return { label: "Processing", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" };
  }
  if (s === "FAILED") {
    return { label: "Failed", className: "bg-red-500/10 text-red-500 border-red-500/20" };
  }
  return { label: s, className: "bg-muted text-muted-foreground border-border" };
}

export function OrganizationReportsWorkspace({
  organizationId,
  organizationName,
}: OrganizationReportsWorkspaceProps) {
  const router = useRouter();

  // Data state
  const [reports, setReports] = useState<ReportItemResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Toolbar Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [riskFilter, setRiskFilter] = useState<string>("ALL");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "highest_score" | "lowest_score">("newest");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Fetch reports for current organization strictly
  const fetchOrgReports = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await reportService.getReportsByOrganization(organizationId, statusFilter);
      setReports(data || []);
    } catch (err: any) {
      console.error(`Failed to load reports for org ${organizationId}:`, err);
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to load organization compliance reports. Please verify server connection.";
      setError(detail);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, statusFilter]);

  useEffect(() => {
    fetchOrgReports();
  }, [fetchOrgReports]);

  // Derived Summary Metrics (strictly calculated from fetched org data)
  const metrics = useMemo(() => {
    const total = reports.length;
    if (total === 0) {
      return {
        total: 0,
        latestReportDate: null,
        latestScore: null,
        averageScore: null,
        requiringReviewCount: 0,
      };
    }

    const scores = reports
      .map((r) => r.overall_score)
      .filter((s): s is number => s != null);

    const averageScore =
      scores.length > 0
        ? Math.round(scores.reduce((acc, s) => acc + (s <= 1.0 ? s * 100 : s), 0) / scores.length)
        : null;

    const latest = reports[0]; // ordered newest first by backend
    const latestScore =
      latest?.overall_score != null
        ? Math.round(latest.overall_score <= 1.0 ? latest.overall_score * 100 : latest.overall_score)
        : null;

    const requiringReviewCount = reports.filter((r) => {
      const risk = (r.risk_level || "").toUpperCase();
      const status = (r.report_status || "").toUpperCase();
      const score = r.overall_score != null ? (r.overall_score <= 1.0 ? r.overall_score * 100 : r.overall_score) : null;
      return risk === "HIGH" || risk === "CRITICAL" || status === "FAILED" || (score != null && score < 70);
    }).length;

    return {
      total,
      latestReportDate: latest ? format(new Date(latest.created_at), "MMM d, yyyy") : null,
      latestScore,
      averageScore,
      requiringReviewCount,
    };
  }, [reports]);

  // Client-side filtering & sorting of organization reports
  const filteredReports = useMemo(() => {
    return reports
      .filter((r) => {
        // Search query filter (Report ID or policy name)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchId = r.id.toLowerCase().includes(q);
          const matchPolicy = (r.policy_document_id || "").toLowerCase().includes(q);
          if (!matchId && !matchPolicy) return false;
        }

        // Status Filter
        if (statusFilter !== "ALL") {
          if ((r.report_status || "").toUpperCase() !== statusFilter.toUpperCase()) {
            return false;
          }
        }

        // Risk Filter
        if (riskFilter !== "ALL") {
          const risk = (r.risk_level || "").toUpperCase();
          if (risk !== riskFilter.toUpperCase()) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortOrder === "oldest") {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        if (sortOrder === "highest_score") {
          return (b.overall_score || 0) - (a.overall_score || 0);
        }
        if (sortOrder === "lowest_score") {
          return (a.overall_score || 0) - (b.overall_score || 0);
        }
        // newest (default)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [reports, searchQuery, statusFilter, riskFilter, sortOrder]);

  // Handle PDF Download
  const handleDownloadPdf = async (reportId: string) => {
    try {
      setDownloadingId(reportId);
      await reportService.downloadReportPdf(reportId);
      toast.success("Compliance report PDF downloaded.");
    } catch (err) {
      console.error("Failed to download PDF:", err);
      toast.error("Failed to download PDF report.");
    } finally {
      setDownloadingId(null);
    }
  };

  // Handle Report Deletion
  const handleDeleteReport = async (reportId: string) => {
    try {
      setDeletingId(reportId);
      await reportService.deleteReport(reportId);
      toast.success("Report deleted successfully.");
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch (err) {
      console.error("Failed to delete report:", err);
      toast.error("Failed to delete report.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── 1. Header & Subtitle ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Reports
              </h2>
              <p className="text-xs text-muted-foreground">
                Review and manage compliance reports for {organizationName || "this organization"}.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => router.push("/compliance")}
            className="gap-1.5 text-xs font-semibold cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Run New Analysis</span>
          </Button>
        </div>
      </div>

      {/* ── 2. Summary Metrics Bar ── */}
      {!isLoading && !error && reports.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Total Reports */}
          <Card className="border border-border/60 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total Reports
              </span>
              <FileCheck className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {metrics.total}
              </span>
              <span className="text-[10px] text-muted-foreground">Generated</span>
            </div>
          </Card>

          {/* Latest Report */}
          <Card className="border border-border/60 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Latest Report
              </span>
              <Calendar className="h-4 w-4 text-sky-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {metrics.latestScore != null ? `${metrics.latestScore}%` : "—"}
              </span>
              <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                {metrics.latestReportDate || "No data"}
              </span>
            </div>
          </Card>

          {/* Average Compliance Score */}
          <Card className="border border-border/60 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Average Score
              </span>
              <BarChart3 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-emerald-500">
                {metrics.averageScore != null ? `${metrics.averageScore}%` : "—"}
              </span>
              <span className="text-[10px] text-muted-foreground">Across analyses</span>
            </div>
          </Card>

          {/* Reports Requiring Review */}
          <Card className="border border-border/60 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Needs Review
              </span>
              <ShieldAlert className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={cn(
                  "text-2xl font-bold tabular-nums",
                  metrics.requiringReviewCount > 0 ? "text-amber-500" : "text-foreground"
                )}
              >
                {metrics.requiringReviewCount}
              </span>
              <span className="text-[10px] text-muted-foreground">High / Critical risk</span>
            </div>
          </Card>
        </div>
      )}

      {/* ── 3. Search & Filter Toolbar ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-xl border border-border/60 bg-card shadow-2xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Report ID or policy..."
            className="pl-9 h-8 text-xs bg-background"
          />
        </div>

        {/* Dropdown Filters & Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter */}
          <div className="flex items-center gap-1">
            <Filter className="h-3 w-3 text-muted-foreground hidden sm:block" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 px-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PROCESSING">Processing</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>

          {/* Risk Filter */}
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="h-8 px-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="ALL">All Risks</option>
            <option value="LOW">Low Risk</option>
            <option value="MEDIUM">Medium Risk</option>
            <option value="HIGH">High Risk</option>
            <option value="CRITICAL">Critical Risk</option>
          </select>

          {/* Sort Order */}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="h-8 px-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="highest_score">Highest Score</option>
            <option value="lowest_score">Lowest Score</option>
          </select>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOrgReports}
            disabled={isLoading}
            className="h-8 px-2.5 text-xs cursor-pointer gap-1"
            title="Refresh Reports"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* ── 4. Error State ── */}
      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold">Failed to load organization reports</h4>
              <p className="text-xs text-red-400 mt-0.5">{error}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOrgReports}
            className="h-8 text-xs border-red-500/30 text-red-500 hover:bg-red-500/20 cursor-pointer shrink-0 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </Button>
        </div>
      )}

      {/* ── 5. Skeleton Loading State ── */}
      {isLoading && !error && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-4 rounded-xl border border-border/50 bg-card space-y-2">
              <div className="flex justify-between items-center">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      )}

      {/* ── 6. Empty State ── */}
      {!isLoading && !error && filteredReports.length === 0 && (
        <Card className="border border-dashed border-border/60 bg-muted/10 py-12 px-6 text-center space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center justify-center mx-auto">
            <FileCheck className="h-6 w-6" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="text-sm font-semibold text-foreground">
              {reports.length === 0 ? "No compliance reports yet" : "No matching reports found"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {reports.length === 0
                ? "Reports will appear here after a compliance analysis is completed for this organization."
                : "Try adjusting your search query or filter options above."}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button
              size="sm"
              onClick={() => router.push("/compliance")}
              className="text-xs font-semibold cursor-pointer gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Run Analysis</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/compliance")}
              className="text-xs cursor-pointer"
            >
              Go to Compliance
            </Button>
          </div>
        </Card>
      )}

      {/* ── 7. Data List / Desktop Table & Mobile Responsive Cards ── */}
      {!isLoading && !error && filteredReports.length > 0 && (
        <div className="space-y-4">
          {/* Desktop Table View (md and above) */}
          <div className="hidden md:block rounded-xl border border-border/60 bg-card overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                    <th className="px-4 py-3">Report Name</th>
                    <th className="px-4 py-3">Compliance Score</th>
                    <th className="px-4 py-3">Risk Level</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredReports.map((report) => {
                    const score =
                      report.overall_score != null
                        ? Math.round(report.overall_score <= 1.0 ? report.overall_score * 100 : report.overall_score)
                        : null;
                    const risk = deriveRiskBadge(report.risk_level, score);
                    const status = deriveStatusBadge(report.report_status);
                    const createdDate = format(new Date(report.created_at), "MMM d, yyyy");

                    return (
                      <tr
                        key={report.id}
                        className="hover:bg-muted/20 transition-colors group cursor-pointer"
                        onClick={() => router.push(`/compliance/reports/${report.id}`)}
                      >
                        {/* Report Name */}
                        <td className="px-4 py-3.5 font-semibold text-foreground">
                          <div className="flex items-center gap-2">
                            <FileCheck className="h-4 w-4 text-indigo-500 shrink-0" />
                            <span className="truncate max-w-[220px]">
                              Compliance Report #{report.id.substring(0, 8)}
                            </span>
                          </div>
                        </td>

                        {/* Compliance Score */}
                        <td className="px-4 py-3.5 font-bold tabular-nums">
                          {score != null ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]",
                                score >= 85
                                  ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                  : score >= 65
                                    ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                    : "bg-red-500/10 text-red-500 border border-red-500/20"
                              )}
                            >
                              {score}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Risk Level */}
                        <td className="px-4 py-3.5">
                          <Badge variant="outline" className={cn("gap-1 text-[10px] uppercase font-semibold", risk.className)}>
                            {risk.icon}
                            {risk.label}
                          </Badge>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          <Badge variant="outline" className={cn("text-[10px] uppercase font-semibold", status.className)}>
                            {status.label}
                          </Badge>
                        </td>

                        {/* Created Date */}
                        <td className="px-4 py-3.5 text-muted-foreground">
                          {createdDate}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* View Action */}
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => router.push(`/compliance/reports/${report.id}`)}
                              className="h-7 text-xs gap-1 cursor-pointer"
                              title="View Report Details"
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span>View</span>
                            </Button>

                            {/* View Findings Action */}
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => router.push(`/compliance/reports/${report.id}/findings`)}
                              className="h-7 text-xs gap-1 cursor-pointer text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
                              title="View Findings Workspace"
                            >
                              <ShieldAlert className="h-3 w-3 text-indigo-500" />
                              <span>Findings</span>
                            </Button>

                            {/* Recommendations Action */}
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => router.push(`/compliance/reports/${report.id}/recommendations`)}
                              className="h-7 text-xs gap-1 cursor-pointer text-amber-600 dark:text-amber-400 border-amber-500/30"
                              title="View Recommendations Workspace"
                            >
                              <Sparkles className="h-3 w-3 text-amber-500" />
                              <span>Recs</span>
                            </Button>

                            {/* Download PDF Action */}
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleDownloadPdf(report.id)}
                              disabled={downloadingId === report.id}
                              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                              title="Download PDF Report"
                            >
                              <Download className={cn("h-3.5 w-3.5", downloadingId === report.id && "animate-pulse")} />
                            </Button>

                            {/* Delete Action */}
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleDeleteReport(report.id)}
                              disabled={deletingId === report.id}
                              className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                              title="Delete Report"
                            >
                              <Trash2 className={cn("h-3.5 w-3.5", deletingId === report.id && "animate-spin")} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card Grid View (sm and below) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredReports.map((report) => {
              const score =
                report.overall_score != null
                  ? Math.round(report.overall_score <= 1.0 ? report.overall_score * 100 : report.overall_score)
                  : null;
              const risk = deriveRiskBadge(report.risk_level, score);
              const status = deriveStatusBadge(report.report_status);
              const createdDate = format(new Date(report.created_at), "MMM d, yyyy");

              return (
                <Card
                  key={report.id}
                  className="border border-border/60 bg-card p-4 space-y-3 shadow-2xs hover:border-border transition-colors cursor-pointer"
                  onClick={() => router.push(`/compliance/reports/${report.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCheck className="h-4 w-4 text-indigo-500 shrink-0" />
                      <span className="font-semibold text-xs text-foreground truncate">
                        Report #{report.id.substring(0, 8)}
                      </span>
                    </div>

                    {score != null ? (
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums shrink-0",
                          score >= 85
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : score >= 65
                              ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                              : "bg-red-500/10 text-red-500 border border-red-500/20"
                        )}
                      >
                        {score}%
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={cn("gap-1 text-[10px] uppercase font-semibold", risk.className)}>
                        {risk.icon}
                        {risk.label}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[10px] uppercase font-semibold", status.className)}>
                        {status.label}
                      </Badge>
                    </div>

                    <span className="shrink-0">{createdDate}</span>
                  </div>

                  <div className="pt-2 flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadPdf(report.id)}
                      disabled={downloadingId === report.id}
                      className="h-8 text-xs cursor-pointer gap-1"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>PDF</span>
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => router.push(`/compliance/reports/${report.id}`)}
                      className="h-8 text-xs font-semibold cursor-pointer gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>View Report</span>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
