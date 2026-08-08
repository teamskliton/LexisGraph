import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ReportItemResponse } from "@/types/report";
import { ReportStatusBadge } from "./ReportStatusBadge";
import { ReportScoreBadge } from "./ReportScoreBadge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, FileText, Clock, Calendar, Eye, FileCheck, ShieldAlert, Sparkles, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { reportService } from "@/services/reportService";

interface ReportCardProps {
  report: ReportItemResponse;
  orgName?: string;
  onViewReport: (reportId: string) => void;
}

export const ReportCard: React.FC<ReportCardProps> = ({
  report,
  orgName,
  onViewReport,
}) => {
  const router = useRouter();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const reportId = report?.id || "";
  const orgId = report?.organization_id || "";
  const regId = report?.regulation_document_id || (report as any)?.regulation_id || "";
  const polId = report?.policy_document_id || "";
  const status = report?.report_status || (report as any)?.status || "PENDING";

  const handleDownloadPdf = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!reportId || isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    try {
      toast.info("Downloading PDF report...");
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
    ? format(new Date(report.created_at), "MMM d, yyyy • HH:mm")
    : "N/A";

  const processingTime =
    report?.processing_time_seconds !== null &&
      report?.processing_time_seconds !== undefined
      ? `${report.processing_time_seconds.toFixed(1)}s`
      : "N/A";

  return (
    <Card className="flex flex-col justify-between hover:shadow-md transition-all duration-200 border-border/60">
      <CardHeader className="p-4 pb-2 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <FileCheck className="h-3.5 w-3.5 text-primary shrink-0" />
              <span title={reportId} className="truncate max-w-[180px]">
                ID: {reportId ? `${reportId.substring(0, 8)}...` : "N/A"}
              </span>
            </div>
          </div>
          <ReportStatusBadge status={status} />
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-2 space-y-3 flex-1 text-sm">
        {/* Score & Org */}
        <div className="flex items-center justify-between gap-2 py-1 border-b border-border/40">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="font-medium text-foreground truncate max-w-[160px]">
              {orgName || (orgId ? `Org: ${orgId.substring(0, 8)}...` : "N/A")}
            </span>
          </div>
          <ReportScoreBadge score={report?.overall_score} />
        </div>

        {/* Regulation & Policy */}
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-muted-foreground">
              <FileText className="h-3.5 w-3.5 text-indigo-500" />
              Regulation:
            </span>
            <span className="font-mono text-foreground truncate max-w-[150px]" title={regId}>
              {regId ? `${regId.substring(0, 8)}...` : "N/A"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-muted-foreground">
              <FileText className="h-3.5 w-3.5 text-emerald-500" />
              Policy:
            </span>
            <span className="font-mono text-foreground truncate max-w-[150px]" title={polId}>
              {polId ? `${polId.substring(0, 8)}...` : "N/A"}
            </span>
          </div>
        </div>

        {/* Processing Time & Date */}
        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground border-t border-border/40">
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            <span>Time: {processingTime}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            <span>{formattedDate}</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 w-full">
          <Button
            variant="outline"
            size="xs"
            onClick={() => router.push(`/compliance/reports/${reportId}/findings`)}
            className="flex-1 text-xs gap-1 cursor-pointer text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-indigo-500" />
            <span>Findings</span>
          </Button>

          <Button
            variant="outline"
            size="xs"
            onClick={() => router.push(`/compliance/reports/${reportId}/recommendations`)}
            className="flex-1 text-xs gap-1 cursor-pointer text-amber-600 dark:text-amber-400 border-amber-500/30"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Recs</span>
          </Button>

          <Button
            variant="outline"
            size="xs"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            className="h-7 px-2 text-xs cursor-pointer"
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
          className="w-full gap-2 cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
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
