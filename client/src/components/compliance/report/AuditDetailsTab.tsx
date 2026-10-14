"use client";

import React, { useState } from "react";
import { format, differenceInSeconds } from "date-fns";
import { toast } from "sonner";
import {
  FileText,
  Copy,
  Check,
  Clock,
  Layers,
  Database,
  Network,
  Cpu,
  Calendar,
  Building2,
  BookOpen,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AuditDetailsTabProps {
  reportId: string;
  organizationId?: string;
  organizationName?: string;
  policyDocumentId?: string;
  policyName?: string;
  regulationDocumentId?: string;
  regulationName?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  totalClauses?: number;
}

export function AuditDetailsTab({
  reportId,
  organizationId,
  organizationName,
  policyDocumentId,
  policyName,
  regulationDocumentId,
  regulationName,
  status,
  createdAt,
  updatedAt,
  totalClauses,
}: AuditDetailsTabProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Identifier copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const createdFormatted = createdAt
    ? format(new Date(createdAt), "MMMM d, yyyy · HH:mm:ss 'UTC'")
    : "—";
  const completedFormatted = updatedAt
    ? format(new Date(updatedAt), "MMMM d, yyyy · HH:mm:ss 'UTC'")
    : createdFormatted;

  const durationSecs =
    createdAt && updatedAt
      ? Math.max(0, differenceInSeconds(new Date(updatedAt), new Date(createdAt)))
      : 0;

  const durationText =
    durationSecs < 60
      ? `${durationSecs} seconds`
      : `${Math.floor(durationSecs / 60)}m ${durationSecs % 60}s`;

  return (
    <div className="space-y-6">
      {/* 2-Column Grid: Report Info & Execution Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Report Information */}
        <Card className="p-5 border-border bg-card shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-border/50 pb-3">
            <Database className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Report Identification & Tenancy
            </h3>
          </div>

          <div className="space-y-3 text-xs divide-y divide-border/30">
            {/* Report ID */}
            <div className="pt-2 first:pt-0 flex items-center justify-between gap-3">
              <span className="text-muted-foreground font-medium">Report UUID</span>
              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-foreground">{reportId}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleCopy(reportId, "reportId")}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Copy Report UUID"
                >
                  {copiedKey === "reportId" ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>

            {/* Organization */}
            <div className="pt-2.5 flex items-center justify-between gap-3">
              <span className="text-muted-foreground font-medium">Organization Workspace</span>
              <span className="text-foreground font-semibold">{organizationName || "TechNova Solutions"}</span>
            </div>

            {/* Organization ID */}
            {organizationId && (
              <div className="pt-2.5 flex items-center justify-between gap-3">
                <span className="text-muted-foreground font-medium">Organization UUID</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="text-foreground">{organizationId}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleCopy(organizationId, "orgId")}
                    className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                    title="Copy Organization UUID"
                  >
                    {copiedKey === "orgId" ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Execution Status */}
            <div className="pt-2.5 flex items-center justify-between gap-3">
              <span className="text-muted-foreground font-medium">Audit Pipeline Status</span>
              <Badge variant="outline" className="text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                {status}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Card 2: Analysis Configuration & Engine */}
        <Card className="p-5 border-border bg-card shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-border/50 pb-3">
            <Cpu className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Analysis Configuration & Engine
            </h3>
          </div>

          <div className="space-y-3 text-xs divide-y divide-border/30">
            {/* Policy ID */}
            <div className="pt-2 first:pt-0 flex items-center justify-between gap-3">
              <span className="text-muted-foreground font-medium">Evaluated Policy</span>
              <div className="text-right">
                <span className="text-foreground font-semibold block">{policyName || "Corporate Policy"}</span>
                {policyDocumentId && (
                  <span className="font-mono text-[10px] text-muted-foreground">{policyDocumentId}</span>
                )}
              </div>
            </div>

            {/* Regulation ID */}
            <div className="pt-2.5 flex items-center justify-between gap-3">
              <span className="text-muted-foreground font-medium">Authoritative Regulation</span>
              <div className="text-right">
                <span className="text-foreground font-semibold block">{regulationName || "Statutory Act"}</span>
                {regulationDocumentId && (
                  <span className="font-mono text-[10px] text-muted-foreground">{regulationDocumentId}</span>
                )}
              </div>
            </div>

            {/* Engine Version */}
            <div className="pt-2.5 flex items-center justify-between gap-3">
              <span className="text-muted-foreground font-medium">Compliance Engine</span>
              <span className="font-mono text-primary font-bold">LexisGraph GraphRAG v2.4</span>
            </div>

            {/* Verification Scope */}
            <div className="pt-2.5 flex items-center justify-between gap-3">
              <span className="text-muted-foreground font-medium">Evaluated Scope</span>
              <span className="text-foreground font-medium">
                {totalClauses || "All"} Statutory Provisions (Dense Embeddings + Graph Traversal)
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Execution Milestones Timeline Card */}
      <Card className="p-5 border-border bg-card shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border/50 pb-3">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Execution Timestamps & Performance
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-lg border border-border/50 bg-surface-elevated space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Job Queued & Started
            </span>
            <p className="font-semibold text-foreground font-mono">{createdFormatted}</p>
          </div>

          <div className="p-3.5 rounded-lg border border-border/50 bg-surface-elevated space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Analysis Completed
            </span>
            <p className="font-semibold text-foreground font-mono">{completedFormatted}</p>
          </div>

          <div className="p-3.5 rounded-lg border border-border/50 bg-surface-elevated space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Total Processing Duration
            </span>
            <p className="font-bold text-primary font-mono text-sm">{durationText}</p>
          </div>
        </div>
      </Card>

      {/* Evidence Provenance & Audit Trail */}
      <Card className="p-5 border-border bg-card shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border/50 pb-3">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Evidence Provenance & Verification Trail
          </h3>
        </div>

        <div className="relative pl-6 space-y-4 text-xs before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
          <div className="relative space-y-1">
            <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-card" />
            <h4 className="font-semibold text-foreground">1. Authoritative Statutory Intake</h4>
            <p className="text-muted-foreground text-[11px]">
              Statutory act ingested, clause structure segmented, and canonical requirements verified in PostgreSQL.
            </p>
          </div>

          <div className="relative space-y-1">
            <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-card" />
            <h4 className="font-semibold text-foreground">2. Dense Vector Semantic Indexing</h4>
            <p className="text-muted-foreground text-[11px]">
              Document clauses embedded into dense high-dimensional vectors and indexed within Qdrant vector store.
            </p>
          </div>

          <div className="relative space-y-1">
            <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-card" />
            <h4 className="font-semibold text-foreground">3. Knowledge Graph Entity Extraction</h4>
            <p className="text-muted-foreground text-[11px]">
              Legal concepts, statutory mandates, and policy obligations linked via semantic edges in Neo4j knowledge graph.
            </p>
          </div>

          <div className="relative space-y-1">
            <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-card" />
            <h4 className="font-semibold text-foreground">4. Cross-Verification & Severity Scoring</h4>
            <p className="text-muted-foreground text-[11px]">
              Automated compliance verification evaluated internal policy coverage against statutory mandates.
            </p>
          </div>

          <div className="relative space-y-1">
            <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-card" />
            <h4 className="font-semibold text-foreground">5. Immutable Audit Report Persistence</h4>
            <p className="text-muted-foreground text-[11px]">
              Report record compiled with verified score, risk classification, and individual finding records stored in PostgreSQL.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
