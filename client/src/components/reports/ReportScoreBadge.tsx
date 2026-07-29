import React from "react";
import { ShieldCheck, ShieldAlert, AlertCircle, HelpCircle } from "lucide-react";

interface ReportScoreBadgeProps {
  score: number | null | undefined;
  className?: string;
  showNumericValue?: boolean;
}

export const ReportScoreBadge: React.FC<ReportScoreBadgeProps> = ({
  score,
  className = "",
  showNumericValue = true,
}) => {
  if (score === null || score === undefined) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700 ${className}`}
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span>N/A</span>
      </span>
    );
  }

  // Normalize score if represented as decimal 0.0-1.0 vs 0-100
  const numericScore = score <= 1.0 && score > 0 ? Math.round(score * 100) : Math.round(score);

  if (numericScore >= 90) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 ${className}`}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        {showNumericValue && <span className="font-mono">{numericScore}%</span>}
        <span>Excellent</span>
      </span>
    );
  }

  if (numericScore >= 80) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800 ${className}`}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        {showNumericValue && <span className="font-mono">{numericScore}%</span>}
        <span>Good</span>
      </span>
    );
  }

  if (numericScore >= 60) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800 ${className}`}
      >
        <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        {showNumericValue && <span className="font-mono">{numericScore}%</span>}
        <span>Needs Review</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-red-50 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800 ${className}`}
    >
      <ShieldAlert className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
      {showNumericValue && <span className="font-mono">{numericScore}%</span>}
      <span>High Risk</span>
    </span>
  );
};

export default ReportScoreBadge;
