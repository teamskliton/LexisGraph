"use client";

import React from "react";
import { ScoreDistribution } from "@/types/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react";

interface ComplianceScoreChartProps {
  data?: ScoreDistribution;
  isLoading: boolean;
}

export const ComplianceScoreChart: React.FC<ComplianceScoreChartProps> = ({
  data,
  isLoading,
}) => {
  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-48" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 py-5 px-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const items = [
    {
      label: "Excellent (90–100%)",
      count: data.excellent,
      color: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
      track: "bg-emerald-500/10",
    },
    {
      label: "Good (80–89%)",
      count: data.good,
      color: "bg-blue-500",
      text: "text-blue-600 dark:text-blue-400",
      track: "bg-blue-500/10",
    },
    {
      label: "Needs Review (60–79%)",
      count: data.needs_review,
      color: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400",
      track: "bg-amber-500/10",
    },
    {
      label: "High Risk (<60%)",
      count: data.high_risk,
      color: "bg-rose-500",
      text: "text-rose-600 dark:text-rose-400",
      track: "bg-rose-500/10",
    },
  ];

  const total = items.reduce((acc, curr) => acc + curr.count, 0);
  const maxCount = Math.max(...items.map((i) => i.count), 1);

  return (
    <Card>
      {/* Header */}
      <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
            <BarChart3 className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm font-semibold text-foreground">
            Compliance Score Distribution
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="px-5 py-5 space-y-4">
        {total === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">
            No compliance score evaluation data available yet.
          </p>
        ) : (
          items.map((item, idx) => {
            const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
            const barWidth = Math.round((item.count / maxCount) * 100);

            return (
              <div key={idx} className="space-y-1.5">
                {/* Label row */}
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground/80">
                    {item.label}
                  </span>
                  <span className={`font-semibold font-mono tabular-nums ${item.text}`}>
                    {item.count}
                    <span className="text-muted-foreground font-normal ml-1">
                      ({percentage}%)
                    </span>
                  </span>
                </div>
                {/* Progress track */}
                <div className={`h-2 w-full rounded-full overflow-hidden ${item.track}`}>
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${item.color}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

export default ComplianceScoreChart;
