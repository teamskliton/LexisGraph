"use client";

import React from "react";
import { KpiStats } from "@/types/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface KpiItem {
  title: string;
  value: string | number;
  subtext: string;
  icon: React.ReactNode;
  iconBg: string;
}

export const DashboardKpiCards: React.FC<DashboardKpiCardsProps> = ({
  kpis,
  isLoading,
}) => {
  if (isLoading || !kpis) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-24 rounded" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-20 rounded" />
            <Skeleton className="h-3 w-28 rounded" />
          </Card>
        ))}
      </div>
    );
  }

  const kpiData: KpiItem[] = [
    {
      title: "Organizations",
      value: kpis.total_organizations,
      subtext: "Active org workspaces",
      icon: <Building2 className="h-4 w-4" />,
      iconBg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    },
    {
      title: "Regulations",
      value: kpis.total_regulations,
      subtext: "Global regulation library",
      icon: <FileText className="h-4 w-4" />,
      iconBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      title: "Policies",
      value: kpis.total_policies,
      subtext: "Corporate policy documents",
      icon: <ShieldCheck className="h-4 w-4" />,
      iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Reports",
      value: kpis.total_compliance_reports,
      subtext: "Audit checks completed",
      icon: <BarChart3 className="h-4 w-4" />,
      iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      title: "Avg. Score",
      value: `${kpis.average_compliance_score}%`,
      subtext: "Overall compliance health",
      icon: <Award className="h-4 w-4" />,
      iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {kpiData.map((kpi, idx) => (
        <Card key={idx} className="flex flex-col gap-0">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 pt-4 px-4">
            {/* Label — uppercase overline style */}
            <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
              {kpi.title}
            </CardTitle>
            {/* Icon container — consistent 32px square */}
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                kpi.iconBg
              )}
            >
              {kpi.icon}
            </div>
          </CardHeader>

          <CardContent className="pb-4 px-4 pt-0">
            {/* Metric value — tabular numerals, tight tracking */}
            <div className="font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground leading-none">
              {kpi.value}
            </div>
            <p className="mt-1.5 text-xs leading-normal text-muted-foreground">
              {kpi.subtext}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default DashboardKpiCards;
