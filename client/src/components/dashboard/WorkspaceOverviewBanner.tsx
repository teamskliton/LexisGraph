"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Zap,
  BarChart3,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface WorkspaceOverviewBannerProps {
  organizationName?: string;
  complianceScore?: number;
  riskLevelLabel?: string;
  lastAnalysisDate?: string;
  policyCount?: number;
  reportCount?: number;
  knowledgeGraphActive?: boolean;
  highRiskIssues?: number;
  needsReview?: number;
  compliantClauses?: number;
  pendingAnalyses?: number;
  isLoading?: boolean;
}

export const WorkspaceOverviewBanner: React.FC<WorkspaceOverviewBannerProps> = ({
  organizationName = "TechNova Solutions Pvt. Ltd.",
  complianceScore = 82,
  riskLevelLabel,
  lastAnalysisDate = "Sep 19, 2026",
  policyCount = 16,
  reportCount = 5,
  knowledgeGraphActive = true,
  highRiskIssues = 1,
  needsReview = 3,
  compliantClauses = 48,
  pendingAnalyses = 0,
  isLoading = false,
}) => {
  const router = useRouter();

  const riskLevel = useMemo(() => {
    if (riskLevelLabel) {
      if (riskLevelLabel.toLowerCase().includes("low")) {
        return {
          label: riskLevelLabel,
          color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
          icon: <ShieldCheck className="h-3.5 w-3.5" />,
        };
      }
      if (riskLevelLabel.toLowerCase().includes("medium")) {
        return {
          label: riskLevelLabel,
          color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
          icon: <ShieldAlert className="h-3.5 w-3.5" />,
        };
      }
      return {
        label: riskLevelLabel,
        color: "text-rose-500 bg-rose-500/10 border-rose-500/20",
        icon: <ShieldX className="h-3.5 w-3.5" />,
      };
    }

    if (complianceScore >= 85) {
      return {
        label: "Low Risk",
        color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
        icon: <ShieldCheck className="h-3.5 w-3.5" />,
      };
    }
    if (complianceScore >= 65) {
      return {
        label: "Medium Risk",
        color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
        icon: <ShieldAlert className="h-3.5 w-3.5" />,
      };
    }
    return {
      label: "High Risk",
      color: "text-rose-500 bg-rose-500/10 border-rose-500/20",
      icon: <ShieldX className="h-3.5 w-3.5" />,
    };
  }, [complianceScore, riskLevelLabel]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card className="border border-border/50 bg-card p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-64 rounded" />
              <Skeleton className="h-4 w-96 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-28 rounded-md" />
              <Skeleton className="h-8 w-28 rounded-md" />
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="p-3 rounded-xl border border-border/40 bg-muted/20 space-y-1">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="h-6 w-12 rounded" />
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="border border-border/50 bg-card p-4 space-y-2">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="h-7 w-14 rounded" />
              <Skeleton className="h-2 w-full rounded" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── WORKSPACE OVERVIEW BANNER ───────────────────────────────── */}
      <Card className="border border-border/50 bg-card p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-foreground">
                {organizationName} Overview
              </h2>
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 text-xs px-2.5 py-0.5 uppercase tracking-wide font-semibold",
                  riskLevel.color
                )}
              >
                {riskLevel.icon}
                {riskLevel.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Workspace compliance posture summary and statutory risk indicators.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => router.push("/documents")}
              className="gap-1.5 text-xs font-semibold cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" /> Upload Policy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/compliance")}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <Zap className="h-3.5 w-3.5 text-warning" /> Run Analysis
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/reports")}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <BarChart3 className="h-3.5 w-3.5 text-primary" /> View Reports
            </Button>
          </div>
        </div>

        {/* 6 Key Attributes Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Compliance Score
            </span>
            <span className="text-xl font-bold tabular-nums text-foreground">
              {complianceScore}%
            </span>
          </div>

          <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Risk Level
            </span>
            <span className="text-sm font-bold text-foreground mt-0.5 block">
              {riskLevel.label}
            </span>
          </div>

          <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Last Analysis
            </span>
            <span className="text-xs font-semibold text-foreground truncate mt-1 block">
              {lastAnalysisDate}
            </span>
          </div>

          <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Policies Uploaded
            </span>
            <span className="text-xl font-bold tabular-nums text-foreground">
              {policyCount}
            </span>
          </div>

          <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Reports Generated
            </span>
            <span className="text-xl font-bold tabular-nums text-foreground">
              {reportCount}
            </span>
          </div>

          <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Knowledge Graph
            </span>
            <span className="text-xs font-semibold text-emerald-500 mt-1 flex items-center gap-1">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full bg-emerald-500",
                  knowledgeGraphActive && "animate-pulse"
                )}
              />{" "}
              {knowledgeGraphActive ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      </Card>

      {/* ─── SECTION 2: COMPLIANCE SNAPSHOT ──────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border border-border/50 bg-card p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Compliance Score</span>
          <p className="text-2xl font-bold text-foreground tabular-nums">{complianceScore}%</p>
          <Progress value={complianceScore} className="h-1.5 mt-2" />
        </Card>

        <Card className="border border-border/50 bg-card p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">High Risk Issues</span>
          <p className="text-2xl font-bold text-rose-500 tabular-nums">{highRiskIssues}</p>
          <span className="text-[10px] text-muted-foreground">Requires immediate review</span>
        </Card>

        <Card className="border border-border/50 bg-card p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Needs Review</span>
          <p className="text-2xl font-bold text-amber-500 tabular-nums">{needsReview}</p>
          <span className="text-[10px] text-muted-foreground">Pending verification</span>
        </Card>

        <Card className="border border-border/50 bg-card p-4 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Compliant Clauses</span>
          <p className="text-2xl font-bold text-emerald-500 tabular-nums">{compliantClauses}</p>
          <span className="text-[10px] text-muted-foreground">Statutory alignment verified</span>
        </Card>

        <Card className="border border-border/50 bg-card p-4 space-y-1 col-span-2 lg:col-span-1">
          <span className="text-xs font-medium text-muted-foreground">Pending Analyses</span>
          <p className="text-2xl font-bold text-primary tabular-nums">{pendingAnalyses}</p>
          <span className="text-[10px] text-muted-foreground">Queued or running jobs</span>
        </Card>
      </div>
    </div>
  );
};
