"use client";

import React from "react";
import { ComplianceKpiStats, KpiStats } from "@/types/dashboard";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Award,
  AlertOctagon,
  Eye,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardKpiCardsProps {
  complianceKpis?: ComplianceKpiStats;
  kpis?: KpiStats;
  isLoading: boolean;
}

interface StatusConfig {
  label: string;
  className: string;
}

function getScoreStatus(score: number | null | undefined): StatusConfig {
  if (score === null || score === undefined || score === 0) {
    return { label: "No Reports", className: "bg-muted text-muted-foreground" };
  }
  if (score >= 85) {
    return {
      label: "Healthy",
      className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
    };
  }
  if (score >= 70) {
    return {
      label: "Fair",
      className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
    };
  }
  return {
    label: "At Risk",
    className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
  };
}

export const DashboardKpiCards: React.FC<DashboardKpiCardsProps> = ({
  complianceKpis,
  kpis,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4 border-border/50 bg-card/60 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-8 w-20 rounded" />
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-3 w-36 rounded" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  // Derive unified metric values strictly from active workspace backend data
  const scoreVal = complianceKpis?.compliance_score ?? (kpis?.average_compliance_score && kpis.average_compliance_score > 0 ? kpis.average_compliance_score : null);
  const trendDelta = complianceKpis?.score_trend_delta;
  const criticalCount = complianceKpis?.critical_findings ?? 0;
  const needsReviewCount = complianceKpis?.needs_review ?? 0;
  const compliantClausesCount = complianceKpis?.compliant_clauses ?? 0;
  const pendingAnalysesCount = complianceKpis?.pending_analyses ?? 0;

  const scoreStatus = getScoreStatus(scoreVal);

  const cards = [
    {
      id: "compliance-score",
      title: "Compliance Score",
      value: scoreVal !== null ? `${scoreVal}%` : "—",
      description: "Current organizational score",
      icon: <Award className="h-4 w-4" />,
      iconBg:
        scoreVal !== null
          ? scoreVal >= 85
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : scoreVal >= 70
            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
          : "bg-muted text-muted-foreground",
      status: scoreStatus,
      trend:
        trendDelta !== null && trendDelta !== undefined ? (
          <div className="flex items-center gap-1 text-[11px] font-medium pt-1">
            {trendDelta > 0 ? (
              <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-3 w-3" /> +{trendDelta}% vs prev
              </span>
            ) : trendDelta < 0 ? (
              <span className="flex items-center gap-0.5 text-rose-600 dark:text-rose-400">
                <TrendingDown className="h-3 w-3" /> {trendDelta}% vs prev
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-muted-foreground">
                <Minus className="h-3 w-3" /> 0% vs prev
              </span>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground pt-1 block">
            {scoreVal !== null ? "Latest analysis score" : "No analyses evaluated"}
          </span>
        ),
    },
    {
      id: "critical-findings",
      title: "Critical Findings",
      value: criticalCount,
      description: "Unresolved high-impact gaps",
      icon: <AlertOctagon className="h-4 w-4" />,
      iconBg:
        criticalCount > 0
          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      status:
        criticalCount > 0
          ? {
              label: `${criticalCount} Action Req.`,
              className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
            }
          : {
              label: "Zero Critical",
              className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
            },
      trend: (
        <span className="text-[10px] text-muted-foreground pt-1 block">
          {criticalCount > 0 ? "Requires priority remediation" : "No unresolved critical gaps"}
        </span>
      ),
    },
    {
      id: "needs-review",
      title: "Needs Review",
      value: needsReviewCount,
      description: "Awaiting human verification",
      icon: <Eye className="h-4 w-4" />,
      iconBg:
        needsReviewCount > 0
          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "bg-muted text-muted-foreground",
      status:
        needsReviewCount > 0
          ? {
              label: "Pending Verification",
              className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
            }
          : {
              label: "Queue Clear",
              className: "bg-muted text-muted-foreground border border-border/50",
            },
      trend: (
        <span className="text-[10px] text-muted-foreground pt-1 block">
          In review or partial alignment
        </span>
      ),
    },
    {
      id: "compliant-clauses",
      title: "Compliant Clauses",
      value: compliantClausesCount,
      description: "Verified statutory alignments",
      icon: <CheckCircle2 className="h-4 w-4" />,
      iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      status:
        compliantClausesCount > 0
          ? {
              label: "Verified",
              className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
            }
          : {
              label: "Pending Checks",
              className: "bg-muted text-muted-foreground border border-border/50",
            },
      trend: (
        <span className="text-[10px] text-muted-foreground pt-1 block">
          Direct rule matches in policy
        </span>
      ),
    },
    {
      id: "pending-analyses",
      title: "Pending Analyses",
      value: pendingAnalysesCount,
      description: "Active background jobs",
      icon: <Clock className="h-4 w-4" />,
      iconBg:
        pendingAnalysesCount > 0
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
      status:
        pendingAnalysesCount > 0
          ? {
              label: "Running",
              className: "bg-primary/10 text-primary border border-primary/20 animate-pulse",
            }
          : {
              label: "Idle",
              className: "bg-muted text-muted-foreground border border-border/50",
            },
      trend: (
        <span className="text-[10px] text-muted-foreground pt-1 block">
          {pendingAnalysesCount > 0 ? "Pipeline actively processing" : "No jobs queued"}
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => (
        <Card
          key={card.id}
          className="border border-border/50 bg-card/60 hover:bg-card hover:border-border transition-all duration-150 flex flex-col justify-between shadow-2xs"
        >
          <CardHeader className="px-4 pt-4 pb-0">
            <div className="flex items-start justify-between gap-2">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  card.iconBg
                )}
              >
                {card.icon}
              </div>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none shrink-0",
                  card.status.className
                )}
              >
                {card.status.label}
              </span>
            </div>
          </CardHeader>

          <CardContent className="px-4 pb-4 pt-3 flex flex-col justify-between flex-1">
            <div>
              <div className="font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground leading-none">
                {card.value}
              </div>
              <p className="text-xs font-semibold text-foreground/90 mt-1.5 leading-tight">
                {card.title}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground mt-0.5">
                {card.description}
              </p>
            </div>

            <div className="mt-2 pt-2 border-t border-border/40">
              {card.trend}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default DashboardKpiCards;
