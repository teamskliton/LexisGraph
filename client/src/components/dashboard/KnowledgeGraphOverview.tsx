"use client";

/**
 * KnowledgeGraphOverview
 *
 * Compact dashboard card showing the health and structural status of
 * the LexisGraph compliance knowledge graph.
 *
 * Design rules:
 *  - Shadcn/ui Card primitives (Card, CardHeader, CardContent, CardFooter)
 *  - No gradients, no glass, no heavy animations
 *  - Relationship diagram: pure HTML/CSS — no SVG library
 *  - No new dependencies
 *
 * Props
 * ─────
 *  kpis        KpiStats | undefined   From the existing dashboard stats query
 *  isLoading   boolean                Show skeleton while data is loading
 *  onExplore   () => void             "Explore Knowledge Graph" CTA handler
 */

import React from "react";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiStats } from "@/types/dashboard";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface KnowledgeGraphOverviewProps {
  kpis?: KpiStats;
  isLoading: boolean;
  onExplore: () => void;
}

// ─── MetricRow ────────────────────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  const isEmpty = value === "—";
  return (
    <div className="flex items-baseline justify-between py-1 border-b border-border/40 last:border-0">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-xs font-semibold",
          mono && "font-mono tabular-nums tracking-tight",
          isEmpty ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ─── RelationshipDiagram ──────────────────────────────────────────────────────
// Pure CSS — DOC → POL → REG — zero SVG or graph library.

const DIAGRAM_NODES = [
  { abbr: "DOC", label: "Document",   color: "text-indigo-600 dark:text-indigo-400",  border: "border-indigo-300 dark:border-indigo-700",  bg: "bg-indigo-500/8" },
  { abbr: "POL", label: "Policy",     color: "text-violet-600 dark:text-violet-400",  border: "border-violet-300 dark:border-violet-700",  bg: "bg-violet-500/8" },
  { abbr: "REG", label: "Regulation", color: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-300 dark:border-emerald-700", bg: "bg-emerald-500/8" },
];

function RelationshipDiagram() {
  return (
    <div
      role="img"
      aria-label="Knowledge graph relationship flow: Document → Policy → Regulation"
      className="flex items-center justify-center gap-0 py-1"
    >
      {DIAGRAM_NODES.map((node, i) => (
        <React.Fragment key={node.abbr}>
          {/* Node */}
          <div className="flex flex-col items-center gap-0.5">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border font-mono text-[9px] font-bold tracking-wide",
                node.bg,
                node.border,
                node.color
              )}
            >
              {node.abbr}
            </div>
            <span className="text-[8px] text-muted-foreground font-medium">
              {node.label}
            </span>
          </div>

          {/* Arrow connector */}
          {i < DIAGRAM_NODES.length - 1 && (
            <div
              aria-hidden="true"
              className="flex items-center pb-[12px] px-1"
            >
              <div className="h-px w-4 bg-border" />
              <div
                className="border-t-[3.5px] border-b-[3.5px] border-l-[4.5px] border-t-transparent border-b-transparent border-l-border"
                style={{ width: 0, height: 0 }}
              />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── StatusRow ────────────────────────────────────────────────────────────────

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5 py-0">
      <span
        className={cn(
          "font-mono text-[10px] font-bold w-3 text-center shrink-0",
          ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
        )}
      >
        {ok ? "✓" : "○"}
      </span>
      <span className="text-[10px] text-muted-foreground font-medium">
        {label}
      </span>
    </div>
  );
}

// ─── Skeleton State ───────────────────────────────────────────────────────────

function KnowledgeGraphOverviewSkeleton() {
  return (
    <Card className="flex flex-col">
      <CardHeader className="px-4 pt-3.5 pb-2.5 border-b border-border/40">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <Skeleton className="h-2.5 w-20 rounded" />
            <Skeleton className="h-4 w-44 rounded" />
            <Skeleton className="h-3 w-52 rounded mt-0.5" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full shrink-0" />
        </div>
      </CardHeader>
      <CardContent className="px-4 py-2.5 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between py-0.5">
            <Skeleton className="h-3 w-28 rounded" />
            <Skeleton className="h-3 w-12 rounded" />
          </div>
        ))}
        <Skeleton className="h-14 w-full rounded-lg mt-2" />
        <Skeleton className="h-12 w-full rounded-lg mt-1.5" />
      </CardContent>
      <CardFooter className="px-4 py-2.5 border-t border-border/40">
        <Skeleton className="h-7 w-full rounded-lg" />
      </CardFooter>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function KnowledgeGraphOverview({
  kpis,
  isLoading,
  onExplore,
}: KnowledgeGraphOverviewProps) {
  if (isLoading) return <KnowledgeGraphOverviewSkeleton />;

  const totalRegs    = kpis?.total_regulations   ?? 0;
  const totalPolicies = kpis?.total_policies      ?? 0;
  const totalOrgs    = kpis?.total_organizations  ?? 0;
  const totalReports = kpis?.total_compliance_reports ?? 0;

  // Connected entities: orgs + regulations + policies as graph nodes
  const connectedEntities = totalOrgs + totalRegs + totalPolicies;

  const hasData = kpis != null && (totalRegs > 0 || totalPolicies > 0 || totalOrgs > 0);

  const mappingStatus  = hasData ? "Indexed" : "Pending";
  const graphHealthy   = hasData;
  const relsIndexed    = hasData && connectedEntities > 0;
  const readyForAI     = graphHealthy && relsIndexed && totalReports > 0;

  return (
    <Card className="flex flex-col">
      {/* ── Header ───────────────────────────────────────── */}
      <CardHeader className="px-4 pt-3.5 pb-2.5 border-b border-border/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-0.5">
              Graph Intelligence
            </p>
            <h3 className="text-sm font-semibold text-foreground leading-tight">
              Knowledge Graph Overview
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              Document relationships and regulatory mapping.
            </p>
          </div>

          {/* Mapping status badge */}
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold shrink-0",
              hasData
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                hasData ? "bg-emerald-500" : "bg-muted-foreground"
              )}
            />
            {mappingStatus}
          </span>
        </div>
      </CardHeader>

      {/* ── Body ─────────────────────────────────────────── */}
      <CardContent className="flex-1 px-4 py-2.5 space-y-2">

        {/* Metrics — or graceful empty state */}
        {!hasData ? (
          <p className="text-[11px] font-mono text-muted-foreground text-center py-2 leading-relaxed">
            Data will appear after additional document ingestion.
          </p>
        ) : (
          <div>
            <MetricRow label="Indexed Documents"   value={totalPolicies + totalRegs} mono />
            <MetricRow label="Indexed Regulations" value={totalRegs}      mono />
            <MetricRow label="Internal Policies"   value={totalPolicies}  mono />
            <MetricRow label="Connected Entities"  value={connectedEntities} mono />
            <MetricRow label="Mapping Status"      value={mappingStatus} />
            <MetricRow label="Compliance Reports"  value={totalReports}   mono />
          </div>
        )}

        {/* Relationship flow diagram */}
        <div className="rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-0.5">
            Relationship Flow
          </p>
          <RelationshipDiagram />
        </div>

        {/* System status */}
        <div className="rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">
            System Status
          </p>
          <StatusRow label="Graph Healthy"          ok={graphHealthy} />
          <StatusRow label="Relationships Indexed"  ok={relsIndexed} />
          <StatusRow label="Ready for AI Retrieval" ok={readyForAI} />
        </div>
      </CardContent>

      {/* ── Footer ───────────────────────────────────────── */}
      <CardFooter className="px-4 py-2.5 border-t border-border/40 flex flex-col gap-1.5">
        <Button
          variant="outline"
          className="w-full text-xs h-8 font-semibold border-primary/25 text-primary hover:bg-primary/5 cursor-pointer"
          onClick={onExplore}
        >
          Explore Knowledge Graph
        </Button>
        <p className="text-[10px] font-mono text-muted-foreground text-center leading-relaxed">
          Used by GraphRAG during AI compliance analysis.
        </p>
      </CardFooter>
    </Card>
  );
}

export default KnowledgeGraphOverview;
