// RiskBadge — Shared compliance risk level badge
// Canonical implementation reused across AnalysisHistoryTable, LatestAnalysisCard, AnalysisDetailsWorkspace

import React from "react";
import { Badge } from "@/components/ui/badge";

interface RiskBadgeProps {
  /** Risk level string from the backend (e.g. "LOW", "MEDIUM", "HIGH", "LOW RISK", etc.) */
  riskLevel: string | null | undefined;
  /** Numeric score — used to derive risk level when riskLevel is absent */
  score?: number | null;
  size?: "sm" | "xs";
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ riskLevel, score, size = "sm" }) => {
  if (!riskLevel && score == null) {
    return <span className="text-muted-foreground" aria-label="Risk level unknown">—</span>;
  }

  const textClass = size === "xs" ? "text-[11px] font-bold" : "text-xs font-bold";

  // Normalize: derive from score if riskLevel absent
  const normalised =
    riskLevel?.toUpperCase().replace(" RISK", "") ||
    (score != null && score >= 85 ? "LOW" : score != null && score >= 70 ? "MEDIUM" : "HIGH");

  switch (normalised) {
    case "LOW":
      return (
        <Badge
          variant="outline"
          className={`bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 ${textClass}`}
          aria-label="Risk level: Low"
        >
          LOW RISK
        </Badge>
      );
    case "MEDIUM":
      return (
        <Badge
          variant="outline"
          className={`bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 ${textClass}`}
          aria-label="Risk level: Medium"
        >
          MEDIUM RISK
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className={`bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 ${textClass}`}
          aria-label="Risk level: High"
        >
          HIGH RISK
        </Badge>
      );
  }
};
