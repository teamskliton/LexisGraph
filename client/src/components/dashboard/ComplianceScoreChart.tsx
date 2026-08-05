"use client";

import React from "react";
import { ScoreDistribution } from "@/types/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Zap } from "lucide-react";
import { useRouter } from "next/navigation";

interface ComplianceScoreChartProps {
  data?: ScoreDistribution;
  isLoading: boolean;
}

export const ComplianceScoreChart: React.FC<ComplianceScoreChartProps> = ({
  data,
  isLoading,
}) => {
  const router = useRouter();

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
      label: "Excellent",
      range: "90–100%",
      count: data.excellent,
      barColor: "bg-emerald-500",
      textColor: "text-emerald-700 dark:text-emerald-400",
      trackColor: "bg-emerald-500/10",
    },
    {
      label: "Good",
      range: "80–89%",
      count: data.good,
      barColor: "bg-blue-500",
      textColor: "text-blue-700 dark:text-blue-400",
      trackColor: "bg-blue-500/10",
    },
    {
      label: "Needs Review",
      range: "60–79%",
      count: data.needs_review,
      barColor: "bg-amber-500",
      textColor: "text-amber-700 dark:text-amber-400",
      trackColor: "bg-amber-500/10",
    },
    {
      label: "High Risk",
      range: "<60%",
      count: data.high_risk,
      barColor: "bg-rose-500",
      textColor: "text-rose-700 dark:text-rose-400",
      trackColor: "bg-rose-500/10",
    },
  ];

  const total = items.reduce((acc, i) => acc + i.count, 0);
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

      <CardContent className="px-5 py-5">
        {total === 0 ? (
          /* Professional empty state */
          <div className="flex flex-col items-center text-center py-8 px-4 gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <BarChart3 className="h-5 w-5 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                No Distribution Data Yet
              </p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-[220px] mx-auto">
                More compliance reports are needed before score distribution
                trends can be visualized.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs mt-1"
              onClick={() => router.push("/compliance")}
            >
              <Zap className="h-3.5 w-3.5" />
              Run First Analysis
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item, idx) => {
              const percentage =
                total > 0 ? Math.round((item.count / total) * 100) : 0;
              const barWidth = Math.round((item.count / maxCount) * 100);

              return (
                <div key={idx} className="space-y-1.5">
                  {/* Label row */}
                  <div className="flex items-baseline justify-between text-xs">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-medium text-foreground/80">
                        {item.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">
                        {item.range}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span
                        className={`font-bold font-mono tabular-nums ${item.textColor}`}
                      >
                        {item.count}
                      </span>
                      <span className="text-muted-foreground text-[10px]">
                        ({percentage}%)
                      </span>
                    </div>
                  </div>
                  {/* Progress track */}
                  <div
                    className={`h-2 w-full rounded-full overflow-hidden ${item.trackColor}`}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${item.barColor}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {/* Summary line */}
            <div className="pt-2 mt-1 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{total} reports analyzed</span>
              <span>
                {Math.round(
                  ((data.excellent + data.good) / total) * 100
                )}
                % scoring 80%+
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ComplianceScoreChart;
