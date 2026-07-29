"use client";

import React from "react";
import { TopOrganizationItem } from "@/types/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Award, FileCheck } from "lucide-react";

interface TopOrganizationsChartProps {
  data?: TopOrganizationItem[];
  isLoading: boolean;
}

export const TopOrganizationsChart: React.FC<TopOrganizationsChartProps> = ({
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

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Building2 className="h-4 w-4" />
            </div>
            <CardTitle className="text-base font-bold text-foreground">
              Top Organizations by Compliance
            </CardTitle>
          </div>
          <Award className="h-4 w-4 text-amber-500" />
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No organization compliance data recorded.
          </p>
        ) : (
          <div className="space-y-3">
            {data.map((org, index) => {
              const scoreVal = Math.round(org.avg_score);
              const badgeColor =
                scoreVal >= 85
                  ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400"
                  : scoreVal >= 70
                  ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-400"
                  : "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-400";

              return (
                <div
                  key={org.id || index}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                      #{index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate" title={org.name}>
                        {org.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <FileCheck className="h-3 w-3" />
                        {org.report_count} {org.report_count === 1 ? "report" : "reports"}
                      </p>
                    </div>
                  </div>

                  <span className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-bold font-mono ${badgeColor}`}>
                    {scoreVal}%
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

export default TopOrganizationsChart;
