"use client";

import React from "react";
import { RiskBreakdown } from "@/types/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
      <Card>
        <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-36" />
          </div>
        </CardHeader>
        <CardContent className="py-5 px-5 space-y-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = data.low + data.medium + data.high + data.critical;
  const pct = (n: number) =>
    total > 0 ? Math.round((n / total) * 100) : 0;

  const hasCritical = data.critical > 0;

  return (
    <Card>
      {/* Header */}
      <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <CardTitle className="text-sm font-semibold text-foreground">
              Risk Level Breakdown
            </CardTitle>
          </div>
          {/* Total pill */}
          {total > 0 && (
            <span className="text-[10px] font-semibold text-muted-foreground">
              {total} total
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="py-4 px-5 space-y-3">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <ShieldCheck className="h-5 w-5 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                No risk data yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1 max-w-[200px] mx-auto">
                Risk levels are computed as compliance reports are generated.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Critical risk ── prominent full-width card */}
            {hasCritical ? (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10 px-4 py-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AlertOctagon className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">
                      Critical Risk
                    </span>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-400">
                    {pct(data.critical)}% of portfolio
                  </span>
                </div>
                <div className="text-3xl font-bold tabular-nums tracking-tight text-rose-700 dark:text-rose-400 leading-none mb-1.5">
                  {data.critical}
                </div>
                <p className="text-[11px] text-rose-600/80 dark:text-rose-500 leading-relaxed">
                  {data.critical === 1
                    ? "1 organization requires immediate compliance action."
                    : `${data.critical} organizations require immediate compliance action.`}
                </p>
              </div>
            ) : (
              /* Critical = 0 — positive state */
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10 px-4 py-3 flex items-center gap-3">
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    No critical risks detected
                  </p>
                  <p className="text-[10px] text-emerald-600/80 dark:text-emerald-500 mt-0.5">
                    Your portfolio has zero critical-level compliance issues.
                  </p>
                </div>
              </div>
            )}

            {/* ── Low / Medium / High — 3 compact cards */}
            <div className="grid grid-cols-3 gap-2">
              {/* Low */}
              <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-3 space-y-1.5 transition-all duration-150 hover:bg-muted/40">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-[10px] font-medium text-muted-foreground">
                    Low
                  </span>
                </div>
                <div className="text-xl font-bold tabular-nums tracking-tight text-emerald-700 dark:text-emerald-400 leading-none">
                  {data.low}
                </div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  {pct(data.low)}%
                </div>
              </div>

              {/* Medium */}
              <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-3 space-y-1.5 transition-all duration-150 hover:bg-muted/40">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-[10px] font-medium text-muted-foreground">
                    Medium
                  </span>
                </div>
                <div className="text-xl font-bold tabular-nums tracking-tight text-amber-700 dark:text-amber-400 leading-none">
                  {data.medium}
                </div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  {pct(data.medium)}%
                </div>
              </div>

              {/* High */}
              <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-3 space-y-1.5 transition-all duration-150 hover:bg-muted/40">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="h-3 w-3 text-orange-600 dark:text-orange-400 shrink-0" />
                  <span className="text-[10px] font-medium text-muted-foreground">
                    High
                  </span>
                </div>
                <div className="text-xl font-bold tabular-nums tracking-tight text-orange-700 dark:text-orange-400 leading-none">
                  {data.high}
                </div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  {pct(data.high)}%
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default RiskBreakdownChart;
