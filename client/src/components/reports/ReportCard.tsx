"use client";

import React from "react";
import { format } from "date-fns";
import { ReportItemResponse } from "@/types/report";
import { ReportStatusBadge } from "./ReportStatusBadge";
import { ReportScoreBadge } from "./ReportScoreBadge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, FileText, Clock, Calendar, Eye, FileCheck } from "lucide-react";

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
  const formattedDate = report.created_at
    ? format(new Date(report.created_at), "MMM d, yyyy • HH:mm")
    : "N/A";

  const processingTime =
    report.processing_time_seconds !== null &&
    report.processing_time_seconds !== undefined
      ? `${report.processing_time_seconds.toFixed(1)}s`
      : "N/A";

  return (
    <Card className="flex flex-col justify-between hover:shadow-md transition-all duration-200 border-border/60">
      <CardHeader className="p-4 pb-2 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <FileCheck className="h-3.5 w-3.5 text-primary shrink-0" />
              <span title={report.id} className="truncate max-w-[180px]">
                ID: {report.id}
              </span>
            </div>
          </div>
          <ReportStatusBadge status={report.report_status} />
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-2 space-y-3 flex-1 text-sm">
        {/* Score & Org */}
        <div className="flex items-center justify-between gap-2 py-1 border-b border-border/40">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="font-medium text-foreground truncate max-w-[160px]">
              {orgName || `Org: ${report.organization_id.substring(0, 8)}...`}
            </span>
          </div>
          <ReportScoreBadge score={report.overall_score} />
        </div>

        {/* Regulation & Policy */}
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-muted-foreground">
              <FileText className="h-3.5 w-3.5 text-indigo-500" />
              Regulation:
            </span>
            <span className="font-mono text-foreground truncate max-w-[150px]" title={report.regulation_document_id}>
              {report.regulation_document_id.substring(0, 8)}...
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-muted-foreground">
              <FileText className="h-3.5 w-3.5 text-emerald-500" />
              Policy:
            </span>
            <span className="font-mono text-foreground truncate max-w-[150px]" title={report.policy_document_id}>
              {report.policy_document_id.substring(0, 8)}...
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

      <CardFooter className="p-4 pt-0">
        <Button
          onClick={() => onViewReport(report.id)}
          className="w-full gap-2 cursor-pointer"
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
