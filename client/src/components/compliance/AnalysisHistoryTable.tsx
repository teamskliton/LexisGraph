// AnalysisHistoryTable — Audit Trail & Analysis History Table
// Reuses existing complianceService APIs to fetch and filter real compliance jobs & reports for an organization.

"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  History,
  Search,
  RefreshCw,
  ExternalLink,
  RotateCcw,
  PlusCircle,
  User,
} from "lucide-react";
import {
  Card,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/compliance/shared/StatusBadge";
import { RiskBadge } from "@/components/compliance/shared/RiskBadge";

import { complianceService, ComplianceJob, ComplianceReport } from "@/services/api/compliance";
import { organizationsService, Organization } from "@/services/api/organizations";

interface AnalysisHistoryTableProps {
  organization: Organization | null;
}

export const AnalysisHistoryTable: React.FC<AnalysisHistoryTableProps> = ({
  organization,
}) => {
  const router = useRouter();

  const [jobs, setJobs] = useState<ComplianceJob[]>([]);
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters & Sorting state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("newest");

  const fetchData = useCallback(async () => {
    if (!organization) {
      setJobs([]);
      setReports([]);
      setIsLoading(false);
      return;
    }

    try {
      const [fetchedJobs, fetchedReports] = await Promise.all([
        complianceService.listComplianceJobs(organization.id).catch(() => []),
        complianceService.listComplianceReports(organization.id).catch(() => []),
      ]);

      setJobs(fetchedJobs);
      setReports(fetchedReports);
    } catch {
      toast.error("Failed to load compliance analysis history.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [organization]);

  useEffect(() => {
    setIsLoading(true);
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData();
    toast.info("Refreshed compliance analysis history.");
  };

  // Map jobs and reports into unified history items
  const historyItems = useMemo(() => {
    const reportMap = new Map(reports.map((r) => [r.id, r]));

    return jobs.map((job) => {
      const linkedReport = job.report_id ? reportMap.get(job.report_id) : null;
      return {
        id: job.id,
        jobId: job.job_id || job.id,
        reportId: job.report_id || linkedReport?.id,
        status: job.status,
        progress: job.progress,
        currentStep: job.current_step,
        // Score: only from real backend data — never fabricated
        score: linkedReport?.overall_score ?? null,
        riskLevel: linkedReport?.risk_level ?? null,
        createdBy: job.created_by || "System User",
        createdAt: job.created_at,
        startedAt: job.started_at || job.created_at,
        completedAt: job.completed_at,
        processingTimeMs: job.processing_time_ms || (job.processing_time ? job.processing_time * 1000 : null),
        errorMessage: job.error_message,
        policyDocId: job.policy_document_id,
        regId: job.regulation_id,
      };
    });
  }, [jobs, reports]);

  // Calculated Summary Stats
  const stats = useMemo(() => {
    const total = historyItems.length;
    const successful = historyItems.filter((i) => i.status === "COMPLETED").length;
    const failed = historyItems.filter((i) => i.status === "FAILED").length;
    const latestItem = historyItems[0];
    const latestDate = latestItem?.createdAt
      ? format(new Date(latestItem.createdAt), "MMM d, yyyy")
      : "Never";

    return { total, successful, failed, latestDate };
  }, [historyItems]);

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    return historyItems
      .filter((item) => {
        if (statusFilter !== "ALL" && item.status !== statusFilter) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchJobId = item.jobId.toLowerCase().includes(q);
          const matchUser = item.createdBy.toLowerCase().includes(q);
          const matchStatus = item.status.toLowerCase().includes(q);
          const matchStep = (item.currentStep || "").toLowerCase().includes(q);
          if (!matchJobId && !matchUser && !matchStatus && !matchStep) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "oldest") {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        if (sortBy === "highest_score") {
          return (b.score || 0) - (a.score || 0);
        }
        if (sortBy === "lowest_score") {
          return (a.score || 0) - (b.score || 0);
        }
        // newest default
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [historyItems, statusFilter, searchQuery, sortBy]);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto" aria-label="Loading analysis history" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* SECTION 1: STATS SUMMARY HEADER */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Analysis statistics">
        <Card className="border border-border/60 bg-card p-4 shadow-xs">
          <span className="text-[11px] uppercase font-bold text-muted-foreground block">Total Analyses</span>
          <p className="text-2xl font-extrabold text-foreground mt-1" aria-label={`${stats.total} total analyses`}>{stats.total}</p>
        </Card>

        <Card className="border border-border/60 bg-card p-4 shadow-xs">
          <span className="text-[11px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Successful Analyses</span>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1" aria-label={`${stats.successful} successful analyses`}>{stats.successful}</p>
        </Card>

        <Card className="border border-border/60 bg-card p-4 shadow-xs">
          <span className="text-[11px] uppercase font-bold text-rose-600 dark:text-rose-400 block">Failed Analyses</span>
          <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1" aria-label={`${stats.failed} failed analyses`}>{stats.failed}</p>
        </Card>

        <Card className="border border-border/60 bg-card p-4 shadow-xs">
          <span className="text-[11px] uppercase font-bold text-muted-foreground block">Latest Analysis</span>
          <p className="text-base font-bold text-foreground mt-1 truncate">{stats.latestDate}</p>
        </Card>
      </div>

      {/* SECTION 2: TOOLBAR */}
      <Card className="border border-border/60 bg-card p-4 shadow-xs space-y-3" role="search" aria-label="Filter and search analyses">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search by Job ID, User, or Status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs h-9 bg-background"
              aria-label="Search analyses"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap justify-end">
            {/* Status Filter */}
            <div
              className="flex items-center gap-1 bg-muted/40 border border-border/50 rounded-lg p-1 text-xs"
              role="group"
              aria-label="Filter by status"
            >
              {["ALL", "COMPLETED", "RUNNING", "FAILED", "QUEUED"].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  aria-pressed={statusFilter === st}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer",
                    statusFilter === st
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Sort Select */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground cursor-pointer focus:ring-1 focus:ring-indigo-500"
              aria-label="Sort order"
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
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-9 text-xs cursor-pointer gap-1.5"
              aria-label="Refresh analysis history"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} aria-hidden="true" />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* SECTION 3: HISTORY TABLE / EMPTY STATE */}
      {filteredItems.length === 0 ? (
        <Card
          className="border border-border/60 bg-card p-12 text-center space-y-4 shadow-xs"
          role="status"
          aria-live="polite"
        >
          <div className="h-12 w-12 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto">
            <History className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-bold text-foreground">
              {searchQuery || statusFilter !== "ALL"
                ? "No matching analyses found"
                : "No analyses have been run for this organization."}
            </h3>
            <p className="text-xs text-muted-foreground">
              {searchQuery || statusFilter !== "ALL"
                ? "Try adjusting your search query or status filter."
                : "Run your first compliance analysis to begin building compliance history."}
            </p>
          </div>

          {!searchQuery && statusFilter === "ALL" && (
            <Button
              onClick={() => router.push("/compliance/new")}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md gap-1.5 cursor-pointer text-xs"
              aria-label="Start a new compliance analysis"
            >
              <PlusCircle className="h-4 w-4" aria-hidden="true" /> Run Analysis
            </Button>
          )}
        </Card>
      ) : (
        <Card className="border border-border/60 bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" role="table" aria-label="Compliance analysis history">
              <thead className="bg-muted/40 border-b border-border/60 uppercase font-bold text-[10px] text-muted-foreground tracking-wider">
                <tr>
                  <th className="p-3.5 pl-4" scope="col">Analysis Job</th>
                  <th className="p-3.5" scope="col">Created By</th>
                  <th className="p-3.5" scope="col">Created At</th>
                  <th className="p-3.5" scope="col">Completed At</th>
                  <th className="p-3.5 text-center" scope="col">Score</th>
                  <th className="p-3.5 text-center" scope="col">Risk</th>
                  <th className="p-3.5 text-center" scope="col">Status</th>
                  <th className="p-3.5 pr-4 text-right" scope="col">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-medium">
                {filteredItems.map((item) => {
                  const createdAtFormatted = item.createdAt
                    ? format(new Date(item.createdAt), "MMM d, yyyy · HH:mm")
                    : "—";
                  const completedAtFormatted = item.completedAt
                    ? format(new Date(item.completedAt), "MMM d, yyyy · HH:mm")
                    : item.status === "RUNNING"
                    ? "In Progress"
                    : "—";

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      {/* Analysis Job */}
                      <td className="p-3.5 pl-4">
                        <div className="space-y-0.5">
                          <span className="font-bold text-foreground block">
                            Audit #{item.jobId.slice(0, 8)}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-mono block">
                            ID: {item.jobId}
                          </span>
                        </div>
                      </td>

                      {/* Created By */}
                      <td className="p-3.5">
                        <span className="text-foreground font-medium flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                          {item.createdBy}
                        </span>
                      </td>

                      {/* Created At */}
                      <td className="p-3.5 text-muted-foreground">{createdAtFormatted}</td>

                      {/* Completed At */}
                      <td className="p-3.5 text-muted-foreground">{completedAtFormatted}</td>

                      {/* Compliance Score */}
                      <td className="p-3.5 text-center font-bold font-mono text-sm">
                        {item.score != null ? (
                          <span className="text-indigo-600 dark:text-indigo-400">{item.score}%</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Risk Level */}
                      <td className="p-3.5 text-center">
                        <RiskBadge riskLevel={item.riskLevel} score={item.score} size="xs" />
                      </td>

                      {/* Status */}
                      <td className="p-3.5 text-center">
                        <StatusBadge status={item.status} size="xs" />
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 pr-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/compliance/progress/${item.jobId}`)}
                            className="h-8 text-xs cursor-pointer px-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
                            aria-label={`View job details for audit ${item.jobId.slice(0, 8)}`}
                          >
                            Details
                          </Button>

                          {item.reportId && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/compliance/reports/${item.reportId}`)}
                              className="h-8 text-xs cursor-pointer px-2 gap-1"
                              aria-label={`Open compliance report for audit ${item.jobId.slice(0, 8)}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Report
                            </Button>
                          )}

                          {item.status === "FAILED" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push("/compliance/new")}
                              className="h-8 text-xs cursor-pointer px-2 text-rose-600 border-rose-500/30 hover:bg-rose-500/10 gap-1"
                              aria-label={`Retry failed analysis ${item.jobId.slice(0, 8)}`}
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
