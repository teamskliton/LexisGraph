"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { History, ExternalLink, ArrowRight } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/compliance/shared/StatusBadge";
import type { ComplianceReport, ComplianceJob } from "@/services/api/compliance";

interface AnalysisHistoryPreviewProps {
  reports: ComplianceReport[];
  jobs: ComplianceJob[];
  isLoading: boolean;
}

export const AnalysisHistoryPreview: React.FC<AnalysisHistoryPreviewProps> = ({
  reports,
  jobs,
  isLoading,
}) => {
  const router = useRouter();

  if (isLoading) {
    return (
      <Card className="border border-border/60 p-5 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </Card>
    );
  }

  // Show top 5 most recent reports
  const combinedHistory = reports.slice(0, 5);

  return (
    <Card className="border border-border/60 bg-card/60 shadow-xs p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-indigo-500" aria-hidden="true" />
            Analysis History Preview
          </CardTitle>

          <CardDescription className="text-xs">
            Showing the 5 most recent compliance analysis runs.
          </CardDescription>
        </div>

        <Button
          variant="outline"
          size="xs"
          onClick={() => router.push("/compliance/history")}
          className="text-xs gap-1 cursor-pointer text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
          aria-label="View all analysis history"
        >
          View All <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Button>
      </div>

      {combinedHistory.length === 0 ? (
        <div
          className="p-8 border border-dashed border-border/60 bg-muted/10 text-center rounded-xl space-y-2"
          role="status"
          aria-live="polite"
        >
          <History className="h-8 w-8 text-muted-foreground mx-auto" aria-hidden="true" />
          <p className="text-xs font-semibold text-foreground">No historical analysis records</p>
          <p className="text-[11px] text-muted-foreground">
            Previous analysis logs will be displayed here once executed.
          </p>
        </div>
      ) : (
        <div className="space-y-2" role="list" aria-label="Recent analyses">
          {combinedHistory.map((rep) => {
            const score = rep.overall_score ?? null;
            const scoreColor =
              score != null && score >= 85
                ? "text-emerald-500"
                : score != null && score >= 70
                ? "text-amber-500"
                : score != null
                ? "text-rose-500"
                : "text-muted-foreground";

            return (
              <div
                key={rep.id}
                role="listitem"
                className="p-3.5 rounded-lg border border-border/40 bg-card hover:bg-muted/30 transition-all flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-center px-2 py-1 rounded bg-muted/50 border border-border/40 shrink-0">
                    <span
                      className={`text-xs font-bold tabular-nums block leading-none ${scoreColor}`}
                      aria-label={`Compliance score: ${score != null ? `${score}%` : "Not available"}`}
                    >
                      {score != null ? `${score}%` : "N/A"}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground block mt-0.5">
                      Score
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      Compliance Audit #{rep.id.substring(0, 8)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(rep.created_at), "MMM d, yyyy · HH:mm")} • Risk:{" "}
                      {rep.risk_level || "Low"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={rep.status} size="xs" />

                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => router.push(`/compliance/reports/${rep.id}`)}
                    className="text-xs gap-1 cursor-pointer"
                    aria-label={`View report for audit ${rep.id.substring(0, 8)}`}
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" /> View
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
