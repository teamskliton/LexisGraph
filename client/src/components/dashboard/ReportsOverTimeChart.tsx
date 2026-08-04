"use client";

import React from "react";
import { ReportsOverTimeItem } from "@/types/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, TrendingUp } from "lucide-react";

interface ReportsOverTimeChartProps {
  data?: ReportsOverTimeItem[];
  isLoading: boolean;
}

export const ReportsOverTimeChart: React.FC<ReportsOverTimeChartProps> = ({
  data = [],
  isLoading,
}) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-44" />
            </div>
            <Skeleton className="h-4 w-4 rounded" />
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-6">
          <Skeleton className="h-40 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.count), 1);

  return (
    <Card>
      {/* Header */}
      <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
              <TrendingUp className="h-4 w-4" />
            </div>
            <CardTitle className="text-sm font-semibold text-foreground">
              Reports Generated Over Time
            </CardTitle>
          </div>
          <Calendar className="h-4 w-4 text-muted-foreground/60 shrink-0" />
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5 pt-6">
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-12">
            No report history recorded over time.
          </p>
        ) : (
          <div className="flex items-end justify-around gap-1.5 h-40 border-b border-border/30 px-1">
            {data.map((item, idx) => {
              const heightPct = Math.max(10, Math.round((item.count / maxVal) * 100));

              return (
                <div key={idx} className="flex flex-col items-center gap-1 flex-1 group/bar">
                  {/* Count label — appears above bar */}
                  <span className="text-[10px] font-semibold font-mono tabular-nums text-muted-foreground/60 group-hover/bar:text-indigo-500 transition-colors duration-150">
                    {item.count}
                  </span>
                  {/* Bar */}
                  <div
                    className="w-full max-w-[22px] rounded-t-[3px] bg-indigo-500/70 group-hover/bar:bg-indigo-500 dark:bg-indigo-500/60 dark:group-hover/bar:bg-indigo-400 transition-all duration-300 ease-out"
                    style={{ height: `${heightPct}%` }}
                  />
                  {/* X-axis label */}
                  <span className="text-[9px] text-muted-foreground/60 truncate w-full text-center mt-1.5 leading-none">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ReportsOverTimeChart;
