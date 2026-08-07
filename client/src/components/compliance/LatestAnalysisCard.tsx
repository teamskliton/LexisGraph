"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Zap, ExternalLink, ArrowRight } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RiskBadge } from "@/components/compliance/shared/RiskBadge";
import { StatusBadge } from "@/components/compliance/shared/StatusBadge";
import type { ComplianceReport, ComplianceJob } from "@/services/api/compliance";

interface LatestAnalysisCardProps {
  latestReport: ComplianceReport | null;
  latestJob: ComplianceJob | null;
  isLoading: boolean;
  onRunAnalysis: () => void;
}

export const LatestAnalysisCard: React.FC<LatestAnalysisCardProps> = ({
  latestReport,
  latestJob,
  isLoading,
  onRunAnalysis,
}) => {
  const router = useRouter();

  if (isLoading) {
    return (
      <Card className="border border-border/60 p-5 space-y-3" aria-busy="true" aria-label="Loading latest analysis">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-60" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </Card>
    );
  }

  const hasAnalysis = latestReport || latestJob;

  const analysisName = latestReport
    ? `Statutory Compliance Audit — Report #${latestReport.id.slice(0, 8)}`
    : latestJob
    ? `Compliance Scan Run — Job #${latestJob.job_id.slice(0, 8)}`
    : "No Analyses Found";

  const dateStr = latestReport?.created_at
    ? format(new Date(latestReport.created_at), "MMM d, yyyy · HH:mm")
    : latestJob?.created_at
    ? format(new Date(latestJob.created_at), "MMM d, yyyy · HH:mm")
    : "N/A";

  const score = latestReport?.overall_score ?? null;
  const riskLevel = latestReport?.risk_level ?? null;
  const status = latestReport?.status || latestJob?.status || "COMPLETED";

  return (
    <Card className="border border-border/60 bg-card/60 shadow-xs p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />
            Latest Compliance Analysis
          </CardTitle>
          <CardDescription className="text-xs">
            Summary of the most recently executed AI compliance analysis run.
          </CardDescription>
        </div>

        {hasAnalysis && (
          <Button
            variant="outline"
            size="xs"
            onClick={onRunAnalysis}
            className="text-xs gap-1 cursor-pointer"
            aria-label="Run a new compliance analysis"
          >
            Run New Analysis <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Button>
        )}
      </div>

      {hasAnalysis ? (
        <div className="p-4 rounded-xl border border-border/40 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-foreground truncate">{analysisName}</h4>
              <StatusBadge status={status} size="xs" />
              <RiskBadge riskLevel={riskLevel} score={score} size="xs" />
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span>
                Date: <strong className="text-foreground font-semibold">{dateStr}</strong>
              </span>
              <span>
                Score:{" "}
                <strong className="text-indigo-600 dark:text-indigo-400 font-bold">
                  {score != null ? `${score}%` : "Pending"}
                </strong>
              </span>
            </div>
          </div>

          <Button
            size="sm"
            onClick={() => {
              if (latestReport) {
                router.push(`/compliance/reports/${latestReport.id}`);
              } else if (latestJob) {
                router.push(`/compliance/progress/${latestJob.job_id}`);
              }
            }}
            className="gap-1.5 text-xs font-semibold cursor-pointer shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white"
            aria-label={latestReport ? `Open analysis report ${latestReport.id.slice(0, 8)}` : "Open analysis job"}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open Analysis
          </Button>
        </div>
      ) : (
        /* Friendly Empty State */
        <div
          className="p-8 rounded-xl border border-dashed border-border/60 bg-muted/10 text-center space-y-3"
          role="status"
          aria-live="polite"
        >
          <div className="h-12 w-12 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto">
            <Zap className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">No analyses performed yet</h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
              Start your first AI compliance audit to scan internal policies against POSH, DPDP, and
              Companies Act mandates.
            </p>
          </div>
          <Button
            onClick={onRunAnalysis}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5 cursor-pointer mt-2"
            aria-label="Run your first compliance analysis"
          >
            <Zap className="h-4 w-4 text-amber-300" aria-hidden="true" /> Run First Analysis
          </Button>
        </div>
      )}
    </Card>
  );
};
