"use client";

import React from "react";
import Link from "next/link";
import { RecentReportItem } from "@/types/dashboard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RecentReportsWidgetProps {
  reports?: RecentReportItem[];
  isLoading: boolean;
}

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

const StatusBadge = ({ status }: { status: string }) => {
  const s = status.toUpperCase();

  if (s === "COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        Completed
      </span>
    );
  }
  if (s === "PROCESSING" || s === "RUNNING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400 border border-blue-500/20">
        <Clock className="h-3 w-3 shrink-0 animate-spin" />
        Processing
      </span>
    );
  }
  if (s === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-400 border border-rose-500/20">
        <AlertCircle className="h-3 w-3 shrink-0" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400 border border-amber-500/20">
      <Clock className="h-3 w-3 shrink-0" />
      {status}
    </span>
  );
};

const ScoreBadge = ({ score }: { score: number | null }) => {
  if (score === null || score === undefined) {
    return <span className="text-xs text-muted-foreground tabular-nums">N/A</span>;
  }
  const rounded = Math.round(score);
  const colorClass =
    rounded >= 85
      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400"
      : rounded >= 70
      ? "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400"
      : "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-400";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold font-mono tabular-nums",
        colorClass
      )}
    >
      {rounded}%
    </span>
  );
};

export const RecentReportsWidget: React.FC<RecentReportsWidgetProps> = ({
  reports = [],
  isLoading,
}) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        </CardHeader>
        <CardContent className="px-5 py-5 space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {/* Header */}
      <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <CardTitle className="text-sm font-semibold text-foreground">
              Recent Reports
            </CardTitle>
          </div>
          <Link
            href="/reports"
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
          >
            View All
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>

      <CardContent className="px-5 py-4">
        {reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3">
              <FileText className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No recent reports</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Compliance reports will appear here once generated.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.slice(0, 5).map((report) => (
              <Link
                key={report.id}
                href={`/reports/${report.id}`}
                className={cn(
                  "group flex flex-col sm:flex-row sm:items-center justify-between",
                  "rounded-lg border border-border/40 bg-muted/10 px-3.5 py-3",
                  "hover:bg-muted/40 hover:border-indigo-400/30 dark:hover:border-indigo-500/30",
                  "transition-all duration-150 ease-out gap-2.5"
                )}
              >
                {/* Left: icon + title + meta */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-150 sm:mt-0">
                    <FileText className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                      {report.name}
                    </p>
                    <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1 truncate max-w-[150px]">
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

                {/* Right: status + score */}
                <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-1.5 sm:pt-0 border-t sm:border-0 border-border/30">
                  <StatusBadge status={report.status} />
                  <ScoreBadge score={report.compliance_score} />
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
