"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  X,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  FileText,
  BookOpen,
  Sparkles,
  Network,
  ExternalLink,
  Copy,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface FindingItem {
  id: string;
  report_id: string;
  policy_clause_id?: string | null;
  regulation_clause_id?: string | null;
  status: string;
  confidence?: number;
  severity: string;
  reasoning?: string | null;
  recommendation?: string | null;
  citation?: string | null;
  matched_policy_text?: string | null;
  graph_path?: any;
  created_at?: string;
}

interface FindingDetailDrawerProps {
  finding: FindingItem | null;
  isOpen: boolean;
  onClose: () => void;
  reportName?: string;
  organizationName?: string;
}

function deriveSeverityBadge(severity?: string, status?: string) {
  const sev = (severity || "").toUpperCase();
  const st = (status || "").toUpperCase();

  if (sev === "CRITICAL" || sev === "HIGH" || st === "NON_COMPLIANT") {
    return {
      label: sev || "HIGH SEVERITY",
      badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
      icon: <ShieldX className="h-4 w-4 text-rose-500" />,
    };
  }
  if (sev === "MEDIUM" || st === "PARTIALLY_COMPLIANT") {
    return {
      label: sev || "MEDIUM SEVERITY",
      badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
      icon: <ShieldAlert className="h-4 w-4 text-amber-500" />,
    };
  }
  return {
    label: sev || "LOW SEVERITY",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />,
  };
}

export const FindingDetailDrawer: React.FC<FindingDetailDrawerProps> = ({
  finding,
  isOpen,
  onClose,
  reportName,
  organizationName,
}) => {
  const router = useRouter();

  if (!isOpen || !finding) return null;

  const severityInfo = deriveSeverityBadge(finding.severity, finding.status);

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard.`);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-background/80 backdrop-blur-xs flex justify-end transition-opacity">
      {/* Backdrop overlay click */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Drawer Body */}
      <div className="relative w-full max-w-2xl bg-card border-l border-border shadow-2xl h-full flex flex-col z-10 overflow-y-auto">
        {/* Drawer Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between p-6 border-b border-border/60 bg-card/95 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Finding Details</h3>
              <p className="text-xs text-muted-foreground">
                ID: <span className="font-mono">{finding.id}</span>
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Close detail drawer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 flex-1">
          {/* Status & Severity Bar */}
          <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-border/60 bg-muted/20 flex-wrap">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn("gap-1 text-xs font-bold px-3 py-1", severityInfo.badgeClass)}>
                {severityInfo.icon}
                <span>{severityInfo.label}</span>
              </Badge>

              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-bold px-3 py-1 uppercase",
                  finding.status === "COMPLIANT"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : finding.status === "PARTIALLY_COMPLIANT"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                )}
              >
                {finding.status}
              </Badge>
            </div>

            {finding.confidence != null && (
              <span className="text-xs font-mono font-bold text-indigo-500">
                Confidence: {(finding.confidence * (finding.confidence <= 1 ? 100 : 1)).toFixed(0)}%
              </span>
            )}
          </div>

          {/* ── Policy Clause Section ── */}
          <Card className="border border-border/60 bg-card p-4 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Policy Clause Reference
              </span>
              {finding.policy_clause_id && (
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  ID: {finding.policy_clause_id}
                </span>
              )}
            </div>
            <p className="text-xs text-foreground font-medium leading-relaxed">
              {finding.matched_policy_text || "No exact matching policy clause text returned."}
            </p>
            {finding.matched_policy_text && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleCopyText(finding.matched_policy_text!, "Policy text")}
                className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer gap-1"
              >
                <Copy className="h-3 w-3" /> Copy Policy Text
              </Button>
            )}
          </Card>

          {/* ── Regulation Clause Section ── */}
          <Card className="border border-border/60 bg-card p-4 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> Statutory Regulation Reference
              </span>
              {finding.regulation_clause_id && (
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  ID: {finding.regulation_clause_id}
                </span>
              )}
            </div>
            <p className="text-xs text-foreground font-medium leading-relaxed">
              {finding.citation || "Statutory regulation clause citation details."}
            </p>
            {finding.citation && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleCopyText(finding.citation!, "Regulation citation")}
                className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer gap-1"
              >
                <Copy className="h-3 w-3" /> Copy Citation
              </Button>
            )}
          </Card>

          {/* ── Explanation Section ── */}
          <Card className="border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-2 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> LLM Legal Reasoning & Analysis
            </span>
            {finding.reasoning ? (
              <p className="text-xs text-foreground leading-relaxed font-medium">
                {finding.reasoning}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No legal reasoning text available for this finding.
              </p>
            )}
          </Card>

          {/* ── Evidence Section ── */}
          <Card className="border border-border/60 bg-card p-4 space-y-2 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-sky-500" /> Evidence & Compliance Citations
            </span>
            {finding.citation || finding.matched_policy_text ? (
              <div className="p-3 rounded-lg bg-muted/30 border border-border/40 text-xs font-mono space-y-1 text-muted-foreground">
                <p>Citation: {finding.citation || "N/A"}</p>
                <p>Policy Match: {finding.matched_policy_text ? "Verified" : "Missing"}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Evidence is not available for this finding.
              </p>
            )}
          </Card>

          {/* ── Knowledge Graph Relationship Preview ── */}
          <Card className="border border-border/60 bg-card p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Network className="h-3.5 w-3.5 text-indigo-500" /> Knowledge Graph Structural Relationship
              </span>
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  const searchTerm = finding.policy_clause_id || finding.regulation_clause_id || "";
                  router.push(searchTerm ? `/knowledge-graph?search=${encodeURIComponent(searchTerm)}` : "/knowledge-graph");
                }}
                className="text-[11px] cursor-pointer gap-1 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
              >
                Explore Knowledge Graph <ArrowRight className="h-3 w-3" />
              </Button>
            </div>

            <div className="p-3 rounded-lg border border-border/40 bg-muted/20 flex items-center justify-around text-center text-xs font-mono">
              <div className="p-2 rounded bg-background border border-border/40">
                <span className="text-[10px] text-muted-foreground block">POLICY</span>
                <span className="font-bold text-foreground">
                  {finding.policy_clause_id || "Policy Clause"}
                </span>
              </div>
              <div className="text-indigo-500 font-bold text-[10px] px-2">
                ── EVALUATED AGAINST ──►
              </div>
              <div className="p-2 rounded bg-background border border-border/40">
                <span className="text-[10px] text-muted-foreground block">REGULATION</span>
                <span className="font-bold text-foreground">
                  {finding.regulation_clause_id || "Regulation Clause"}
                </span>
              </div>
            </div>
          </Card>

          {/* ── Recommendation Section ── */}
          <Card className="border border-amber-500/20 bg-amber-500/5 p-4 space-y-2 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Recommended Remediation
            </span>
            {finding.recommendation ? (
              <p className="text-xs text-amber-900 dark:text-amber-200 font-medium leading-relaxed">
                {finding.recommendation}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No specific remediation recommendation provided for this clause.
              </p>
            )}
          </Card>
        </div>

        {/* Drawer Footer Actions */}
        <div className="sticky bottom-0 z-20 p-4 border-t border-border/60 bg-card/95 backdrop-blur-md flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs cursor-pointer"
          >
            Close
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/compliance/reports/${finding.report_id}`)}
              className="text-xs cursor-pointer gap-1"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open Report
            </Button>

            <Button
              size="sm"
              onClick={() => {
                const searchTerm = finding.policy_clause_id || finding.regulation_clause_id || "";
                router.push(searchTerm ? `/knowledge-graph?search=${encodeURIComponent(searchTerm)}` : "/knowledge-graph");
              }}
              className="text-xs cursor-pointer gap-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              <Network className="h-3.5 w-3.5" /> Explore Graph
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
