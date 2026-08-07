"use client";

import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Zap,
  Award,
  AlertTriangle,
  ShieldCheck,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ComplianceOverviewKpisProps {
  totalAnalyses: number;
  latestScore: number | null;
  activeRisksCount: number;
  policiesCount: number;
  regulationsCount: number;
  isLoading: boolean;
}

export const ComplianceOverviewKpis: React.FC<ComplianceOverviewKpisProps> = ({
  totalAnalyses,
  latestScore,
  activeRisksCount,
  policiesCount,
  regulationsCount,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4 border-border/60">
            <div className="flex items-start justify-between mb-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-8 w-20 rounded mb-1.5" />
            <Skeleton className="h-3 w-28 rounded mb-1" />
            <Skeleton className="h-3 w-36 rounded" />
          </Card>
        ))}
      </div>
    );
  }

  const getScoreBadge = (score: number | null) => {
    if (score === null) return { label: "No Data", className: "bg-muted text-muted-foreground" };
    if (score >= 85) return { label: "Healthy", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
    if (score >= 70) return { label: "Fair", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
    return { label: "At Risk", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400" };
  };

  const scoreBadge = getScoreBadge(latestScore);

  const cards = [
    {
      title: "Total Analyses",
      value: totalAnalyses,
      description: "Total AI compliance runs completed",
      icon: <Zap className="h-4 w-4" />,
      iconBg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
      status: {
        label: totalAnalyses > 0 ? "Completed" : "None",
        className: totalAnalyses > 0 ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "bg-muted text-muted-foreground",
      },
    },
    {
      title: "Latest Score",
      value: latestScore != null ? `${latestScore}%` : "—",
      description: "Most recent analysis alignment score",
      icon: <Award className="h-4 w-4" />,
      iconBg:
        latestScore != null && latestScore >= 85
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : latestScore != null && latestScore >= 70
          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : latestScore != null
          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
          : "bg-muted text-muted-foreground",
      status: scoreBadge,
    },
    {
      title: "Active Risks",
      value: activeRisksCount,
      description: "Identified policy compliance gaps",
      icon: <AlertTriangle className="h-4 w-4" />,
      iconBg: activeRisksCount > 0 ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      status: {
        label: activeRisksCount > 0 ? `${activeRisksCount} Gaps` : "Clear",
        className: activeRisksCount > 0 ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      },
    },
    {
      title: "Policies Covered",
      value: policiesCount,
      description: "Internal company policies indexed",
      icon: <ShieldCheck className="h-4 w-4" />,
      iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      status: {
        label: policiesCount > 0 ? "Indexed" : "Empty",
        className: policiesCount > 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
      },
    },
    {
      title: "Regulations Applied",
      value: regulationsCount,
      description: "Statutory acts & benchmarks applied",
      icon: <BookOpen className="h-4 w-4" />,
      iconBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
      status: {
        label: regulationsCount > 0 ? "Mapped" : "None",
        className: regulationsCount > 0 ? "bg-violet-500/10 text-violet-600 dark:text-violet-400" : "bg-muted text-muted-foreground",
      },
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card, idx) => (
        <Card key={idx} className="flex flex-col justify-between border-border/60 bg-card/60 shadow-xs">
          <CardHeader className="px-4 pt-4 pb-0">
            <div className="flex items-start justify-between gap-2">
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", card.iconBg)}>
                {card.icon}
              </div>
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none shrink-0", card.status.className)}>
                {card.status.label}
              </span>
            </div>
          </CardHeader>

          <CardContent className="px-4 pb-4 pt-3 flex flex-col gap-1">
            <div className="font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground leading-none">
              {card.value}
            </div>
            <p className="text-xs font-semibold text-foreground/80 leading-tight">
              {card.title}
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground mt-0.5">
              {card.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
