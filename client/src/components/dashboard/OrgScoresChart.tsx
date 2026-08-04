"use client";

import React from "react";
import { OrgScoreAnalyticsItem } from "@/types/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Award, FileCheck, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrgScoresChartProps {
  data?: OrgScoreAnalyticsItem[];
  isLoading: boolean;
  onAddOrg?: () => void;
}

export const OrgScoresChart: React.FC<OrgScoresChartProps> = ({
  data = [],
  isLoading,
  onAddOrg,
}) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-52" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="py-5 px-5 space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {/* Header */}
      <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Building2 className="h-4 w-4" />
            </div>
            <CardTitle className="text-sm font-semibold text-foreground">
              Avg. Score Per Organization
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onAddOrg && (
              <Button
                variant="outline"
                size="sm"
                onClick={onAddOrg}
                className="h-7 px-2.5 text-[11px] gap-1 cursor-pointer border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
              >
                <Plus className="h-3 w-3" />
                <span>Add Org</span>
              </Button>
            )}
            <Award className="h-4 w-4 text-amber-500 shrink-0" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="py-5 px-5">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-3 text-center">
            <p className="text-xs text-muted-foreground">
              No organization compliance metrics recorded yet.
            </p>
            {onAddOrg && (
              <Button
                variant="outline"
                size="sm"
                onClick={onAddOrg}
                className="gap-1.5 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/50 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Organization</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {data.map((org, index) => {
              const scoreVal = Math.round(org.avg_score);
              const badgeColor =
                scoreVal >= 85
                  ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400"
                  : scoreVal >= 70
                  ? "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400"
                  : "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-400";

              return (
                <div
                  key={org.id || index}
                  className={cn(
                    "flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5",
                    "transition-all duration-150 hover:bg-muted/40 hover:border-border"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Rank badge */}
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/8 text-primary font-bold text-[10px] tabular-nums">
                      #{index + 1}
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-sm font-medium text-foreground truncate"
                        title={org.name}
                      >
                        {org.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <FileCheck className="h-3 w-3 shrink-0" />
                        {org.report_count} {org.report_count === 1 ? "report" : "reports"}
                      </p>
                    </div>
                  </div>

                  {/* Score badge */}
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold font-mono tabular-nums shrink-0",
                      badgeColor
                    )}
                  >
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

export default OrgScoresChart;
