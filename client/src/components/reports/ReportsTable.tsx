"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ReportItemResponse } from "@/types/report";
import { ReportStatusBadge } from "./ReportStatusBadge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye,
  FileCheck,
  Copy,
  Check,
  Inbox,
  ShieldAlert,
  Download,
  Loader2,
  Sparkles,
  MoreVertical,
  Trash2,
  BookOpen,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { reportService } from "@/services/reportService";

interface ReportsTableProps {
  reports: ReportItemResponse[];
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
            <TableHead className="min-w-[200px]">Report</TableHead>
            <TableHead className="min-w-[220px]">Analysis Scope</TableHead>
            <TableHead className="w-[130px] min-w-[125px]">Compliance</TableHead>
            <TableHead className="w-[110px] min-w-[105px]">Status</TableHead>
            <TableHead className="w-[110px] min-w-[105px]">Generated</TableHead>
            <TableHead className="w-[115px] min-w-[115px] text-right pr-4">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}>
              <TableCell>
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-3.5 w-24 font-mono" />
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-10" />
                  <Skeleton className="h-5 w-14 rounded" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell className="text-right pr-4">
                <div className="flex items-center justify-end gap-1.5">
                  <Skeleton className="h-8 w-16 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
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
  isLoading,
  onViewReport,
  onDeleteReport,
}) => {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadPdf = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (downloadingId === id) return;
    setDownloadingId(id);
    try {
      toast.info("Generating and downloading PDF report...");
      await reportService.downloadReportPdf(id);
      toast.success("PDF report downloaded.");
    } catch (err: any) {
      console.error(`Failed to download PDF for report ${id}:`, err);
      const detail = err?.response?.data?.detail || "Unable to download the report PDF.";
      toast.error(typeof detail === "string" ? detail : "Unable to download the report PDF.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success("Report ID copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const confirmDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this compliance report? This action cannot be undone.")) {
      if (onDeleteReport) {
        onDeleteReport(id);
      }
    }
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
        <h3 className="text-lg font-semibold text-foreground">No compliance reports yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Run your first compliance analysis to generate a report, or adjust your search filters.
        </p>
        <Button
          onClick={() => router.push("/compliance")}
          className="mt-2 text-xs font-semibold cursor-pointer"
          size="sm"
        >
          Run Your First Analysis
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="min-w-[200px]">Report</TableHead>
            <TableHead className="min-w-[220px]">Analysis Scope</TableHead>
            <TableHead className="w-[130px] min-w-[125px]">Compliance</TableHead>
            <TableHead className="w-[110px] min-w-[105px]">Status</TableHead>
            <TableHead className="w-[110px] min-w-[105px]">Generated</TableHead>
            <TableHead className="w-[115px] min-w-[115px] text-right pr-4">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((report) => {
            const reportId = report?.id || "";
            const status = report?.report_status || (report as any)?.status || "PENDING";
            const isCompleted = status === "COMPLETED";
            const riskLevel = (report?.risk_level || "MEDIUM").toUpperCase();

            // Compliance score computation
            const rawScore = report.overall_score;
            const scorePercent =
              rawScore != null
                ? Math.round(rawScore <= 1.0 && rawScore > 0 ? rawScore * 100 : rawScore)
                : null;

            // Human-readable titles resolved from backend
            const reportTitle =
              report?.report_title ||
              (report?.created_at
                ? `Compliance Assessment — ${format(new Date(report.created_at), "MMM d, yyyy")}`
                : "Compliance Assessment");

            const regTitle =
              report?.regulation_name ||
              (report?.regulation_document_id
                ? `Regulation (${report.regulation_document_id.substring(0, 8)})`
                : "Regulation Standard");

            const polTitle =
              report?.policy_name ||
              (report?.policy_document_id
                ? `Policy (${report.policy_document_id.substring(0, 8)})`
                : "Policy Document");

            const formattedDate = report?.created_at
              ? format(new Date(report.created_at), "MMM d, yyyy")
              : "—";

            const fullDateTime = report?.created_at
              ? format(new Date(report.created_at), "PPPpp")
              : "";

            return (
              <TableRow
                key={reportId}
                className="hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => onViewReport(reportId)}
              >
                {/* 1. Report: Human title + Short ID */}
                <TableCell className="align-middle py-3 min-w-[200px]">
                  <div className="space-y-1">
                    <div
                      className="font-semibold text-sm text-foreground hover:text-primary transition-colors line-clamp-1 max-w-[260px]"
                      title={reportTitle}
                    >
                      {reportTitle}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono group">
                      <FileCheck className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span title={reportId}>
                        #{reportId ? reportId.substring(0, 8) : "N/A"}
                      </span>
                      {reportId && (
                        <button
                          type="button"
                          onClick={(e) => handleCopyId(reportId, e)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
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
                  </div>
                </TableCell>

                {/* 2. Analysis Scope: Policy & Regulation */}
                <TableCell className="align-middle py-3 min-w-[220px]">
                  <div className="space-y-1 text-xs">
                    <div
                      className="flex items-center gap-1.5 text-foreground font-medium line-clamp-1 max-w-[280px]"
                      title={`Policy: ${polTitle}`}
                    >
                      <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="truncate">{polTitle}</span>
                    </div>
                    <div
                      className="flex items-center gap-1.5 text-muted-foreground line-clamp-1 max-w-[280px]"
                      title={`Regulation: ${regTitle}`}
                    >
                      <BookOpen className="h-3.5 w-3.5 text-[#0A61C9] dark:text-sky-400 shrink-0" />
                      <span className="truncate">{regTitle}</span>
                    </div>
                  </div>
                </TableCell>

                {/* 3. Compliance: Score + Risk Level (No duplicate 'High Risk' label) */}
                <TableCell className="align-middle py-3 w-[130px] min-w-[125px] whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm tabular-nums text-foreground">
                      {scorePercent != null ? `${scorePercent}%` : "—"}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider",
                        riskLevel === "LOW" &&
                          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
                        riskLevel === "HIGH" &&
                          "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30",
                        riskLevel === "CRITICAL" &&
                          "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30",
                        riskLevel === "MEDIUM" &&
                          "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      )}
                    >
                      {riskLevel}
                    </span>
                  </div>
                </TableCell>

                {/* 4. Status */}
                <TableCell className="align-middle py-3 w-[110px] min-w-[105px]">
                  <ReportStatusBadge status={status} />
                </TableCell>

                {/* 5. Generated Date */}
                <TableCell className="align-middle py-3 w-[110px] min-w-[105px]">
                  <span
                    className="text-xs text-muted-foreground whitespace-nowrap"
                    title={fullDateTime}
                  >
                    {formattedDate}
                  </span>
                </TableCell>

                {/* 6. Actions: Primary View Report + Three-dot dropdown */}
                <TableCell className="align-middle py-3 text-right pr-4 w-[115px] min-w-[115px]">
                  <div
                    className="flex items-center justify-end gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewReport(reportId)}
                      className="h-8 px-2.5 font-medium cursor-pointer text-xs"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      <span>View</span>
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 cursor-pointer text-muted-foreground hover:text-foreground shrink-0"
                            title="More Actions"
                          >
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">More actions</span>
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() =>
                            router.push(`/compliance/reports/${reportId}/findings`)
                          }
                          className="cursor-pointer gap-2"
                        >
                          <ShieldAlert className="h-4 w-4 text-primary" />
                          <span>View Findings</span>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={() =>
                            router.push(
                              `/compliance/reports/${reportId}/recommendations`
                            )
                          }
                          className="cursor-pointer gap-2"
                        >
                          <Sparkles className="h-4 w-4 text-amber-500" />
                          <span>View Recommendations</span>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={(e) => handleDownloadPdf(reportId, e)}
                          disabled={!isCompleted || downloadingId === reportId}
                          className="cursor-pointer gap-2"
                        >
                          {downloadingId === reportId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 text-[#0A61C9] dark:text-sky-400" />
                          )}
                          <span>Download PDF</span>
                        </DropdownMenuItem>

                        {onDeleteReport && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => confirmDelete(reportId, e)}
                              variant="destructive"
                              className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>Delete Report</span>
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default ReportsTable;
