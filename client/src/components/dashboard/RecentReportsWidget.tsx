"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RecentReportItem } from "@/types/dashboard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
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

const ScoreRing: React.FC<{ score: number | null }> = ({ score }) => {
  if (score === null || score === undefined) {
    return (
      <div className="h-9 w-9 rounded-full border border-border/50 flex items-center justify-center shrink-0 bg-muted/20">
        <span className="text-[9px] text-muted-foreground font-medium leading-none">
          N/A
        </span>
      </div>
    );
  }
  const rounded = Math.round(score);
  const ringColor =
    rounded >= 85
      ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
      : rounded >= 70
      ? "border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-500/5"
      : "border-rose-500 text-rose-600 dark:text-rose-400 bg-rose-500/5";

  return (
    <div
      className={cn(
        "h-9 w-9 rounded-full border-2 flex flex-col items-center justify-center shrink-0 font-mono",
        ringColor
      )}
    >
      <span className="text-[11px] font-bold tabular-nums leading-none">
        {rounded}
      </span>
      <span className="text-[7px] text-muted-foreground leading-none mt-0.5">
        %
      </span>
    </div>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = status.toUpperCase();

  if (s === "COMPLETED") {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] px-2 py-0.5 font-medium whitespace-nowrap"
      >
        <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
        Completed
      </Badge>
    );
  }
  if (s === "PROCESSING" || s === "RUNNING") {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-primary/10 text-primary border-primary/20 text-[10px] px-2 py-0.5 font-medium whitespace-nowrap"
      >
        <Clock className="h-2.5 w-2.5 shrink-0 animate-spin" />
        Processing
      </Badge>
    );
  }
  if (s === "FAILED") {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[10px] px-2 py-0.5 font-medium whitespace-nowrap"
      >
        <AlertCircle className="h-2.5 w-2.5 shrink-0" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] px-2 py-0.5 font-medium whitespace-nowrap"
    >
      <Clock className="h-2.5 w-2.5 shrink-0" />
      {status}
    </Badge>
  );
};

const RiskBadge: React.FC<{ risk?: string | null }> = ({ risk }) => {
  if (!risk) return null;
  const r = risk.toLowerCase();

  if (r.includes("low")) {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] px-1.5 py-0 font-medium whitespace-nowrap"
      >
        <ShieldCheck className="h-2.5 w-2.5 shrink-0" />
        Low Risk
      </Badge>
    );
  }
  if (r.includes("medium")) {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] px-1.5 py-0 font-medium whitespace-nowrap"
      >
        <ShieldAlert className="h-2.5 w-2.5 shrink-0" />
        Medium Risk
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[10px] px-1.5 py-0 font-medium whitespace-nowrap"
    >
      <ShieldX className="h-2.5 w-2.5 shrink-0" />
      High Risk
    </Badge>
  );
};

export const RecentReportsWidget: React.FC<RecentReportsWidgetProps> = ({
  reports = [],
  isLoading,
}) => {
  const router = useRouter();

  if (isLoading) {
    return (
      <Card className="border border-border/50 bg-card shadow-2xs">
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
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5 min-w-0">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/50 bg-card shadow-2xs flex flex-col justify-between">
      {/* ── Card Header ── */}
      <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Recent Reports
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Latest compliance audit reports for this organization
              </p>
            </div>
          </div>
          <Link
            href="/reports"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            <span>View All Reports</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>

      {/* ── Card Content ── */}
      <CardContent className="px-5 py-4 flex-1">
        {reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-2.5">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground/50">
              <FileText className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">
                No Compliance Reports Yet
              </p>
              <p className="text-[11px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
                Compliance checks and gap analyses evaluated for this organization will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.slice(0, 5).map((report) => (
              <div
                key={report.id}
                onClick={() => router.push(`/reports/${report.id}`)}
                className={cn(
                  "group flex items-center gap-3.5 rounded-lg border border-border/40 bg-muted/10 px-3.5 py-2.5 cursor-pointer",
                  "transition-all duration-150 hover:bg-muted/30 hover:border-border hover:shadow-2xs"
                )}
              >
                {/* Score Ring */}
                <ScoreRing score={report.compliance_score} />

                {/* Report Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p
                      className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors"
                      title={report.name}
                    >
                      {report.name}
                    </p>
                    <RiskBadge risk={report.risk_level} />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Calendar className="h-3 w-3 shrink-0" />
                      {formatDate(report.created_at)}
                    </span>
                    <span>•</span>
                    <span className="truncate max-w-[120px]">
                      {report.organization_name}
                    </span>
                  </div>
                </div>

                {/* Status Badge + Arrow */}
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={report.status} />
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
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
