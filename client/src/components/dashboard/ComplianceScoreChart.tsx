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
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent className="space-y-4 py-4">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const items = [
    { label: "Excellent (90-100%)", count: data.excellent, color: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
    { label: "Good (80-89%)", count: data.good, color: "bg-blue-500", text: "text-blue-600 dark:text-blue-400" },
    { label: "Needs Review (60-79%)", count: data.needs_review, color: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
    { label: "High Risk (<60%)", count: data.high_risk, color: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  ];

  const total = items.reduce((acc, curr) => acc + curr.count, 0);
  const maxCount = Math.max(...items.map((i) => i.count), 1);

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <BarChart3 className="h-4 w-4" />
          </div>
          <CardTitle className="text-base font-bold text-foreground">
            Compliance Score Distribution
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {total === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No compliance score evaluation data available.
          </p>
        ) : (
          items.map((item, idx) => {
            const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
            const barWidth = Math.round((item.count / maxCount) * 100);

            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{item.label}</span>
                  <span className={`font-bold font-mono ${item.text}`}>
                    {item.count} ({percentage}%)
                  </span>
                </div>
                <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
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
