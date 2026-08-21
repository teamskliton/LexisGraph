// ShareReportModal — Comprehensive Modal for Sharing Statutory Compliance Audits
// Supports Direct Link Copy (with fallback), Native Web Share API, Formatted Summary Copy, and Email Sharing.

"use client";

import React, { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Share2,
  Copy,
  Check,
  Mail,
  ExternalLink,
  ShieldCheck,
  FileText,
  Sparkles,
  Building2,
  Layers,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/components/compliance/shared/RiskBadge";
import type { ComplianceReport } from "@/services/api/compliance";

export interface ShareReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: ComplianceReport | null;
  reportId?: string;
  organizationName?: string | null;
  regulationName?: string | null;
  policyName?: string | null;
  overallScore?: number | null;
  riskLevel?: string | null;
  compliantCount?: number | null;
  partialCount?: number | null;
  gapCount?: number | null;
  totalClauses?: number | null;
}

/**
 * Robust clipboard copy helper with legacy textarea fallback
 * Ensures copying works on HTTP, localhost, and non-standard browser contexts.
 */
async function robustCopyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // 1. Try Modern Clipboard API
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy fallback
    }
  }

  // 2. Fallback: Hidden Textarea ExecCommand
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    textArea.setAttribute("readonly", "");
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error("Clipboard copy error:", err);
    return false;
  }
}

export const ShareReportModal: React.FC<ShareReportModalProps> = ({
  open,
  onOpenChange,
  report,
  reportId: propReportId,
  organizationName,
  regulationName,
  policyName,
  overallScore: propScore,
  riskLevel: propRiskLevel,
  compliantCount: propCompliant,
  partialCount: propPartial,
  gapCount: propGap,
  totalClauses: propTotal,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const reportId = report?.id || propReportId || "";
  const score = report?.overall_score ?? propScore ?? 85;
  const riskLevel = report?.risk_level || propRiskLevel || (score >= 80 ? "LOW" : score >= 50 ? "MEDIUM" : "HIGH");
  const total = report?.details?.total_regulation_clauses ?? (report?.total_matches != null ? (report.total_matches + (report.total_partial_matches || 0) + (report.total_missing || 0)) : null) ?? propTotal ?? 0;
  const compliant = report?.details?.compliant_count ?? report?.total_matches ?? propCompliant ?? 0;
  const partial = report?.details?.partially_compliant_count ?? report?.total_partial_matches ?? propPartial ?? 0;
  const nonCompliant = report?.details?.non_compliant_count ?? report?.total_missing ?? propGap ?? 0;

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    if (reportId) {
      return `${window.location.origin}/compliance/reports/${reportId}`;
    }
    return window.location.href;
  }, [reportId]);

  const summaryText = useMemo(() => {
    const lines = [
      `🛡️ Statutory Compliance Audit Summary — LexisGraph`,
      `• Report ID: #${reportId.slice(0, 8)}`,
      `• Overall Score: ${score}% (${riskLevel} RISK)`,
      organizationName ? `• Organization: ${organizationName}` : null,
      regulationName ? `• Benchmark Regulation: ${regulationName}` : null,
      policyName ? `• Evaluated Policy: ${policyName}` : null,
      total > 0
        ? `• Clause Coverage: ${total} total (${compliant} compliant, ${partial} partial, ${nonCompliant} gap)`
        : null,
      `• View Full Audit: ${shareUrl}`,
    ].filter(Boolean);

    return lines.join("\n");
  }, [reportId, score, riskLevel, organizationName, regulationName, policyName, total, compliant, partial, nonCompliant, shareUrl]);

  const hasNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleCopyLink = async () => {
    const success = await robustCopyToClipboard(shareUrl);
    if (success) {
      setCopiedLink(true);
      toast.success("Audit workspace link copied to clipboard!");
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      toast.error("Failed to copy link. Please manually copy the URL below.");
    }
  };

  const handleCopySummary = async () => {
    const success = await robustCopyToClipboard(summaryText);
    if (success) {
      setCopiedSummary(true);
      toast.success("Audit executive summary copied to clipboard!");
      setTimeout(() => setCopiedSummary(false), 2000);
    } else {
      toast.error("Failed to copy summary.");
    }
  };

  const handleNativeShare = async () => {
    if (!hasNativeShare) return;
    try {
      await navigator.share({
        title: `Statutory Compliance Audit #${reportId.slice(0, 8)}`,
        text: `LexisGraph AI Compliance Audit: Score ${score}%, ${riskLevel} Risk.`,
        url: shareUrl,
      });
      toast.success("Audit shared successfully!");
    } catch {
      // User cancelled or closed the share modal
    }
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`Statutory Compliance Audit Report #${reportId.slice(0, 8)} — LexisGraph`);
    const body = encodeURIComponent(
      `Hello,\n\nPlease review the Statutory Compliance Audit Report generated by LexisGraph.\n\n${summaryText}\n\nAccess the interactive audit workspace here:\n${shareUrl}\n\nBest regards,\nLexisGraph Compliance Team`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] p-6 gap-5">
        <DialogHeader className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Share2 className="h-4 w-4" />
            </div>
            <DialogTitle className="text-lg font-bold text-foreground">
              Share Statutory Compliance Audit
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Share this verified AI regulatory compliance audit with colleagues, auditors, or executives.
          </DialogDescription>
        </DialogHeader>

        {/* Audit Snapshot Card */}
        <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-500" />
              <span className="font-bold text-sm text-foreground">
                Audit #{reportId.slice(0, 8)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                {score}% Score
              </span>
              <RiskBadge riskLevel={riskLevel} score={score} size="xs" />
            </div>
          </div>

          {(regulationName || policyName || organizationName) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1 border-t border-border/40">
              {organizationName && (
                <div className="text-muted-foreground flex items-center gap-1.5 truncate">
                  <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{organizationName}</span>
                </div>
              )}
              {regulationName && (
                <div className="text-muted-foreground flex items-center gap-1.5 truncate">
                  <Layers className="h-3 w-3 text-indigo-500 shrink-0" />
                  <span className="truncate">{regulationName}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Direct Link Share */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground flex items-center justify-between">
            <span>Direct Audit Workspace Link</span>
            <span className="text-[11px] font-normal text-muted-foreground">Accessible by organization members</span>
          </label>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={shareUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="font-mono text-xs h-9 bg-background select-all"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleCopyLink}
              className="h-9 px-3 shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs gap-1.5 cursor-pointer"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedLink ? "Copied!" : "Copy Link"}
            </Button>
          </div>
        </div>

        {/* Action Grid: Summary, Email, Native Share */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          {/* Copy Summary */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopySummary}
            className="text-xs h-9 justify-center gap-1.5 cursor-pointer font-medium"
          >
            {copiedSummary ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <FileText className="h-3.5 w-3.5 text-indigo-500" />}
            {copiedSummary ? "Summary Copied!" : "Copy Summary"}
          </Button>

          {/* Email Share */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleEmailShare}
            className="text-xs h-9 justify-center gap-1.5 cursor-pointer font-medium"
          >
            <Mail className="h-3.5 w-3.5 text-amber-500" /> Email Audit
          </Button>

          {/* Native Web Share or Open View */}
          {hasNativeShare ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNativeShare}
              className="text-xs h-9 justify-center gap-1.5 cursor-pointer font-medium border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
            >
              <Sparkles className="h-3.5 w-3.5" /> Share App...
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(shareUrl, "_blank")}
              className="text-xs h-9 justify-center gap-1.5 cursor-pointer font-medium"
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /> Open Link
            </Button>
          )}
        </div>

        <DialogFooter className="pt-2 border-t border-border/40 flex items-center justify-between sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            Recipients must have access permissions in your LexisGraph workspace.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs cursor-pointer"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
