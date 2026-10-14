"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Network,
  BookOpen,
  FileText,
  Search,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Layers,
  Sparkles,
  Link2,
  ShieldCheck,
  Eye,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FindingItem } from "@/components/compliance/FindingDetailDrawer";

interface EvidenceItem {
  id: string;
  regulationClauseId: string;
  regulationText: string;
  matchedPolicyClauseId?: string | null;
  matchedPolicyText?: string | null;
  similarityScore: number;
  graphScore?: number;
  status: "COMPLIANT" | "PARTIALLY_COMPLIANT" | "NON_COMPLIANT";
  reasoning: string;
  recommendation?: string | null;
  associatedFinding?: FindingItem;
}

interface EvidenceTabProps {
  evidenceList: EvidenceItem[];
  regulationName?: string;
  policyName?: string;
  onSelectFinding: (finding: FindingItem) => void;
}

export function EvidenceTab({
  evidenceList,
  regulationName,
  policyName,
  onSelectFinding,
}: EvidenceTabProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "COMPLIANT" | "PARTIAL" | "MISSING">("ALL");
  const [selectedId, setSelectedId] = useState<string>(evidenceList[0]?.id || "");

  // Filter evidence
  const filteredList = useMemo(() => {
    return evidenceList.filter((item) => {
      if (filterType === "COMPLIANT" && item.status !== "COMPLIANT") return false;
      if (filterType === "PARTIAL" && item.status !== "PARTIALLY_COMPLIANT") return false;
      if (filterType === "MISSING" && item.status !== "NON_COMPLIANT") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const clauseMatch = item.regulationClauseId.toLowerCase().includes(q);
        const regMatch = item.regulationText.toLowerCase().includes(q);
        const polMatch = (item.matchedPolicyText || "").toLowerCase().includes(q);
        const reasonMatch = item.reasoning.toLowerCase().includes(q);
        if (!clauseMatch && !regMatch && !polMatch && !reasonMatch) return false;
      }

      return true;
    });
  }, [evidenceList, filterType, searchQuery]);

  // Selected item
  const selectedItem = useMemo(() => {
    return filteredList.find((i) => i.id === selectedId) || filteredList[0] || null;
  }, [filteredList, selectedId]);

  return (
    <div className="space-y-4">
      {/* Evidence Banner */}
      <Card className="p-4 border-border bg-card shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-accent/10 text-accent border border-accent/20">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              GraphRAG Evidence Explorer
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Inspect semantic vector similarity, statutory provisions, and knowledge graph linkages.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/knowledge-graph")}
          className="text-xs h-8 gap-1.5 text-accent border-accent/40 hover:bg-accent/10 cursor-pointer self-start sm:self-auto"
        >
          <Network className="h-3.5 w-3.5" />
          <span>Explore Knowledge Graph</span>
          <ArrowRight className="h-3 w-3" />
        </Button>
      </Card>

      {/* ── TWO-PANEL EXPLORER ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Panel: Evidence List (5 cols) */}
        <Card className="lg:col-span-5 p-4 border-border bg-card shadow-xs space-y-3 flex flex-col h-[700px]">
          {/* Search & Quick Filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search evidence clauses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-surface-elevated border-border"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setFilterType("ALL")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors",
                  filterType === "ALL"
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-elevated text-muted-foreground hover:text-foreground"
                )}
              >
                All ({evidenceList.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("MISSING")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors",
                  filterType === "MISSING"
                    ? "bg-rose-500 text-white"
                    : "bg-surface-elevated text-muted-foreground hover:text-foreground"
                )}
              >
                Gaps
              </button>
              <button
                type="button"
                onClick={() => setFilterType("PARTIAL")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors",
                  filterType === "PARTIAL"
                    ? "bg-amber-500 text-black"
                    : "bg-surface-elevated text-muted-foreground hover:text-foreground"
                )}
              >
                Partial
              </button>
              <button
                type="button"
                onClick={() => setFilterType("COMPLIANT")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors",
                  filterType === "COMPLIANT"
                    ? "bg-emerald-500 text-white"
                    : "bg-surface-elevated text-muted-foreground hover:text-foreground"
                )}
              >
                Compliant
              </button>
            </div>
          </div>

          {/* Scrollable Items List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-border/20">
            {filteredList.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No supporting evidence items match your filter.
              </div>
            ) : (
              filteredList.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      "p-3 rounded-lg border transition-all cursor-pointer space-y-1.5 text-xs",
                      isSelected
                        ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                        : "border-border/60 bg-surface-elevated hover:border-border hover:bg-muted/30"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {item.status === "COMPLIANT" ? (
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : item.status === "PARTIALLY_COMPLIANT" ? (
                          <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                        )}
                        <span className="font-mono text-[11px] font-bold text-foreground">
                          {item.regulationClauseId}
                        </span>
                      </div>

                      <span className="font-mono text-[11px] font-bold text-primary">
                        {(item.similarityScore * 100).toFixed(0)}% match
                      </span>
                    </div>

                    <p className="text-muted-foreground line-clamp-2 leading-relaxed">
                      {item.regulationText}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Right Panel: Evidence Details (7 cols) */}
        <Card className="lg:col-span-7 p-6 border-border bg-card shadow-xs flex flex-col h-[700px] overflow-y-auto space-y-5">
          {!selectedItem ? (
            <div className="my-auto text-center space-y-2">
              <Network className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
              <p className="text-xs text-muted-foreground">
                Select an evidence item on the left to inspect statutory clauses and policy mapping.
              </p>
            </div>
          ) : (
            <>
              {/* Header Info */}
              <div className="flex items-center justify-between pb-3 border-b border-border/50">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Statutory Provision
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] font-bold px-2 py-0.5 uppercase",
                        selectedItem.status === "COMPLIANT"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                          : selectedItem.status === "PARTIALLY_COMPLIANT"
                          ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                          : "bg-rose-500/10 text-rose-500 border-rose-500/30"
                      )}
                    >
                      {selectedItem.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <h3 className="text-base font-bold text-foreground font-mono">
                    Clause #{selectedItem.regulationClauseId}
                  </h3>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground block uppercase font-bold">
                    Vector Similarity
                  </span>
                  <span className="text-xl font-extrabold font-mono text-primary">
                    {(selectedItem.similarityScore * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Block 1: Statutory Requirement Text */}
              <div className="p-4 rounded-xl bg-surface-elevated border border-border space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-primary flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5" />
                    Statutory Act Requirement ({regulationName || "Authoritative Regulation"})
                  </span>
                </div>
                <p className="text-foreground leading-relaxed font-medium">
                  {selectedItem.regulationText}
                </p>
              </div>

              {/* Block 2: Internal Policy Text */}
              <div className="p-4 rounded-xl bg-surface-elevated border border-border space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-secondary-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    Internal Corporate Policy ({policyName || "Corporate Policy"})
                  </span>
                  {selectedItem.matchedPolicyClauseId && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      ID: {selectedItem.matchedPolicyClauseId}
                    </span>
                  )}
                </div>

                {selectedItem.matchedPolicyText ? (
                  <p className="text-muted-foreground leading-relaxed">
                    {selectedItem.matchedPolicyText}
                  </p>
                ) : (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>No matching clause found in corporate policy addressing this mandate.</span>
                  </div>
                )}
              </div>

              {/* Block 3: GraphRAG Relationship & Reasoning */}
              <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 space-y-2 text-xs">
                <span className="text-[10px] uppercase font-bold text-accent flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  Semantic & Legal Reasoning
                </span>
                <p className="text-foreground leading-relaxed">
                  {selectedItem.reasoning}
                </p>
              </div>

              {/* Block 4: Recommendation if available */}
              {selectedItem.recommendation && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2 text-xs">
                  <span className="text-[10px] uppercase font-bold text-amber-500 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Actionable Remediation Guidance
                  </span>
                  <p className="text-amber-900 dark:text-amber-200 leading-relaxed font-medium">
                    {selectedItem.recommendation}
                  </p>
                </div>
              )}

              {/* Actions Footer */}
              <div className="pt-2 flex items-center justify-between gap-3 border-t border-border/50">
                {selectedItem.associatedFinding ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSelectFinding(selectedItem.associatedFinding!)}
                    className="text-xs h-8 gap-1.5 border-primary/30 text-primary cursor-pointer"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Open Finding Details</span>
                  </Button>
                ) : (
                  <div />
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/knowledge-graph")}
                  className="text-xs h-8 gap-1.5 text-accent border-accent/30 hover:bg-accent/10 cursor-pointer"
                >
                  <Network className="h-3.5 w-3.5" />
                  <span>Inspect in Knowledge Graph</span>
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
