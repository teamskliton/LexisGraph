"use client";

import React from "react";
import { format } from "date-fns";
import { ReportItemResponse } from "@/types/report";
import { ReportStatusBadge } from "./ReportStatusBadge";
import { ReportScoreBadge } from "./ReportScoreBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, FileCheck, Copy, Check, Inbox } from "lucide-react";
import { toast } from "sonner";

interface ReportsTableProps {
  reports: ReportItemResponse[];
  orgMap?: Map<string, string>;
  isLoading: boolean;
  onViewReport: (reportId: string) => void;
  onDeleteReport?: (reportId: string) => void;
}

export const ReportsTableSkeleton: React.FC = () => {
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-[12%]">Report ID</TableHead>
            <TableHead className="w-[15%]">Organization</TableHead>
            <TableHead className="w-[12%]">Regulation</TableHead>
            <TableHead className="w-[12%]">Policy</TableHead>
            <TableHead className="w-[12%]">Overall Score</TableHead>
            <TableHead className="w-[10%]">Risk Level</TableHead>
            <TableHead className="w-[10%]">Status</TableHead>
            <TableHead className="w-[7%]">Time</TableHead>
            <TableHead className="w-[10%]">Created Date</TableHead>
            <TableHead className="w-[10%] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}>
              <TableCell><Skeleton className="h-5 w-24 font-mono" /></TableCell>
              <TableCell><Skeleton className="h-5 w-28" /></TableCell>
              <TableCell><Skeleton className="h-5 w-24 font-mono" /></TableCell>
              <TableCell><Skeleton className="h-5 w-24 font-mono" /></TableCell>
              <TableCell><Skeleton className="h-6 w-20 rounded-md" /></TableCell>
              <TableCell><Skeleton className="h-5 w-16" /></TableCell>
              <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-5 w-12" /></TableCell>
              <TableCell><Skeleton className="h-5 w-20" /></TableCell>
              <TableCell className="text-right">
                <Skeleton className="h-8 w-24 ml-auto rounded-md" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export const ReportsTable: React.FC<ReportsTableProps> = ({
  reports,
  orgMap = new Map(),
  isLoading,
  onViewReport,
  onDeleteReport,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success("Report ID copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) {
    return <ReportsTableSkeleton />;
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-card/40 p-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Inbox className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">No reports found</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          No compliance reports match your current filters or search terms. Try adjusting your filters.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[12%]">Report ID</TableHead>
              <TableHead className="w-[15%]">Organization</TableHead>
              <TableHead className="w-[12%]">Regulation</TableHead>
              <TableHead className="w-[12%]">Policy</TableHead>
              <TableHead className="w-[12%]">Overall Score</TableHead>
              <TableHead className="w-[10%]">Risk Level</TableHead>
              <TableHead className="w-[10%]">Status</TableHead>
              <TableHead className="w-[7%]">Processing Time</TableHead>
              <TableHead className="w-[10%]">Created Date</TableHead>
              <TableHead className="w-[10%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report) => {
              const reportId = report?.id || "";
              const orgId = report?.organization_id || "";
              const regId = report?.regulation_document_id || (report as any)?.regulation_id || "";
              const polId = report?.policy_document_id || "";
              const status = report?.report_status || (report as any)?.status || "PENDING";
              const riskLevel = report?.risk_level || "MEDIUM";

              const orgName =
                orgMap.get(orgId) ||
                (orgId ? `Org: ${orgId.substring(0, 8)}...` : "N/A");

              const formattedDate = report?.created_at
                ? format(new Date(report.created_at), "MMM d, yyyy")
                : "—";

              const processingTime =
                report?.processing_time_seconds !== null &&
                  report?.processing_time_seconds !== undefined
                  ? `${report.processing_time_seconds.toFixed(1)}s`
                  : "—";

              return (
                <TableRow
                  key={reportId}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => onViewReport(reportId)}
                >
                  {/* Report ID */}
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-1.5 group">
                      <FileCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span title={reportId} className="font-medium text-foreground">
                        {reportId ? `${reportId.substring(0, 8)}...` : "N/A"}
                      </span>
                      {reportId && (
                        <button
                          onClick={(e) => handleCopyId(reportId, e)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-0.5 rounded"
                          title="Copy full Report ID"
                        >
                          {copiedId === reportId ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </TableCell>

                  {/* Organization */}
                  <TableCell className="text-sm font-medium text-foreground">
                    <span className="truncate block max-w-[180px]" title={orgName}>
                      {orgName}
                    </span>
                  </TableCell>

                  {/* Regulation */}
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <span title={regId}>
                      {regId ? `${regId.substring(0, 8)}...` : "N/A"}
                    </span>
                  </TableCell>

                  {/* Policy */}
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <span title={polId}>
                      {polId ? `${polId.substring(0, 8)}...` : "N/A"}
                    </span>
                  </TableCell>

                  {/* Overall Score */}
                  <TableCell>
                    <ReportScoreBadge score={report.overall_score} />
                  </TableCell>

                  {/* Risk Level */}
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${riskLevel === "LOW"
                          ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                          : riskLevel === "HIGH"
                            ? "bg-orange-500/10 text-orange-600 border border-orange-500/30"
                            : riskLevel === "CRITICAL"
                              ? "bg-red-500/10 text-red-600 border border-red-500/30"
                              : "bg-amber-500/10 text-amber-600 border border-amber-500/30"
                        }`}
                    >
                      {riskLevel}
                    </span>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <ReportStatusBadge status={status} />
                  </TableCell>

                  {/* Processing Time */}
                  <TableCell className="text-sm text-muted-foreground font-mono">
                    {processingTime}
                  </TableCell>

                  {/* Created Date */}
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formattedDate}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewReport(reportId)}
                        className="gap-1.5 h-8 font-medium cursor-pointer text-xs"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>View</span>
                      </Button>
                      {onDeleteReport && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteReport(reportId)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                          title="Delete Report"
                        >
                          <Inbox className="h-3.5 w-3.5 hidden" />
                          <span className="sr-only">Delete</span>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ReportsTable;
