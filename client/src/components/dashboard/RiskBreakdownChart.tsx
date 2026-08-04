"use client";

import React from "react";
import { RiskBreakdown } from "@/types/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, ShieldCheck, AlertTriangle, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";

interface RiskBreakdownChartProps {
  data?: RiskBreakdown;
  isLoading: boolean;
}

interface RiskItem {
  label: string;
  count: number;
  barColor: string;
  iconColor: string;
  iconBg: string;
  badgeBg: string;
  badgeText: string;
  hoverRing: string;
  icon: React.ReactNode;
}

export const RiskBreakdownChart: React.FC<RiskBreakdownChartProps> = ({
  data,
  isLoading,
}) => {
  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-36" />
          </div>
        </CardHeader>
        <CardContent className="py-5 px-5">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const items: RiskItem[] = [
    {
      label: "Low Risk",
      count: data.low,
      barColor: "bg-emerald-500",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      iconBg: "bg-emerald-500/10",
      badgeBg: "bg-emerald-500/10",
      badgeText: "text-emerald-700 dark:text-emerald-400",
      hoverRing: "hover:ring-1 hover:ring-emerald-500/30",
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
    },
    {
      label: "Medium Risk",
      count: data.medium,
      barColor: "bg-amber-500",
      iconColor: "text-amber-600 dark:text-amber-400",
      iconBg: "bg-amber-500/10",
      badgeBg: "bg-amber-500/10",
      badgeText: "text-amber-700 dark:text-amber-400",
      hoverRing: "hover:ring-1 hover:ring-amber-500/30",
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
    },
    {
      label: "High Risk",
      count: data.high,
      barColor: "bg-orange-500",
      iconColor: "text-orange-600 dark:text-orange-400",
      iconBg: "bg-orange-500/10",
      badgeBg: "bg-orange-500/10",
      badgeText: "text-orange-700 dark:text-orange-400",
      hoverRing: "hover:ring-1 hover:ring-orange-500/30",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
    },
    {
      label: "Critical",
      count: data.critical,
      barColor: "bg-rose-500",
      iconColor: "text-rose-600 dark:text-rose-400",
      iconBg: "bg-rose-500/10",
      badgeBg: "bg-rose-500/10",
      badgeText: "text-rose-700 dark:text-rose-400",
      hoverRing: "hover:ring-1 hover:ring-rose-500/40",
      icon: <AlertOctagon className="h-3.5 w-3.5" />,
    },
  ];

  const total = items.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <Card>
      {/* Header */}
      <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm font-semibold text-foreground">
            Risk Level Breakdown
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="py-5 px-5">
        {total === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">
            No risk evaluation metrics available yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((item, idx) => {
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;

              return (
                <div
                  key={idx}
                  className={cn(
                    "group rounded-lg border border-border/50 bg-muted/20 p-3.5 space-y-2",
                    "transition-all duration-200 ease-out",
                    "hover:-translate-y-0.5 hover:bg-muted/40 hover:border-border",
                    item.hoverRing
                  )}
                >
                  {/* Icon + label row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("shrink-0", item.iconColor)}>
                        {item.icon}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground leading-none">
                        {item.label}
                      </span>
                    </div>
                    {/* Percentage badge */}
                    <span
                      className={cn(
                        "text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded",
                        item.badgeBg,
                        item.badgeText
                      )}
                    >
                      {pct}%
                    </span>
                  </div>

                  {/* Count — large, prominent */}
                  <div className={cn(
                    "text-2xl font-bold tabular-nums tracking-tight leading-none",
                    item.iconColor
                  )}>
                    {item.count}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RiskBreakdownChart;
