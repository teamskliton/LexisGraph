"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, AlertTriangle, Calculator, CheckCircle2, Info } from "lucide-react";

interface ComplianceScoreModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  score: number;
  riskLevel: string;
  totalClauses: number;
  compliantCount: number;
  partialCount: number;
  nonCompliantCount: number;
}

export function ComplianceScoreModal({
  open,
  onOpenChange,
  score,
  riskLevel,
  totalClauses,
  compliantCount,
  partialCount,
  nonCompliantCount,
}: ComplianceScoreModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-6 bg-card border-border shadow-2xl rounded-xl">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                How is the Compliance Score Calculated?
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Transparent scoring methodology and risk classification algorithm.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2 text-xs">
          {/* Active Audit Formula Breakdown */}
          <div className="p-4 rounded-xl bg-surface-elevated border border-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Audit Alignment Score</span>
              <span className="text-lg font-extrabold font-mono text-primary">{score.toFixed(1)}%</span>
            </div>

            <div className="p-2.5 rounded-lg bg-background/80 border border-border/60 font-mono text-[11px] text-muted-foreground">
              Score = (Compliant × 1.0 + Partial × 0.5) / Total Clauses × 100
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-[10px] text-muted-foreground block font-sans">Compliant (100%)</span>
                <span className="text-sm font-bold text-emerald-500">{compliantCount}</span>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <span className="text-[10px] text-muted-foreground block font-sans">Partial (50%)</span>
                <span className="text-sm font-bold text-amber-500">{partialCount}</span>
              </div>
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <span className="text-[10px] text-muted-foreground block font-sans">Gaps (0%)</span>
                <span className="text-sm font-bold text-rose-500">{nonCompliantCount}</span>
              </div>
            </div>
          </div>

          {/* Scoring Methodology Details */}
          <div className="space-y-2">
            <h4 className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
              <Info className="h-3.5 w-3.5 text-primary" /> Evaluation Criteria
            </h4>
            <ul className="space-y-1.5 text-muted-foreground list-disc list-inside">
              <li>
                <strong className="text-foreground">Authoritative Statutory Extraction:</strong> Statutory obligations are parsed into clause-level requirements from official regulations.
              </li>
              <li>
                <strong className="text-foreground">GraphRAG Semantic Retrieval:</strong> Relevant internal policy clauses are identified using dense vector embeddings + knowledge graph relations.
              </li>
              <li>
                <strong className="text-foreground">Cross-Verification:</strong> Semantic compliance verification ensures the policy explicitly satisfies statutory mandates without ambiguous gaps.
              </li>
            </ul>
          </div>

          {/* Risk Level Classification */}
          <div className="space-y-2 pt-1">
            <h4 className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Risk Level Classification
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-1">
                <div className="flex items-center gap-1 font-bold text-emerald-500">
                  <ShieldCheck className="h-3.5 w-3.5" /> Low Risk
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Score ≥ 80% with 0 unresolved high-severity statutory gaps.
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-1">
                <div className="flex items-center gap-1 font-bold text-amber-500">
                  <ShieldAlert className="h-3.5 w-3.5" /> Medium Risk
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Score ≥ 50% with ≤ 2 high-severity omissions.
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/5 space-y-1">
                <div className="flex items-center gap-1 font-bold text-rose-500">
                  <AlertTriangle className="h-3.5 w-3.5" /> High Risk
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Score &lt; 50% or &gt; 2 critical statutory omissions identified.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-8 cursor-pointer bg-primary text-primary-foreground hover:bg-primary-hover"
          >
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
