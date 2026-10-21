"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ReportItemResponse } from "@/types/report";
import { ReportStatusBadge } from "./ReportStatusBadge";
import { ReportScoreBadge } from "./ReportScoreBadge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Clock,
  Calendar,
  Eye,
  FileCheck,
  ShieldAlert,
  Sparkles,
  Download,
  Loader2,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { reportService } from "@/services/reportService";

interface ReportCardProps {
  report: ReportItemResponse;
  onViewReport: (reportId: string) => void;
}

export const ReportCard: React.FC<ReportCardProps> = ({
  report,
  onViewReport,
}) => {
  const router = useRouter();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const reportId = report?.id || "";
  const status = report?.report_status || (report as any)?.status || "PENDING";
  const isCompleted = status === "COMPLETED";
  const riskLevel = (report?.risk_level || "MEDIUM").toUpperCase();

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

  const handleDownloadPdf = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!reportId || isDownloadingPdf || !isCompleted) return;
    setIsDownloadingPdf(true);
    try {
      toast.info("Generating and downloading PDF report...");
      await reportService.downloadReportPdf(reportId);
      toast.success("PDF report downloaded.");
    } catch (err: any) {
      console.error(`Failed to download PDF for report ${reportId}:`, err);
      const detail = err?.response?.data?.detail || "Unable to download the report PDF.";
      toast.error(typeof detail === "string" ? detail : "Unable to download the report PDF.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const formattedDate = report?.created_at
    ? format(new Date(report.created_at), "MMM d, yyyy")
    : "N/A";

  const processingTime =
    report?.processing_time_seconds !== null &&
    report?.processing_time_seconds !== undefined
      ? `${report.processing_time_seconds.toFixed(1)}s`
      : null;

  return (
    <Card className="flex flex-col justify-between hover:shadow-md transition-all duration-200 border-border/60 bg-card">
      <CardHeader className="p-4 pb-2 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <h4 className="font-semibold text-sm text-foreground line-clamp-1" title={reportTitle}>
              {reportTitle}
            </h4>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <FileCheck className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>#{reportId ? reportId.substring(0, 8) : "N/A"}</span>
            </div>
          </div>
          <ReportStatusBadge status={status} />
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-2 space-y-3 flex-1 text-sm">
        {/* Compliance & Risk Badges */}
        <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Compliance:</span>
            <ReportScoreBadge score={report?.overall_score} />
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
              riskLevel === "LOW"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                : riskLevel === "HIGH"
                ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                : riskLevel === "CRITICAL"
                ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
            }`}
          >
            {riskLevel}
          </span>
        </div>

        {/* Scope: Policy & Regulation */}
        <div className="space-y-2 text-xs">
          <div className="flex items-start gap-1.5">
            <FileText className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <div className="truncate">
              <span className="text-muted-foreground mr-1">Policy:</span>
              <span className="font-medium text-foreground">{polTitle}</span>
            </div>
          </div>
          <div className="flex items-start gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-[#0A61C9] dark:text-sky-400 shrink-0 mt-0.5" />
            <div className="truncate">
              <span className="text-muted-foreground mr-1">Regulation:</span>
              <span className="font-medium text-foreground">{regTitle}</span>
            </div>
          </div>
        </div>

        {/* Processing Time & Date */}
        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground border-t border-border/40">
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            <span>{formattedDate}</span>
          </div>
          {processingTime && (
            <div className="flex items-center gap-1 font-mono">
              <Clock className="h-3.5 w-3.5" />
              <span>{processingTime}</span>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/compliance/reports/${reportId}/findings`)}
            className="flex-1 text-xs gap-1 cursor-pointer text-primary border-primary/30"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-primary" />
            <span>Findings</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/compliance/reports/${reportId}/recommendations`)}
            className="flex-1 text-xs gap-1 cursor-pointer text-amber-600 dark:text-amber-400 border-amber-500/30"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Recs</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={!isCompleted || isDownloadingPdf}
            className="h-8 px-2.5 text-xs cursor-pointer"
            title="Download PDF Report"
          >
            {isDownloadingPdf ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        <Button
          onClick={() => onViewReport(reportId)}
          className="w-full gap-2 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          size="sm"
        >
          <Eye className="h-4 w-4" />
          <span>View Report</span>
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ReportCard;
