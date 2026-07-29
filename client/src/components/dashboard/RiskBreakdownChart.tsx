"use client";

import React from "react";
import { RiskBreakdown } from "@/types/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, ShieldCheck, AlertTriangle, AlertOctagon } from "lucide-react";

interface RiskBreakdownChartProps {
  data?: RiskBreakdown;
  isLoading: boolean;
}

export const RiskBreakdownChart: React.FC<RiskBreakdownChartProps> = ({
  data,
  isLoading,
}) => {
  if (isLoading || !data) {
    return (
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent className="py-4">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const items = [
    {
      label: "Low Risk",
      count: data.low,
      color: "bg-emerald-500",
      icon: <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />,
      badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400",
    },
    {
      label: "Medium Risk",
      count: data.medium,
      color: "bg-amber-500",
      icon: <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />,
      badge: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400",
    },
    {
      label: "High Risk",
      count: data.high,
      color: "bg-orange-500",
      icon: <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />,
      badge: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-400",
    },
    {
      label: "Critical Risk",
      count: data.critical,
      color: "bg-red-500",
      icon: <AlertOctagon className="h-3.5 w-3.5 text-red-500" />,
      badge: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-400",
    },
  ];

  const total = items.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <CardTitle className="text-base font-bold text-foreground">
            Risk Level Breakdown
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-3">
        {total === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No risk evaluation metrics available.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((item, idx) => {
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;

              return (
                <div
                  key={idx}
                  className="rounded-lg border border-border/50 p-3 space-y-1.5 bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      {item.icon}
                      {item.label}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${item.badge}`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="text-xl font-extrabold font-mono text-foreground">
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
