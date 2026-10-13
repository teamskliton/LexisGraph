"use client";

import React from "react";
import { SeverityBreakdown, RiskBreakdown } from "@/types/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldAlert,
  ShieldCheck,
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FindingsBySeverityChartProps {
  data?: SeverityBreakdown;
  fallbackRisk?: RiskBreakdown;
  isLoading: boolean;
}

export const FindingsBySeverityChart: React.FC<FindingsBySeverityChartProps> = ({
  data,
  fallbackRisk,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <Card className="border border-border/50 bg-card shadow-2xs">
        <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-40" />
          </div>
        </CardHeader>
        <CardContent className="py-6 px-5 space-y-3">
          <Skeleton className="h-6 w-full rounded-md" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Derive counts representing actual findings for the active workspace
  const critical = data?.critical ?? fallbackRisk?.critical ?? 0;
  const high = data?.high ?? fallbackRisk?.high ?? 0;
  const medium = data?.medium ?? fallbackRisk?.medium ?? 0;
  const low = data?.low ?? fallbackRisk?.low ?? 0;
  const total = data?.total ?? (critical + high + medium + low);

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const categories = [
    {
      label: "Critical",
      count: critical,
      percentage: pct(critical),
      barColor: "bg-rose-500",
      textColor: "text-rose-600 dark:text-rose-400",
      borderColor: "border-rose-500/20",
      bgColor: "bg-rose-500/5 dark:bg-rose-500/10",
      icon: <AlertOctagon className="h-3.5 w-3.5 text-rose-500" />,
      subtext: "Immediate action",
    },
    {
      label: "High Risk",
      count: high,
      percentage: pct(high),
      barColor: "bg-orange-500",
      textColor: "text-orange-600 dark:text-orange-400",
      borderColor: "border-orange-500/20",
      bgColor: "bg-orange-500/5 dark:bg-orange-500/10",
      icon: <ShieldAlert className="h-3.5 w-3.5 text-orange-500" />,
      subtext: "Priority remediation",
    },
    {
      label: "Medium Risk",
      count: medium,
      percentage: pct(medium),
      barColor: "bg-amber-500",
      textColor: "text-amber-600 dark:text-amber-400",
      borderColor: "border-amber-500/20",
      bgColor: "bg-amber-500/5 dark:bg-amber-500/10",
      icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
      subtext: "Review recommended",
    },
    {
      label: "Low Risk",
      count: low,
      percentage: pct(low),
      barColor: "bg-emerald-500",
      textColor: "text-emerald-600 dark:text-emerald-400",
      borderColor: "border-emerald-500/20",
      bgColor: "bg-emerald-500/5 dark:bg-emerald-500/10",
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
      subtext: "Minor discrepancy",
    },
  ];

  return (
    <Card className="border border-border/50 bg-card shadow-2xs flex flex-col justify-between">
      {/* ── Card Header ── */}
      <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 shrink-0">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Findings by Severity
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Active compliance findings for this organization
              </p>
            </div>
          </div>
          {total > 0 && (
            <span className="text-xs font-semibold text-foreground font-mono bg-muted/40 border border-border/40 px-2 py-0.5 rounded-full">
              {total} Total Findings
            </span>
          )}
        </div>
      </CardHeader>

      {/* ── Card Content ── */}
      <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-4">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
            <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">
                Zero Active Findings
              </p>
              <p className="text-[11px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
                No unresolved non-compliant findings detected in this organization&apos;s current analysis reports.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Compact Stacked Bar Visualization ── */}
            <div className="space-y-1.5">
              <div className="h-3 w-full rounded-full bg-muted/40 overflow-hidden flex">
                {categories.map((cat) => {
                  if (cat.percentage === 0) return null;
                  return (
                    <div
                      key={cat.label}
                      className={cn("h-full transition-all duration-300", cat.barColor)}
                      style={{ width: `${cat.percentage}%` }}
                      title={`${cat.label}: ${cat.count} (${cat.percentage}%)`}
                    />
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5 font-medium">
                <span>Distribution across severity tiers</span>
                <span>100% evaluated</span>
              </div>
            </div>

            {/* ── 4 Category Cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              {categories.map((cat) => (
                <div
                  key={cat.label}
                  className={cn(
                    "rounded-lg border p-3 flex flex-col justify-between space-y-1.5 transition-all duration-150",
                    cat.borderColor,
                    cat.bgColor
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {cat.icon}
                    <span className="text-[11px] font-semibold text-foreground truncate">
                      {cat.label}
                    </span>
                  </div>
                  <div>
                    <div className={cn("text-xl font-bold font-mono tabular-nums leading-none", cat.textColor)}>
                      {cat.count}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                      {cat.percentage}% of findings
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default FindingsBySeverityChart;
