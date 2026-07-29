"use client";

import React from "react";
import { format } from "date-fns";
import { ReportDetailResponse } from "@/types/report";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportStatusBadge } from "./ReportStatusBadge";
import { Clock, Calendar, Database, Shield } from "lucide-react";

interface ReportMetadataProps {
  report: ReportDetailResponse;
}

export const ReportMetadata: React.FC<ReportMetadataProps> = ({ report }) => {
  const createdAtFormatted = report.created_at
    ? format(new Date(report.created_at), "PPP • HH:mm:ss O")
    : "N/A";

  const updatedAtFormatted = report.updated_at
    ? format(new Date(report.updated_at), "PPP • HH:mm:ss O")
    : "N/A";

  const processingTime =
    report.processing_time_seconds !== null &&
    report.processing_time_seconds !== undefined
      ? `${report.processing_time_seconds.toFixed(2)} seconds`
      : "N/A";

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-400">
            <Database className="h-4 w-4" />
          </div>
          <CardTitle className="text-base font-bold text-foreground">
            Processing Details & System Metadata
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Processing Time */}
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              Processing Time
            </span>
            <p className="text-sm font-bold font-mono text-foreground">
              {processingTime}
            </p>
          </div>

          {/* Report Status */}
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-emerald-500" />
              Report Status
            </span>
            <div>
              <ReportStatusBadge status={report.report_status} />
            </div>
          </div>

          {/* Created At */}
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-indigo-500" />
              Created At
            </span>
            <p className="text-xs font-medium text-foreground">
              {createdAtFormatted}
            </p>
          </div>

          {/* Updated At */}
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-indigo-500" />
              Last Updated At
            </span>
            <p className="text-xs font-medium text-foreground">
              {updatedAtFormatted}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReportMetadata;
