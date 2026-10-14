"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Download,
  Sparkles,
  Share2,
  Copy,
  Check,
  FileCode,
  FileSpreadsheet,
  MoreVertical,
  Building2,
  BookOpen,
  FileText,
  Clock,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/compliance/shared/StatusBadge";
import { cn } from "@/lib/utils";

interface ReportHeaderProps {
  reportId: string;
  organizationName?: string;
  organizationId?: string;
  policyName?: string;
  regulationName?: string;
  status: string;
  riskLevel?: string;
  score: number;
  createdAt?: string;
  updatedAt?: string;
  onExportPDF: () => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onShare: () => void;
}

export function ReportHeader({
  reportId,
  organizationName,
  organizationId,
  policyName,
  regulationName,
  status,
  riskLevel,
  score,
  createdAt,
  updatedAt,
  onExportPDF,
  onExportJSON,
  onExportCSV,
  onShare,
}: ReportHeaderProps) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState(false);

  const shortId = reportId ? reportId.slice(0, 8) : "";
  const createdDate = createdAt ? format(new Date(createdAt), "MMM d, yyyy · HH:mm") : "—";

  const handleCopyId = () => {
    navigator.clipboard.writeText(reportId);
    setCopiedId(true);
    toast.success("Report ID copied to clipboard");
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleAskAI = () => {
    const question = `What are the critical compliance gaps and recommended remediation steps for ${policyName || "the internal policy"} under ${regulationName || "the evaluated statutory regulation"}?`;
    router.push(
      `/ai-assistant?reportId=${reportId}${organizationId ? `&orgId=${organizationId}` : ""}&question=${encodeURIComponent(question)}`
    );
  };

  const riskBadgeClass =
    riskLevel === "LOW"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
      : riskLevel === "MEDIUM"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
      : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";

  return (
    <div className="space-y-4">
      {/* Top back navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/reports")}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1.5 -ml-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Compliance Reports
        </Button>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-primary/30 text-primary bg-primary/10 text-[11px] font-semibold px-2.5 py-0.5"
          >
            Audit Assessment
          </Badge>
          <StatusBadge status={status as any} />
        </div>
      </div>

      {/* Main Header Card */}
      <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          {/* Left Metadata Block */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                Statutory Compliance Audit
              </h1>
              <Badge variant="outline" className={cn("text-xs font-bold px-2.5 py-0.5", riskBadgeClass)}>
                {riskLevel || (score >= 80 ? "LOW RISK" : score >= 50 ? "MEDIUM RISK" : "HIGH RISK")}
              </Badge>
              <span className="font-mono text-sm font-bold text-primary">
                {score.toFixed(1)}% Score
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              Compliance assessment for{" "}
              <strong className="text-foreground font-semibold">
                {organizationName || "TechNova Solutions Pvt. Ltd."}
              </strong>
            </p>

            {/* Structured Meta Badges */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap pt-1">
              <button
                type="button"
                onClick={handleCopyId}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors font-mono text-[11px] border border-border/50 cursor-pointer"
                title="Click to copy full Report ID"
              >
                <span>Report #{shortId}</span>
                {copiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              </button>

              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                {createdDate}
              </span>

              {regulationName && (
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5 text-primary" />
                  <span className="text-foreground font-medium">{regulationName}</span>
                </span>
              )}

              {policyName && (
                <span className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5 text-secondary-foreground" />
                  <span className="text-foreground font-medium">{policyName}</span>
                </span>
              )}
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAskAI}
              className="text-xs h-9 cursor-pointer gap-1.5 border-accent/40 text-accent hover:bg-accent/10 font-semibold"
            >
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Ask AI
            </Button>

            <Button
              size="sm"
              onClick={onExportPDF}
              className="text-xs h-9 cursor-pointer gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </Button>

            {/* Overflow Action Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
                title="More actions"
              >
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 text-xs bg-card border-border">
                <DropdownMenuItem onClick={onShare} className="cursor-pointer gap-2">
                  <Share2 className="h-3.5 w-3.5 text-primary" />
                  Share Audit Report
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportJSON} className="cursor-pointer gap-2">
                  <FileCode className="h-3.5 w-3.5 text-emerald-500" />
                  Export Raw JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportCSV} className="cursor-pointer gap-2">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-amber-500" />
                  Export Clauses CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleCopyId} className="cursor-pointer gap-2">
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  Copy Report UUID
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
