"use client";

import React from "react";
import Link from "next/link";
import { RecentReportItem } from "@/types/dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ArrowRight, Building2, Calendar, CheckCircle2, Clock, AlertCircle } from "lucide-react";

interface RecentReportsWidgetProps {
  reports?: RecentReportItem[];
  isLoading: boolean;
}

export const RecentReportsWidget: React.FC<RecentReportsWidgetProps> = ({
  reports = [],
  isLoading,
}) => {
  if (isLoading) {
    return (
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent className="py-4">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    if (s === "COMPLETED") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="h-3 w-3" />
          Completed
        </span>
      );
    }
    if (s === "PROCESSING" || s === "RUNNING") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <Clock className="h-3 w-3 animate-spin" />
          Processing
        </span>
      );
    }
    if (s === "FAILED") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400 border border-red-500/20">
          <AlertCircle className="h-3 w-3" />
          Failed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
        <Clock className="h-3 w-3" />
        {status}
      </span>
    );
  };

  const getScoreBadge = (score: number | null) => {
    if (score === null || score === undefined) {
      return <span className="text-xs text-muted-foreground">N/A</span>;
    }
    const rounded = Math.round(score);
    const colorClass =
      rounded >= 85
        ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400"
        : rounded >= 70
        ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-400"
        : "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-400";

    return (
      <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold font-mono ${colorClass}`}>
        {rounded}%
      </span>
    );
  };

  return (
    <Card className="border-border/60 shadow-sm flex flex-col justify-between">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Recent Reports
              </CardTitle>
            </div>
          </div>
          <Link
            href="/reports"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 hover:underline"
          >
            View All
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>

      <CardContent className="pt-4 flex-1">
        {reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground">No recent compliance reports recorded.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {reports.slice(0, 5).map((report) => (
              <Link
                key={report.id}
                href={`/reports/${report.id}`}
                className="group flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/50 hover:border-indigo-500/30 transition-all gap-2"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white transition-colors mt-0.5 sm:mt-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                      {report.name}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1 truncate max-w-[140px]">
                        <Building2 className="h-3 w-3 shrink-0" />
                        {report.organization_name}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <Calendar className="h-3 w-3" />
                        {formatDate(report.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-border/40">
                  {getStatusBadge(report.status)}
                  {getScoreBadge(report.compliance_score)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentReportsWidget;
