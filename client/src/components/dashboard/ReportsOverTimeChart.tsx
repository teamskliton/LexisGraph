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

  const maxVal = Math.max(...data.map((d) => d.count), 1);

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <TrendingUp className="h-4 w-4" />
            </div>
            <CardTitle className="text-base font-bold text-foreground">
              Reports Generated Over Time
            </CardTitle>
          </div>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No report history recorded over time.
          </p>
        ) : (
          <div className="flex items-end justify-around gap-2 h-36 pt-4 border-b border-border/40 px-2">
            {data.map((item, idx) => {
              const heightPct = Math.max(12, Math.round((item.count / maxVal) * 100));

              return (
                <div key={idx} className="flex flex-col items-center gap-1 flex-1 group">
                  <span className="text-[10px] font-bold font-mono text-muted-foreground group-hover:text-primary transition-colors">
                    {item.count}
                  </span>
                  <div
                    className="w-full max-w-[28px] bg-indigo-500/80 group-hover:bg-indigo-600 dark:bg-indigo-600 dark:group-hover:bg-indigo-500 rounded-t-md transition-all duration-500"
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground truncate w-full text-center mt-1">
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
