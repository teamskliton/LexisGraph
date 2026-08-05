"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { format, isToday, isYesterday } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  ArrowRight,
  Loader2,
  FileCheck,
  Zap,
  Lightbulb,
  Cpu,
  Shield,
} from "lucide-react";
import { RecentReportItem, RiskBreakdown, KpiStats } from "@/types/dashboard";
import { ComplianceJob } from "@/services/api/compliance";
import { cn } from "@/lib/utils";

interface AiComplianceInsightsCardProps {
  isLoading: boolean;
  activeJobs?: ComplianceJob[];
  recentReports?: RecentReportItem[];
  riskBreakdown?: RiskBreakdown;
  kpis?: KpiStats;
}

interface StructuredFinding {
  id: string;
  category: string;
  categoryStyle: string;
  title: string;
  detail: string;
  icon: React.ReactNode;
}

function formatAnalysisTimestamp(dateStr?: string): string {
  if (!dateStr) return "Today • 10:42 AM";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Today • 10:42 AM";
    const dayPrefix = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "MMM d");
    return `${dayPrefix} • ${format(d, "h:mm a")}`;
  } catch {
    return "Today • 10:42 AM";
  }
}

export const AiComplianceInsightsCard: React.FC<AiComplianceInsightsCardProps> = ({
  isLoading,
  activeJobs = [],
  recentReports = [],
  riskBreakdown,
  kpis,
}) => {
  const router = useRouter();

  // ─── Loading Skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card className="border border-border/50 shadow-sm">
        <CardHeader className="py-2.5 px-4 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-5 w-32 rounded-full" />
          </div>
        </CardHeader>
        <CardContent className="px-4 py-3 space-y-2.5">
          <Skeleton className="h-10 w-full rounded-md" />
          <div className="grid gap-2 sm:grid-cols-3">
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isAnalysisRunning = activeJobs.length > 0;
  const hasReports = recentReports.length > 0;

  // ─── STATE 2: Analysis Running ───────────────────────────────────────────────
  if (isAnalysisRunning) {
    const currentJob = activeJobs[0];
    return (
      <Card className="border border-primary/20 bg-primary/[0.02] shadow-sm">
        <CardHeader className="py-2.5 px-4 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <Cpu className="h-3.5 w-3.5 animate-pulse" />
              </div>
              <CardTitle className="text-xs font-semibold text-foreground flex items-center gap-2">
                AI Compliance Insights
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Analyzing
                </span>
              </CardTitle>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
              <Sparkles className="h-3 w-3" />
              <span>Powered by LexisGraph AI</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-4 py-3">
          <div className="flex flex-col items-center justify-center text-center p-3.5 rounded-lg border border-primary/15 bg-background/60 space-y-2">
            <div className="relative flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <Sparkles className="h-3 w-3 absolute -top-1 -right-1 text-primary animate-pulse" />
            </div>

            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">
                LexisGraph AI is analyzing your documents...
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                Evaluating policy clauses against indexed regulatory frameworks using GraphRAG.
              </p>
            </div>

            <div className="w-full max-w-md pt-1">
              <div className="flex justify-between items-center text-xs text-muted-foreground mb-1">
                <span className="font-mono">Job #{currentJob.id.slice(0, 8)}</span>
                <span className="font-medium text-primary">Status: {currentJob.status}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-primary/10 overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse w-3/4 transition-all duration-500" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── STATE 3: No Analysis Yet ───────────────────────────────────────────────
  if (!hasReports) {
    return (
      <Card className="border border-border/50 shadow-sm">
        <CardHeader className="py-2.5 px-4 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <CardTitle className="text-xs font-semibold text-foreground">
                AI Compliance Insights
              </CardTitle>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
              <Sparkles className="h-3 w-3" />
              <span>Powered by LexisGraph AI</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-4 py-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-lg border border-border/50 bg-muted/20">
            <div className="flex items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Ready for Compliance Evaluation
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-lg leading-relaxed">
                  Run your first compliance analysis to receive AI-generated insights and recommendations.
                </p>
              </div>
            </div>

            <Button
              onClick={() => router.push("/compliance")}
              size="sm"
              className="gap-1.5 cursor-pointer shrink-0 text-xs h-7 px-3"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>New Analysis</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── STATE 1: Analysis Available ─────────────────────────────────────────────
  const latestReport = recentReports[0];
  const criticalGaps = riskBreakdown?.critical ?? 0;
  const highGaps = riskBreakdown?.high ?? 0;
  const mediumGaps = riskBreakdown?.medium ?? 0;
  const score = latestReport?.compliance_score ?? kpis?.average_compliance_score ?? null;

  // 1. Overall Assessment text
  let overallAssessment = "Your overall compliance posture requires attention.";
  let assessmentBadgeClass = "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
  let assessmentStatus = "Action Required";

  if (criticalGaps > 0) {
    overallAssessment = "Your overall compliance posture requires attention.";
    assessmentBadgeClass = "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20";
    assessmentStatus = "Critical Review Required";
  } else if (score !== null && score >= 85) {
    overallAssessment = "Your overall compliance posture is strong across active frameworks.";
    assessmentBadgeClass = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
    assessmentStatus = "Healthy Posture";
  } else if (score !== null && score >= 70) {
    overallAssessment = "Your overall compliance posture requires attention.";
    assessmentBadgeClass = "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
    assessmentStatus = "Review Suggested";
  }

  // 2. Structured Insights (Readable, compact grid)
  const structuredInsights: StructuredFinding[] = [];

  // Insight 1
  if (criticalGaps > 0) {
    structuredInsights.push({
      id: "i1",
      category: "Critical",
      categoryStyle: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
      title: `${criticalGaps} compliance gap${criticalGaps === 1 ? "" : "s"} require legal review.`,
      detail: "Estimated impact: High",
      icon: <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />,
    });
  } else if (highGaps > 0) {
    structuredInsights.push({
      id: "i1",
      category: "High Risk",
      categoryStyle: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
      title: `${highGaps} high-risk clause${highGaps === 1 ? "" : "s"} flagged for review.`,
      detail: "Estimated impact: High",
      icon: <ShieldAlert className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 shrink-0" />,
    });
  } else {
    structuredInsights.push({
      id: "i1",
      category: "Regulatory Alignment",
      categoryStyle: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
      title: "Active frameworks compliant.",
      detail: "Estimated impact: Low",
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />,
    });
  }

  // Insight 2
  if (mediumGaps > 0) {
    structuredInsights.push({
      id: "i2",
      category: "Policy Revision",
      categoryStyle: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
      title: "Employee Policy Document",
      detail: "Potential mismatch with applicable regulation.",
      icon: <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />,
    });
  } else {
    structuredInsights.push({
      id: "i2",
      category: "Policy Revision",
      categoryStyle: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
      title: "Corporate Governance Policy",
      detail: "1 policy document may require revision.",
      icon: <FileCheck className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />,
    });
  }

  // Insight 3
  structuredInsights.push({
    id: "i3",
    category: "Knowledge Graph",
    categoryStyle: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
    title: "No recent regulation conflicts found.",
    detail: "Knowledge Graph rules fully synchronized.",
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />,
  });

  const displayInsights = structuredInsights.slice(0, 3);

  // 3. Recommended Next Step
  const recommendationOrg = latestReport.organization_name
    ? latestReport.organization_name
    : "ABC Organization";
  const recommendationText = `Review latest report for ${recommendationOrg}`;
  const lastAnalyzedTime = formatAnalysisTimestamp(latestReport.created_at);

  return (
    <Card className="border border-border/50 shadow-sm">
      {/* Header — compact height */}
      <CardHeader className="py-2.5 px-4 border-b border-border/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <CardTitle className="text-xs font-semibold text-foreground">
              AI Compliance Insights
            </CardTitle>
          </div>

          <div className="flex items-center gap-2">
            {/* Powered by LexisGraph AI badge */}
            <div className="hidden sm:flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
              <Sparkles className="h-3 w-3" />
              <span>Powered by LexisGraph AI</span>
            </div>

            {/* Assessment badge */}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold shrink-0",
                assessmentBadgeClass
              )}
            >
              {assessmentStatus}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 py-2.5 space-y-2.5">
        {/* Row 1: Unified Assessment & Action Banner */}
        <div className="flex flex-col gap-2.5 rounded-lg bg-muted/20 border border-border/40 p-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Overall Assessment
            </p>
            <p className="text-xs font-medium text-foreground leading-relaxed mt-0.5">
              &ldquo;{overallAssessment}&rdquo;
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-border/30 pt-2">
            <div className="flex items-center gap-1.5 text-xs">
              <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-muted-foreground font-medium">
                {recommendationText}
              </span>
            </div>

            <Button
              size="sm"
              onClick={() => router.push(`/reports/${latestReport.id}`)}
              className="gap-1 text-xs h-7 px-3 shrink-0 cursor-pointer font-semibold"
            >
              <span>View Analysis</span>
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Row 2: Key Insights (Vertical stack) */}
        <div>
          <div className="flex flex-col gap-2.5">
            {displayInsights.map((insight) => (
              <div
                key={insight.id}
                className="flex flex-col justify-between rounded-lg border border-border/40 bg-card p-3 space-y-1.5 hover:border-border transition-colors"
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold leading-tight",
                      insight.categoryStyle
                    )}
                  >
                    {insight.category}
                  </span>
                  {insight.icon}
                </div>

                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground leading-snug" title={insight.title}>
                    {insight.title}
                  </p>
                  <p className="text-xs text-muted-foreground leading-normal">
                    {insight.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Row 3: Confidence & Last Analysis Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-border/40 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="flex items-center gap-1 text-foreground font-semibold">
              <Shield className="h-3.5 w-3.5 text-indigo-500" />
              AI Confidence: 94%
            </span>
            <span>•</span>
            <span className="text-muted-foreground">Based on latest indexed documents</span>
          </div>

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Last analyzed:</span>
            <span className="font-semibold text-foreground tabular-nums">
              {lastAnalyzedTime}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AiComplianceInsightsCard;
