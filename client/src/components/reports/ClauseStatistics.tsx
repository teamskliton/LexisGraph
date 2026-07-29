"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  FileCode,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from "lucide-react";

interface ClauseStatisticsProps {
  totalClauses: number | null | undefined;
  compliantClauses: number | null | undefined;
  partialClauses: number | null | undefined;
  nonCompliantClauses: number | null | undefined;
}

export const ClauseStatistics: React.FC<ClauseStatisticsProps> = ({
  totalClauses = 0,
  compliantClauses = 0,
  partialClauses = 0,
  nonCompliantClauses = 0,
}) => {
  const total = totalClauses || 0;
  const compliant = compliantClauses || 0;
  const partial = partialClauses || 0;
  const nonCompliant = nonCompliantClauses || 0;

  const compliantPct = total > 0 ? Math.round((compliant / total) * 100) : 0;
  const partialPct = total > 0 ? Math.round((partial / total) * 100) : 0;
  const nonCompliantPct = total > 0 ? Math.round((nonCompliant / total) * 100) : 0;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
        <FileCode className="h-4 w-4 text-primary" />
        <span>Clause Evaluation Statistics</span>
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Clauses */}
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total Evaluated
              </span>
              <FileCode className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-extrabold font-mono text-foreground">
                {total}
              </span>
              <span className="text-xs text-muted-foreground">100%</span>
            </div>
            <Progress value={100} className="h-1.5" indicatorClassName="bg-indigo-500" />
          </CardContent>
        </Card>

        {/* Compliant Clauses */}
        <Card className="border-border/60 shadow-sm border-l-4 border-l-emerald-500">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                Compliant
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                {compliant}
              </span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {compliantPct}%
              </span>
            </div>
            <Progress value={compliantPct} className="h-1.5" indicatorClassName="bg-emerald-500" />
          </CardContent>
        </Card>

        {/* Partially Compliant */}
        <Card className="border-border/60 shadow-sm border-l-4 border-l-amber-500">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                Partially Compliant
              </span>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-extrabold font-mono text-amber-600 dark:text-amber-400">
                {partial}
              </span>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {partialPct}%
              </span>
            </div>
            <Progress value={partialPct} className="h-1.5" indicatorClassName="bg-amber-500" />
          </CardContent>
        </Card>

        {/* Non-Compliant */}
        <Card className="border-border/60 shadow-sm border-l-4 border-l-rose-500">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                Non-Compliant
              </span>
              <XCircle className="h-4 w-4 text-rose-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-extrabold font-mono text-rose-600 dark:text-rose-400">
                {nonCompliant}
              </span>
              <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                {nonCompliantPct}%
              </span>
            </div>
            <Progress value={nonCompliantPct} className="h-1.5" indicatorClassName="bg-rose-500" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ClauseStatistics;
