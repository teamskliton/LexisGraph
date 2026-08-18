// GapAnalysisWorkspace — Sprint 8.1: Compliance Gap Analysis & Traceability
// Rendered as a tab inside AnalysisDetailsWorkspace for COMPLETED reports.
// Calls GET /compliance/{reportId}/gap-analysis and displays structured coverage data.

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileCheck2,
  FileText,
  MinusCircle,
  Network,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  XCircle,
  BookOpen,
  ArrowRight,
  Info,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import {
  complianceService,
  GapAnalysisResponse,
  GapAnalysisClauseResult,
  GapAnalysisCoverageSummary,
} from "@/services/api/compliance";

interface GapAnalysisWorkspaceProps {
  reportId: string;
  organizationId?: string;
}

// ─── Coverage Status Helpers ─────────────────────────────────────────────────

const COVERAGE_META: Record<
  string,
  { label: string; icon: React.ReactNode; badge: string; bg: string }
> = {
  COVERED: {
    label: "Covered",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    bg: "bg-emerald-500/5 border-emerald-500/20",
  },
  PARTIALLY_COVERED: {
    label: "Partially Covered",
    icon: <ShieldAlert className="h-4 w-4 text-amber-500" />,
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    bg: "bg-amber-500/5 border-amber-500/20",
  },
  GAP: {
    label: "Gap",
    icon: <XCircle className="h-4 w-4 text-rose-500" />,
    badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
    bg: "bg-rose-500/5 border-rose-500/20",
  },
  UNABLE_TO_DETERMINE: {
    label: "Unable to Determine",
    icon: <MinusCircle className="h-4 w-4 text-slate-400" />,
    badge: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/30",
    bg: "bg-slate-500/5 border-slate-500/20",
  },
};

function CoverageBadge({ status }: { status: string }) {
  const meta = COVERAGE_META[status] ?? COVERAGE_META.UNABLE_TO_DETERMINE;
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-bold px-2 py-0.5 gap-1 flex items-center", meta.badge)}
    >
      {meta.icon}
      {meta.label}
    </Badge>
  );
}

function ConfidenceBadge({ confidence }: { confidence?: string }) {
  const conf = (confidence || "HIGH").toUpperCase();
  const meta: Record<string, { label: string; badge: string }> = {
    HIGH: { label: "High Confidence", badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
    MEDIUM: { label: "Medium Confidence", badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
    LOW: { label: "Low Confidence", badge: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30" },
  };
  const item = meta[conf] ?? meta.MEDIUM;
  return (
    <Badge variant="outline" className={cn("text-[9px] font-bold px-1.5 py-0.5", item.badge)}>
      {item.label}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colorMap: Record<string, string> = {
    CRITICAL: "bg-rose-600/10 text-rose-600 dark:text-rose-400 border-rose-600/30",
    HIGH: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
    MEDIUM: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    LOW: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] font-bold px-2 py-0.5", colorMap[severity] ?? colorMap.MEDIUM)}>
      {severity}
    </Badge>
  );
}

function LifecycleBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    OPEN: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
    IN_REVIEW: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
    REMEDIATION: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    RESOLVED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    REOPENED: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
    REASSESSMENT_REQUIRED: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
  };
  const label = status?.replace(/_/g, " ") ?? "OPEN";
  return (
    <Badge variant="outline" className={cn("text-[10px] font-bold px-2 py-0.5", colorMap[status] ?? colorMap.OPEN)}>
      {label}
    </Badge>
  );
}

// ─── Coverage Summary Cards ───────────────────────────────────────────────────

function CoverageSummaryCards({ summary }: { summary: GapAnalysisCoverageSummary }) {
  const stats = [
    {
      label: "Covered",
      count: summary.covered,
      pct: summary.covered_pct,
      icon: <ShieldCheck className="h-5 w-5 text-emerald-500" />,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "border-emerald-500/20 bg-emerald-500/5",
    },
    {
      label: "Partially Covered",
      count: summary.partially_covered,
      pct: summary.partial_pct,
      icon: <ShieldAlert className="h-5 w-5 text-amber-500" />,
      color: "text-amber-600 dark:text-amber-400",
      bg: "border-amber-500/20 bg-amber-500/5",
    },
    {
      label: "Gap",
      count: summary.gap,
      pct: summary.gap_pct,
      icon: <ShieldOff className="h-5 w-5 text-rose-500" />,
      color: "text-rose-600 dark:text-rose-400",
      bg: "border-rose-500/20 bg-rose-500/5",
    },
    {
      label: "Unable to Determine",
      count: summary.unable_to_determine,
      pct: summary.unable_pct,
      icon: <MinusCircle className="h-5 w-5 text-slate-400" />,
      color: "text-slate-500 dark:text-slate-400",
      bg: "border-slate-500/20 bg-slate-500/5",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((s) => (
        <Card key={s.label} className={cn("border p-4 text-center shadow-xs", s.bg)}>
          <div className="flex justify-center mb-1">{s.icon}</div>
          <p className={cn("text-2xl font-extrabold font-mono", s.color)}>{s.count}</p>
          <p className="text-[10px] uppercase font-bold text-muted-foreground mt-0.5">{s.label}</p>
          <p className={cn("text-xs font-semibold mt-0.5", s.color)}>{s.pct}%</p>
        </Card>
      ))}
    </div>
  );
}

// ─── Clause Row ───────────────────────────────────────────────────────────────

interface ClauseRowProps {
  clause: GapAnalysisClauseResult;
  isExpanded: boolean;
  onToggle: () => void;
  onViewFinding: (findingId: string) => void;
  onExploreGraph: (searchTerm: string) => void;
  onViewDocument: (docId: string) => void;
  policyDocId?: string;
}

function ClauseRow({
  clause,
  isExpanded,
  onToggle,
  onViewFinding,
  onExploreGraph,
  onViewDocument,
  policyDocId,
}: ClauseRowProps) {
  const meta = COVERAGE_META[clause.coverage_status] ?? COVERAGE_META.UNABLE_TO_DETERMINE;

  return (
    <div
      className={cn(
        "border rounded-lg overflow-hidden transition-all",
        isExpanded ? meta.bg : "border-border/50 bg-card hover:bg-muted/20"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-3.5 flex items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset"
        aria-expanded={isExpanded}
      >
        <span className="mt-0.5 shrink-0">{meta.icon}</span>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono font-bold text-muted-foreground">
              #{clause.clause_index + 1}
            </span>
            <CoverageBadge status={clause.coverage_status} />
            <ConfidenceBadge confidence={clause.confidence} />
            {clause.conflicting_evidence && (
              <Badge
                variant="outline"
                className="text-[9px] font-bold px-1.5 py-0.5 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
              >
                Conflicting
              </Badge>
            )}
            {clause.finding && (
              <Badge
                variant="outline"
                className="text-[10px] font-bold px-2 py-0.5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10"
              >
                F-{clause.finding.finding_id.slice(0, 8)}
              </Badge>
            )}
          </div>
          <p className="text-xs text-foreground/90 line-clamp-2 leading-relaxed">
            {clause.regulation_text}
          </p>
          {clause.policy_evidence && !isExpanded && (
            <p className="text-[11px] text-muted-foreground line-clamp-1 italic">
              Evidence: {clause.policy_evidence.slice(0, 120)}…
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span className="text-[10px] font-bold text-muted-foreground block">Vector Sim</span>
          <span className="text-xs font-bold text-foreground">
            {(clause.similarity_score * 100).toFixed(0)}%
          </span>
        </div>
        <span className="shrink-0 mt-0.5 text-muted-foreground">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>


      {isExpanded && (
        <div className="border-t border-border/30 p-4 space-y-4 text-xs">
          <div className="space-y-1">
            <h4 className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-indigo-500" /> Regulation Requirement
            </h4>
            <p className="text-foreground/90 leading-relaxed bg-muted/30 p-3 rounded-lg border border-border/40">
              {clause.regulation_text}
            </p>
          </div>

          {clause.policy_evidence ? (
            <div className="space-y-1">
              <h4 className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileCheck2 className="h-3.5 w-3.5 text-emerald-500" /> Policy Evidence
                {clause.total_policy_matches > 1 && (
                  <Badge variant="outline" className="text-[9px] px-1.5 border-muted-foreground/30 text-muted-foreground">
                    +{clause.total_policy_matches - 1} more
                  </Badge>
                )}
              </h4>
              <p className="text-foreground/90 leading-relaxed bg-muted/30 p-3 rounded-lg border border-border/40 italic">
                "{clause.policy_evidence}"
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px]">
              No policy evidence found for this requirement.
            </div>
          )}

          <div className="space-y-1">
            <h4 className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-500" /> Analysis Reasoning
            </h4>
            <p className="text-foreground/80 leading-relaxed">{clause.reasoning}</p>
          </div>

          {clause.conflicting_evidence && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <span>
                <strong>Conflicting Evidence:</strong> Contradictory or incompatible policy provisions were detected across the evaluated document sections.
              </span>
            </div>
          )}

          {clause.missing_aspects && clause.missing_aspects.length > 0 && (
            <div className="space-y-1">
              <h4 className="font-bold text-[10px] uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Missing / Incomplete Aspects
              </h4>
              <ul className="list-disc list-inside space-y-1 bg-rose-500/5 p-3 rounded-lg border border-rose-500/20 text-foreground/90">
                {clause.missing_aspects.map((aspect, i) => (
                  <li key={i} className="text-xs leading-relaxed">
                    {aspect}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {clause.recommendation && (
            <div className="space-y-1">
              <h4 className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-amber-500" /> Recommendation
              </h4>
              <p className="text-amber-700 dark:text-amber-400 leading-relaxed bg-amber-500/5 p-3 rounded-lg border border-amber-500/20">
                {clause.recommendation}
              </p>
            </div>
          )}


          {clause.finding && (
            <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20 space-y-2">
              <h4 className="font-bold text-[10px] uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" /> Finding: F-{clause.finding.finding_id.slice(0, 8)}
              </h4>
              <div className="flex items-center gap-2 flex-wrap">
                <LifecycleBadge status={clause.finding.lifecycle_status} />
                <SeverityBadge severity={clause.finding.severity} />
              </div>
              {clause.finding.recommendation && (
                <p className="text-[11px] text-foreground/80 leading-relaxed">
                  {clause.finding.recommendation}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap pt-1">
            {clause.finding && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onViewFinding(clause.finding!.finding_id)}
                className="text-[11px] gap-1.5 cursor-pointer h-7 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
              >
                <ArrowRight className="h-3.5 w-3.5" /> View Finding
              </Button>
            )}
            {policyDocId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onViewDocument(policyDocId)}
                className="text-[11px] gap-1.5 cursor-pointer h-7"
              >
                <FileText className="h-3.5 w-3.5" /> View Policy
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => onExploreGraph(clause.regulation_text.slice(0, 60))}
              className="text-[11px] gap-1.5 cursor-pointer h-7 border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
            >
              <Network className="h-3.5 w-3.5" /> Explore Knowledge Graph
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const GapAnalysisWorkspace: React.FC<GapAnalysisWorkspaceProps> = ({
  reportId,
  organizationId,
}) => {
  const router = useRouter();

  const [data, setData] = useState<GapAnalysisResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const loadGapAnalysis = useCallback(async () => {
    if (!reportId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await complianceService.getGapAnalysis(reportId);
      setData(result);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || "Failed to load gap analysis.";
      setError(typeof detail === "string" ? detail : JSON.stringify(detail));
      toast.error("Failed to load gap analysis.");
    } finally {
      setIsLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    loadGapAnalysis();
  }, [loadGapAnalysis]);

  const toggleRow = (clauseId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(clauseId)) next.delete(clauseId);
      else next.add(clauseId);
      return next;
    });
  };

  const filteredClauses = useMemo(() => {
    if (!data?.clauses) return [];
    return data.clauses.filter((c) => {
      const matchesStatus = filterStatus === "ALL" || c.coverage_status === filterStatus;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.regulation_text.toLowerCase().includes(q) ||
        (c.policy_evidence?.toLowerCase().includes(q) ?? false) ||
        c.reasoning.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [data, filterStatus, searchQuery]);

  const handleViewFinding = (findingId: string) => {
    router.push(`/compliance/findings/${findingId}`);
  };

  const handleExploreGraph = (searchTerm: string) => {
    const params = new URLSearchParams();
    if (organizationId) params.set("organization_id", organizationId);
    if (searchTerm) params.set("search", encodeURIComponent(searchTerm));
    router.push(`/knowledge-graph?${params.toString()}`);
  };

  const handleViewDocument = (docId: string) => {
    router.push(`/documents/${docId}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border border-rose-500/30 bg-rose-500/5 p-10 text-center space-y-3">
        <AlertTriangle className="h-10 w-10 text-rose-500 mx-auto" />
        <p className="text-sm font-semibold text-foreground">Gap Analysis Unavailable</p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          {error || "The gap analysis could not be loaded. Ensure the report is completed."}
        </p>
        <Button size="sm" variant="outline" onClick={loadGapAnalysis} className="gap-1.5 cursor-pointer text-xs">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </Card>
    );
  }

  const summary = data.coverage_summary;
  const statusFilters = [
    { value: "ALL", label: `All (${data.clauses.length})` },
    { value: "COVERED", label: `Covered (${summary?.covered ?? 0})` },
    { value: "PARTIALLY_COVERED", label: `Partial (${summary?.partially_covered ?? 0})` },
    { value: "GAP", label: `Gap (${summary?.gap ?? 0})` },
    { value: "UNABLE_TO_DETERMINE", label: `Unable (${summary?.unable_to_determine ?? 0})` },
  ];

  return (
    <div className="space-y-6">
      {/* Stale Banner */}
      {data.is_stale && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Analysis May Be Outdated</p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
              {data.stale_reason || "The source documents have changed since this analysis was run."}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => router.push("/compliance/new")}
            className="shrink-0 text-xs gap-1.5 cursor-pointer bg-amber-500 hover:bg-amber-600 text-white font-semibold"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Run Again
          </Button>
        </div>
      )}

      {/* Coverage Summary */}
      {summary && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-indigo-500" /> Coverage Summary
            <span className="text-muted-foreground/60 normal-case font-normal">
              — {summary.total_requirements} regulation requirements evaluated
            </span>
          </h3>
          <CoverageSummaryCards summary={summary} />
        </div>
      )}

      {/* Regulation & Policy Info */}
      {(data.regulation || data.policy) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.regulation && (
            <Card className="border border-border/60 bg-card p-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-indigo-500" /> Regulation Applied
              </span>
              <p className="text-sm font-bold text-foreground">{data.regulation.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {[data.regulation.jurisdiction, data.regulation.version, data.regulation.act_year].filter(Boolean).join(" · ")}
              </p>
            </Card>
          )}
          {data.policy && (
            <Card className="border border-border/60 bg-card p-4 space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                <FileCheck2 className="h-3.5 w-3.5 text-emerald-500" /> Policy Analyzed
              </span>
              <p className="text-sm font-bold text-foreground truncate">{data.policy.original_filename}</p>
              <p className="text-[11px] text-muted-foreground">{data.policy.document_type}</p>
            </Card>
          )}
        </div>
      )}

      {/* Requirements Table */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <FileCheck2 className="h-4 w-4 text-indigo-500" /> Regulatory Requirements
            {filteredClauses.length !== data.clauses.length && (
              <span className="text-muted-foreground/60 normal-case font-normal">
                — showing {filteredClauses.length} of {data.clauses.length}
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpandedRows(new Set())}
              className="text-[11px] text-muted-foreground cursor-pointer h-7"
            >
              Collapse All
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpandedRows(new Set(filteredClauses.map((c) => c.regulation_clause_id)))}
              className="text-[11px] text-muted-foreground cursor-pointer h-7"
            >
              Expand All
            </Button>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search requirements, evidence, reasoning…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {statusFilters.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilterStatus(f.value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer",
                  filterStatus === f.value
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-muted/20 text-muted-foreground border-border/50 hover:bg-muted/40"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredClauses.length === 0 ? (
          <Card className="border border-dashed border-border/50 p-10 text-center">
            <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">No requirements match</p>
            <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filter.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredClauses.map((clause) => (
              <ClauseRow
                key={clause.regulation_clause_id || String(clause.clause_index)}
                clause={clause}
                isExpanded={expandedRows.has(clause.regulation_clause_id)}
                onToggle={() => toggleRow(clause.regulation_clause_id)}
                onViewFinding={handleViewFinding}
                onExploreGraph={handleExploreGraph}
                onViewDocument={handleViewDocument}
                policyDocId={data.policy?.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer Metadata */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] text-muted-foreground pt-2 border-t border-border/30">
        <div className="flex items-center gap-3 flex-wrap">
          {data.analyzed_at && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Analyzed: {new Date(data.analyzed_at).toLocaleString()}
            </span>
          )}
          {data.processing_time_seconds != null && (
            <span>Processing: {data.processing_time_seconds.toFixed(1)}s</span>
          )}
          <span className="flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-purple-400" />
            Engine: {data.analysis_engine}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground/70 italic">
          * Vector Sim represents semantic retrieval proximity, not a legal compliance percentage.
        </span>
      </div>

    </div>
  );
};
