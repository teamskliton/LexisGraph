"use client";

import React from "react";
import { KpiStats } from "@/types/dashboard";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  FileText,
  ShieldCheck,
  BarChart3,
  Award,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardKpiCardsProps {
  kpis?: KpiStats;
  isLoading: boolean;
}

interface StatusConfig {
  label: string;
  className: string;
}

function getScoreStatus(score: number): StatusConfig {
  if (score === 0)
    return { label: "No Data", className: "bg-muted text-muted-foreground" };
  if (score >= 85)
    return {
      label: "Healthy",
      className:
        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    };
  if (score >= 70)
    return {
      label: "Fair",
      className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    };
  return {
    label: "At Risk",
    className: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  };
}

interface KpiCardData {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  status: StatusConfig;
}

function buildCards(kpis: KpiStats): KpiCardData[] {
  const scoreStatus = getScoreStatus(kpis.average_compliance_score);

  const activeStatus = (count: number, label: string): StatusConfig =>
    count === 0
      ? { label: "Empty", className: "bg-muted text-muted-foreground" }
      : { label, className: "bg-primary/10 text-primary" };

  return [
    {
      title: "Organizations",
      value: kpis.total_organizations,
      description: "Active compliance workspaces under management",
      icon: <Building2 className="h-4 w-4" />,
      iconBg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
      status: activeStatus(kpis.total_organizations, "Active"),
    },
    {
      title: "Regulation Library",
      value: kpis.total_regulations,
      description: "Global regulations indexed in the knowledge graph",
      icon: <FileText className="h-4 w-4" />,
      iconBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
      status: activeStatus(kpis.total_regulations, "Indexed"),
    },
    {
      title: "Policy Documents",
      value: kpis.total_policies,
      description: "Internal policies mapped against regulations",
      icon: <ShieldCheck className="h-4 w-4" />,
      iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      status: activeStatus(kpis.total_policies, "Managed"),
    },
    {
      title: "Compliance Reports",
      value: kpis.total_compliance_reports,
      description: "AI-generated audit analyses completed",
      icon: <BarChart3 className="h-4 w-4" />,
      iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      status: activeStatus(kpis.total_compliance_reports, "Analyzed"),
    },
    {
      title: "Portfolio Score",
      value:
        kpis.average_compliance_score > 0
          ? `${kpis.average_compliance_score}%`
          : "—",
      description: "Avg. compliance score across all organizations",
      icon: <Award className="h-4 w-4" />,
      iconBg:
        kpis.average_compliance_score >= 85
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : kpis.average_compliance_score >= 70
          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : kpis.average_compliance_score > 0
          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
          : "bg-muted text-muted-foreground",
      status: scoreStatus,
    },
  ];
}

export const DashboardKpiCards: React.FC<DashboardKpiCardsProps> = ({
  kpis,
  isLoading,
}) => {
  if (isLoading || !kpis) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between mb-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-8 w-20 rounded mb-1.5" />
            <Skeleton className="h-3 w-28 rounded mb-1" />
            <Skeleton className="h-3 w-36 rounded mb-3" />
            <Skeleton className="h-3 w-16 rounded" />
          </Card>
        ))}
      </div>
    );
  }

  const cards = buildCards(kpis);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card, idx) => (
        <Card key={idx} className="flex flex-col justify-between">
          <CardHeader className="px-4 pt-4 pb-0">
            {/* Icon + Status badge row */}
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

          <CardContent className="px-4 pb-4 pt-3 flex flex-col gap-1">
            {/* Primary metric */}
            <div className="font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground leading-none">
              {card.value}
            </div>
            {/* Card title */}
            <p className="text-xs font-semibold text-foreground/80 leading-tight">
              {card.title}
            </p>
            {/* Supporting description */}
            <p className="text-[11px] leading-relaxed text-muted-foreground mt-0.5">
              {card.description}
            </p>
            {/* Live indicator */}
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/40">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="text-[10px] text-muted-foreground/60 font-medium">
                Live data
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default DashboardKpiCards;
