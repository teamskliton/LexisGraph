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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RecentReportsWidgetProps {
  reports?: RecentReportItem[];
  isLoading: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Circular score ring — CSS only, no library
const ScoreRing: React.FC<{ score: number | null }> = ({ score }) => {
  if (score === null || score === undefined) {
    return (
      <div className="h-10 w-10 rounded-full border-2 border-border/50 flex items-center justify-center shrink-0">
        <span className="text-[9px] text-muted-foreground font-medium leading-none">
          N/A
        </span>
      </div>
    );
  }
  const rounded = Math.round(score);
  const ringColor =
    rounded >= 85
      ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
      : rounded >= 70
      ? "border-amber-500 text-amber-700 dark:text-amber-400"
      : "border-rose-500 text-rose-700 dark:text-rose-400";

  return (
    <div
      className={cn(
        "h-10 w-10 rounded-full border-2 flex flex-col items-center justify-center shrink-0",
        ringColor
      )}
    >
      <span className="text-[11px] font-bold tabular-nums leading-none">
        {rounded}
      </span>
      <span className="text-[8px] text-muted-foreground leading-none mt-0.5">
        %
      </span>
    </div>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = status.toUpperCase();

  if (s === "COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
        <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
        Completed
      </span>
    );
  }
  if (s === "PROCESSING" || s === "RUNNING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-400 border border-blue-500/20 whitespace-nowrap">
        <Clock className="h-2.5 w-2.5 shrink-0 animate-spin" />
        Processing
      </span>
    );
  }
  if (s === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400 border border-rose-500/20 whitespace-nowrap">
        <AlertCircle className="h-2.5 w-2.5 shrink-0" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20 whitespace-nowrap">
      <Clock className="h-2.5 w-2.5 shrink-0" />
      {status}
    </span>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

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
        <CardContent className="px-5 py-4 space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-lg border border-border/40 p-3.5"
            >
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5 min-w-0">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <div className="space-y-1.5 shrink-0">
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
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
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                No reports yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">
                Compliance reports appear here once you run an analysis against
                your organization&apos;s policy documents.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.slice(0, 5).map((report) => (
              <div
                key={report.id}
                className={cn(
                  "group relative flex items-center gap-4 rounded-lg border border-border/40 bg-muted/10 px-4 py-3",
                  "transition-all duration-150",
                  // Hover: left accent bar + background
                  "before:absolute before:left-0 before:inset-y-0 before:w-[3px] before:rounded-l-lg",
                  "before:bg-transparent before:transition-colors before:duration-150",
                  "hover:bg-muted/30 hover:border-border hover:before:bg-indigo-500/60"
                )}
              >
                {/* Score ring */}
                <ScoreRing score={report.compliance_score} />

                {/* Report info */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-semibold text-foreground truncate leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
                    title={report.name}
                  >
                    {report.name}
                  </p>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate max-w-[120px]">
                        {report.organization_name}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar className="h-3 w-3 shrink-0" />
                      {formatDate(report.created_at)}
                    </span>
                  </div>
                </div>

                {/* Status + action */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <StatusBadge status={report.status} />
                  {/* Open Report — visible on hover */}
                  <Link href={`/reports/${report.id}`}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-muted-foreground hover:text-foreground"
                      aria-label={`Open report ${report.name}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentReportsWidget;
