"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  FileCheck2,
  HelpCircle,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Building2,
  BookOpen,
  FileText,
  UserCheck,
  CheckCircle2,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ComplianceScoreModal } from "./ComplianceScoreModal";
import { FindingItem } from "@/components/compliance/FindingDetailDrawer";

interface OverviewTabProps {
  score: number;
  riskLevel: string;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  summaryText?: string | null;
  topPriorityFindings: FindingItem[];
  organizationName?: string;
  policyName?: string;
  regulationName?: string;
  policyDocumentId?: string;
  regulationDocumentId?: string;
  createdAt?: string;
  onNavigateToFindings: (severityFilter?: string) => void;
  onSelectFinding: (finding: FindingItem) => void;
}

export function OverviewTab({
  score,
  riskLevel,
  totalFindings,
  criticalCount,
  highCount,
  mediumCount,
  lowCount,
  summaryText,
  topPriorityFindings,
  organizationName,
  policyName,
  regulationName,
  policyDocumentId,
  regulationDocumentId,
  createdAt,
  onNavigateToFindings,
  onSelectFinding,
}: OverviewTabProps) {
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);

  const unresolvedGaps = criticalCount + highCount;

  // Percentage calculations
  const total = totalFindings || 1;
  const criticalPct = Math.round((criticalCount / total) * 100);
  const highPct = Math.round((highCount / total) * 100);
  const mediumPct = Math.round((mediumCount / total) * 100);
  const lowPct = Math.round((lowCount / total) * 100);

  return (
    <div className="space-y-6">
      {/* ── SECTION A: COMPLIANCE SUMMARY (4 KPI CARDS) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Compliance Score */}
        <Card className="p-4 border-border bg-card shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Compliance Score
            </span>
            <button
              type="button"
              onClick={() => setIsScoreModalOpen(true)}
              className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
              title="How is this score calculated?"
              aria-label="How is this score calculated?"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold font-mono text-primary">
              {score.toFixed(1)}%
            </span>
            <button
              type="button"
              onClick={() => setIsScoreModalOpen(true)}
              className="text-[10px] text-primary hover:underline font-medium cursor-pointer"
            >
              Methodology →
            </button>
          </div>

          <div className="mt-2 text-[11px] text-muted-foreground">
            Weighted across {totalFindings} evaluated statutory provisions.
          </div>
        </Card>

        {/* KPI 2: Overall Risk Level */}
        <Card className="p-4 border-border bg-card shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Overall Risk Level
            </span>
            {riskLevel === "LOW" ? (
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            ) : riskLevel === "MEDIUM" ? (
              <ShieldAlert className="h-4 w-4 text-amber-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            )}
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-sm font-extrabold px-3 py-1",
                riskLevel === "LOW"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : riskLevel === "MEDIUM"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
              )}
            >
              {riskLevel || (score >= 80 ? "LOW RISK" : score >= 50 ? "MEDIUM RISK" : "HIGH RISK")}
            </Badge>
          </div>

          <div className="mt-2 text-[11px] text-muted-foreground">
            Analysis is completed; risk evaluates regulatory exposure.
          </div>
        </Card>

        {/* KPI 3: Total Findings */}
        <Card className="p-4 border-border bg-card shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Findings
            </span>
            <FileCheck2 className="h-4 w-4 text-primary" />
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-foreground">
              {totalFindings}
            </span>
            <span className="text-xs text-muted-foreground">clauses audited</span>
          </div>

          <div className="mt-2 text-[11px] text-muted-foreground">
            {lowCount} compliant · {mediumCount} partial · {unresolvedGaps} gaps
          </div>
        </Card>

        {/* KPI 4: Unresolved High/Critical Findings */}
        <Card className="p-4 border-border bg-card shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Unresolved High Risks
            </span>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-rose-600 dark:text-rose-400">
              {unresolvedGaps}
            </span>
            <span className="text-xs text-muted-foreground">require remediation</span>
          </div>

          <div className="mt-2 text-[11px] text-muted-foreground">
            {criticalCount} critical statutory omissions · {highCount} high risk
          </div>
        </Card>
      </div>

      {/* ── SECTION B: EXECUTIVE SUMMARY ── */}
      <Card className="p-5 border-border bg-card shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Executive Assessment Summary
          </span>
          <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent border-accent/20 font-medium">
            AI-Grounded Synthesis
          </Badge>
        </div>

        <p className="text-xs text-foreground/90 leading-relaxed font-medium">
          {summaryText ||
            `The statutory compliance assessment evaluated ${policyName || "the internal policy"} against ${regulationName || "statutory obligations"}. The overall alignment score is ${score.toFixed(1)}% with an assessed risk level of ${riskLevel}. ${unresolvedGaps} statutory requirements exhibit compliance gaps or missing internal policy coverage that warrant immediate remediation attention.`}
        </p>
      </Card>

      {/* ── SECTION C: RISK DISTRIBUTION (CLICKABLE BARS) ── */}
      <Card className="p-5 border-border bg-card shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Risk & Severity Distribution
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Click any severity category below to filter the Compliance Findings table.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigateToFindings("ALL")}
            className="text-xs h-7 text-primary hover:text-primary-hover cursor-pointer"
          >
            View all findings →
          </Button>
        </div>

        {/* Stacked Visual Bar */}
        <div className="h-3 w-full bg-muted/40 rounded-full overflow-hidden flex">
          {criticalCount > 0 && (
            <div
              style={{ width: `${criticalPct}%` }}
              className="bg-rose-700 hover:opacity-90 transition-opacity cursor-pointer"
              onClick={() => onNavigateToFindings("CRITICAL")}
              title={`Critical: ${criticalCount} (${criticalPct}%)`}
            />
          )}
          {highCount > 0 && (
            <div
              style={{ width: `${highPct}%` }}
              className="bg-rose-500 hover:opacity-90 transition-opacity cursor-pointer"
              onClick={() => onNavigateToFindings("HIGH")}
              title={`High: ${highCount} (${highPct}%)`}
            />
          )}
          {mediumCount > 0 && (
            <div
              style={{ width: `${mediumPct}%` }}
              className="bg-amber-500 hover:opacity-90 transition-opacity cursor-pointer"
              onClick={() => onNavigateToFindings("MEDIUM")}
              title={`Medium: ${mediumCount} (${mediumPct}%)`}
            />
          )}
          {lowCount > 0 && (
            <div
              style={{ width: `${lowPct}%` }}
              className="bg-emerald-500 hover:opacity-90 transition-opacity cursor-pointer"
              onClick={() => onNavigateToFindings("LOW")}
              title={`Low: ${lowCount} (${lowPct}%)`}
            />
          )}
        </div>

        {/* Clickable Severity Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => onNavigateToFindings("CRITICAL")}
            className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 text-left transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-rose-500 uppercase">Critical Gaps</span>
              <span className="text-xs font-mono font-bold text-rose-500">{criticalPct}%</span>
            </div>
            <p className="text-lg font-extrabold font-mono text-foreground mt-1 group-hover:text-rose-500 transition-colors">
              {criticalCount}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateToFindings("HIGH")}
            className="p-3 rounded-lg border border-rose-400/30 bg-rose-400/5 hover:bg-rose-400/10 text-left transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-rose-400 uppercase">High Risk</span>
              <span className="text-xs font-mono font-bold text-rose-400">{highPct}%</span>
            </div>
            <p className="text-lg font-extrabold font-mono text-foreground mt-1 group-hover:text-rose-400 transition-colors">
              {highCount}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateToFindings("MEDIUM")}
            className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-left transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-amber-500 uppercase">Medium Risk</span>
              <span className="text-xs font-mono font-bold text-amber-500">{mediumPct}%</span>
            </div>
            <p className="text-lg font-extrabold font-mono text-foreground mt-1 group-hover:text-amber-500 transition-colors">
              {mediumCount}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateToFindings("LOW")}
            className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-left transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-emerald-500 uppercase">Low Risk</span>
              <span className="text-xs font-mono font-bold text-emerald-500">{lowPct}%</span>
            </div>
            <p className="text-lg font-extrabold font-mono text-foreground mt-1 group-hover:text-emerald-500 transition-colors">
              {lowCount}
            </p>
          </button>
        </div>
      </Card>

      {/* ── SECTION D & E: 2-COLUMN GRID (Top Priority Findings & Scope) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Priority Findings (2 cols) */}
        <Card className="p-5 border-border bg-card shadow-xs lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Top Priority Findings
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Most serious unresolved statutory gaps requiring action.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateToFindings("HIGH")}
              className="text-xs h-7 gap-1 text-primary border-primary/30 cursor-pointer"
            >
              <span>Inspect All Gaps</span>
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>

          {topPriorityFindings.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground">
              No unresolved critical or high-risk findings identified.
            </div>
          ) : (
            <div className="space-y-2.5">
              {topPriorityFindings.slice(0, 5).map((finding) => (
                <div
                  key={finding.id}
                  onClick={() => onSelectFinding(finding)}
                  className="p-3.5 rounded-lg border border-border/70 bg-surface-elevated hover:border-primary/50 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-bold text-muted-foreground">
                        #{finding.id.slice(0, 8)}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] font-bold px-1.5 py-0 uppercase",
                          finding.severity === "CRITICAL" || finding.severity === "HIGH"
                            ? "bg-rose-500/10 text-rose-500 border-rose-500/30"
                            : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                        )}
                      >
                        {finding.severity}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[9px] font-medium px-1.5 py-0 bg-muted/30 border-border text-muted-foreground"
                      >
                        {finding.lifecycle_status || "OPEN"}
                      </Badge>
                    </div>

                    <p className="text-foreground font-semibold line-clamp-1">
                      {finding.reasoning || finding.citation || "Statutory clause gap identified"}
                    </p>

                    <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                      <span>Clause: {finding.regulation_clause_id || "Statutory Provision"}</span>
                      {finding.assignee && (
                        <span>· Owner: {finding.assignee.full_name}</span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2 text-primary shrink-0 self-end sm:self-center"
                  >
                    View Details →
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Assessment Scope (1 col) */}
        <Card className="p-5 border-border bg-card shadow-xs space-y-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Assessment Scope
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Entities and parameters evaluated in this run.
            </p>
          </div>

          <div className="space-y-3 text-xs divide-y divide-border/40">
            <div className="pt-2 first:pt-0 space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3 w-3 text-primary" /> Organization Workspace
              </span>
              <p className="font-semibold text-foreground">{organizationName || "Active Organization"}</p>
            </div>

            <div className="pt-2.5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-primary" /> Internal Policy
              </span>
              <p className="font-semibold text-foreground line-clamp-2">
                {policyName || "Corporate Compliance Policy"}
              </p>
            </div>

            <div className="pt-2.5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                <BookOpen className="h-3 w-3 text-primary" /> Applied Regulation
              </span>
              <p className="font-semibold text-foreground line-clamp-2">
                {regulationName || "Statutory Act"}
              </p>
            </div>

            <div className="pt-2.5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">
                Analysis Date
              </span>
              <p className="text-muted-foreground">
                {createdAt ? format(new Date(createdAt), "MMMM d, yyyy") : "—"}
              </p>
            </div>

            <div className="pt-2.5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">
                Engine & Scope
              </span>
              <p className="text-muted-foreground text-[11px]">
                GraphRAG Semantic & Clause Extraction (Full Document Scope)
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Compliance Score Explanation Modal */}
      <ComplianceScoreModal
        open={isScoreModalOpen}
        onOpenChange={setIsScoreModalOpen}
        score={score}
        riskLevel={riskLevel}
        totalClauses={totalFindings}
        compliantCount={lowCount}
        partialCount={mediumCount}
        nonCompliantCount={unresolvedGaps}
      />
    </div>
  );
}
