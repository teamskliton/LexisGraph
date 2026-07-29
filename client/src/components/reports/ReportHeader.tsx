"use client";

import React from "react";
import { format } from "date-fns";
import { ReportDetailResponse } from "@/types/report";
import { ReportStatusBadge } from "./ReportStatusBadge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Building2,
  FileText,
  Calendar,
  FileCheck,
  Copy,
  Check,
  Download,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface ReportHeaderProps {
  report: ReportDetailResponse;
  orgName?: string;
  onBack: () => void;
  onDownloadPdf?: () => void;
  isDownloadingPdf?: boolean;
}

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  report,
  orgName,
  onBack,
  onDownloadPdf,
  isDownloadingPdf = false,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(report.id);
    setCopied(true);
    toast.success("Report ID copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedDate = report.created_at
    ? format(new Date(report.created_at), "MMMM d, yyyy • HH:mm:ss")
    : "N/A";

  return (
    <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm space-y-4">
      {/* Top Bar: Back Button, Status Badge & Download PDF */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Reports</span>
          </Button>
          <div className="h-4 w-[1px] bg-border hidden sm:block" />
          <div className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Compliance Report
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ReportStatusBadge status={report.report_status} className="text-sm px-3 py-1" />

          {onDownloadPdf && (
            <Button
              onClick={onDownloadPdf}
              disabled={isDownloadingPdf}
              size="sm"
              className="gap-2 cursor-pointer shadow-sm"
            >
              {isDownloadingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>{isDownloadingPdf ? "Generating PDF..." : "Download PDF"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-border/50">
        {/* Report ID */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            Report ID
          </span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-foreground truncate max-w-[160px]" title={report.id}>
              {report.id}
            </span>
            <button
              onClick={handleCopyId}
              className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
              title="Copy Report ID"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Organization */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            Organization
          </span>
          <p className="text-sm font-semibold text-foreground truncate" title={orgName || report.organization_id}>
            {orgName || `${report.organization_id.substring(0, 8)}...`}
          </p>
        </div>

        {/* Regulation vs Policy */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            <FileText className="h-3.5 w-3.5 text-indigo-500" />
            Regulation / Policy
          </span>
          <p className="text-xs font-mono text-foreground truncate" title={`Reg: ${report.regulation_document_id} | Policy: ${report.policy_document_id}`}>
            Reg: {report.regulation_document_id.substring(0, 6)}... / Pol: {report.policy_document_id.substring(0, 6)}...
          </p>
        </div>

        {/* Created Date */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            Created Date
          </span>
          <p className="text-xs font-medium text-foreground truncate">
            {formattedDate}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ReportHeader;
