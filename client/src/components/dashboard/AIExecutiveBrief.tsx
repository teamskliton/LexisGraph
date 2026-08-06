"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, isToday, isYesterday } from "date-fns";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  ShieldAlert,
  AlertCircle,
  Info,
  CheckCircle2,
  ArrowRight,
  Shield,
  Loader2,
  Zap,
} from "lucide-react";
import {
  RecentReportItem,
  RiskBreakdown,
  KpiStats,
  ExecutiveRecommendation,
  RecommendationPriority,
} from "@/types/dashboard";
import { ComplianceJob } from "@/services/api/compliance";
import { cn } from "@/lib/utils";

export interface AIExecutiveBriefProps {
  isLoading?: boolean;
  activeJobs?: ComplianceJob[];
  recentReports?: RecentReportItem[];
  riskBreakdown?: RiskBreakdown;
  kpis?: KpiStats;
  recommendations?: ExecutiveRecommendation[];
  summary?: string;
  overallConfidence?: number;
  lastAnalyzedAt?: string;
  onViewFullAnalysis?: () => void;
  onRecommendationAction?: (recommendation: ExecutiveRecommendation) => void;
  className?: string;
}

// ─── DEFAULT RECOMMENDATIONS (Fallback if not provided in props) ──────────────

const DEFAULT_RECOMMENDATIONS: ExecutiveRecommendation[] = [
  {
    id: "rec-1",
    priority: "Critical",
    type: "Policy Update",
    title: "Update POSH Policy",
    explanation:
      "POSH policy lacks updated remote work compliance guidelines required by recent mandates.",
    actionLabel: "Open Policy",
    confidence: 98,
    affectedOrganization: "Acme Corp",
    regulation: "POSH Act 2013",
  },
  {
    id: "rec-2",
    priority: "High",
    type: "Critical Compliance Gap",
    title: "2 compliance gaps require legal review",
    explanation:
      "Discrepancies detected between internal handling procedures and statutory compliance standards.",
    actionLabel: "Review Report",
    confidence: 94,
    affectedOrganization: "Global Tech Inc.",
  },
  {
    id: "rec-3",
    priority: "Medium",
    type: "New Regulation",
    title: "DPDP amendment detected",
    explanation:
      "Statutory amendments released regarding data fiduciary obligations and consent manager workflows.",
    actionLabel: "View Regulation",
    confidence: 92,
    regulation: "DPDP Act 2023",
  },
];

// ─── HELPER UTILS ─────────────────────────────────────────────────────────────

function getPriorityBadgeClass(priority: RecommendationPriority): string {
  switch (priority) {
    case "Critical":
      return "bg-danger/10 text-danger border-danger/25 dark:bg-danger/20 font-semibold";
    case "High":
      return "bg-warning/10 text-warning-foreground dark:text-warning border-warning/25 dark:bg-warning/20 font-semibold";
    case "Medium":
      return "bg-info/10 text-info dark:text-info border-info/25 dark:bg-info/20 font-medium";
    case "Low":
      return "bg-muted text-muted-foreground border-border font-medium";
    default:
      return "bg-muted text-muted-foreground border-border font-medium";
  }
}

function getPriorityIcon(priority: RecommendationPriority) {
  switch (priority) {
    case "Critical":
      return <ShieldAlert className="h-3 w-3 text-danger shrink-0" />;
    case "High":
      return <AlertCircle className="h-3 w-3 text-warning shrink-0" />;
    case "Medium":
      return <Info className="h-3 w-3 text-info shrink-0" />;
    case "Low":
      return <CheckCircle2 className="h-3 w-3 text-muted-foreground shrink-0" />;
  }
}

function formatAnalysisTimestamp(dateStr?: string): string {
  if (!dateStr) return "Today • 10:42 AM";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Today • 10:42 AM";
    const dayPrefix = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "MMM d, yyyy");
    return `${dayPrefix} ${format(d, "h:mm a")}`;
  } catch {
    return "Today • 10:42 AM";
  }
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export const AIExecutiveBrief: React.FC<AIExecutiveBriefProps> = ({
  isLoading = false,
  activeJobs = [],
  recentReports = [],
  riskBreakdown,
  kpis,
  recommendations,
  overallConfidence = 94,
  lastAnalyzedAt,
  onViewFullAnalysis,
  onRecommendationAction,
  className,
}) => {
  const router = useRouter();

  // Sort and pick top 3 priority actions
  const priorityOrder: Record<RecommendationPriority, number> = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Low: 3,
  };

  const topActions = useMemo(() => {
    const source = recommendations || DEFAULT_RECOMMENDATIONS;
    return [...source]
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, 3);
  }, [recommendations]);

  // Derived Portfolio Status (Section 1)
  const portfolioStatus = useMemo(() => {
    const criticalGaps = riskBreakdown?.critical ?? 0;
    const highGaps = riskBreakdown?.high ?? 0;
    const score = recentReports[0]?.compliance_score ?? kpis?.average_compliance_score ?? null;

    if (criticalGaps > 0) {
      return {
        label: "Critical" as const,
        badgeClass: "bg-danger/10 text-danger border-danger/25 font-semibold",
        summary: "Portfolio compliance is below acceptable thresholds due to unresolved policy gaps.",
      };
    }
    if (highGaps > 0 || (score !== null && score < 70)) {
      return {
        label: "At Risk" as const,
        badgeClass: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/25 font-semibold",
        summary: "Multiple high-risk policy discrepancies require legal team review.",
      };
    }
    if (score !== null && score < 85) {
      return {
        label: "Needs Review" as const,
        badgeClass: "bg-warning/10 text-warning-foreground dark:text-warning border-warning/25 font-semibold",
        summary: "Minor compliance gaps detected across active operational procedures.",
      };
    }
    return {
      label: "Healthy" as const,
      badgeClass: "bg-success/10 text-success border-success/25 font-semibold",
      summary: "Your overall compliance posture is strong across active regulatory frameworks.",
    };
  }, [riskBreakdown, kpis, recentReports]);

  const timestampDisplay = useMemo(() => {
    if (lastAnalyzedAt) return formatAnalysisTimestamp(lastAnalyzedAt);
    if (recentReports.length > 0 && recentReports[0].created_at) {
      return formatAnalysisTimestamp(recentReports[0].created_at);
    }
    return "30 Jul 2026 12:22 AM";
  }, [lastAnalyzedAt, recentReports]);

  // ── 1. LOADING SKELETON ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card className={cn("border border-border bg-card shadow-sm", className)}>
        <CardHeader className="py-2.5 px-4 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <Skeleton className="h-5 w-36 rounded-full" />
          </div>
        </CardHeader>
        <CardContent className="px-4 py-3 space-y-3">
          <Skeleton className="h-12 w-full rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── 2. ANALYSIS RUNNING STATE ───────────────────────────────────────────────
  const isAnalysisRunning = activeJobs.length > 0;
  if (isAnalysisRunning) {
    const currentJob = activeJobs[0];
    return (
      <Card className={cn("border border-primary/20 bg-card shadow-sm", className)}>
        <CardHeader className="py-2.5 px-4 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              </div>
              <div>
                <CardTitle className="text-xs font-semibold text-foreground tracking-tight">
                  AI Executive Brief
                </CardTitle>
                <CardDescription className="text-[11px] text-muted-foreground">
                  Evaluating policy clauses against indexed regulatory frameworks...
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] px-2 py-0.5 shrink-0 font-medium">
              Powered by LexisGraph AI
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex flex-col items-center justify-center text-center p-3 rounded-lg border border-primary/15 bg-muted/20 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
              <span>Analyzing Documents (Job #{currentJob.id.slice(0, 8)})</span>
            </div>
            <div className="w-full max-w-sm h-1.5 rounded-full bg-primary/10 overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-pulse w-3/4" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── 3. EMPTY STATE ──────────────────────────────────────────────────────────
  const hasNoReports = recentReports.length === 0 && (!recommendations || recommendations.length === 0);
  if (hasNoReports) {
    return (
      <Card className={cn("border border-border bg-card shadow-sm", className)}>
        <CardHeader className="py-2.5 px-4 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div>
                <CardTitle className="text-xs font-semibold text-foreground tracking-tight">
                  AI Executive Brief
                </CardTitle>
                <CardDescription className="text-[11px] text-muted-foreground">
                  AI-generated summary of your compliance portfolio.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] px-2 py-0.5 shrink-0 font-medium">
              Powered by LexisGraph AI
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex flex-col items-center justify-center text-center py-6 px-4 rounded-lg border border-dashed border-border/60 bg-muted/10 space-y-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success shrink-0">
              <CheckCircle2 className="h-4.5 w-4.5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">
                Your compliance portfolio appears healthy.
              </p>
              <p className="text-[11px] text-muted-foreground">
                No critical recommendations are available.
              </p>
            </div>
            <Button
              onClick={() => router.push("/compliance")}
              size="xs"
              className="gap-1 text-xs font-medium mt-1 cursor-pointer"
            >
              <Zap className="h-3 w-3" />
              <span>Run New Analysis</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── 4. FULL BRIEF STATE ─────────────────────────────────────────────────────
  return (
    <Card className={cn("border border-border bg-card shadow-sm h-full flex flex-col justify-between", className)}>
      {/* ── CARD HEADER ── */}
      <CardHeader className="py-3 px-5 border-b border-border/40 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold text-foreground tracking-tight">
                AI Executive Brief
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground truncate mt-0.5">
                AI-generated summary of your compliance portfolio.
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className="shrink-0 bg-primary/10 text-primary border-primary/20 text-xs px-2.5 py-0.5 font-medium"
          >
            Powered by LexisGraph AI
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-5 py-3.5 flex-1 flex flex-col justify-between gap-3.5">
        {/* ── SECTION 1: Portfolio Status ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-lg bg-muted/20 border border-border/40 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Badge
              variant="outline"
              className={cn("text-[11px] px-2.5 py-0.5 shrink-0 tracking-wide uppercase", portfolioStatus.badgeClass)}
            >
              {portfolioStatus.label}
            </Badge>
            <p className="text-xs text-foreground font-medium truncate">
              {portfolioStatus.summary}
            </p>
          </div>
        </div>

        {/* ── SECTION 2: Priority Actions (Top 3 Only, Spacious 1-Line Cards) ── */}
        <div className="space-y-2 flex-1 flex flex-col justify-center">
          <div className="flex items-center justify-between px-0.5 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Priority Actions
            </span>
            <span className="text-[10px] text-muted-foreground font-semibold bg-muted/50 px-2 py-0.5 rounded-full border border-border/30">
              Top 3
            </span>
          </div>

          <div className="space-y-2 flex-1 flex flex-col justify-around">
            {topActions.map((action) => {
              const formattedConfidence =
                action.confidence > 1
                  ? Math.round(action.confidence)
                  : Math.round(action.confidence * 100);

              return (
                <div
                  key={action.id}
                  className="group flex items-center justify-between gap-3 p-3 rounded-lg border border-border/50 bg-background hover:border-border transition-all duration-150 shadow-2xs"
                >
                  {/* Left: Priority Badge + Title & 1-Line Description */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        "gap-1 text-[11px] px-2 py-0.5 shrink-0 uppercase tracking-wide",
                        getPriorityBadgeClass(action.priority)
                      )}
                    >
                      {getPriorityIcon(action.priority)}
                      <span>{action.priority}</span>
                    </Badge>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {action.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                        {action.explanation}
                      </p>
                    </div>
                  </div>

                  {/* Right: Confidence % + Compact Action Button */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className="text-xs font-medium text-muted-foreground hidden sm:inline"
                      title="AI Confidence Score"
                    >
                      Confidence {formattedConfidence}%
                    </span>

                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        if (action.onAction) {
                          action.onAction();
                        } else if (onRecommendationAction) {
                          onRecommendationAction(action);
                        } else {
                          router.push("/compliance");
                        }
                      }}
                      className="gap-1 text-xs h-7 px-2.5 font-medium shrink-0 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors cursor-pointer"
                    >
                      <span>{action.actionLabel}</span>
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>

      {/* ── SECTIONS 3 & 4 + BOTTOM CTA ── */}
      <CardFooter className="py-2.5 px-5 border-t border-border/40 bg-muted/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Section 3 & 4: AI Confidence & Latest Update */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground min-w-0">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Shield className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>AI Confidence: {overallConfidence}%</span>
          </div>
          <span className="hidden sm:inline text-muted-foreground/60">•</span>
          <span className="truncate hidden md:inline">
            Based on latest indexed regulations and internal policies.
          </span>
          <span className="hidden sm:inline text-muted-foreground/60">•</span>
          <div className="flex items-center gap-1">
            <span>Last analyzed:</span>
            <span className="font-semibold text-foreground tabular-nums">
              {timestampDisplay}
            </span>
          </div>
        </div>

        {/* Bottom CTA */}
        <Button
          size="xs"
          onClick={() => {
            if (onViewFullAnalysis) {
              onViewFullAnalysis();
            } else {
              router.push("/reports");
            }
          }}
          className="gap-1.5 text-xs h-7 px-3.5 font-semibold shrink-0 cursor-pointer ml-auto"
        >
          <span>View Full Analysis</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </CardFooter>
    </Card>
  );
};

export default AIExecutiveBrief;
