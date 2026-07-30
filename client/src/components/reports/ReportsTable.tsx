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
}

export const ReportsTableSkeleton: React.FC = () => {
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-[14%]">Report ID</TableHead>
            <TableHead className="w-[16%]">Organization</TableHead>
            <TableHead className="w-[14%]">Regulation</TableHead>
            <TableHead className="w-[14%]">Policy</TableHead>
            <TableHead className="w-[14%]">Overall Score</TableHead>
            <TableHead className="w-[12%]">Status</TableHead>
            <TableHead className="w-[8%]">Time</TableHead>
            <TableHead className="w-[10%]">Created Date</TableHead>
            <TableHead className="w-[8%] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}>
              <TableCell><Skeleton className="h-5 w-24 font-mono" /></TableCell>
              <TableCell><Skeleton className="h-5 w-28" /></TableCell>
              <TableCell><Skeleton className="h-5 w-24 font-mono" /></TableCell>
              <TableCell><Skeleton className="h-5 w-24 font-mono" /></TableCell>
              <TableCell><Skeleton className="h-6 w-24 rounded-md" /></TableCell>
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
              <TableHead className="w-[14%]">Report ID</TableHead>
              <TableHead className="w-[16%]">Organization</TableHead>
              <TableHead className="w-[14%]">Regulation</TableHead>
              <TableHead className="w-[14%]">Policy</TableHead>
              <TableHead className="w-[14%]">Overall Score</TableHead>
              <TableHead className="w-[12%]">Status</TableHead>
              <TableHead className="w-[8%]">Processing Time</TableHead>
              <TableHead className="w-[10%]">Created Date</TableHead>
              <TableHead className="w-[8%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report) => {
              const reportId = report?.id || "";
              const orgId = report?.organization_id || "";
              const regId = report?.regulation_document_id || (report as any)?.regulation_id || "";
              const polId = report?.policy_document_id || "";
              const status = report?.report_status || (report as any)?.status || "PENDING";

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
                  className="hover:bg-muted/30 transition-colors"
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewReport(reportId)}
                      className="gap-1.5 h-8 font-medium cursor-pointer text-xs"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>View Report</span>
                    </Button>
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
