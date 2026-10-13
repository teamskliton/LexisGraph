"use client";

import React from "react";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GraphOverviewStats, KpiStats } from "@/types/dashboard";
import { Network, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface KnowledgeGraphOverviewProps {
  graphOverview?: GraphOverviewStats;
  kpis?: KpiStats;
  isLoading: boolean;
  onExplore: () => void;
}

function MetricRow({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-xs font-semibold text-foreground",
          mono && "font-mono tabular-nums tracking-tight"
        )}
      >
        {value}
      </span>
    </div>
  );
}

const DIAGRAM_NODES = [
  { abbr: "DOC", label: "Document", color: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-500/30", bg: "bg-indigo-500/10" },
  { abbr: "POL", label: "Policy", color: "text-violet-600 dark:text-violet-400", border: "border-violet-500/30", bg: "bg-violet-500/10" },
  { abbr: "REG", label: "Regulation", color: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/10" },
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
            <span className="text-[9px] text-muted-foreground font-medium">
              {node.label}
            </span>
          </div>

          {i < DIAGRAM_NODES.length - 1 && (
            <div aria-hidden="true" className="flex items-center pb-[14px] px-2">
              <div className="h-px w-5 bg-border" />
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

export const KnowledgeGraphOverview: React.FC<KnowledgeGraphOverviewProps> = ({
  graphOverview,
  kpis,
  isLoading,
  onExplore,
}) => {
  if (isLoading) {
    return (
      <Card className="border border-border/50 bg-card shadow-2xs h-full flex flex-col justify-between">
        <CardHeader className="py-3.5 px-5 border-b border-border/40">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <Skeleton className="h-4 w-40 rounded" />
              <Skeleton className="h-3 w-52 rounded" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </CardHeader>
        <CardContent className="px-5 py-4 space-y-3 flex-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between py-1 border-b border-border/30">
              <Skeleton className="h-3 w-32 rounded" />
              <Skeleton className="h-3 w-12 rounded" />
            </div>
          ))}
          <Skeleton className="h-20 w-full rounded-lg mt-3" />
        </CardContent>
        <CardFooter className="py-2.5 px-5 border-t border-border/40">
          <Skeleton className="h-8 w-full rounded-lg" />
        </CardFooter>
      </Card>
    );
  }

  // Real organization graph metrics
  const indexedRegs = graphOverview?.indexed_regulations ?? kpis?.total_regulations ?? 0;
  const indexedPols = graphOverview?.indexed_policies ?? kpis?.total_policies ?? 0;
  const connectedEntities = graphOverview?.connected_entities ?? (indexedRegs + indexedPols + (kpis?.total_compliance_reports ?? 0));
  const unmappedPolicies = graphOverview?.unmapped_policies ?? 0;
  const mappingStatus = graphOverview?.mapping_status ?? (indexedRegs > 0 || indexedPols > 0 ? "Active" : "Pending");

  const hasData = indexedRegs > 0 || indexedPols > 0;

  return (
    <Card className="border border-border/50 bg-card shadow-2xs h-full flex flex-col justify-between">
      {/* ── Card Header ── */}
      <CardHeader className="py-3.5 px-5 border-b border-border/40 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Network className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground leading-tight">
                Knowledge Graph Overview
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed truncate">
                GraphRAG statutory mapping for this workspace
              </p>
            </div>
          </div>

          {/* Compact Graph Status Indicator */}
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold shrink-0 border",
              hasData
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-muted text-muted-foreground border-border/50"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                hasData ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
              )}
            />
            {mappingStatus}
          </span>
        </div>
      </CardHeader>

      {/* ── Card Content ── */}
      <CardContent className="px-5 py-4 flex-1 flex flex-col justify-between space-y-3">
        {/* Core Organization-Specific Graph Metrics */}
        <div className="space-y-0.5">
          <MetricRow label="Indexed Regulations" value={indexedRegs} />
          <MetricRow label="Indexed Internal Policies" value={indexedPols} />
          <MetricRow label="Connected Entities & Relations" value={connectedEntities} />
          <MetricRow label="Unmapped Policies" value={unmappedPolicies} />
        </div>

        {/* Relationship Flow diagram */}
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground mb-1 text-center">
            Graph Entity Mapping Flow
          </p>
          <RelationshipDiagram />
        </div>
      </CardContent>

      {/* ── Card Footer ── */}
      <CardFooter className="py-2.5 px-5 border-t border-border/40 bg-muted/20 flex flex-col gap-1.5 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-8 font-semibold border-primary/25 text-primary hover:bg-primary/5 cursor-pointer"
          onClick={onExplore}
        >
          <span>Explore Knowledge Graph</span>
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </CardFooter>
    </Card>
  );
};

export default KnowledgeGraphOverview;
