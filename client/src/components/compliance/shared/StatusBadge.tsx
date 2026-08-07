// StatusBadge — Shared compliance analysis job status badge
// Canonical implementation reused across AnalysisHistoryTable, LiveAnalysisMonitor, AnalysisHistoryPreview

import React from "react";
import { CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "xs";
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = "sm" }) => {
  const iconClass = size === "xs" ? "h-3 w-3 mr-1" : "h-3.5 w-3.5 mr-1";
  const textClass = size === "xs" ? "text-[10px] px-2 py-0.5 font-bold" : "text-xs px-2.5 py-0.5 font-bold";

  switch (status) {
    case "COMPLETED":
      return (
        <Badge
          variant="outline"
          className={`bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 ${textClass}`}
          aria-label="Status: Completed"
        >
          <CheckCircle2 className={iconClass} aria-hidden="true" />
          COMPLETED
        </Badge>
      );
    case "FAILED":
      return (
        <Badge
          variant="outline"
          className={`bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 ${textClass}`}
          aria-label="Status: Failed"
        >
          <XCircle className={iconClass} aria-hidden="true" />
          FAILED
        </Badge>
      );
    case "RUNNING":
      return (
        <Badge
          variant="outline"
          className={`bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 ${textClass}`}
          aria-label="Status: Running"
        >
          <Loader2 className={`${iconClass} animate-spin`} aria-hidden="true" />
          RUNNING
        </Badge>
      );
    case "CANCELLED":
      return (
        <Badge
          variant="outline"
          className={`bg-muted text-muted-foreground border-border/50 ${textClass}`}
          aria-label="Status: Cancelled"
        >
          <XCircle className={iconClass} aria-hidden="true" />
          CANCELLED
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className={`bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 ${textClass}`}
          aria-label="Status: Queued"
        >
          <Clock className={iconClass} aria-hidden="true" />
          QUEUED
        </Badge>
      );
  }
};
