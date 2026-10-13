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
  FileText,
  BookOpen,
  HelpCircle,
} from "lucide-react";
import { PriorityActionItem, RecentReportItem } from "@/types/dashboard";
import { ComplianceJob } from "@/services/api/compliance";
import { cn } from "@/lib/utils";

export interface AIExecutiveBriefProps {
  isLoading?: boolean;
  activeJobs?: ComplianceJob[];
  recentReports?: RecentReportItem[];
  priorityActions?: PriorityActionItem[];
  complianceScore?: number | null;
  riskStatus?: string;
  summary?: string;
  lastAnalyzedAt?: string | null;
  onViewFullAnalysis?: () => void;
  className?: string;
}

function getSeverityBadge(severity: string) {
  const s = severity.toUpperCase();
  switch (s) {
    case "CRITICAL":
      return {
        icon: <ShieldAlert className="h-3 w-3 text-rose-500 shrink-0" />,
        className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 font-semibold",
      };
    case "HIGH":
      return {
        icon: <AlertCircle className="h-3 w-3 text-orange-500 shrink-0" />,
        className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 font-semibold",
      };
    case "MEDIUM":
      return {
        icon: <Info className="h-3 w-3 text-amber-500 shrink-0" />,
        className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-medium",
      };
    default:
      return {
        icon: <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />,
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-medium",
      };
  }
}

function formatAnalysisTimestamp(dateStr?: string | null): string {
  if (!dateStr) return "Pending Analysis";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dayPrefix = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "MMM d, yyyy");
    return `${dayPrefix} at ${format(d, "h:mm a")}`;
  } catch {
    return dateStr;
  }
}

export const AIExecutiveBrief: React.FC<AIExecutiveBriefProps> = ({
  isLoading = false,
  activeJobs = [],
  recentReports = [],
  priorityActions = [],
  complianceScore,
  riskStatus,
  summary,
  lastAnalyzedAt,
  onViewFullAnalysis,
  className,
}) => {
  const router = useRouter();

  // Dynamic posture summary
  const posture = useMemo(() => {
    if (summary) {
      return {
        badge: riskStatus || "Monitored",
        badgeClass: "bg-primary/10 text-primary border-primary/20",
        text: summary,
      };
    }

    if (complianceScore === null || complianceScore === undefined) {
      return {
        badge: "Initial Setup",
        badgeClass: "bg-muted text-muted-foreground border-border/50",
        text: "No compliance audit analyses have been evaluated for this organization yet. Ingest policy documents and run your first regulatory check to populate executive intelligence.",
      };
    }

    if (complianceScore >= 85) {
      return {
        badge: "Healthy Posture",
        badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        text: `Organization compliance posture is strong (${complianceScore}%). Policies demonstrate high statutory alignment with monitored regulatory frameworks. Maintain regular ingestion cycles.`,
      };
    }
    if (complianceScore >= 70) {
      return {
        badge: "Requires Review",
        badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
        text: `Organization compliance posture is fair (${complianceScore}%). Several policy clauses show partial coverage or require human reviewer verification against statutory obligations.`,
      };
    }
    return {
      badge: "High Risk Detected",
      badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
      text: `Organization compliance posture is at risk (${complianceScore}%). Critical gaps have been identified between internal policy procedures and enforceable statutory mandates. Immediate remediation recommended.`,
    };
  }, [complianceScore, riskStatus, summary]);

  // Timestamp display
  const timestampDisplay = useMemo(() => {
    if (lastAnalyzedAt) return formatAnalysisTimestamp(lastAnalyzedAt);
    if (recentReports.length > 0 && recentReports[0].created_at) {
      return formatAnalysisTimestamp(recentReports[0].created_at);
    }
    return null;
  }, [lastAnalyzedAt, recentReports]);

  // Loading skeleton
  if (isLoading) {
    return (
      <Card className={cn("border border-border/50 bg-card shadow-2xs h-full flex flex-col", className)}>
        <CardHeader className="py-3.5 px-5 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </CardHeader>
        <CardContent className="px-5 py-4 space-y-3.5 flex-1">
          <Skeleton className="h-14 w-full rounded-lg" />
          <div className="space-y-2.5 pt-2">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Active Job Running State
  if (activeJobs.length > 0) {
    const job = activeJobs[0];
    return (
      <Card className={cn("border border-primary/30 bg-card shadow-2xs h-full flex flex-col justify-between", className)}>
        <CardHeader className="py-3.5 px-5 border-b border-border/40 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-foreground">
                  AI Executive Brief
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Compliance evaluation in progress...
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs px-2.5 py-0.5 font-medium">
              Job Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-5 py-8 flex-1 flex flex-col items-center justify-center text-center space-y-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Sparkles className="h-5 w-5 animate-pulse" />
          </div>
          <div className="space-y-1 max-w-md">
            <h4 className="text-sm font-semibold text-foreground">
              Evaluating Policy Clauses against Regulatory Graph
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              LexisGraph AI is verifying statutory requirements and semantic embeddings for job #{job.id.slice(0, 8)}.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("border border-border/50 bg-card shadow-2xs h-full flex flex-col justify-between", className)}>
      {/* ── Card Header ── */}
      <CardHeader className="py-3.5 px-5 border-b border-border/40 shrink-0">
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
                AI-driven analysis of organization compliance posture and corrective actions
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className="shrink-0 bg-primary/10 text-primary border-primary/20 text-xs px-2.5 py-0.5 font-medium"
          >
            LexisGraph AI
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-5 py-4 flex-1 flex flex-col justify-between gap-4">
        {/* ── Posture Summary ── */}
        <div className="p-3.5 rounded-lg bg-muted/20 border border-border/50 space-y-1.5 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn("text-[11px] px-2 py-0.5 uppercase tracking-wide", posture.badgeClass)}>
              {posture.badge}
            </Badge>
            {complianceScore !== null && complianceScore !== undefined && (
              <span className="text-xs font-semibold text-foreground">
                Score: {complianceScore}%
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {posture.text}
          </p>
        </div>

        {/* ── Priority Actions Section ── */}
        <div className="space-y-2 flex-1 flex flex-col justify-center">
          <div className="flex items-center justify-between px-0.5 shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Priority Actions
            </span>
            <span className="text-[10px] text-muted-foreground font-medium bg-muted/40 px-2 py-0.5 rounded-full border border-border/30">
              {priorityActions.length > 0 ? `${priorityActions.length} Actions` : "Zero Blockers"}
            </span>
          </div>

          {priorityActions.length === 0 ? (
            <div className="p-6 rounded-lg border border-dashed border-border/60 bg-muted/10 text-center space-y-2 my-auto">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-foreground">
                  No Unresolved Critical Findings
                </p>
                <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                  All analyzed policy clauses satisfy compliance thresholds or have been marked resolved.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5 flex-1 flex flex-col justify-around">
              {priorityActions.slice(0, 3).map((action) => {
                const sevBadge = getSeverityBadge(action.severity);
                return (
                  <div
                    key={action.id}
                    className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-border/50 bg-background/50 hover:border-border hover:bg-background transition-all duration-150 shadow-2xs"
                  >
                    {/* Finding Info */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={cn("gap-1 text-[10px] px-2 py-0.5 shrink-0 uppercase tracking-wide", sevBadge.className)}
                        >
                          {sevBadge.icon}
                          <span>{action.severity}</span>
                        </Badge>
                        <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {action.title}
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-1 leading-relaxed">
                        {action.description}
                      </p>

                      {/* Traceability: Policy & Regulation Links */}
                      <div className="flex items-center gap-2 pt-0.5 text-[10px] text-muted-foreground flex-wrap">
                        {action.relevant_policy && (
                          <span className="inline-flex items-center gap-1 text-primary/80 font-medium">
                            <FileText className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[140px]">{action.relevant_policy}</span>
                          </span>
                        )}
                        {action.relevant_policy && action.relevant_regulation && <span>•</span>}
                        {action.relevant_regulation && (
                          <span className="inline-flex items-center gap-1 text-secondary-foreground/80 font-medium">
                            <BookOpen className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[140px]">{action.relevant_regulation}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Confidence & Action Button */}
                    <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                      {action.confidence !== null && action.confidence !== undefined && (
                        <div
                          className="text-right hidden md:block"
                          title="NLP & semantic clause match confidence for regulatory entity extraction"
                        >
                          <span className="text-[10px] text-muted-foreground block leading-tight">
                            Extraction
                          </span>
                          <span className="text-xs font-bold tabular-nums text-foreground">
                            {action.confidence}%
                          </span>
                        </div>
                      )}

                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          if (action.action_type === "policy" && action.policy_id) {
                            router.push(`/documents?id=${action.policy_id}`);
                          } else if (action.action_type === "regulation" && action.regulation_id) {
                            router.push(`/regulations`);
                          } else if (action.report_id) {
                            router.push(`/reports/${action.report_id}`);
                          } else {
                            router.push("/compliance");
                          }
                        }}
                        className="gap-1 text-xs h-7 px-2.5 font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors cursor-pointer"
                      >
                        <span>{action.action_label}</span>
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>

      {/* ── Footer: Confidence disclaimer & Full Analysis CTA ── */}
      <CardFooter className="py-2.5 px-5 border-t border-border/40 bg-muted/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground min-w-0">
          <div
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground cursor-help"
            title="Semantic extraction confidence score indicates entity mapping accuracy. It is not an absolute legal certification."
          >
            <Shield className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>Traceable to indexed statutory clauses</span>
            <HelpCircle className="h-3 w-3 text-muted-foreground/60" />
          </div>
          {timestampDisplay && (
            <>
              <span className="hidden sm:inline text-muted-foreground/40">•</span>
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                Analyzed: <strong className="text-foreground font-medium">{timestampDisplay}</strong>
              </span>
            </>
          )}
        </div>

        <Button
          size="xs"
          onClick={() => {
            if (onViewFullAnalysis) onViewFullAnalysis();
            else router.push("/reports");
          }}
          className="gap-1.5 text-xs h-7 px-3 font-semibold shrink-0 cursor-pointer ml-auto"
        >
          <span>View Reports</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </CardFooter>
    </Card>
  );
};

export default AIExecutiveBrief;
