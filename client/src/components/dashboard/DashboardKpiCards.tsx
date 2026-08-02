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
  Activity,
  Award,
} from "lucide-react";

interface DashboardKpiCardsProps {
  kpis?: KpiStats;
  isLoading: boolean;
}

export const DashboardKpiCards: React.FC<DashboardKpiCardsProps> = ({
  kpis,
  isLoading,
}) => {
  if (isLoading || !kpis) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="border-border/60 shadow-sm p-4 space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </Card>
        ))}
      </div>
    );
  }

  const kpiData = [
    {
      title: "Total Organizations",
      value: kpis.total_organizations,
      subtext: "Active org workspaces",
      icon: <Building2 className="h-4 w-4 text-indigo-500" />,
    },
    {
      title: "Global Regulation Library",
      value: kpis.total_regulations,
      subtext: "Shared global repository",
      icon: <FileText className="h-4 w-4 text-violet-500" />,
    },
    {
      title: "Total Policies",
      value: kpis.total_policies,
      subtext: "Corporate policy documents",
      icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />,
    },
    {
      title: "Compliance Reports",
      value: kpis.total_compliance_reports,
      subtext: "Audit checks completed",
      icon: <BarChart3 className="h-4 w-4 text-blue-500" />,
    },
    {
      title: "Average Score",
      value: `${kpis.average_compliance_score}%`,
      subtext: "Overall compliance health",
      icon: <Award className="h-4 w-4 text-amber-500" />,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {kpiData.map((kpi, idx) => (
        <Card key={idx} className="border-border/60 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {kpi.title}
            </CardTitle>
            {kpi.icon}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {kpi.value}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{kpi.subtext}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default DashboardKpiCards;
